# -*- coding: utf-8 -*-
"""
操作系统课程设计 - 内存缓冲页管理模块
实现M×K大小的缓冲区，支持页面置换（LRU算法）
"""

import os
import threading
import time
from typing import Optional, Dict, List, Any
from dataclasses import dataclass, field
from enum import Enum
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import *


class PageState(Enum):
    """缓冲页状态"""
    FREE = 0       # 空闲
    CLEAN = 1      # 干净（与磁盘一致）
    DIRTY = 2      # 脏页（已修改）


@dataclass
class BufferPage:
    """
    缓冲页结构
    记录缓冲页的所有者、访问时间、修改状态等信息
    """
    page_id: int                          # 缓冲页ID
    block_id: int = -1                    # 对应的磁盘块号（-1表示未关联）
    owner_process: int = -1               # 所有者进程ID（-1表示无主）
    data: bytearray = field(default_factory=lambda: bytearray(BUFFER_PAGE_SIZE))
    state: PageState = PageState.FREE     # 页面状态
    access_time: float = 0.0              # 最后访问时间
    load_time: float = 0.0                # 加载时间
    access_count: int = 0                 # 访问计数（用于LFU）
    is_pinned: bool = False               # 是否被钉住（不可置换）
    
    def reset(self):
        """重置缓冲页"""
        self.block_id = -1
        self.owner_process = -1
        self.data = bytearray(BUFFER_PAGE_SIZE)
        self.state = PageState.FREE
        self.access_time = 0.0
        self.load_time = 0.0
        self.access_count = 0
        self.is_pinned = False


class BufferManager:
    """
    缓冲区管理器
    管理M×K大小的内存缓冲区
    实现缓冲页的分配、置换（LRU算法）和写回
    """
    
    def __init__(self, disk):
        """
        初始化缓冲管理器
        
        Args:
            disk: 虚拟磁盘对象
        """
        self.disk = disk
        self.lock = threading.RLock()
        self.condition = threading.Condition(self.lock)  # 条件变量，用于同步
        
        # 初始化缓冲页
        self.pages: List[BufferPage] = [
            BufferPage(page_id=i) for i in range(BUFFER_PAGE_COUNT)
        ]
        
        # 块号到页号的映射（用于快速查找）
        self.block_to_page: Dict[int, int] = {}
        
        # 统计信息
        self.stats = {
            'hits': 0,           # 缓存命中次数
            'misses': 0,         # 缓存未命中次数
            'page_faults': 0,    # 缺页次数
            'writebacks': 0,     # 写回次数
            'evictions': 0       # 置换次数
        }
        
        # 置换日志（用于可视化）
        self.swap_log: List[Dict] = []
    
    def _find_free_page(self) -> Optional[int]:
        """查找空闲页"""
        for i, page in enumerate(self.pages):
            if page.state == PageState.FREE:
                return i
        return None
    
    def _find_victim_lru(self) -> Optional[int]:
        """
        使用LRU算法选择牺牲页
        选择最近最少使用的未钉住页面
        """
        victim = None
        oldest_time = float('inf')
        
        for i, page in enumerate(self.pages):
            if page.is_pinned:
                continue
            if page.state != PageState.FREE and page.access_time < oldest_time:
                oldest_time = page.access_time
                victim = i
        
        return victim
    
    def _evict_page(self, page_id: int) -> bool:
        """
        置换页面
        如果页面是脏页，需要先写回磁盘
        """
        page = self.pages[page_id]
        
        if page.state == PageState.FREE:
            return True
        
        # 如果是脏页，写回磁盘
        if page.state == PageState.DIRTY:
            self._writeback_page(page_id)
        
        # 记录置换日志
        self._log_swap('EVICT', page_id, page.block_id, page.owner_process)
        
        # 移除映射
        if page.block_id in self.block_to_page:
            del self.block_to_page[page.block_id]
        
        # 重置页面
        page.reset()
        self.stats['evictions'] += 1
        
        return True
    
    def _writeback_page(self, page_id: int):
        """将脏页写回磁盘"""
        page = self.pages[page_id]
        
        if page.state != PageState.DIRTY or page.block_id < 0:
            return
        
        # 写回磁盘
        self.disk.write_block(page.block_id, bytes(page.data))
        page.state = PageState.CLEAN
        
        self.stats['writebacks'] += 1
        self._log_swap('WRITEBACK', page_id, page.block_id, page.owner_process)
        
        # 模拟写回延时
        time.sleep(PAGE_SWAP_DELAY)
    
    def _load_page(self, page_id: int, block_id: int, process_id: int) -> bool:
        """从磁盘加载页面到缓冲区"""
        page = self.pages[page_id]
        
        # 从磁盘读取数据
        block_data = self.disk.read_block(block_id)
        
        page.block_id = block_id
        page.owner_process = process_id
        page.data = bytearray(block_data)
        page.state = PageState.CLEAN
        page.load_time = time.time()
        page.access_time = time.time()
        page.access_count = 1
        
        # 更新映射
        self.block_to_page[block_id] = page_id
        
        self.stats['page_faults'] += 1
        self._log_swap('LOAD', page_id, block_id, process_id)
        
        # 模拟加载延时
        time.sleep(PAGE_SWAP_DELAY)
        
        return True
    
    def get_page(self, block_id: int, process_id: int) -> Optional[int]:
        """
        获取包含指定磁盘块的缓冲页
        如果块不在缓冲区中，则加载它
        
        Args:
            block_id: 磁盘块号
            process_id: 请求的进程ID
            
        Returns:
            缓冲页ID，如果失败返回None
        """
        with self.condition:
            # 检查块是否已在缓冲区
            if block_id in self.block_to_page:
                page_id = self.block_to_page[block_id]
                page = self.pages[page_id]
                page.access_time = time.time()
                page.access_count += 1
                self.stats['hits'] += 1
                return page_id
            
            self.stats['misses'] += 1
            
            # 查找空闲页
            page_id = self._find_free_page()
            
            if page_id is None:
                # 需要置换
                page_id = self._find_victim_lru()
                if page_id is None:
                    return None  # 所有页都被钉住
                
                self._evict_page(page_id)
            
            # 加载页面
            if self._load_page(page_id, block_id, process_id):
                return page_id
            
            return None
    
    def read_page(self, block_id: int, process_id: int) -> Optional[bytes]:
        """
        读取指定磁盘块的内容
        
        Args:
            block_id: 磁盘块号
            process_id: 请求的进程ID
            
        Returns:
            块内容，如果失败返回None
        """
        with self.condition:
            page_id = self.get_page(block_id, process_id)
            if page_id is None:
                return None
            
            return bytes(self.pages[page_id].data)
    
    def write_page(self, block_id: int, data: bytes, process_id: int) -> bool:
        """
        写入数据到指定磁盘块（通过缓冲区）
        
        Args:
            block_id: 磁盘块号
            data: 要写入的数据
            process_id: 请求的进程ID
            
        Returns:
            是否成功
        """
        with self.condition:
            page_id = self.get_page(block_id, process_id)
            if page_id is None:
                return False
            
            page = self.pages[page_id]
            
            # 写入数据
            write_len = min(len(data), BUFFER_PAGE_SIZE)
            page.data[:write_len] = data[:write_len]
            if write_len < BUFFER_PAGE_SIZE:
                page.data[write_len:] = b'\x00' * (BUFFER_PAGE_SIZE - write_len)
            
            page.state = PageState.DIRTY
            page.access_time = time.time()
            
            # 通知等待的线程
            self.condition.notify_all()
            
            return True
    
    def pin_page(self, page_id: int) -> bool:
        """钉住页面（不可置换）"""
        with self.lock:
            if 0 <= page_id < BUFFER_PAGE_COUNT:
                self.pages[page_id].is_pinned = True
                return True
            return False
    
    def unpin_page(self, page_id: int) -> bool:
        """解除页面钉住状态"""
        with self.condition:
            if 0 <= page_id < BUFFER_PAGE_COUNT:
                self.pages[page_id].is_pinned = False
                # 通知等待的线程
                self.condition.notify_all()
                return True
            return False
    
    def flush_page(self, page_id: int) -> bool:
        """刷新指定页面（写回磁盘）"""
        with self.lock:
            if 0 <= page_id < BUFFER_PAGE_COUNT:
                page = self.pages[page_id]
                if page.state == PageState.DIRTY:
                    self._writeback_page(page_id)
                return True
            return False
    
    def flush_all(self):
        """刷新所有脏页"""
        with self.lock:
            for i, page in enumerate(self.pages):
                if page.state == PageState.DIRTY:
                    self._writeback_page(i)
    
    def release_process_pages(self, process_id: int):
        """释放指定进程的所有缓冲页"""
        with self.condition:
            for page in self.pages:
                if page.owner_process == process_id:
                    if page.state == PageState.DIRTY:
                        self._writeback_page(page.page_id)
                    page.reset()
            
            # 更新映射
            self.block_to_page = {
                b: p for b, p in self.block_to_page.items()
                if self.pages[p].block_id == b
            }
            
            self.condition.notify_all()
    
    def get_buffer_status(self) -> List[Dict[str, Any]]:
        """获取缓冲区状态（用于可视化）"""
        with self.lock:
            status = []
            for page in self.pages:
                status.append({
                    'page_id': page.page_id,
                    'block_id': page.block_id,
                    'owner': page.owner_process,
                    'state': page.state.name,
                    'is_pinned': page.is_pinned,
                    'access_time': page.access_time,
                    'access_count': page.access_count,
                    'data_preview': page.data[:16].hex() if page.state != PageState.FREE else ''
                })
            return status
    
    def get_stats(self) -> Dict[str, Any]:
        """获取统计信息"""
        with self.lock:
            total = self.stats['hits'] + self.stats['misses']
            hit_rate = self.stats['hits'] / total if total > 0 else 0
            
            free_pages = sum(1 for p in self.pages if p.state == PageState.FREE)
            dirty_pages = sum(1 for p in self.pages if p.state == PageState.DIRTY)
            clean_pages = sum(1 for p in self.pages if p.state == PageState.CLEAN)
            
            return {
                **self.stats,
                'hit_rate': hit_rate,
                'total_pages': BUFFER_PAGE_COUNT,
                'free_pages': free_pages,
                'dirty_pages': dirty_pages,
                'clean_pages': clean_pages,
                'pinned_pages': sum(1 for p in self.pages if p.is_pinned)
            }
    
    def _log_swap(self, op_type: str, page_id: int, block_id: int, process_id: int):
        """记录置换日志"""
        log_entry = {
            'timestamp': time.time(),
            'type': op_type,
            'page_id': page_id,
            'block_id': block_id,
            'process_id': process_id
        }
        self.swap_log.append(log_entry)
        # 只保留最近50条日志
        if len(self.swap_log) > 50:
            self.swap_log = self.swap_log[-50:]
    
    def get_swap_log(self) -> List[Dict]:
        """获取置换日志"""
        return self.swap_log.copy()

    def access_block(self, block_id: int, process_id: int = 0) -> Dict[str, Any]:
        """访问单个磁盘块；若不在缓冲中会触发置换（LRU）。"""
        before_hit = block_id in self.block_to_page
        data = self.read_page(block_id, process_id)
        success = data is not None
        page_id = self.block_to_page.get(block_id) if success else None
        return {
            'success': success,
            'hit': before_hit,
            'block_id': block_id,
            'page_id': page_id,
            'stats': self.get_stats(),
            'log': self.get_swap_log(),
            'pages': self.get_buffer_status(),
        }

    def rewrite_block(self, block_id: int, process_id: int = 0) -> Dict[str, Any]:
        """在内存中重写块的原有内容，用于模拟写操作但不改变数据。"""
        with self.condition:
            before_hit = block_id in self.block_to_page
            page_id = self.get_page(block_id, process_id)
            if page_id is None:
                return {
                    'success': False,
                    'error': '无法加载块到缓冲区',
                    'stats': self.get_stats(),
                    'log': self.get_swap_log(),
                    'pages': self.get_buffer_status(),
                }

            page = self.pages[page_id]
            # 不改变数据内容，仅标记为写入过（脏页）
            page.state = PageState.DIRTY
            page.access_time = time.time()
            page.access_count += 1
            self._log_swap('WRITE', page_id, block_id, process_id)

            return {
                'success': True,
                'hit': before_hit,
                'block_id': block_id,
                'page_id': page_id,
                'stats': self.get_stats(),
                'log': self.get_swap_log(),
                'pages': self.get_buffer_status(),
            }
    
    def wait_for_page(self, block_id: int, process_id: int, timeout: float = None) -> Optional[int]:
        """
        等待页面可用（条件变量实现）
        用于实现进程间的同步
        
        Args:
            block_id: 磁盘块号
            process_id: 请求的进程ID
            timeout: 超时时间（秒）
            
        Returns:
            缓冲页ID，超时返回None
        """
        with self.condition:
            start_time = time.time()
            
            while True:
                page_id = self.get_page(block_id, process_id)
                if page_id is not None:
                    return page_id
                
                # 计算剩余等待时间
                if timeout is not None:
                    elapsed = time.time() - start_time
                    remaining = timeout - elapsed
                    if remaining <= 0:
                        return None
                    self.condition.wait(remaining)
                else:
                    self.condition.wait()

