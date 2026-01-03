# -*- coding: utf-8 -*-
"""
操作系统课程设计 - 进程间通信模块
实现共享内存方式的进程间通信
采用条件变量实现同步与互斥
"""

import os
import threading
import time
import mmap
import struct
from typing import Optional, Dict, List, Any
from dataclasses import dataclass
from enum import Enum
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import *


class SharedMemorySegment:
    """
    共享内存段
    模拟操作系统的共享内存机制
    """
    
    def __init__(self, key: int, size: int):
        """
        创建共享内存段
        
        Args:
            key: 共享内存标识符
            size: 大小（字节）
        """
        self.key = key
        self.size = size
        self.data = bytearray(size)
        self.lock = threading.RLock()
        self.condition = threading.Condition(self.lock)
        
        # 附加的进程列表
        self.attached_processes: List[int] = []
        
        # 读写计数
        self.readers = 0
        self.writers = 0
        
        # 统计信息
        self.read_count = 0
        self.write_count = 0
        self.create_time = time.time()
        self.last_access = time.time()
    
    def attach(self, process_id: int) -> bool:
        """附加进程到共享内存"""
        with self.lock:
            if process_id not in self.attached_processes:
                self.attached_processes.append(process_id)
            return True
    
    def detach(self, process_id: int) -> bool:
        """从共享内存分离进程"""
        with self.condition:
            if process_id in self.attached_processes:
                self.attached_processes.remove(process_id)
                self.condition.notify_all()
            return True
    
    def read(self, offset: int, length: int, process_id: int) -> Optional[bytes]:
        """
        读取共享内存
        使用条件变量实现读写同步
        """
        with self.condition:
            # 等待写者完成
            while self.writers > 0:
                self.condition.wait()
            
            self.readers += 1
        
        try:
            # 读取数据
            if offset < 0 or offset + length > self.size:
                return None
            
            result = bytes(self.data[offset:offset + length])
            
            with self.lock:
                self.read_count += 1
                self.last_access = time.time()
            
            return result
        finally:
            with self.condition:
                self.readers -= 1
                if self.readers == 0:
                    self.condition.notify_all()
    
    def write(self, offset: int, data: bytes, process_id: int) -> bool:
        """
        写入共享内存
        使用条件变量实现互斥
        """
        with self.condition:
            # 等待所有读者和写者完成
            while self.readers > 0 or self.writers > 0:
                self.condition.wait()
            
            self.writers += 1
        
        try:
            # 写入数据
            if offset < 0 or offset + len(data) > self.size:
                return False
            
            self.data[offset:offset + len(data)] = data
            
            with self.lock:
                self.write_count += 1
                self.last_access = time.time()
            
            return True
        finally:
            with self.condition:
                self.writers -= 1
                self.condition.notify_all()
    
    def get_info(self) -> Dict[str, Any]:
        """获取共享内存段信息"""
        with self.lock:
            return {
                'key': self.key,
                'size': self.size,
                'attached_count': len(self.attached_processes),
                'attached_processes': self.attached_processes.copy(),
                'readers': self.readers,
                'writers': self.writers,
                'read_count': self.read_count,
                'write_count': self.write_count,
                'create_time': self.create_time,
                'last_access': self.last_access
            }


class SharedMemoryManager:
    """
    共享内存管理器
    管理所有共享内存段的创建、访问和销毁
    """
    
    def __init__(self):
        """初始化共享内存管理器"""
        self.lock = threading.RLock()
        self.segments: Dict[int, SharedMemorySegment] = {}
        self.next_key = 1
        
        # 统计信息
        self.stats = {
            'total_created': 0,
            'total_destroyed': 0,
            'total_reads': 0,
            'total_writes': 0
        }
    
    def create(self, size: int, key: int = None) -> int:
        """
        创建共享内存段
        
        Args:
            size: 大小（字节）
            key: 指定的key（可选）
            
        Returns:
            共享内存标识符
        """
        with self.lock:
            if key is None:
                key = self.next_key
                self.next_key += 1
            elif key in self.segments:
                return -1  # key已存在
            
            segment = SharedMemorySegment(key, size)
            self.segments[key] = segment
            self.stats['total_created'] += 1
            
            return key
    
    def destroy(self, key: int) -> bool:
        """
        销毁共享内存段
        
        Args:
            key: 共享内存标识符
            
        Returns:
            是否成功
        """
        with self.lock:
            if key not in self.segments:
                return False
            
            segment = self.segments[key]
            
            # 检查是否还有进程附加
            if segment.attached_processes:
                return False
            
            del self.segments[key]
            self.stats['total_destroyed'] += 1
            
            return True
    
    def attach(self, key: int, process_id: int) -> bool:
        """
        附加进程到共享内存
        
        Args:
            key: 共享内存标识符
            process_id: 进程ID
            
        Returns:
            是否成功
        """
        with self.lock:
            if key not in self.segments:
                return False
            
            return self.segments[key].attach(process_id)
    
    def detach(self, key: int, process_id: int) -> bool:
        """
        从共享内存分离进程
        
        Args:
            key: 共享内存标识符
            process_id: 进程ID
            
        Returns:
            是否成功
        """
        with self.lock:
            if key not in self.segments:
                return False
            
            return self.segments[key].detach(process_id)
    
    def read(self, key: int, offset: int, length: int, process_id: int) -> Optional[bytes]:
        """
        读取共享内存
        
        Args:
            key: 共享内存标识符
            offset: 偏移量
            length: 长度
            process_id: 进程ID
            
        Returns:
            读取的数据
        """
        with self.lock:
            if key not in self.segments:
                return None
            segment = self.segments[key]
        
        result = segment.read(offset, length, process_id)
        
        if result is not None:
            with self.lock:
                self.stats['total_reads'] += 1
        
        return result
    
    def write(self, key: int, offset: int, data: bytes, process_id: int) -> bool:
        """
        写入共享内存
        
        Args:
            key: 共享内存标识符
            offset: 偏移量
            data: 数据
            process_id: 进程ID
            
        Returns:
            是否成功
        """
        with self.lock:
            if key not in self.segments:
                return False
            segment = self.segments[key]
        
        result = segment.write(offset, data, process_id)
        
        if result:
            with self.lock:
                self.stats['total_writes'] += 1
        
        return result
    
    def get_segment_info(self, key: int) -> Optional[Dict[str, Any]]:
        """获取共享内存段信息"""
        with self.lock:
            if key not in self.segments:
                return None
            return self.segments[key].get_info()
    
    def get_all_segments(self) -> List[Dict[str, Any]]:
        """获取所有共享内存段信息"""
        with self.lock:
            return [seg.get_info() for seg in self.segments.values()]
    
    def get_stats(self) -> Dict[str, Any]:
        """获取统计信息"""
        with self.lock:
            return {
                **self.stats,
                'active_segments': len(self.segments),
                'total_size': sum(seg.size for seg in self.segments.values())
            }


class Semaphore:
    """
    信号量类
    用于进程间同步（可选使用）
    """
    
    def __init__(self, value: int = 1):
        """
        初始化信号量
        
        Args:
            value: 初始值
        """
        self.value = value
        self.lock = threading.Lock()
        self.condition = threading.Condition(self.lock)
        self.waiting_count = 0
    
    def wait(self, timeout: float = None) -> bool:
        """
        P操作（等待）
        
        Args:
            timeout: 超时时间
            
        Returns:
            是否成功
        """
        with self.condition:
            start_time = time.time()
            
            while self.value <= 0:
                self.waiting_count += 1
                
                if timeout is not None:
                    elapsed = time.time() - start_time
                    remaining = timeout - elapsed
                    if remaining <= 0:
                        self.waiting_count -= 1
                        return False
                    result = self.condition.wait(remaining)
                else:
                    self.condition.wait()
                
                self.waiting_count -= 1
            
            self.value -= 1
            return True
    
    def signal(self):
        """V操作（释放）"""
        with self.condition:
            self.value += 1
            self.condition.notify()
    
    def get_value(self) -> int:
        """获取当前值"""
        with self.lock:
            return self.value
    
    def get_waiting_count(self) -> int:
        """获取等待进程数"""
        with self.lock:
            return self.waiting_count


class ConditionVariable:
    """
    条件变量类
    用于进程间复杂同步
    """
    
    def __init__(self):
        """初始化条件变量"""
        self.lock = threading.RLock()
        self.condition = threading.Condition(self.lock)
        self.waiting_processes: List[int] = []
    
    def wait(self, process_id: int, timeout: float = None) -> bool:
        """
        等待条件变量
        
        Args:
            process_id: 进程ID
            timeout: 超时时间
            
        Returns:
            是否成功（False表示超时）
        """
        with self.condition:
            self.waiting_processes.append(process_id)
            
            try:
                if timeout is not None:
                    return self.condition.wait(timeout)
                else:
                    self.condition.wait()
                    return True
            finally:
                if process_id in self.waiting_processes:
                    self.waiting_processes.remove(process_id)
    
    def signal(self):
        """唤醒一个等待的进程"""
        with self.condition:
            self.condition.notify()
    
    def broadcast(self):
        """唤醒所有等待的进程"""
        with self.condition:
            self.condition.notify_all()
    
    def get_waiting_count(self) -> int:
        """获取等待进程数"""
        with self.lock:
            return len(self.waiting_processes)
    
    def get_waiting_processes(self) -> List[int]:
        """获取等待的进程列表"""
        with self.lock:
            return self.waiting_processes.copy()

