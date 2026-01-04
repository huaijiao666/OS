# -*- coding: utf-8 -*-
"""
操作系统课程设计 - 配置文件
模拟磁盘和文件系统的全局配置
"""

# ==================== 磁盘配置 ====================
BLOCK_SIZE = 64          # 每个盘块大小（字节）M=64B
BLOCK_COUNT = 1024       # 盘块数量 N=1024
DISK_SIZE = BLOCK_SIZE * BLOCK_COUNT  # 总磁盘大小 64KB

# ==================== 磁盘布局 ====================
# 前部用于存放元数据，后部用于存放文件内容
SUPERBLOCK_BLOCKS = 1    # 超级块占用的块数
BITMAP_BLOCKS = 2        # 位图占用的块数（1024位 = 128字节 = 2块）
INODE_BLOCKS = 32        # iNode区占用的块数
DATA_START_BLOCK = SUPERBLOCK_BLOCKS + BITMAP_BLOCKS + INODE_BLOCKS  # 数据区起始块号

# ==================== iNode配置 ====================
INODE_SIZE = 64          # 每个iNode大小（字节）
INODES_PER_BLOCK = BLOCK_SIZE // INODE_SIZE  # 每块可存放的iNode数
MAX_INODES = INODE_BLOCKS * INODES_PER_BLOCK  # 最大iNode数量

# 索引结构配置（混合索引）
DIRECT_BLOCKS = 6        # 直接索引块数
SINGLE_INDIRECT = 1      # 一级间接索引
DOUBLE_INDIRECT = 1      # 二级间接索引
POINTERS_PER_BLOCK = BLOCK_SIZE // 2  # 每块可存放的指针数（2字节/指针）

# ==================== 内存缓冲配置 ====================
BUFFER_PAGE_COUNT = 8    # 缓冲页数量改为 8
BUFFER_PAGE_SIZE = BLOCK_SIZE  # 缓冲页大小等于盘块大小

# ==================== 进程调度配置 ====================
TIME_QUANTUM = 100       # 时间片大小（毫秒）
MAX_PROCESSES = 32       # 最大进程数

# ==================== 文件权限 ====================
PERM_READ = 0b100        # 读权限
PERM_WRITE = 0b010       # 写权限
PERM_EXECUTE = 0b001     # 执行权限

# ==================== 可视化配置 ====================
IO_DELAY = 0.3           # I/O操作延时（秒），用于可视化观察
PAGE_SWAP_DELAY = 0.5    # 页面置换延时（秒）

# ==================== 磁盘文件路径 ====================
DISK_FILE_PATH = "virtual_disk.bin"  # 模拟磁盘文件路径

