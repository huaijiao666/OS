# 操作系统课程设计 - 文件系统模拟器

## 📖 项目简介

本项目是一个完整的操作系统文件系统模拟器，用于模拟实现操作系统的核心功能，包括磁盘管理、文件系统、内存缓冲、进程管理和调度等。该项目采用现代化的 Web 技术栈，提供美观的可视化界面和良好的人机交互体验。

### 实现方案

| 模块         | 实现方式       |
| ------------ | -------------- |
| 数据组织     | 混合索引方式   |
| 空闲块管理   | 位示图法       |
| 文件访问方式 | 非阻塞 I/O     |
| 进程通信     | 共享内存       |
| 同步机制     | 条件变量       |
| 调度策略     | 时间片轮转(RR) |

## 🏗️ 项目结构

```
OS/
├── backend/                    # Python 后端 (Flask + SocketIO)
│   ├── app.py                 # Flask 主应用，提供 RESTful API 和 WebSocket
│   ├── config.py              # 全局配置（磁盘参数、缓冲区大小等）
│   ├── main.py                # 备用入口
│   ├── virtual_disk.bin       # 虚拟磁盘文件（运行时自动生成）
│   └── core/                  # 核心模块
│       ├── __init__.py
│       ├── disk.py            # 虚拟磁盘模块（位图管理）
│       ├── filesystem.py      # 文件系统模块（iNode、目录、混合索引）
│       ├── buffer.py          # 内存缓冲模块（LRU 页面置换）
│       ├── process.py         # 进程管理模块（PCB、状态转换）
│       ├── scheduler.py       # 调度器模块（时间片轮转 RR）
│       └── ipc.py             # 进程通信模块（共享内存、条件变量）
│
├── frontend/                   # React 前端 (Vite + TypeScript)
│   ├── index.html             # Vite 入口
│   ├── package.json           # 前端依赖
│   ├── vite.config.ts         # Vite 配置（代理 /api 到后端）
│   ├── tsconfig.json          # TypeScript 配置
│   └── src/
│       ├── App.tsx            # 主应用组件
│       ├── main.tsx           # 入口文件
│       ├── components/        # UI 组件
│       │   ├── Sidebar.tsx    # 侧边栏导航
│       │   ├── TopBar.tsx     # 顶部工具栏
│       │   ├── Modal.tsx      # 模态框组件
│       │   ├── Toast.tsx      # 消息提示组件
│       │   └── panels/        # 功能面板
│       │       ├── Dashboard.tsx      # 仪表盘
│       │       ├── FilesPanel.tsx     # 文件管理
│       │       ├── DiskPanel.tsx      # 磁盘可视化
│       │       ├── BufferPanel.tsx    # 缓冲区管理
│       │       ├── ProcessPanel.tsx   # 进程管理
│       │       ├── SchedulerPanel.tsx # 调度器
│       │       └── TerminalPanel.tsx  # 终端
│       ├── services/
│       │   └── api.ts         # API 服务（HTTP + WebSocket）
│       ├── types/
│       │   └── index.ts       # TypeScript 类型定义
│       └── styles/
│           └── index.css      # 全局样式
│
└── docs/                       # 文档目录
    ├── 题目.md                # 课设题目要求
    ├── 报告模板.md            # 报告格式模板
    ├── 使用说明.md            # 系统使用手册
    └── 课设报告.md            # 完整课设报告
```

## 🔧 技术栈

### 后端

| 技术              | 用途           |
| ----------------- | -------------- |
| Python 3.8+       | 主要编程语言   |
| Flask             | Web 框架       |
| Flask-SocketIO    | WebSocket 通信 |
| Flask-CORS        | 跨域支持       |
| threading         | 多线程/同步    |

### 前端

| 技术              | 用途           |
| ----------------- | -------------- |
| React 18          | UI 框架        |
| TypeScript        | 类型安全       |
| Vite              | 构建工具       |
| Socket.IO Client  | WebSocket 客户端 |
| CSS Grid/Flexbox  | 现代布局       |

## 📦 安装与运行

### 环境要求

- Python 3.8+
- Node.js 16+
- npm 或 yarn

### 安装依赖

```bash
# 后端依赖
cd backend
pip install flask flask-cors flask-socketio

# 前端依赖
cd ../frontend
npm install
```

### 启动服务

```bash
# 终端 1：启动后端（端口 3456）
cd backend
python app.py

# 终端 2：启动前端（端口 5173）
cd frontend
npm run dev
```

### 访问系统

浏览器打开 http://localhost:5173

## 🎯 核心模块

### 1. 虚拟磁盘 (disk.py)

**磁盘规格：**
- 块大小：64 字节 (M=64)
- 块数量：1024 块 (N=1024)
- 总容量：64 KB

**磁盘布局：**
```
┌──────────┬──────────┬──────────────┬─────────────────────┐
│  超级块   │  位图区   │    iNode区    │       数据区         │
│  (1块)   │  (2块)   │   (32块)     │     (989块)         │
│  块 0    │ 块 1-2   │  块 3-34     │    块 35-1023       │
└──────────┴──────────┴──────────────┴─────────────────────┘
```

**位示图管理：**
- 每个 bit 对应一个磁盘块
- 0 = 空闲，1 = 已使用
- 支持块的分配与释放

### 2. 文件系统 (filesystem.py)

**iNode 结构（64 字节）：**

| 偏移    | 大小 | 字段           |
| ------- | ---- | -------------- |
| 0-1     | 2B   | iNode ID       |
| 2       | 1B   | 文件类型       |
| 3       | 1B   | 权限 (rwx)     |
| 4-7     | 4B   | 文件大小       |
| 8-15    | 8B   | 创建时间       |
| 16-23   | 8B   | 修改时间       |
| 24-25   | 2B   | 链接计数       |
| 26-37   | 12B  | 直接索引 (6个) |
| 38-39   | 2B   | 一级间接索引   |
| 40-41   | 2B   | 二级间接索引   |
| 42-63   | 22B  | 保留           |

**混合索引：**
- 直接索引：6 块 × 64B = 384B
- 一级间接：32 块 × 64B = 2KB
- 二级间接：32 × 32 块 × 64B = 64KB
- 最大文件：约 66KB

**目录项（26 字节）：**
- 文件名：24 字节 (UTF-8)
- iNode 号：2 字节

### 3. 内存缓冲 (buffer.py)

**缓冲区规格：**
- 页数量：16 页 (K=16)
- 页大小：64 字节（与块大小相同）

**页面状态：**
- FREE：空闲页
- CLEAN：干净页（与磁盘一致）
- DIRTY：脏页（已修改未写回）

**LRU 置换算法：**
1. 选择 access_time 最小的未钉住页
2. 若为脏页，先写回磁盘
3. 加载新页面到该位置

### 4. 进程管理 (process.py)

**进程状态：**
```
NEW → READY ⇄ RUNNING → TERMINATED
        ↓        ↓
     BLOCKED ←───┘
```

**进程控制块 (PCB)：**
- pid：进程 ID
- name：进程名称
- state：进程状态
- command：命令类型
- time_slice：时间片
- remaining_time：剩余时间片

### 5. 调度器 (scheduler.py)

**时间片轮转 (RR)：**
- 默认时间片：100ms
- 就绪队列：FIFO
- 时间片用完后放回队尾

### 6. 进程通信 (ipc.py)

**共享内存：**
- 支持创建/销毁共享内存段
- 读者-写者同步（条件变量）

**同步机制：**
- threading.RLock：可重入锁
- threading.Condition：条件变量

## 🖥️ 功能面板

| 面板       | 功能                           |
| ---------- | ------------------------------ |
| 仪表盘     | 系统状态总览、操作日志         |
| 文件管理   | 文件/目录的创建、查看、修改、删除 |
| 磁盘可视化 | 位图显示、块内容查看           |
| 内存缓冲   | 缓冲页状态、置换日志、统计信息 |
| 进程管理   | 进程列表、状态监控             |
| 调度器     | 调度控制、事件日志、时间片设置 |
| 终端       | 命令行界面操作                 |

## 💻 终端命令

| 命令                    | 说明           |
| ----------------------- | -------------- |
| `ls`                    | 列出目录内容   |
| `cd <dir>`              | 切换目录       |
| `cd ..`                 | 返回上级目录   |
| `pwd`                   | 显示当前路径   |
| `mkdir <dir>`           | 创建目录       |
| `touch <file>`          | 创建空文件     |
| `cat <file>`            | 查看文件内容   |
| `write <file> <content>`| 写入文件       |
| `rm <file>`             | 删除文件/目录  |
| `info <file>`           | 查看文件信息   |
| `clear`                 | 清屏           |
| `help`                  | 显示帮助       |

## 📊 API 接口

### 文件系统 API

| 方法   | 路径                    | 功能       |
| ------ | ----------------------- | ---------- |
| GET    | /api/files              | 获取文件列表 |
| POST   | /api/files              | 创建文件   |
| GET    | /api/files/:filename    | 读取文件   |
| PUT    | /api/files/:filename    | 修改文件   |
| DELETE | /api/files/:filename    | 删除文件   |
| POST   | /api/mkdir              | 创建目录   |
| POST   | /api/cd                 | 切换目录   |
| GET    | /api/pwd                | 获取当前路径 |

### 磁盘 API

| 方法   | 路径                    | 功能       |
| ------ | ----------------------- | ---------- |
| GET    | /api/disk/info          | 磁盘信息   |
| GET    | /api/disk/bitmap        | 位图状态   |
| GET    | /api/disk/block/:id     | 读取块     |
| POST   | /api/disk/format        | 格式化磁盘 |

### 缓冲区 API

| 方法   | 路径                    | 功能       |
| ------ | ----------------------- | ---------- |
| GET    | /api/buffer/status      | 缓冲区状态 |
| GET    | /api/buffer/log         | 置换日志   |
| POST   | /api/buffer/flush       | 刷新缓冲区 |

### 进程/调度器 API

| 方法   | 路径                    | 功能       |
| ------ | ----------------------- | ---------- |
| GET    | /api/processes          | 进程列表   |
| POST   | /api/processes          | 创建进程   |
| GET    | /api/scheduler/status   | 调度器状态 |
| POST   | /api/scheduler/start    | 启动调度器 |
| POST   | /api/scheduler/stop     | 停止调度器 |

## 🔒 同步机制

### 条件变量应用

1. **缓冲区管理** - 等待空闲页面
2. **共享内存** - 读者-写者问题
3. **进程同步** - 等待进程完成

### 文件保护

- 打开的文件无法删除
- 写模式互斥访问
- 非阻塞 I/O 立即返回

## 📈 统计信息

- 磁盘使用率
- 缓冲区命中率
- 页面置换次数
- 上下文切换次数
- CPU 利用率

## ⚠️ 注意事项

1. `virtual_disk.bin` 首次运行自动创建
2. 格式化磁盘会清除所有数据
3. 文件名最大 24 字节（UTF-8）
4. 单文件最大约 66KB

## 📚 文档

- [使用说明](docs/使用说明.md) - 详细操作指南
- [课设报告](docs/课设报告.md) - 完整设计报告
- [题目要求](docs/题目.md) - 课设题目

## 📝 参考资料

1. 《计算机操作系统》汤小丹等
2. 《Operating System Concepts》Silberschatz
3. Flask 官方文档
4. React 官方文档

---

© 2025 操作系统课程设计
