# -*- coding: utf-8 -*-
"""
操作系统课程设计 - 虚拟磁盘模块
实现M×N大小的模拟磁盘，采用位图+索引方式管理
"""

import os
import struct
import threading
import time
from typing import List, Optional, Tuple
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import *


class VirtualDisk:
    """
    虚拟磁盘类
    模拟一个M×N大小的磁盘，其中：
    - M = BLOCK_SIZE = 64字节（每个盘块大小）
    - N = BLOCK_COUNT = 1024（盘块数量）
    
    磁盘布局：
    [超级块][位图区][iNode区][数据区]
    """
    
    def __init__(self, disk_path: str = None):
        """初始化虚拟磁盘"""
        self.disk_path = disk_path or DISK_FILE_PATH
        self.lock = threading.RLock()  # 可重入锁，用于同步访问
        
        # 磁盘状态
        self.is_mounted = False
        self.total_blocks = BLOCK_COUNT
        self.free_blocks = 0
        
        # 位图缓存（内存中的位图副本）
        self.bitmap = bytearray(BLOCK_COUNT // 8)  # 1024位 = 128字节
        
        # 操作记录（用于可视化）
        self.operation_log = []
        
        # 初始化或加载磁盘
        if os.path.exists(self.disk_path):
            self._load_disk()
        else:
            self._format_disk()
    
    def _format_disk(self):
        """格式化磁盘，初始化所有数据结构"""
        with self.lock:
            # 创建空磁盘文件
            with open(self.disk_path, 'wb') as f:
                f.write(b'\x00' * DISK_SIZE)
            
            # 初始化超级块
            self._write_superblock()
            
            # 初始化位图（标记元数据区已使用）
            self._init_bitmap()
            
            # 初始化iNode区
            self._init_inodes()
            
            self.is_mounted = True
            self._log_operation("FORMAT", "磁盘格式化完成")
    
    def _load_disk(self):
        """加载已存在的磁盘"""
        with self.lock:
            # 读取超级块验证
            superblock = self._read_block(0)
            magic = struct.unpack('<I', superblock[:4])[0]
            
            if magic != 0x4F534653:  # 'OSFS' magic number
                self._format_disk()
                return
            
            # 加载位图到内存
            self._load_bitmap()
            self.is_mounted = True
            self._log_operation("MOUNT", "磁盘挂载成功")
    
    def _write_superblock(self):
        """写入超级块信息"""
        superblock = bytearray(BLOCK_SIZE)
        
        # Magic Number: 'OSFS'
        struct.pack_into('<I', superblock, 0, 0x4F534653)
        # 版本号
        struct.pack_into('<H', superblock, 4, 1)
        # 块大小
        struct.pack_into('<H', superblock, 6, BLOCK_SIZE)
        # 总块数
        struct.pack_into('<I', superblock, 8, BLOCK_COUNT)
        # 空闲块数
        struct.pack_into('<I', superblock, 12, BLOCK_COUNT - DATA_START_BLOCK)
        # 数据区起始块
        struct.pack_into('<I', superblock, 16, DATA_START_BLOCK)
        # iNode数量
        struct.pack_into('<I', superblock, 20, MAX_INODES)
        # 创建时间
        struct.pack_into('<Q', superblock, 24, int(time.time()))
        
        self._write_block(0, bytes(superblock))
    
    def _init_bitmap(self):
        """初始化位图"""
        # 标记元数据区块为已使用
        for i in range(DATA_START_BLOCK):
            self._set_bit(i, True)
        
        # 计算空闲块数
        self.free_blocks = BLOCK_COUNT - DATA_START_BLOCK
        
        # 写入位图到磁盘
        self._save_bitmap()
    
    def _init_inodes(self):
        """初始化iNode区"""
        # 创建根目录的iNode（iNode 0）
        root_inode = self._create_inode(
            inode_id=0,
            file_type=1,  # 1=目录
            permissions=PERM_READ | PERM_WRITE | PERM_EXECUTE,
            size=0,
            blocks=[]
        )
        self._write_inode(0, root_inode)
    
    def _create_inode(self, inode_id: int, file_type: int, permissions: int,
                      size: int, blocks: List[int]) -> bytes:
        """
        创建iNode数据结构
        
        iNode结构（64字节）：
        - 0-1: iNode ID (2字节)
        - 2: 文件类型 (1字节) 0=空闲, 1=目录, 2=普通文件
        - 3: 权限 (1字节)
        - 4-7: 文件大小 (4字节)
        - 8-15: 创建时间 (8字节)
        - 16-23: 修改时间 (8字节)
        - 24-25: 链接计数 (2字节)
        - 26-37: 直接索引块 (6×2=12字节)
        - 38-39: 一级间接索引 (2字节)
        - 40-41: 二级间接索引 (2字节)
        - 42-63: 保留 (22字节)
        """
        inode = bytearray(INODE_SIZE)
        
        current_time = int(time.time())
        
        struct.pack_into('<H', inode, 0, inode_id)
        struct.pack_into('<B', inode, 2, file_type)
        struct.pack_into('<B', inode, 3, permissions)
        struct.pack_into('<I', inode, 4, size)
        struct.pack_into('<Q', inode, 8, current_time)
        struct.pack_into('<Q', inode, 16, current_time)
        struct.pack_into('<H', inode, 24, 1)  # 链接计数
        
        # 写入直接索引块
        for i, block_id in enumerate(blocks[:DIRECT_BLOCKS]):
            struct.pack_into('<H', inode, 26 + i * 2, block_id)
        
        return bytes(inode)
    
    def _read_block(self, block_id: int) -> bytes:
        """读取指定块"""
        if block_id < 0 or block_id >= BLOCK_COUNT:
            raise ValueError(f"无效的块号: {block_id}")
        
        with open(self.disk_path, 'rb') as f:
            f.seek(block_id * BLOCK_SIZE)
            data = f.read(BLOCK_SIZE)
        
        return data
    
    def _write_block(self, block_id: int, data: bytes):
        """写入指定块"""
        if block_id < 0 or block_id >= BLOCK_COUNT:
            raise ValueError(f"无效的块号: {block_id}")
        
        if len(data) > BLOCK_SIZE:
            data = data[:BLOCK_SIZE]
        elif len(data) < BLOCK_SIZE:
            data = data + b'\x00' * (BLOCK_SIZE - len(data))
        
        with open(self.disk_path, 'r+b') as f:
            f.seek(block_id * BLOCK_SIZE)
            f.write(data)
    
    def _set_bit(self, block_id: int, used: bool):
        """设置位图中的某一位"""
        byte_index = block_id // 8
        bit_index = block_id % 8
        
        if used:
            self.bitmap[byte_index] |= (1 << bit_index)
        else:
            self.bitmap[byte_index] &= ~(1 << bit_index)
    
    def _get_bit(self, block_id: int) -> bool:
        """获取位图中某一位的状态"""
        byte_index = block_id // 8
        bit_index = block_id % 8
        return bool(self.bitmap[byte_index] & (1 << bit_index))
    
    def _save_bitmap(self):
        """保存位图到磁盘"""
        # 位图从块1开始存储
        for i in range(BITMAP_BLOCKS):
            start = i * BLOCK_SIZE
            end = start + BLOCK_SIZE
            block_data = bytes(self.bitmap[start:end]) if end <= len(self.bitmap) else \
                         bytes(self.bitmap[start:]) + b'\x00' * (BLOCK_SIZE - len(self.bitmap[start:]))
            self._write_block(SUPERBLOCK_BLOCKS + i, block_data)
    
    def _load_bitmap(self):
        """从磁盘加载位图"""
        bitmap_data = bytearray()
        for i in range(BITMAP_BLOCKS):
            block_data = self._read_block(SUPERBLOCK_BLOCKS + i)
            bitmap_data.extend(block_data)
        
        self.bitmap = bitmap_data[:BLOCK_COUNT // 8]
        
        # 计算空闲块数
        self.free_blocks = sum(1 for i in range(DATA_START_BLOCK, BLOCK_COUNT) 
                               if not self._get_bit(i))
    
    def allocate_block(self) -> Optional[int]:
        """
        分配一个空闲块
        使用位图法查找空闲块
        返回块号，如果没有空闲块则返回None
        """
        with self.lock:
            for i in range(DATA_START_BLOCK, BLOCK_COUNT):
                if not self._get_bit(i):
                    self._set_bit(i, True)
                    self.free_blocks -= 1
                    self._save_bitmap()
                    self._log_operation("ALLOCATE", f"分配块 {i}")
                    return i
            return None
    
    def allocate_blocks(self, count: int) -> List[int]:
        """分配多个连续或非连续的空闲块"""
        with self.lock:
            blocks = []
            for _ in range(count):
                block = self.allocate_block()
                if block is None:
                    # 回滚已分配的块
                    for b in blocks:
                        self.free_block(b)
                    return []
                blocks.append(block)
            return blocks
    
    def free_block(self, block_id: int):
        """释放一个块"""
        with self.lock:
            if block_id >= DATA_START_BLOCK and self._get_bit(block_id):
                self._set_bit(block_id, False)
                self.free_blocks += 1
                self._save_bitmap()
                # 清空块内容
                self._write_block(block_id, b'\x00' * BLOCK_SIZE)
                self._log_operation("FREE", f"释放块 {block_id}")
    
    def read_block(self, block_id: int) -> bytes:
        """公开的读块接口（带锁）"""
        with self.lock:
            data = self._read_block(block_id)
            self._log_operation("READ", f"读取块 {block_id}")
            return data
    
    def write_block(self, block_id: int, data: bytes):
        """公开的写块接口（带锁）"""
        with self.lock:
            self._write_block(block_id, data)
            self._log_operation("WRITE", f"写入块 {block_id}")
    
    def _write_inode(self, inode_id: int, inode_data: bytes):
        """写入iNode"""
        block_id = SUPERBLOCK_BLOCKS + BITMAP_BLOCKS + (inode_id // INODES_PER_BLOCK)
        offset = (inode_id % INODES_PER_BLOCK) * INODE_SIZE
        
        block_data = bytearray(self._read_block(block_id))
        block_data[offset:offset + INODE_SIZE] = inode_data
        self._write_block(block_id, bytes(block_data))
    
    def read_inode(self, inode_id: int) -> bytes:
        """读取iNode"""
        with self.lock:
            block_id = SUPERBLOCK_BLOCKS + BITMAP_BLOCKS + (inode_id // INODES_PER_BLOCK)
            offset = (inode_id % INODES_PER_BLOCK) * INODE_SIZE
            
            block_data = self._read_block(block_id)
            return block_data[offset:offset + INODE_SIZE]
    
    def write_inode(self, inode_id: int, inode_data: bytes):
        """公开的写iNode接口"""
        with self.lock:
            self._write_inode(inode_id, inode_data)
            self._log_operation("WRITE_INODE", f"写入iNode {inode_id}")
    
    def get_bitmap_status(self) -> List[bool]:
        """获取位图状态（用于可视化）"""
        with self.lock:
            return [self._get_bit(i) for i in range(BLOCK_COUNT)]
    
    def get_disk_info(self) -> dict:
        """获取磁盘信息"""
        with self.lock:
            return {
                'total_blocks': self.total_blocks,
                'free_blocks': self.free_blocks,
                'used_blocks': self.total_blocks - self.free_blocks,
                'block_size': BLOCK_SIZE,
                'total_size': DISK_SIZE,
                'data_start_block': DATA_START_BLOCK,
                'is_mounted': self.is_mounted
            }
    
    def _log_operation(self, op_type: str, message: str):
        """记录操作日志"""
        log_entry = {
            'timestamp': time.time(),
            'type': op_type,
            'message': message
        }
        self.operation_log.append(log_entry)
        # 只保留最近100条日志
        if len(self.operation_log) > 100:
            self.operation_log = self.operation_log[-100:]
    
    def get_operation_log(self) -> List[dict]:
        """获取操作日志"""
        return self.operation_log.copy()

