# 操作系统课程设计 - 文件系统模拟器

## 📖 项目简介

本项目是一个完整的操作系统文件系统模拟器，用于模拟实现操作系统的核心功能，包括磁盘管理、文件系统、内存缓冲、进程管理和调度等。该项目采用现代化的Web技术栈，提供美观的可视化界面和良好的人机交互体验。

### 选择的实现方案

| 模块 | 实现方式 |
|------|----------|
| 文件访问方式 | 非阻塞I/O |
| 通信模式 | 共享内存 |
| 同步机制 | 条件变量 |
| 调度策略 | 时间片轮转(RR) |
| 磁盘组织方式 | 位图+索引 |

## 🏗️ 项目架构

```
OS-Project/
├── backend/                  # Flask 后端（纯 API + WebSocket）
│   ├── app.py               # 主入口，提供 /api/* 与 Socket.IO
│   ├── config.py            # 全局配置
│   ├── core/                # 内核模拟模块（磁盘/文件系统/进程/调度/IPC）
│   └── pyproject.toml       # Python 依赖与配置
└── frontend/                # React 前端（Vite + TypeScript）
    ├── index.html           # Vite 入口文件
    ├── package.json         # 前端依赖与脚本
    ├── vite.config.ts       # 开发代理到 http://localhost:3456
    └── src/                 # 组件与样式
        ├── App.tsx
        ├── components/
        ├── services/api.ts  # 与后端交互
        └── styles/index.css # 迁移的原样式表
```

## 🔧 技术栈

### 后端
- **Python 3.8+** - 主要编程语言
- **Flask** - Web框架
- **Flask-SocketIO** - WebSocket实时通信
- **Flask-CORS** - 跨域支持
- **threading** - 多线程支持

### 前端
- **React + TypeScript (Vite)** - 组件化单页应用
- **Socket.IO Client** - WebSocket 客户端
- **CSS Grid/Flexbox** - 现代布局
- **CSS Variables** - 主题定制

## 📦 安装与运行

### 1. 环境要求
- Python 3.8 或更高版本
- pip 包管理器

### 2. 安装依赖
```bash
# 后端
cd backend
pip install -e .

# 前端
cd ../frontend
npm install
```

### 3. 启动服务
```bash
# 后端 API (Flask + Socket.IO)
cd backend
python app.py  # 默认监听 http://localhost:3456

# 前端 (Vite 开发服务器)
cd ../frontend
npm run dev    # 默认 http://localhost:5173，经 vite.config.ts 代理 /api 与 /socket.io
```

### 4. 访问界面
浏览器打开 http://localhost:5173 （生产环境请先 npm run build 再用静态服务器托管 dist/）

## 🎯 功能模块详解

### 1. 虚拟磁盘模块 (disk.py)

#### 磁盘结构
- **总大小**: 64KB (1024块 × 64字节/块)
- **布局**:
  - 块0: 超级块
  - 块1-2: 位图区
  - 块3-34: iNode区
  - 块35-1023: 数据区

#### 核心功能
```python
class VirtualDisk:
    def allocate_block() -> int          # 分配空闲块
    def free_block(block_id: int)        # 释放块
    def read_block(block_id: int) -> bytes   # 读块
    def write_block(block_id: int, data: bytes)  # 写块
    def get_bitmap_status() -> List[bool]    # 获取位图状态
```

#### 位图管理算法
```
位图采用字节数组存储，每个bit对应一个磁盘块
- 0 表示空闲
- 1 表示已使用

分配算法：线性扫描找到第一个空闲位
时间复杂度：O(N)，N为总块数
```

### 2. 文件系统模块 (filesystem.py)

#### iNode结构 (64字节)
| 偏移 | 大小 | 字段 |
|------|------|------|
| 0-1 | 2B | iNode ID |
| 2 | 1B | 文件类型 (0=空闲, 1=目录, 2=文件) |
| 3 | 1B | 权限 (rwx) |
| 4-7 | 4B | 文件大小 |
| 8-15 | 8B | 创建时间 |
| 16-23 | 8B | 修改时间 |
| 24-25 | 2B | 链接计数 |
| 26-37 | 12B | 直接索引块 (6个) |
| 38-39 | 2B | 一级间接索引 |
| 40-41 | 2B | 二级间接索引 |
| 42-63 | 22B | 保留 |

#### 混合索引结构
```
文件块索引采用混合索引方式：
- 直接索引：6个直接块指针，可寻址 6×64B = 384B
- 一级间接：1个间接块指针，可寻址 32×64B = 2KB
- 二级间接：1个二级间接块指针，可寻址 32×32×64B = 64KB

最大文件大小：384B + 2KB + 64KB ≈ 66KB
```

#### 目录项结构 (26字节)
| 偏移 | 大小 | 字段 |
|------|------|------|
| 0-23 | 24B | 文件名 (UTF-8) |
| 24-25 | 2B | iNode号 |

#### 文件操作API
```python
class FileSystem:
    def create_file(filename, content, permissions)  # 创建文件
    def read_file(filename, block_index)             # 读取文件
    def write_file(filename, content, block_index)   # 修改文件
    def delete_file(filename)                        # 删除文件
    def list_directory()                             # 列目录
    def create_directory(dirname)                    # 创建目录
    def open_file(filename, process_id, mode)        # 打开文件
    def close_file(filename, process_id)             # 关闭文件
```

#### 非阻塞I/O实现
```python
def open_file(self, filename, process_id, mode):
    # 非阻塞I/O：如果文件被占用，立即返回而不等待
    if inode_id in self.open_files:
        existing = self.open_files[inode_id]
        if 'w' in existing['mode'] or 'w' in mode:
            return {
                'success': False,
                'would_block': True  # 非阻塞标志
            }
```

### 3. 内存缓冲模块 (buffer.py)

#### 缓冲页结构
```python
@dataclass
class BufferPage:
    page_id: int           # 缓冲页ID
    block_id: int          # 对应磁盘块号
    owner_process: int     # 所有者进程
    data: bytearray        # 页面数据
    state: PageState       # FREE/CLEAN/DIRTY
    access_time: float     # 最后访问时间
    is_pinned: bool        # 是否钉住
```

#### 配置参数
- 缓冲页数量 K = 16
- 每页大小 = 64B（与磁盘块相同）

#### LRU页面置换算法
```python
def _find_victim_lru(self) -> Optional[int]:
    """
    LRU算法选择牺牲页：
    1. 遍历所有未钉住的页面
    2. 选择access_time最小的页面
    3. 如果页面是脏页，先写回磁盘
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
```

#### 条件变量同步
```python
class BufferManager:
    def __init__(self):
        self.lock = threading.RLock()
        self.condition = threading.Condition(self.lock)
    
    def wait_for_page(self, block_id, process_id, timeout=None):
        """使用条件变量等待页面可用"""
        with self.condition:
            while True:
                page_id = self.get_page(block_id, process_id)
                if page_id is not None:
                    return page_id
                self.condition.wait(timeout)
```

### 4. 进程管理模块 (process.py)

#### 进程控制块 (PCB)
```python
@dataclass
class Process:
    pid: int                    # 进程ID
    name: str                   # 进程名称
    state: ProcessState         # NEW/READY/RUNNING/BLOCKED/TERMINATED
    command: CommandType        # 命令类型
    args: Dict[str, Any]        # 命令参数
    result: Any                 # 执行结果
    time_slice: int             # 分配的时间片
    remaining_time: int         # 剩余时间片
```

#### 进程状态转换
```
     ┌─────────────────────────────┐
     │                             ▼
   NEW ──► READY ◄──► RUNNING ──► TERMINATED
             │            │
             │            ▼
             └───────► BLOCKED
                          │
                          └──────────┘
```

### 5. 共享内存模块 (ipc.py)

#### 共享内存实现
```python
class SharedMemorySegment:
    def __init__(self, key: int, size: int):
        self.data = bytearray(size)
        self.lock = threading.RLock()
        self.condition = threading.Condition(self.lock)
        self.readers = 0
        self.writers = 0
    
    def read(self, offset, length, process_id):
        """读者-写者问题：允许多个读者同时读"""
        with self.condition:
            while self.writers > 0:
                self.condition.wait()
            self.readers += 1
        # ... 读取数据 ...
    
    def write(self, offset, data, process_id):
        """写者需要独占访问"""
        with self.condition:
            while self.readers > 0 or self.writers > 0:
                self.condition.wait()
            self.writers += 1
        # ... 写入数据 ...
```

### 6. RR调度器模块 (scheduler.py)

#### 时间片轮转算法
```python
class RRScheduler:
    def __init__(self, process_manager, time_quantum=100):
        self.time_quantum = time_quantum  # 默认100ms
        self.ready_queue: List[int] = []  # 就绪队列
    
    def _scheduler_loop(self):
        while self.state == SchedulerState.RUNNING:
            next_pid = self._select_next_process()
            
            if next_pid is None:
                # 空闲等待
                continue
            
            # 调度进程运行
            self._dispatch(next_pid)
            
            # 运行一个时间片
            self._run_time_slice()
    
    def _run_time_slice(self):
        """运行一个时间片后抢占"""
        time.sleep(self.time_quantum / 1000.0)
        
        if process.state == ProcessState.RUNNING:
            # 时间片用完，放回队列尾部
            self._preempt_current()
```

#### RR调度流程
```
1. 从就绪队列头部取出进程
2. 分配CPU给该进程
3. 运行一个时间片
4. 时间片用完后：
   - 如果进程完成：标记为TERMINATED
   - 如果进程阻塞：放入阻塞队列
   - 否则：放回就绪队列尾部
5. 重复步骤1
```

## 🖥️ 前端界面

### 功能面板
1. **仪表盘** - 系统状态总览
2. **文件管理** - 文件的增删改查
3. **磁盘可视化** - 位图显示磁盘块使用情况
4. **内存缓冲** - 缓冲页状态和置换日志
5. **进程管理** - 进程列表和状态
6. **调度器** - RR调度器控制和事件
7. **终端** - 命令行界面

### 终端命令
```
ls              - 列出当前目录文件
cat <file>      - 查看文件内容
touch <file> [content] - 创建文件
rm <file>       - 删除文件
mkdir <dir>     - 创建目录
cd <dir>        - 切换目录
info <file>     - 查看文件信息
disk            - 查看磁盘状态
buffer          - 查看缓冲区状态
ps              - 查看进程列表
clear           - 清空终端
help            - 显示帮助
```

## 📊 可视化特性

### 磁盘位图可视化
- 不同颜色区分：超级块(红)、位图(橙)、iNode区(紫)、已用块(青)、空闲块(灰)
- 点击块查看十六进制和文本内容
- 实时更新显示

### 缓冲区可视化
- 显示16个缓冲页状态
- 颜色区分：空闲/干净/脏页
- 置换日志实时显示

### 调度器可视化
- 就绪队列显示
- 调度事件时间线
- CPU利用率统计

## 🔒 同步与互斥机制

### 条件变量使用场景
1. **缓冲区管理**
   - 等待空闲缓冲页
   - 页面写回完成通知

2. **共享内存访问**
   - 读者-写者问题
   - 写者独占访问

3. **进程同步**
   - 等待进程完成
   - 就绪队列通知

### 锁的使用
- `threading.RLock()` - 可重入锁，防止死锁
- `threading.Condition()` - 条件变量

## 📈 性能指标

系统提供以下性能统计：
- 磁盘使用率
- 缓冲区命中率
- 页面置换次数
- 上下文切换次数
- CPU利用率

## 🧪 测试方法

### 功能测试
1. 创建/删除文件
2. 读写文件内容
3. 目录操作
4. 并发文件访问

### 性能测试
1. 大文件读写
2. 多进程并发
3. 缓冲区压力测试

## ⚠️ 注意事项

1. 虚拟磁盘文件 `virtual_disk.bin` 会在首次运行时自动创建
2. 格式化磁盘会清除所有数据
3. 文件名最大长度24字节（UTF-8编码）
4. 单文件最大约66KB

## 📝 开发日志

- 2025-01-03: 项目初始化，完成核心模块设计
- 实现虚拟磁盘和位图管理
- 实现文件系统和混合索引
- 实现LRU缓冲区管理
- 实现进程管理和RR调度
- 实现共享内存和条件变量
- 完成前端可视化界面

## 📚 参考资料

1. 《操作系统概念》(Operating System Concepts)
2. 《现代操作系统》(Modern Operating Systems)
3. Linux文件系统设计
4. Flask官方文档

## 👥 团队分工

请根据实际情况填写团队成员和分工...

---

© 2025 操作系统课程设计

