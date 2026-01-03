# 课设报告配图 - AI绘图提示词

本文档提供课设报告中需要使用AI工具生成的图片详细说明。

## 使用说明

1. **推荐工具**：可使用以下AI绘图工具
   - Microsoft Designer（免费，推荐）: https://designer.microsoft.com
   - Canva AI（免费）: https://www.canva.com
   - ChatGPT + DALL-E（需订阅）
   - Midjourney（需订阅）
   - 其他支持的绘图工具

2. **图片格式**：建议导出为 PNG 格式，分辨率 1920×1080 或更高

3. **风格要求**：
   - 白色背景（#FFFFFF）
   - 简洁专业的技术图表风格
   - 无渐变、无阴影、无装饰性元素
   - 适合放入Word文档

---

## 图2-1 系统功能模块图

### 图片内容描述

层次结构图，展示系统的功能模块组成：

```
                    ┌──────────────────────┐
                    │  文件系统模拟器      │
                    └──────────┬───────────┘
        ┌──────┬──────┬───────┼───────┬──────┬──────┐
        ▼      ▼      ▼       ▼       ▼      ▼      ▼
    ┌──────┐┌──────┐┌──────┐┌──────┐┌──────┐┌────┐┌──────┐
    │虚拟  ││文件  ││缓冲区││进程  ││调度器││IPC ││Web   │
    │磁盘  ││系统  ││管理  ││管理  ││     ││模块││可视化│
    └──────┘└──────┘└──────┘└──────┘└──────┘└────┘└──────┘
```

### AI绘图Prompt（英文版）

```
Create a simple hierarchical system architecture diagram. White background (#FFFFFF). 

Top level: One rectangle labeled "File System Simulator" (Chinese: 文件系统模拟器)

Bottom level: 7 rectangles arranged horizontally, connected to top with vertical lines:
1. "Virtual Disk" (虚拟磁盘)
2. "File System" (文件系统)  
3. "Buffer Manager" (缓冲区管理)
4. "Process Manager" (进程管理)
5. "Scheduler" (调度器)
6. "IPC Module" (IPC模块)
7. "Web Visualization" (Web可视化)

Style: Blue rectangles with black borders, black connecting lines, clean professional technical diagram, no shadows, no gradients, no decorations. Labels in both Chinese and English.
```

### AI绘图Prompt（中文版，适用于国产AI）

```
创建一个简单的系统架构层次图。纯白色背景。

顶层：一个矩形框，标注"文件系统模拟器"

底层：7个矩形框水平排列，用垂直线连接到顶层：
1. 虚拟磁盘
2. 文件系统
3. 缓冲区管理
4. 进程管理
5. 调度器
6. IPC模块
7. Web可视化

风格要求：蓝色矩形框配黑色边框，黑色连接线，专业技术图表风格，无阴影无渐变无装饰，白色背景适合打印。
```

---

## 图2-2 系统主流程图

### 图片内容描述

标准程序流程图，展示系统主要运行流程：

```
    ┌─────────┐
    │  开始   │
    └────┬────┘
         ▼
    ┌─────────┐
    │初始化磁盘│
    └────┬────┘
         ▼
    ┌─────────┐
    │加载文件 │
    │  系统   │
    └────┬────┘
         ▼
    ┌─────────┐
    │启动调度器│
    └────┬────┘
         ▼
    ┌─────────┐◄────────────────┐
    │等待用户 │                 │
    │  命令   │                 │
    └────┬────┘                 │
         ▼                      │
    ┌─────────┐                 │
    │解析命令 │                 │
    └────┬────┘                 │
         ▼                      │
    ┌─────────┐                 │
    │创建进程 │                 │
    └────┬────┘                 │
         ▼                      │
    ┌─────────┐                 │
    │加入就绪 │                 │
    │  队列   │                 │
    └────┬────┘                 │
         ▼                      │
    ┌─────────┐                 │
    │调度执行 │                 │
    └────┬────┘                 │
         ▼                      │
    ┌─────────┐                 │
    │返回结果 │─────────────────┘
    └─────────┘
```

### AI绘图Prompt（英文版）

```
Create a standard flowchart diagram with white background.

Use standard flowchart symbols:
- Oval/stadium shape for Start and End
- Rectangles for process steps
- Arrows connecting the steps

Flow sequence (top to bottom, then loop back):
1. Start (开始) - oval
2. Initialize Disk (初始化磁盘) - rectangle
3. Load File System (加载文件系统) - rectangle
4. Start Scheduler (启动调度器) - rectangle
5. Wait for Command (等待用户命令) - rectangle
6. Parse Command (解析命令) - rectangle
7. Create Process (创建进程) - rectangle
8. Add to Ready Queue (加入就绪队列) - rectangle
9. Schedule and Execute (调度执行) - rectangle
10. Return Result (返回结果) - rectangle
11. Arrow loops back from step 10 to step 5

Style: Black outlines, white fill, black arrows, clean professional flowchart style, no shadows or gradients. Labels in Chinese.
```

### AI绘图Prompt（中文版）

```
创建一个标准流程图，白色背景。

使用标准流程图符号：
- 椭圆形表示开始/结束
- 矩形表示处理步骤
- 箭头连接各步骤

流程顺序：
1. 开始（椭圆）
2. 初始化磁盘（矩形）
3. 加载文件系统（矩形）
4. 启动调度器（矩形）
5. 等待用户命令（矩形）
6. 解析命令（矩形）
7. 创建进程（矩形）
8. 加入就绪队列（矩形）
9. 调度执行（矩形）
10. 返回结果（矩形）
11. 从步骤10用箭头循环回到步骤5

风格：黑色边框，白色填充，黑色箭头，专业流程图风格，无阴影无渐变。
```

---

## 图3-1 iNode结构示意图

### 图片内容描述

水平条形图，展示64字节iNode的内部结构：

```
┌────────┬────┬────┬────────┬──────────┬──────────┬──────┬────────────┬──────┬──────┬──────────┐
│iNode ID│Type│Perm│  Size  │  CTime   │  MTime   │Links │Direct Blocks│Single│Double│ Reserved │
│ 0-1    │ 2  │ 3  │  4-7   │  8-15    │  16-23   │24-25 │   26-37    │38-39 │40-41 │  42-63   │
│ 2字节  │1字节│1字节│ 4字节  │  8字节   │  8字节   │2字节 │   12字节   │2字节 │2字节 │  22字节  │
└────────┴────┴────┴────────┴──────────┴──────────┴──────┴────────────┴──────┴──────┴──────────┘
```

### AI绘图Prompt（英文版）

```
Create a data structure layout diagram showing a 64-byte iNode structure. White background.

Draw a long horizontal bar divided into sections, each section representing a field:

From left to right:
1. iNode ID (bytes 0-1, 2 bytes) - light blue
2. Type (byte 2, 1 byte) - light green  
3. Permissions (byte 3, 1 byte) - light green
4. Size (bytes 4-7, 4 bytes) - light yellow
5. Create Time (bytes 8-15, 8 bytes) - light orange
6. Modify Time (bytes 16-23, 8 bytes) - light orange
7. Link Count (bytes 24-25, 2 bytes) - light pink
8. Direct Blocks (bytes 26-37, 12 bytes) - light purple
9. Single Indirect (bytes 38-39, 2 bytes) - light cyan
10. Double Indirect (bytes 40-41, 2 bytes) - light cyan
11. Reserved (bytes 42-63, 22 bytes) - light gray

Each section should show:
- Field name (top)
- Byte offset range (middle)
- Size in bytes (bottom)

Style: Alternating pastel colors, black borders, clean labels, professional technical diagram, no shadows.
```

### AI绘图Prompt（中文版）

```
创建一个数据结构布局图，展示64字节的iNode结构。白色背景。

绘制一个水平长条形，分成多个区域，每个区域代表一个字段：

从左到右依次为：
1. iNode ID（字节0-1，2字节）- 浅蓝色
2. 类型（字节2，1字节）- 浅绿色
3. 权限（字节3，1字节）- 浅绿色
4. 大小（字节4-7，4字节）- 浅黄色
5. 创建时间（字节8-15，8字节）- 浅橙色
6. 修改时间（字节16-23，8字节）- 浅橙色
7. 链接数（字节24-25，2字节）- 浅粉色
8. 直接块（字节26-37，12字节）- 浅紫色
9. 一级间接（字节38-39，2字节）- 浅青色
10. 二级间接（字节40-41，2字节）- 浅青色
11. 保留区（字节42-63，22字节）- 浅灰色

每个区域显示：字段名称、字节偏移、大小

风格：使用柔和的浅色区分各字段，黑色边框，清晰标签，专业技术图风格，无阴影。
```

---

## 图3-2 混合索引结构图

### 图片内容描述

展示iNode的混合索引机制：

```
    ┌─────────┐
    │  iNode  │
    └────┬────┘
         │
    ┌────┴────────────────────────────────┐
    │                                      │
    ▼                                      ▼
┌────────┐                           ┌──────────┐
│直接索引│                           │ 间接索引  │
│(6个块) │                           │          │
└───┬────┘                           └────┬─────┘
    │                                     │
    ▼                                ┌────┴────┐
┌──┬──┬──┬──┬──┬──┐                 │         │
│块│块│块│块│块│块│                 ▼         ▼
│0 │1 │2 │3 │4 │5 │           ┌──────┐    ┌──────┐
└──┴──┴──┴──┴──┴──┘           │一级   │    │二级   │
                              │间接块 │    │间接块 │
                              └───┬───┘    └───┬───┘
                                  │            │
                                  ▼            ▼
                              ┌──────┐    ┌──────┐
                              │32个  │    │间接块│
                              │数据块│    │(32个)│
                              └──────┘    └───┬───┘
                                              │
                                              ▼
                                          ┌──────┐
                                          │32×32 │
                                          │数据块│
                                          └──────┘
```

### AI绘图Prompt（英文版）

```
Create a file system hybrid indexing diagram with white background.

Structure:
1. Top: One box labeled "iNode" (iNode节点)

2. From iNode, draw arrows to two groups:
   
   Left branch - Direct Indexing (直接索引):
   - Arrow from iNode to 6 small boxes arranged horizontally
   - Label them "Block 0" through "Block 5"
   - These represent data blocks
   
   Right branch - Indirect Indexing (间接索引):
   - Arrow from iNode to "Single Indirect Block" (一级间接块)
   - From Single Indirect, arrow to group of "32 Data Blocks" (32个数据块)
   - Arrow from iNode to "Double Indirect Block" (二级间接块)
   - From Double Indirect, arrow to multiple "Indirect Blocks"
   - From each Indirect Block, arrows to "Data Blocks"

Color scheme:
- iNode: Blue
- Indirect blocks: Orange
- Data blocks: Green

Style: Clean boxes with rounded corners, black arrows, clear labels in Chinese, professional technical diagram, white background, no shadows.
```

### AI绘图Prompt（中文版）

```
创建一个文件系统混合索引结构图，白色背景。

结构说明：
1. 顶部：一个蓝色方框，标注"iNode"

2. 左侧分支 - 直接索引：
   - 从iNode画箭头指向6个小方框（绿色）
   - 标注为"数据块0"到"数据块5"
   - 这些代表直接索引的数据块

3. 右侧分支 - 间接索引：
   - 从iNode画箭头指向"一级间接块"（橙色）
   - 从一级间接块画箭头指向一组"32个数据块"（绿色）
   - 从iNode画另一个箭头指向"二级间接块"（橙色）
   - 从二级间接块画箭头指向多个中间间接块
   - 最终指向大量数据块

颜色方案：
- iNode节点：蓝色
- 间接索引块：橙色
- 数据块：绿色

风格：圆角方框，黑色箭头，中文标签，专业技术图风格，白色背景，无阴影。
```

---

## 图3-3 函数调用关系图

### 图片内容描述

树形结构图，展示模块间的函数调用关系：

```
                        app.py
                          │
        ┌─────────┬───────┼───────┬─────────┐
        │         │       │       │         │
        ▼         ▼       ▼       ▼         ▼
   FileSystem  Buffer  Process  Scheduler  SHM
        │      Manager  Manager     │      Manager
        │         │       │         │         │
        ▼         ▼       ▼         ▼         ▼
   ┌────────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐
   │create  │ │get   │ │create│ │start │ │create│
   │read    │ │read  │ │execute││stop  │ │read  │
   │write   │ │write │ │term  │ │pause │ │write │
   │delete  │ │flush │ │block │ │loop  │ │delete│
   └────────┘ └──────┘ └──────┘ └──────┘ └──────┘
        │
        ▼
   VirtualDisk
        │
        ▼
   ┌────────────┐
   │read_block  │
   │write_block │
   │allocate    │
   │free_block  │
   └────────────┘
```

### AI绘图Prompt（英文版）

```
Create a function call hierarchy diagram with white background.

Structure (tree layout, top to bottom):

Level 1 (Top):
- "app.py" (main application)

Level 2:
Connect app.py to 5 modules:
- FileSystem (文件系统)
- BufferManager (缓冲区管理)
- ProcessManager (进程管理)
- Scheduler (调度器)
- SharedMemoryManager (共享内存)

Level 3:
Under each module, list its main functions:

FileSystem:
- create_file()
- read_file()
- write_file()
- delete_file()

BufferManager:
- get_page()
- read_page()
- write_page()
- flush_all()

ProcessManager:
- create_process()
- execute_process()
- terminate_process()

Scheduler:
- start()
- stop()
- _scheduler_loop()
- _run_time_slice()

SharedMemoryManager:
- create()
- read()
- write()
- destroy()

Level 4:
Under FileSystem, connect to:
- VirtualDisk
  - read_block()
  - write_block()
  - allocate_block()
  - free_block()

Style: Clean boxes, black connecting lines, professional tree diagram, white background, clear labels.
```

### AI绘图Prompt（中文版）

```
创建一个函数调用层次图，白色背景。

结构（树形布局，从上到下）：

第一层（顶部）：
- "app.py"（主应用）

第二层：
从app.py连接到5个模块：
- 文件系统 FileSystem
- 缓冲区管理 BufferManager
- 进程管理 ProcessManager
- 调度器 Scheduler
- 共享内存 SharedMemoryManager

第三层：
每个模块下列出主要函数：

文件系统：create_file, read_file, write_file, delete_file
缓冲区：get_page, read_page, write_page, flush_all
进程管理：create_process, execute_process, terminate_process
调度器：start, stop, _scheduler_loop
共享内存：create, read, write, destroy

第四层：
文件系统下连接虚拟磁盘VirtualDisk：
read_block, write_block, allocate_block, free_block

风格：简洁方框，黑色连接线，专业树形图，白色背景，清晰标签。
```

---

## 替代方案：使用绘图工具手动绘制

如果AI生成的图片不满意，可以使用以下工具手动绘制：

### 推荐工具

1. **draw.io / diagrams.net**（免费在线）
   - 网址：https://app.diagrams.net
   - 选择"空白图"开始
   - 导出为PNG，背景设为白色

2. **ProcessOn**（中文在线工具）
   - 网址：https://www.processon.com
   - 支持流程图、架构图等

3. **Visio**（Microsoft Office）
   - 专业绘图工具
   - 模板丰富

4. **PPT / PowerPoint**
   - 使用形状工具绘制
   - 导出为图片

### 绘制要点

1. 使用统一的颜色方案
2. 保持元素大小一致
3. 对齐和间距要均匀
4. 字体使用宋体或微软雅黑
5. 导出时设置白色背景
6. 分辨率至少300 DPI（用于打印）

---

## 图片命名规范

建议按以下格式命名：

```
图2-1_系统功能模块图.png
图2-2_系统主流程图.png
图3-1_iNode结构示意图.png
图3-2_混合索引结构图.png
图3-3_函数调用关系图.png
```

保存位置：`docs/images/` 文件夹

