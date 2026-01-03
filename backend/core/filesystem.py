# -*- coding: utf-8 -*-
"""
操作系统课程设计 - 文件系统模块
实现文件的创建、读取、修改、删除等操作
采用索引方式组织数据
"""

import os
import struct
import threading
import time
from typing import List, Optional, Dict, Any
from dataclasses import dataclass
from enum import Enum
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import *
from .disk import VirtualDisk

# 全局进度回调（用于可视化）
_progress_callback = None

def set_progress_callback(callback):
    """设置进度回调函数"""
    global _progress_callback
    _progress_callback = callback

def notify_progress(operation: str, filename: str, current_block: int, total_blocks: int, block_id: int):
    """通知操作进度"""
    global _progress_callback
    if _progress_callback:
        _progress_callback({
            'operation': operation,
            'filename': filename,
            'current_block': current_block,
            'total_blocks': total_blocks,
            'block_id': block_id,
            'progress': (current_block / total_blocks * 100) if total_blocks > 0 else 100
        })


class FileType(Enum):
    """文件类型枚举"""
    FREE = 0       # 空闲
    DIRECTORY = 1  # 目录
    REGULAR = 2    # 普通文件


@dataclass
class INode:
    """iNode数据结构"""
    inode_id: int
    file_type: FileType
    permissions: int
    size: int
    create_time: int
    modify_time: int
    link_count: int
    direct_blocks: List[int]     # 直接索引块
    single_indirect: int         # 一级间接索引块
    double_indirect: int         # 二级间接索引块
    
    @classmethod
    def from_bytes(cls, data: bytes) -> 'INode':
        """从字节数据解析iNode"""
        inode_id = struct.unpack_from('<H', data, 0)[0]
        file_type = FileType(struct.unpack_from('<B', data, 2)[0])
        permissions = struct.unpack_from('<B', data, 3)[0]
        size = struct.unpack_from('<I', data, 4)[0]
        create_time = struct.unpack_from('<Q', data, 8)[0]
        modify_time = struct.unpack_from('<Q', data, 16)[0]
        link_count = struct.unpack_from('<H', data, 24)[0]
        
        direct_blocks = []
        for i in range(DIRECT_BLOCKS):
            block_id = struct.unpack_from('<H', data, 26 + i * 2)[0]
            direct_blocks.append(block_id)
        
        single_indirect = struct.unpack_from('<H', data, 38)[0]
        double_indirect = struct.unpack_from('<H', data, 40)[0]
        
        return cls(
            inode_id=inode_id,
            file_type=file_type,
            permissions=permissions,
            size=size,
            create_time=create_time,
            modify_time=modify_time,
            link_count=link_count,
            direct_blocks=direct_blocks,
            single_indirect=single_indirect,
            double_indirect=double_indirect
        )
    
    def to_bytes(self) -> bytes:
        """将iNode序列化为字节"""
        data = bytearray(INODE_SIZE)
        
        struct.pack_into('<H', data, 0, self.inode_id)
        struct.pack_into('<B', data, 2, self.file_type.value)
        struct.pack_into('<B', data, 3, self.permissions)
        struct.pack_into('<I', data, 4, self.size)
        struct.pack_into('<Q', data, 8, self.create_time)
        struct.pack_into('<Q', data, 16, self.modify_time)
        struct.pack_into('<H', data, 24, self.link_count)
        
        for i, block_id in enumerate(self.direct_blocks[:DIRECT_BLOCKS]):
            struct.pack_into('<H', data, 26 + i * 2, block_id)
        
        struct.pack_into('<H', data, 38, self.single_indirect)
        struct.pack_into('<H', data, 40, self.double_indirect)
        
        return bytes(data)


@dataclass
class DirectoryEntry:
    """目录项结构"""
    name: str           # 文件名（最大24字节）
    inode_id: int       # iNode号
    
    @classmethod
    def from_bytes(cls, data: bytes) -> Optional['DirectoryEntry']:
        """从字节解析目录项"""
        if len(data) < 26:
            return None
        
        # 文件名（24字节，以\0结尾）
        name_bytes = data[:24]
        try:
            name = name_bytes.rstrip(b'\x00').decode('utf-8')
        except:
            name = ""
        
        if not name:
            return None
        
        inode_id = struct.unpack_from('<H', data, 24)[0]
        return cls(name=name, inode_id=inode_id)
    
    def to_bytes(self) -> bytes:
        """序列化为字节"""
        data = bytearray(26)
        name_bytes = self.name.encode('utf-8')[:24]
        data[:len(name_bytes)] = name_bytes
        struct.pack_into('<H', data, 24, self.inode_id)
        return bytes(data)


class FileSystem:
    """
    文件系统类
    实现文件的增删改查操作
    采用索引方式组织文件数据
    """
    
    # 每个目录块可存放的目录项数
    ENTRIES_PER_BLOCK = BLOCK_SIZE // 26  # 26字节/目录项
    
    def __init__(self, disk: VirtualDisk):
        """初始化文件系统"""
        self.disk = disk
        self.lock = threading.RLock()
        
        # 文件打开表（记录正在使用的文件）
        self.open_files: Dict[int, Dict[str, Any]] = {}  # inode_id -> {process_id, mode, ...}
        
        # iNode位图（内存中）
        self.inode_bitmap = [False] * MAX_INODES
        self._load_inode_bitmap()
        
        # 当前工作目录
        self.current_dir_inode = 0  # 根目录
        
        # 目录路径栈（用于支持返回上级目录）
        self.path_stack: List[str] = []  # 存储路径名
        self.inode_stack: List[int] = [0]  # 存储inode号，初始为根目录
    
    def _load_inode_bitmap(self):
        """加载iNode使用情况"""
        for i in range(MAX_INODES):
            inode_data = self.disk.read_inode(i)
            file_type = struct.unpack_from('<B', inode_data, 2)[0]
            self.inode_bitmap[i] = (file_type != 0)
    
    def _allocate_inode(self) -> Optional[int]:
        """分配一个空闲iNode"""
        for i in range(MAX_INODES):
            if not self.inode_bitmap[i]:
                self.inode_bitmap[i] = True
                return i
        return None
    
    def _free_inode(self, inode_id: int):
        """释放iNode"""
        if 0 < inode_id < MAX_INODES:  # 不允许释放根目录
            self.inode_bitmap[inode_id] = False
            # 清空iNode数据
            empty_inode = bytes(INODE_SIZE)
            self.disk.write_inode(inode_id, empty_inode)
    
    def _get_inode(self, inode_id: int) -> Optional[INode]:
        """获取iNode"""
        if inode_id < 0 or inode_id >= MAX_INODES:
            return None
        
        data = self.disk.read_inode(inode_id)
        if struct.unpack_from('<B', data, 2)[0] == 0:
            return None
        
        return INode.from_bytes(data)
    
    def _save_inode(self, inode: INode):
        """保存iNode"""
        self.disk.write_inode(inode.inode_id, inode.to_bytes())
    
    def _get_file_blocks(self, inode: INode) -> List[int]:
        """
        获取文件的所有数据块号
        支持混合索引（直接索引+一级间接索引+二级间接索引）
        """
        blocks = []
        
        # 直接索引块
        for block_id in inode.direct_blocks:
            if block_id > 0:
                blocks.append(block_id)
        
        # 一级间接索引
        if inode.single_indirect > 0:
            indirect_data = self.disk.read_block(inode.single_indirect)
            for i in range(POINTERS_PER_BLOCK):
                block_id = struct.unpack_from('<H', indirect_data, i * 2)[0]
                if block_id > 0:
                    blocks.append(block_id)
        
        # 二级间接索引
        if inode.double_indirect > 0:
            double_data = self.disk.read_block(inode.double_indirect)
            for i in range(POINTERS_PER_BLOCK):
                single_ptr = struct.unpack_from('<H', double_data, i * 2)[0]
                if single_ptr > 0:
                    indirect_data = self.disk.read_block(single_ptr)
                    for j in range(POINTERS_PER_BLOCK):
                        block_id = struct.unpack_from('<H', indirect_data, j * 2)[0]
                        if block_id > 0:
                            blocks.append(block_id)
        
        return blocks
    
    def _allocate_file_blocks(self, inode: INode, block_count: int) -> bool:
        """
        为文件分配数据块
        采用混合索引方式
        """
        current_blocks = self._get_file_blocks(inode)
        needed = block_count - len(current_blocks)
        
        if needed <= 0:
            return True
        
        new_blocks = self.disk.allocate_blocks(needed)
        if len(new_blocks) < needed:
            return False
        
        all_blocks = current_blocks + new_blocks
        
        # 重新分配索引
        idx = 0
        
        # 直接索引
        for i in range(DIRECT_BLOCKS):
            if idx < len(all_blocks):
                inode.direct_blocks[i] = all_blocks[idx]
                idx += 1
            else:
                inode.direct_blocks[i] = 0
        
        # 一级间接索引
        if idx < len(all_blocks):
            if inode.single_indirect == 0:
                single_block = self.disk.allocate_block()
                if single_block is None:
                    return False
                inode.single_indirect = single_block
            
            indirect_data = bytearray(BLOCK_SIZE)
            for i in range(POINTERS_PER_BLOCK):
                if idx < len(all_blocks):
                    struct.pack_into('<H', indirect_data, i * 2, all_blocks[idx])
                    idx += 1
            self.disk.write_block(inode.single_indirect, bytes(indirect_data))
        
        # 二级间接索引（如果需要）
        if idx < len(all_blocks):
            if inode.double_indirect == 0:
                double_block = self.disk.allocate_block()
                if double_block is None:
                    return False
                inode.double_indirect = double_block
            
            double_data = bytearray(BLOCK_SIZE)
            single_idx = 0
            
            while idx < len(all_blocks) and single_idx < POINTERS_PER_BLOCK:
                single_block = self.disk.allocate_block()
                if single_block is None:
                    return False
                
                struct.pack_into('<H', double_data, single_idx * 2, single_block)
                
                indirect_data = bytearray(BLOCK_SIZE)
                for i in range(POINTERS_PER_BLOCK):
                    if idx < len(all_blocks):
                        struct.pack_into('<H', indirect_data, i * 2, all_blocks[idx])
                        idx += 1
                
                self.disk.write_block(single_block, bytes(indirect_data))
                single_idx += 1
            
            self.disk.write_block(inode.double_indirect, bytes(double_data))
        
        return True
    
    def _free_file_blocks(self, inode: INode):
        """释放文件的所有数据块"""
        # 释放直接索引块
        for block_id in inode.direct_blocks:
            if block_id > 0:
                self.disk.free_block(block_id)
        
        # 释放一级间接索引
        if inode.single_indirect > 0:
            indirect_data = self.disk.read_block(inode.single_indirect)
            for i in range(POINTERS_PER_BLOCK):
                block_id = struct.unpack_from('<H', indirect_data, i * 2)[0]
                if block_id > 0:
                    self.disk.free_block(block_id)
            self.disk.free_block(inode.single_indirect)
        
        # 释放二级间接索引
        if inode.double_indirect > 0:
            double_data = self.disk.read_block(inode.double_indirect)
            for i in range(POINTERS_PER_BLOCK):
                single_ptr = struct.unpack_from('<H', double_data, i * 2)[0]
                if single_ptr > 0:
                    indirect_data = self.disk.read_block(single_ptr)
                    for j in range(POINTERS_PER_BLOCK):
                        block_id = struct.unpack_from('<H', indirect_data, j * 2)[0]
                        if block_id > 0:
                            self.disk.free_block(block_id)
                    self.disk.free_block(single_ptr)
            self.disk.free_block(inode.double_indirect)
    
    def _free_file_blocks_with_progress(self, inode: INode, filename: str):
        """释放文件的所有数据块（带进度通知）"""
        all_blocks = self._get_file_blocks(inode)
        total = len(all_blocks)
        
        # 释放直接索引块
        block_count = 0
        for block_id in inode.direct_blocks:
            if block_id > 0:
                block_count += 1
                notify_progress('delete', filename, block_count, total, block_id)
                self.disk.free_block(block_id)
                time.sleep(IO_DELAY * 0.5)  # 删除延时（较短）
        
        # 释放一级间接索引中的数据块
        if inode.single_indirect > 0:
            indirect_data = self.disk.read_block(inode.single_indirect)
            for i in range(POINTERS_PER_BLOCK):
                block_id = struct.unpack_from('<H', indirect_data, i * 2)[0]
                if block_id > 0:
                    block_count += 1
                    notify_progress('delete', filename, block_count, total, block_id)
                    self.disk.free_block(block_id)
                    time.sleep(IO_DELAY * 0.5)
            # 释放间接索引块本身
            self.disk.free_block(inode.single_indirect)
        
        # 释放二级间接索引
        if inode.double_indirect > 0:
            double_data = self.disk.read_block(inode.double_indirect)
            for i in range(POINTERS_PER_BLOCK):
                single_ptr = struct.unpack_from('<H', double_data, i * 2)[0]
                if single_ptr > 0:
                    indirect_data = self.disk.read_block(single_ptr)
                    for j in range(POINTERS_PER_BLOCK):
                        block_id = struct.unpack_from('<H', indirect_data, j * 2)[0]
                        if block_id > 0:
                            block_count += 1
                            notify_progress('delete', filename, block_count, total, block_id)
                            self.disk.free_block(block_id)
                            time.sleep(IO_DELAY * 0.5)
                    self.disk.free_block(single_ptr)
            self.disk.free_block(inode.double_indirect)
        
        # 清空iNode中的索引
        inode.direct_blocks = [0] * DIRECT_BLOCKS
        inode.single_indirect = 0
        inode.double_indirect = 0
    
    def _read_directory(self, dir_inode: INode) -> List[DirectoryEntry]:
        """读取目录内容"""
        entries = []
        blocks = self._get_file_blocks(dir_inode)
        
        for block_id in blocks:
            block_data = self.disk.read_block(block_id)
            for i in range(self.ENTRIES_PER_BLOCK):
                entry_data = block_data[i * 26:(i + 1) * 26]
                entry = DirectoryEntry.from_bytes(entry_data)
                if entry:
                    entries.append(entry)
        
        return entries
    
    def _add_directory_entry(self, dir_inode: INode, entry: DirectoryEntry) -> bool:
        """向目录添加一个条目"""
        blocks = self._get_file_blocks(dir_inode)
        
        # 尝试在现有块中找空位
        for block_id in blocks:
            block_data = bytearray(self.disk.read_block(block_id))
            for i in range(self.ENTRIES_PER_BLOCK):
                entry_data = block_data[i * 26:(i + 1) * 26]
                if entry_data[0] == 0:  # 空目录项
                    block_data[i * 26:(i + 1) * 26] = entry.to_bytes()
                    self.disk.write_block(block_id, bytes(block_data))
                    return True
        
        # 需要分配新块给目录
        # 使用 _allocate_file_blocks 来正确分配并更新 inode 索引
        new_block_count = len(blocks) + 1
        if not self._allocate_file_blocks(dir_inode, new_block_count):
            return False
        
        # 重新获取块列表，找到新分配的块
        new_blocks = self._get_file_blocks(dir_inode)
        if len(new_blocks) < new_block_count:
            return False
        
        # 新块是列表中最后一个
        new_block = new_blocks[-1]
        
        # 写入新条目到新块
        block_data = bytearray(BLOCK_SIZE)
        block_data[:26] = entry.to_bytes()
        self.disk.write_block(new_block, bytes(block_data))
        
        # 更新目录大小
        dir_inode.size += 26
        self._save_inode(dir_inode)
        
        return True
    
    def _remove_directory_entry(self, dir_inode: INode, filename: str) -> bool:
        """从目录移除一个条目"""
        blocks = self._get_file_blocks(dir_inode)
        
        for block_id in blocks:
            block_data = bytearray(self.disk.read_block(block_id))
            for i in range(self.ENTRIES_PER_BLOCK):
                entry_data = block_data[i * 26:(i + 1) * 26]
                entry = DirectoryEntry.from_bytes(entry_data)
                if entry and entry.name == filename:
                    # 清空该条目
                    block_data[i * 26:(i + 1) * 26] = b'\x00' * 26
                    self.disk.write_block(block_id, bytes(block_data))
                    return True
        
        return False
    
    def _find_in_directory(self, dir_inode: INode, filename: str) -> Optional[int]:
        """在目录中查找文件，返回iNode号"""
        entries = self._read_directory(dir_inode)
        for entry in entries:
            if entry.name == filename:
                return entry.inode_id
        return None
    
    def _validate_filename(self, filename: str) -> Optional[str]:
        """
        验证文件名合法性
        返回错误信息，如果合法返回None
        """
        if not filename:
            return '文件名不能为空'
        
        if filename in ('.', '..'):
            return '文件名不能是 . 或 ..'
        
        # 文件名最大24字节（UTF-8编码）
        if len(filename.encode('utf-8')) > 24:
            return '文件名过长（最大24字节）'
        
        # 禁止的特殊字符
        forbidden_chars = ['/', '\\', '\0', ':']
        for char in forbidden_chars:
            if char in filename:
                return f'文件名不能包含特殊字符: {char}'
        
        return None
    
    def _get_entry_type(self, dir_inode: INode, filename: str) -> Optional[str]:
        """获取目录项的类型（DIRECTORY或REGULAR），不存在返回None"""
        inode_id = self._find_in_directory(dir_inode, filename)
        if inode_id is None:
            return None
        file_inode = self._get_inode(inode_id)
        if not file_inode:
            return None
        return file_inode.file_type.name
    
    def create_file(self, filename: str, content: bytes = b'', 
                    permissions: int = PERM_READ | PERM_WRITE) -> Dict[str, Any]:
        """
        创建新文件
        
        Args:
            filename: 文件名
            content: 文件内容
            permissions: 文件权限
            
        Returns:
            操作结果字典
        """
        with self.lock:
            # 验证文件名
            error = self._validate_filename(filename)
            if error:
                return {'success': False, 'error': error}
            
            # 获取当前目录
            dir_inode = self._get_inode(self.current_dir_inode)
            if not dir_inode:
                return {'success': False, 'error': '当前目录无效'}
            
            # 检查名称是否已存在
            existing_type = self._get_entry_type(dir_inode, filename)
            if existing_type:
                if existing_type == 'DIRECTORY':
                    return {'success': False, 'error': f'已存在同名目录 "{filename}"，无法创建文件'}
                else:
                    return {'success': False, 'error': f'文件 "{filename}" 已存在'}
            
            # 分配iNode
            new_inode_id = self._allocate_inode()
            if new_inode_id is None:
                return {'success': False, 'error': 'iNode空间不足'}
            
            # 计算需要的块数
            block_count = (len(content) + BLOCK_SIZE - 1) // BLOCK_SIZE
            if block_count == 0:
                block_count = 1  # 至少分配一个块
            
            # 创建新iNode
            current_time = int(time.time())
            new_inode = INode(
                inode_id=new_inode_id,
                file_type=FileType.REGULAR,
                permissions=permissions,
                size=len(content),
                create_time=current_time,
                modify_time=current_time,
                link_count=1,
                direct_blocks=[0] * DIRECT_BLOCKS,
                single_indirect=0,
                double_indirect=0
            )
            
            # 分配数据块
            if not self._allocate_file_blocks(new_inode, block_count):
                self._free_inode(new_inode_id)
                return {'success': False, 'error': '磁盘空间不足'}
            
            # 写入文件内容
            blocks = self._get_file_blocks(new_inode)
            for i, block_id in enumerate(blocks):
                start = i * BLOCK_SIZE
                end = start + BLOCK_SIZE
                block_data = content[start:end]
                if len(block_data) < BLOCK_SIZE:
                    block_data = block_data + b'\x00' * (BLOCK_SIZE - len(block_data))
                
                # 通知进度
                notify_progress('write', filename, i + 1, len(blocks), block_id)
                
                self.disk.write_block(block_id, block_data)
                time.sleep(IO_DELAY)  # I/O延时，用于可视化
            
            # 保存iNode
            self._save_inode(new_inode)
            
            # 添加目录项
            entry = DirectoryEntry(name=filename, inode_id=new_inode_id)
            if not self._add_directory_entry(dir_inode, entry):
                self._free_file_blocks(new_inode)
                self._free_inode(new_inode_id)
                return {'success': False, 'error': '无法添加目录项'}
            
            return {
                'success': True,
                'inode_id': new_inode_id,
                'blocks': blocks,
                'size': len(content),
                'message': f'文件 {filename} 创建成功'
            }
    
    def read_file(self, filename: str, block_index: int = -1) -> Dict[str, Any]:
        """
        读取文件内容
        
        Args:
            filename: 文件名
            block_index: 要读取的块索引，-1表示读取全部
            
        Returns:
            文件内容和元信息
        """
        with self.lock:
            # 获取当前目录
            dir_inode = self._get_inode(self.current_dir_inode)
            if not dir_inode:
                return {'success': False, 'error': '当前目录无效'}
            
            # 查找文件
            inode_id = self._find_in_directory(dir_inode, filename)
            if inode_id is None:
                return {'success': False, 'error': f'文件 {filename} 不存在'}
            
            file_inode = self._get_inode(inode_id)
            if not file_inode or file_inode.file_type != FileType.REGULAR:
                return {'success': False, 'error': f'{filename} 不是普通文件'}
            
            # 获取文件块
            blocks = self._get_file_blocks(file_inode)
            
            if block_index >= 0:
                # 读取指定块
                if block_index >= len(blocks):
                    return {'success': False, 'error': f'块索引 {block_index} 超出范围'}
                
                # 通知进度
                notify_progress('read', filename, 1, 1, blocks[block_index])
                
                block_data = self.disk.read_block(blocks[block_index])
                time.sleep(IO_DELAY)
                
                return {
                    'success': True,
                    'content': block_data,
                    'block_id': blocks[block_index],
                    'block_index': block_index
                }
            else:
                # 读取全部内容
                content = bytearray()
                for i, block_id in enumerate(blocks):
                    # 通知进度
                    notify_progress('read', filename, i + 1, len(blocks), block_id)
                    
                    block_data = self.disk.read_block(block_id)
                    content.extend(block_data)
                    time.sleep(IO_DELAY)
                
                # 截断到实际大小
                content = bytes(content[:file_inode.size])
                
                return {
                    'success': True,
                    'content': content,
                    'inode_id': inode_id,
                    'size': file_inode.size,
                    'blocks': blocks,
                    'create_time': file_inode.create_time,
                    'modify_time': file_inode.modify_time
                }
    
    def write_file(self, filename: str, content: bytes, block_index: int = -1) -> Dict[str, Any]:
        """
        修改文件内容
        
        Args:
            filename: 文件名
            content: 要写入的内容
            block_index: 要修改的块索引，-1表示替换全部内容
            
        Returns:
            操作结果
        """
        with self.lock:
            # 检查文件是否被其他进程打开
            dir_inode = self._get_inode(self.current_dir_inode)
            inode_id = self._find_in_directory(dir_inode, filename)
            
            if inode_id is None:
                return {'success': False, 'error': f'文件 {filename} 不存在'}
            
            # 检查文件是否正在被使用
            if inode_id in self.open_files:
                return {'success': False, 'error': f'文件 {filename} 正在被使用'}
            
            file_inode = self._get_inode(inode_id)
            if not file_inode or file_inode.file_type != FileType.REGULAR:
                return {'success': False, 'error': f'{filename} 不是普通文件'}
            
            blocks = self._get_file_blocks(file_inode)
            
            if block_index >= 0:
                # 修改指定块
                if block_index >= len(blocks):
                    return {'success': False, 'error': f'块索引 {block_index} 超出范围'}
                
                block_data = content[:BLOCK_SIZE]
                if len(block_data) < BLOCK_SIZE:
                    block_data = block_data + b'\x00' * (BLOCK_SIZE - len(block_data))
                
                self.disk.write_block(blocks[block_index], block_data)
                time.sleep(IO_DELAY)
            else:
                # 替换全部内容
                new_block_count = (len(content) + BLOCK_SIZE - 1) // BLOCK_SIZE
                if new_block_count == 0:
                    new_block_count = 1
                
                # 释放多余的块或分配新块
                if new_block_count != len(blocks):
                    if new_block_count < len(blocks):
                        # 释放多余的块
                        for block_id in blocks[new_block_count:]:
                            self.disk.free_block(block_id)
                    else:
                        # 分配新块
                        if not self._allocate_file_blocks(file_inode, new_block_count):
                            return {'success': False, 'error': '磁盘空间不足'}
                
                # 写入内容
                blocks = self._get_file_blocks(file_inode)
                for i, block_id in enumerate(blocks):
                    start = i * BLOCK_SIZE
                    end = start + BLOCK_SIZE
                    block_data = content[start:end]
                    if len(block_data) < BLOCK_SIZE:
                        block_data = block_data + b'\x00' * (BLOCK_SIZE - len(block_data))
                    
                    # 通知进度
                    notify_progress('write', filename, i + 1, len(blocks), block_id)
                    
                    self.disk.write_block(block_id, block_data)
                    time.sleep(IO_DELAY)
                
                file_inode.size = len(content)
            
            # 更新修改时间
            file_inode.modify_time = int(time.time())
            self._save_inode(file_inode)
            
            return {
                'success': True,
                'message': f'文件 {filename} 修改成功',
                'new_size': len(content) if block_index < 0 else file_inode.size
            }
    
    def delete_file(self, filename: str, process_id: int = None) -> Dict[str, Any]:
        """
        删除文件
        
        Args:
            filename: 文件名
            process_id: 发起删除的进程ID
            
        Returns:
            操作结果
        """
        with self.lock:
            # 验证文件名
            if not filename or filename in ('.', '..'):
                return {'success': False, 'error': '无效的文件名'}
            
            dir_inode = self._get_inode(self.current_dir_inode)
            if not dir_inode:
                return {'success': False, 'error': '当前目录无效'}
            
            inode_id = self._find_in_directory(dir_inode, filename)
            if inode_id is None:
                return {'success': False, 'error': f'"{filename}" 不存在'}
            
            # 检查是否试图删除当前工作路径中的目录
            if inode_id in self.inode_stack:
                return {'success': False, 'error': f'无法删除 "{filename}"：目录正在使用中'}
            
            # 检查文件是否正在被使用（文件保护）
            if inode_id in self.open_files:
                return {'success': False, 'error': f'"{filename}" 正在被使用，无法删除'}
            
            file_inode = self._get_inode(inode_id)
            if not file_inode:
                return {'success': False, 'error': f'无法读取 "{filename}" 的信息'}
            
            if file_inode.file_type == FileType.DIRECTORY:
                # 检查目录是否为空
                entries = self._read_directory(file_inode)
                if entries:
                    return {'success': False, 'error': f'目录 "{filename}" 不为空，请先删除目录内的文件'}
            
            # 获取要释放的块列表（用于返回信息）
            blocks_to_free = self._get_file_blocks(file_inode)
            
            # 通知开始删除
            notify_progress('delete', filename, 0, len(blocks_to_free) + 1, inode_id)
            
            # 释放文件数据块（带进度通知）
            self._free_file_blocks_with_progress(file_inode, filename)
            
            # 释放iNode
            self._free_inode(inode_id)
            
            # 通知iNode释放
            notify_progress('delete', filename, len(blocks_to_free) + 1, len(blocks_to_free) + 1, inode_id)
            
            # 从目录中移除条目
            self._remove_directory_entry(dir_inode, filename)
            
            return {
                'success': True,
                'message': f'文件 {filename} 删除成功',
                'freed_inode': inode_id,
                'freed_blocks': blocks_to_free,
                'freed_block_count': len(blocks_to_free)
            }
    
    def list_directory(self) -> Dict[str, Any]:
        """
        列出当前目录内容
        
        Returns:
            目录内容列表
        """
        with self.lock:
            dir_inode = self._get_inode(self.current_dir_inode)
            if not dir_inode:
                return {'success': False, 'error': '当前目录无效'}
            
            entries = self._read_directory(dir_inode)
            
            files = []
            for entry in entries:
                file_inode = self._get_inode(entry.inode_id)
                if file_inode:
                    blocks = self._get_file_blocks(file_inode)
                    files.append({
                        'name': entry.name,
                        'inode_id': entry.inode_id,
                        'type': file_inode.file_type.name,
                        'size': file_inode.size,
                        'blocks': len(blocks),
                        'block_ids': blocks,
                        'permissions': file_inode.permissions,
                        'create_time': file_inode.create_time,
                        'modify_time': file_inode.modify_time
                    })
            
            # 计算当前路径
            current_path = '/' + '/'.join(self.path_stack) if self.path_stack else '/'
            
            return {
                'success': True,
                'current_inode': self.current_dir_inode,
                'current_path': current_path,
                'can_go_back': len(self.inode_stack) > 1,
                'files': files,
                'total': len(files)
            }
    
    def create_directory(self, dirname: str) -> Dict[str, Any]:
        """创建目录"""
        with self.lock:
            # 验证目录名
            error = self._validate_filename(dirname)
            if error:
                return {'success': False, 'error': error}
            
            dir_inode = self._get_inode(self.current_dir_inode)
            if not dir_inode:
                return {'success': False, 'error': '当前目录无效'}
            
            # 检查名称是否已存在
            existing_type = self._get_entry_type(dir_inode, dirname)
            if existing_type:
                if existing_type == 'DIRECTORY':
                    return {'success': False, 'error': f'目录 "{dirname}" 已存在'}
                else:
                    return {'success': False, 'error': f'已存在同名文件 "{dirname}"，无法创建目录'}
            
            # 分配iNode
            new_inode_id = self._allocate_inode()
            if new_inode_id is None:
                return {'success': False, 'error': 'iNode空间不足'}
            
            # 分配一个块给目录
            block_id = self.disk.allocate_block()
            if block_id is None:
                self._free_inode(new_inode_id)
                return {'success': False, 'error': '磁盘空间不足'}
            
            # 创建新目录iNode
            current_time = int(time.time())
            new_inode = INode(
                inode_id=new_inode_id,
                file_type=FileType.DIRECTORY,
                permissions=PERM_READ | PERM_WRITE | PERM_EXECUTE,
                size=0,
                create_time=current_time,
                modify_time=current_time,
                link_count=1,
                direct_blocks=[block_id] + [0] * (DIRECT_BLOCKS - 1),
                single_indirect=0,
                double_indirect=0
            )
            self._save_inode(new_inode)
            
            # 添加目录项
            entry = DirectoryEntry(name=dirname, inode_id=new_inode_id)
            if not self._add_directory_entry(dir_inode, entry):
                self.disk.free_block(block_id)
                self._free_inode(new_inode_id)
                return {'success': False, 'error': '无法添加目录项'}
            
            return {
                'success': True,
                'inode_id': new_inode_id,
                'message': f'目录 {dirname} 创建成功'
            }
    
    def change_directory(self, dirname: str) -> Dict[str, Any]:
        """切换目录"""
        with self.lock:
            if dirname == '..':
                # 返回上级目录
                if len(self.inode_stack) <= 1:
                    # 已经在根目录
                    return {
                        'success': True,
                        'current_inode': 0,
                        'current_path': '/',
                        'message': '已在根目录'
                    }
                
                # 弹出当前目录
                self.inode_stack.pop()
                self.path_stack.pop()
                self.current_dir_inode = self.inode_stack[-1]
                
                current_path = '/' + '/'.join(self.path_stack) if self.path_stack else '/'
                return {
                    'success': True,
                    'current_inode': self.current_dir_inode,
                    'current_path': current_path,
                    'message': '返回上级目录'
                }
            
            dir_inode = self._get_inode(self.current_dir_inode)
            if not dir_inode:
                return {'success': False, 'error': '当前目录无效'}
            
            target_inode_id = self._find_in_directory(dir_inode, dirname)
            if target_inode_id is None:
                return {'success': False, 'error': f'目录 {dirname} 不存在'}
            
            target_inode = self._get_inode(target_inode_id)
            if not target_inode or target_inode.file_type != FileType.DIRECTORY:
                return {'success': False, 'error': f'{dirname} 不是目录'}
            
            self.current_dir_inode = target_inode_id
            # 更新路径栈
            self.path_stack.append(dirname)
            self.inode_stack.append(target_inode_id)
            
            current_path = '/' + '/'.join(self.path_stack)
            return {
                'success': True,
                'current_inode': self.current_dir_inode,
                'current_path': current_path,
                'message': f'切换到目录 {dirname}'
            }
    
    def open_file(self, filename: str, process_id: int, mode: str = 'r') -> Dict[str, Any]:
        """
        打开文件（非阻塞I/O方式）
        
        Args:
            filename: 文件名
            process_id: 进程ID
            mode: 打开模式 ('r', 'w', 'rw')
        """
        with self.lock:
            dir_inode = self._get_inode(self.current_dir_inode)
            inode_id = self._find_in_directory(dir_inode, filename)
            
            if inode_id is None:
                return {'success': False, 'error': f'文件 {filename} 不存在', 'would_block': False}
            
            # 非阻塞I/O：如果文件正在被其他进程以写模式打开，立即返回
            if inode_id in self.open_files:
                existing = self.open_files[inode_id]
                if 'w' in existing['mode'] or 'w' in mode:
                    return {
                        'success': False,
                        'error': f'文件 {filename} 正在被进程 {existing["process_id"]} 使用',
                        'would_block': True  # 非阻塞I/O标志
                    }
            
            self.open_files[inode_id] = {
                'process_id': process_id,
                'mode': mode,
                'open_time': time.time()
            }
            
            return {
                'success': True,
                'inode_id': inode_id,
                'message': f'文件 {filename} 已打开'
            }
    
    def close_file(self, filename: str, process_id: int) -> Dict[str, Any]:
        """关闭文件"""
        with self.lock:
            dir_inode = self._get_inode(self.current_dir_inode)
            inode_id = self._find_in_directory(dir_inode, filename)
            
            if inode_id is None:
                return {'success': False, 'error': f'文件 {filename} 不存在'}
            
            if inode_id not in self.open_files:
                return {'success': False, 'error': f'文件 {filename} 未打开'}
            
            if self.open_files[inode_id]['process_id'] != process_id:
                return {'success': False, 'error': f'文件 {filename} 不属于进程 {process_id}'}
            
            del self.open_files[inode_id]
            return {
                'success': True,
                'message': f'文件 {filename} 已关闭'
            }
    
    def get_file_info(self, filename: str) -> Dict[str, Any]:
        """获取文件详细信息"""
        with self.lock:
            dir_inode = self._get_inode(self.current_dir_inode)
            if not dir_inode:
                return {'success': False, 'error': '当前目录无效'}
            
            inode_id = self._find_in_directory(dir_inode, filename)
            if inode_id is None:
                return {'success': False, 'error': f'文件 {filename} 不存在'}
            
            file_inode = self._get_inode(inode_id)
            if not file_inode:
                return {'success': False, 'error': f'无法读取文件 {filename} 的iNode'}
            
            blocks = self._get_file_blocks(file_inode)
            
            return {
                'success': True,
                'name': filename,
                'inode_id': inode_id,
                'type': file_inode.file_type.name,
                'size': file_inode.size,
                'blocks': blocks,
                'block_count': len(blocks),
                'permissions': file_inode.permissions,
                'create_time': file_inode.create_time,
                'modify_time': file_inode.modify_time,
                'is_open': inode_id in self.open_files
            }
    
    def get_filesystem_stats(self) -> Dict[str, Any]:
        """获取文件系统统计信息"""
        with self.lock:
            disk_info = self.disk.get_disk_info()
            used_inodes = sum(1 for x in self.inode_bitmap if x)
            
            return {
                'total_blocks': disk_info['total_blocks'],
                'free_blocks': disk_info['free_blocks'],
                'used_blocks': disk_info['used_blocks'],
                'total_inodes': MAX_INODES,
                'used_inodes': used_inodes,
                'free_inodes': MAX_INODES - used_inodes,
                'block_size': BLOCK_SIZE,
                'open_files': len(self.open_files)
            }
    
    def get_current_path(self) -> Dict[str, Any]:
        """获取当前工作目录路径"""
        with self.lock:
            current_path = '/' + '/'.join(self.path_stack) if self.path_stack else '/'
            return {
                'success': True,
                'current_path': current_path,
                'current_inode': self.current_dir_inode,
                'can_go_back': len(self.inode_stack) > 1
            }
    
    def reset_to_root(self):
        """重置到根目录"""
        with self.lock:
            self.current_dir_inode = 0
            self.path_stack = []
            self.inode_stack = [0]

