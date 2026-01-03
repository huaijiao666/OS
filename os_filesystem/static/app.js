/**
 * 操作系统课程设计 - 前端应用
 * 文件系统模拟器可视化界面
 */

// ==================== 全局状态 ====================
const state = {
    currentPanel: 'dashboard',
    currentFile: null,
    schedulerRunning: false,
    socket: null,
    logs: [],
    commandHistory: [],
    historyIndex: -1
};

// API基础URL
const API_BASE = '';

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', () => {
    initSocket();
    initNavigation();
    initTerminal();
    refreshData();
    
    // 定时刷新数据
    setInterval(refreshData, 2000);
});

// ==================== WebSocket ====================
function initSocket() {
    state.socket = io();
    
    state.socket.on('connect', () => {
        console.log('WebSocket 已连接');
        updateStatusIndicator(true);
    });
    
    state.socket.on('disconnect', () => {
        console.log('WebSocket 已断开');
        updateStatusIndicator(false);
    });
    
    state.socket.on('status_update', (data) => {
        updateDashboard(data);
    });
    
    state.socket.on('file_created', (data) => {
        if (data.result.success) {
            showToast('success', `文件 ${data.filename} 创建成功`);
            addLog('create', `创建文件 ${data.filename}`);
            loadFiles();
        }
    });
    
    state.socket.on('file_updated', (data) => {
        if (data.result.success) {
            showToast('success', `文件 ${data.filename} 修改成功`);
            addLog('write', `修改文件 ${data.filename}`);
        }
    });
    
    state.socket.on('file_deleted', (data) => {
        if (data.result.success) {
            showToast('success', `文件 ${data.filename} 删除成功`);
            addLog('delete', `删除文件 ${data.filename}`);
            loadFiles();
        }
    });
    
    state.socket.on('disk_formatted', (data) => {
        showToast('info', data.message);
        refreshData();
    });
}

function updateStatusIndicator(online) {
    const dot = document.querySelector('.status-dot');
    if (online) {
        dot.classList.add('online');
    } else {
        dot.classList.remove('online');
    }
}

// ==================== 导航 ====================
function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const panel = item.dataset.panel;
            switchPanel(panel);
        });
    });
}

function switchPanel(panelName) {
    // 更新导航状态
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.panel === panelName);
    });
    
    // 更新面板显示
    document.querySelectorAll('.panel').forEach(panel => {
        panel.classList.toggle('active', panel.id === `panel-${panelName}`);
    });
    
    // 更新标题
    const titles = {
        dashboard: '仪表盘',
        files: '文件管理',
        disk: '磁盘可视化',
        buffer: '内存缓冲',
        process: '进程管理',
        scheduler: '调度器',
        terminal: '终端'
    };
    document.getElementById('currentPageTitle').textContent = titles[panelName] || '仪表盘';
    
    state.currentPanel = panelName;
    
    // 根据面板加载数据
    switch (panelName) {
        case 'files':
            loadFiles();
            break;
        case 'disk':
            loadDiskBitmap();
            break;
        case 'buffer':
            loadBufferStatus();
            break;
        case 'process':
            loadProcesses();
            break;
        case 'scheduler':
            loadSchedulerStatus();
            break;
    }
}

// ==================== 数据刷新 ====================
async function refreshData() {
    try {
        const response = await fetch(`${API_BASE}/api/stats`);
        const data = await response.json();
        updateDashboard(data);
    } catch (error) {
        console.error('刷新数据失败:', error);
    }
}

function updateDashboard(data) {
    if (!data) return;
    
    // 磁盘状态
    if (data.disk) {
        const usedBlocks = data.disk.used_blocks;
        const totalBlocks = data.disk.total_blocks;
        const usage = (usedBlocks / totalBlocks * 100).toFixed(1);
        
        document.getElementById('diskUsedBlocks').textContent = usedBlocks;
        document.getElementById('diskFreeBlocks').textContent = data.disk.free_blocks;
        document.getElementById('diskTotalBlocks').textContent = totalBlocks;
        document.getElementById('diskUsageBar').style.width = `${usage}%`;
    }
    
    // 文件系统
    if (data.filesystem) {
        const usedInodes = data.filesystem.used_inodes;
        const totalInodes = data.filesystem.total_inodes;
        const usage = (usedInodes / totalInodes * 100).toFixed(1);
        
        document.getElementById('usedInodes').textContent = usedInodes;
        document.getElementById('freeInodes').textContent = data.filesystem.free_inodes;
        document.getElementById('totalInodes').textContent = totalInodes;
        document.getElementById('inodeUsageBar').style.width = `${usage}%`;
    }
    
    // 缓冲区
    if (data.buffer) {
        const hitRate = (data.buffer.hit_rate * 100).toFixed(1);
        document.getElementById('bufferHitRate').textContent = `${hitRate}%`;
        document.getElementById('bufferDirtyPages').textContent = data.buffer.dirty_pages;
        document.getElementById('bufferFreePages').textContent = data.buffer.free_pages;
    }
    
    // 进程
    if (data.processes) {
        document.getElementById('runningProcesses').textContent = data.processes.running;
        document.getElementById('readyProcesses').textContent = data.processes.ready;
        document.getElementById('blockedProcesses').textContent = data.processes.blocked;
    }
    
    // 调度器
    if (data.scheduler) {
        updateSchedulerState(data.scheduler.state);
    }
}

// ==================== 文件管理 ====================
async function loadFiles() {
    try {
        const response = await fetch(`${API_BASE}/api/files`);
        const data = await response.json();
        
        if (data.success) {
            renderFiles(data.files);
        }
    } catch (error) {
        console.error('加载文件列表失败:', error);
    }
}

function renderFiles(files) {
    const grid = document.getElementById('filesGrid');
    
    if (!files || files.length === 0) {
        grid.innerHTML = `
            <div class="file-empty" style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">
                <p>目录为空</p>
                <p style="font-size: 0.85rem;">点击"新建文件"开始</p>
            </div>
        `;
        return;
    }
    
    grid.innerHTML = files.map(file => {
        const isDir = file.type === 'DIRECTORY';
        const icon = isDir ? 
            `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>` :
            `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
        
        return `
            <div class="file-item" onclick="openFile('${file.name}', ${isDir})">
                <div class="file-icon-large ${isDir ? 'folder' : 'file'}">
                    ${icon}
                </div>
                <div class="file-name">${file.name}</div>
                <div class="file-size">${isDir ? `${file.blocks} 块` : formatSize(file.size)}</div>
            </div>
        `;
    }).join('');
}

function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function openFile(filename, isDir) {
    if (isDir) {
        // 切换目录
        try {
            const response = await fetch(`${API_BASE}/api/cd`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dirname: filename })
            });
            const data = await response.json();
            if (data.success) {
                loadFiles();
            }
        } catch (error) {
            console.error('切换目录失败:', error);
        }
    } else {
        // 打开文件预览
        try {
            const response = await fetch(`${API_BASE}/api/files/${encodeURIComponent(filename)}`);
            const data = await response.json();
            
            if (data.success) {
                state.currentFile = filename;
                document.getElementById('previewFileName').textContent = filename;
                document.getElementById('previewMeta').innerHTML = `
                    大小: ${formatSize(data.size)} | 
                    块数: ${data.blocks.length} | 
                    创建: ${formatTime(data.create_time)} | 
                    修改: ${formatTime(data.modify_time)}
                `;
                document.getElementById('previewContent').value = data.content;
                document.getElementById('filePreview').style.display = 'flex';
            }
        } catch (error) {
            console.error('打开文件失败:', error);
        }
    }
}

function closePreview() {
    document.getElementById('filePreview').style.display = 'none';
    state.currentFile = null;
}

async function saveFile() {
    if (!state.currentFile) return;
    
    const content = document.getElementById('previewContent').value;
    
    try {
        const response = await fetch(`${API_BASE}/api/files/${encodeURIComponent(state.currentFile)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content })
        });
        
        const data = await response.json();
        if (data.success) {
            showToast('success', '文件保存成功');
        } else {
            showToast('error', data.error || '保存失败');
        }
    } catch (error) {
        showToast('error', '保存失败: ' + error.message);
    }
}

async function deleteCurrentFile() {
    if (!state.currentFile) return;
    
    if (!confirm(`确定要删除文件 "${state.currentFile}" 吗？`)) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/api/files/${encodeURIComponent(state.currentFile)}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        if (data.success) {
            closePreview();
            loadFiles();
        } else {
            showToast('error', data.error || '删除失败');
        }
    } catch (error) {
        showToast('error', '删除失败: ' + error.message);
    }
}

function formatTime(timestamp) {
    if (!timestamp) return '-';
    const date = new Date(timestamp * 1000);
    return date.toLocaleString('zh-CN');
}

// ==================== 磁盘可视化 ====================
async function loadDiskBitmap() {
    try {
        const response = await fetch(`${API_BASE}/api/disk/bitmap`);
        const data = await response.json();
        renderDiskBitmap(data.bitmap);
    } catch (error) {
        console.error('加载磁盘位图失败:', error);
    }
}

function renderDiskBitmap(bitmap) {
    const container = document.getElementById('diskBitmap');
    
    // 常量定义
    const SUPERBLOCK_BLOCKS = 1;
    const BITMAP_BLOCKS = 2;
    const INODE_BLOCKS = 32;
    const DATA_START = SUPERBLOCK_BLOCKS + BITMAP_BLOCKS + INODE_BLOCKS;
    
    container.innerHTML = bitmap.map((used, i) => {
        let blockClass = 'free';
        
        if (i < SUPERBLOCK_BLOCKS) {
            blockClass = 'superblock';
        } else if (i < SUPERBLOCK_BLOCKS + BITMAP_BLOCKS) {
            blockClass = 'bitmap';
        } else if (i < DATA_START) {
            blockClass = 'inode';
        } else if (used) {
            blockClass = 'used';
        }
        
        return `<div class="bitmap-block ${blockClass}" 
                     title="块 #${i}" 
                     onclick="showBlockDetail(${i})"></div>`;
    }).join('');
}

async function showBlockDetail(blockId) {
    try {
        const response = await fetch(`${API_BASE}/api/disk/block/${blockId}`);
        const data = await response.json();
        
        if (data.success) {
            document.getElementById('blockDetailId').textContent = blockId;
            document.getElementById('blockHex').textContent = data.data;
            document.getElementById('blockText').textContent = data.text;
            document.getElementById('blockDetail').style.display = 'block';
        }
    } catch (error) {
        console.error('读取块失败:', error);
    }
}

function closeBlockDetail() {
    document.getElementById('blockDetail').style.display = 'none';
}

// ==================== 内存缓冲 ====================
async function loadBufferStatus() {
    try {
        const response = await fetch(`${API_BASE}/api/buffer/status`);
        const data = await response.json();
        
        renderBufferPages(data.pages);
        updateBufferStats(data.stats);
        loadBufferLog();
    } catch (error) {
        console.error('加载缓冲区状态失败:', error);
    }
}

function renderBufferPages(pages) {
    const container = document.getElementById('bufferPages');
    
    container.innerHTML = pages.map(page => {
        const stateClass = page.state.toLowerCase();
        return `
            <div class="buffer-page ${stateClass}">
                <div class="page-id">页 #${page.page_id}</div>
                <div class="page-block">${page.block_id >= 0 ? `块 ${page.block_id}` : '-'}</div>
                <div class="page-state ${page.state}">${page.state}</div>
            </div>
        `;
    }).join('');
}

function updateBufferStats(stats) {
    document.getElementById('bufferHits').textContent = stats.hits;
    document.getElementById('bufferMisses').textContent = stats.misses;
    document.getElementById('bufferEvictions').textContent = stats.evictions;
    document.getElementById('bufferWritebacks').textContent = stats.writebacks;
}

async function loadBufferLog() {
    try {
        const response = await fetch(`${API_BASE}/api/buffer/log`);
        const data = await response.json();
        
        const container = document.getElementById('bufferLog');
        if (!data.log || data.log.length === 0) {
            container.innerHTML = '<div style="color: var(--text-muted);">暂无日志</div>';
            return;
        }
        
        container.innerHTML = data.log.slice(-20).reverse().map(log => `
            <div class="buffer-log-item">
                <span style="color: var(--text-muted);">${formatTimestamp(log.timestamp)}</span>
                <span style="color: var(--accent-primary);">${log.type}</span>
                <span>页${log.page_id} ↔ 块${log.block_id}</span>
            </div>
        `).join('');
    } catch (error) {
        console.error('加载缓冲区日志失败:', error);
    }
}

async function flushBuffer() {
    try {
        const response = await fetch(`${API_BASE}/api/buffer/flush`, { method: 'POST' });
        const data = await response.json();
        
        if (data.success) {
            showToast('success', '缓冲区已刷新');
            loadBufferStatus();
        }
    } catch (error) {
        showToast('error', '刷新失败');
    }
}

// ==================== 进程管理 ====================
async function loadProcesses() {
    try {
        const response = await fetch(`${API_BASE}/api/processes`);
        const data = await response.json();
        renderProcesses(data.processes);
    } catch (error) {
        console.error('加载进程列表失败:', error);
    }
}

function renderProcesses(processes) {
    const container = document.getElementById('processTable');
    
    if (!processes || processes.length === 0) {
        container.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted);">暂无进程</div>';
        return;
    }
    
    container.innerHTML = processes.map(p => `
        <div class="table-row">
            <span>${p.pid}</span>
            <span>${p.name}</span>
            <span><span class="process-state ${p.state}">${p.state}</span></span>
            <span>${p.command || '-'}</span>
            <span>${p.cpu_time.toFixed(3)}s</span>
            <span>
                ${p.state !== 'TERMINATED' ? 
                    `<button class="btn-small" onclick="terminateProcess(${p.pid})">终止</button>` : 
                    '-'}
            </span>
        </div>
    `).join('');
}

async function createTestProcess() {
    try {
        const response = await fetch(`${API_BASE}/api/processes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                command: 'ls',
                args: {}
            })
        });
        
        const data = await response.json();
        if (data.success) {
            showToast('success', `进程 ${data.pid} 已创建`);
            loadProcesses();
        }
    } catch (error) {
        showToast('error', '创建进程失败');
    }
}

async function terminateProcess(pid) {
    try {
        const response = await fetch(`${API_BASE}/api/processes/${pid}/terminate`, {
            method: 'POST'
        });
        
        const data = await response.json();
        if (data.success) {
            showToast('success', `进程 ${pid} 已终止`);
            loadProcesses();
        }
    } catch (error) {
        showToast('error', '终止进程失败');
    }
}

// ==================== 调度器 ====================
async function loadSchedulerStatus() {
    try {
        const response = await fetch(`${API_BASE}/api/scheduler/status`);
        const data = await response.json();
        
        updateSchedulerUI(data);
        loadSchedulerEvents();
    } catch (error) {
        console.error('加载调度器状态失败:', error);
    }
}

function updateSchedulerUI(data) {
    if (!data) return;
    
    // 更新状态
    updateSchedulerState(data.stats.state);
    
    // 更新统计
    document.getElementById('schedContextSwitches').textContent = data.stats.context_switches;
    document.getElementById('schedPreemptions').textContent = data.stats.preemptions;
    document.getElementById('schedCpuUtil').textContent = 
        `${(data.stats.cpu_utilization * 100).toFixed(1)}%`;
    
    // 更新就绪队列
    const queueContainer = document.getElementById('readyQueue');
    if (data.ready_queue && data.ready_queue.length > 0) {
        queueContainer.innerHTML = data.ready_queue.map(pid => 
            `<div class="queue-item">PID ${pid}</div>`
        ).join('');
    } else {
        queueContainer.innerHTML = '<span class="queue-empty">队列为空</span>';
    }
}

function updateSchedulerState(stateName) {
    const stateEl = document.getElementById('schedulerState');
    stateEl.textContent = stateName;
    stateEl.className = 'scheduler-state ' + stateName;
    
    state.schedulerRunning = stateName === 'RUNNING';
    document.getElementById('schedulerToggleText').textContent = 
        state.schedulerRunning ? '停止调度' : '启动调度';
}

async function loadSchedulerEvents() {
    try {
        const response = await fetch(`${API_BASE}/api/scheduler/events`);
        const data = await response.json();
        
        const container = document.getElementById('schedulerEvents');
        if (!data.events || data.events.length === 0) {
            container.innerHTML = '<div style="padding: 20px; color: var(--text-muted);">暂无事件</div>';
            return;
        }
        
        container.innerHTML = data.events.slice().reverse().map(e => `
            <div class="event-item">
                <span style="color: var(--text-muted);">${formatTimestamp(e.timestamp)}</span>
                <span class="event-type ${e.type}">${e.type}</span>
                <span>PID ${e.pid}</span>
                <span style="color: var(--text-secondary);">${e.details}</span>
            </div>
        `).join('');
    } catch (error) {
        console.error('加载调度事件失败:', error);
    }
}

async function startScheduler() {
    try {
        await fetch(`${API_BASE}/api/scheduler/start`, { method: 'POST' });
        showToast('success', '调度器已启动');
        loadSchedulerStatus();
    } catch (error) {
        showToast('error', '启动调度器失败');
    }
}

async function stopScheduler() {
    try {
        await fetch(`${API_BASE}/api/scheduler/stop`, { method: 'POST' });
        showToast('success', '调度器已停止');
        loadSchedulerStatus();
    } catch (error) {
        showToast('error', '停止调度器失败');
    }
}

async function pauseScheduler() {
    try {
        await fetch(`${API_BASE}/api/scheduler/pause`, { method: 'POST' });
        showToast('info', '调度器已暂停');
        loadSchedulerStatus();
    } catch (error) {
        showToast('error', '暂停调度器失败');
    }
}

function toggleScheduler() {
    if (state.schedulerRunning) {
        stopScheduler();
    } else {
        startScheduler();
    }
}

async function updateTimeQuantum() {
    const quantum = parseInt(document.getElementById('timeQuantum').value);
    if (isNaN(quantum) || quantum < 10 || quantum > 1000) {
        showToast('error', '时间片必须在 10-1000ms 之间');
        return;
    }
    
    try {
        await fetch(`${API_BASE}/api/scheduler/quantum`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ quantum })
        });
        showToast('success', `时间片已设置为 ${quantum}ms`);
    } catch (error) {
        showToast('error', '设置时间片失败');
    }
}

// ==================== 终端 ====================
function initTerminal() {
    const input = document.getElementById('terminalInput');
    
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            executeCommand(input.value.trim());
            state.commandHistory.push(input.value);
            state.historyIndex = state.commandHistory.length;
            input.value = '';
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (state.historyIndex > 0) {
                state.historyIndex--;
                input.value = state.commandHistory[state.historyIndex];
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (state.historyIndex < state.commandHistory.length - 1) {
                state.historyIndex++;
                input.value = state.commandHistory[state.historyIndex];
            } else {
                state.historyIndex = state.commandHistory.length;
                input.value = '';
            }
        }
    });
}

async function executeCommand(cmdLine) {
    if (!cmdLine) return;
    
    const output = document.getElementById('terminalOutput');
    
    // 添加命令行
    output.innerHTML += `
        <div class="terminal-line">
            <span class="terminal-prompt-text">root@osfs:~$</span>
            <span class="terminal-command"> ${escapeHtml(cmdLine)}</span>
        </div>
    `;
    
    // 解析命令
    const parts = cmdLine.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);
    
    let result = '';
    
    try {
        switch (cmd) {
            case 'ls':
                result = await cmdLs();
                break;
            case 'cat':
                result = await cmdCat(args[0]);
                break;
            case 'touch':
                result = await cmdTouch(args[0], args.slice(1).join(' '));
                break;
            case 'rm':
                result = await cmdRm(args[0]);
                break;
            case 'mkdir':
                result = await cmdMkdir(args[0]);
                break;
            case 'cd':
                result = await cmdCd(args[0]);
                break;
            case 'info':
                result = await cmdInfo(args[0]);
                break;
            case 'disk':
                result = await cmdDisk();
                break;
            case 'buffer':
                result = await cmdBuffer();
                break;
            case 'ps':
                result = await cmdPs();
                break;
            case 'clear':
                output.innerHTML = '';
                return;
            case 'help':
                result = cmdHelp();
                break;
            default:
                result = `命令未找到: ${cmd}\n输入 'help' 查看可用命令`;
        }
    } catch (error) {
        result = `错误: ${error.message}`;
    }
    
    // 添加输出
    output.innerHTML += `<div class="terminal-output-text">${escapeHtml(result)}</div>`;
    
    // 滚动到底部
    output.scrollTop = output.scrollHeight;
}

async function cmdLs() {
    const response = await fetch(`${API_BASE}/api/files`);
    const data = await response.json();
    
    if (!data.success) return data.error;
    if (!data.files || data.files.length === 0) return '(空目录)';
    
    return data.files.map(f => {
        const type = f.type === 'DIRECTORY' ? 'd' : '-';
        const perm = formatPermissions(f.permissions);
        return `${type}${perm}  ${f.blocks}块  ${String(f.size).padStart(6)}B  ${f.name}`;
    }).join('\n');
}

async function cmdCat(filename) {
    if (!filename) return '用法: cat <filename>';
    
    const response = await fetch(`${API_BASE}/api/files/${encodeURIComponent(filename)}`);
    const data = await response.json();
    
    if (!data.success) return data.error;
    return data.content || '(空文件)';
}

async function cmdTouch(filename, content = '') {
    if (!filename) return '用法: touch <filename> [content]';
    
    const response = await fetch(`${API_BASE}/api/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, content })
    });
    
    const data = await response.json();
    return data.success ? `文件 '${filename}' 已创建` : data.error;
}

async function cmdRm(filename) {
    if (!filename) return '用法: rm <filename>';
    
    const response = await fetch(`${API_BASE}/api/files/${encodeURIComponent(filename)}`, {
        method: 'DELETE'
    });
    
    const data = await response.json();
    return data.success ? `文件 '${filename}' 已删除` : data.error;
}

async function cmdMkdir(dirname) {
    if (!dirname) return '用法: mkdir <dirname>';
    
    const response = await fetch(`${API_BASE}/api/mkdir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dirname })
    });
    
    const data = await response.json();
    return data.success ? `目录 '${dirname}' 已创建` : data.error;
}

async function cmdCd(dirname) {
    if (!dirname) return '用法: cd <dirname>';
    
    const response = await fetch(`${API_BASE}/api/cd`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dirname })
    });
    
    const data = await response.json();
    return data.success ? `已切换到 '${dirname}'` : data.error;
}

async function cmdInfo(filename) {
    if (!filename) return '用法: info <filename>';
    
    const response = await fetch(`${API_BASE}/api/files/${encodeURIComponent(filename)}/info`);
    const data = await response.json();
    
    if (!data.success) return data.error;
    
    return `文件: ${data.name}
类型: ${data.type}
大小: ${data.size} 字节
块数: ${data.block_count}
块号: [${data.blocks.join(', ')}]
权限: ${formatPermissions(data.permissions)}
创建: ${formatTime(data.create_time)}
修改: ${formatTime(data.modify_time)}
打开: ${data.is_open ? '是' : '否'}`;
}

async function cmdDisk() {
    const response = await fetch(`${API_BASE}/api/disk/info`);
    const data = await response.json();
    
    const usage = ((data.used_blocks / data.total_blocks) * 100).toFixed(1);
    
    return `磁盘信息:
  总容量: ${data.total_size} 字节 (${data.total_size / 1024} KB)
  块大小: ${data.block_size} 字节
  总块数: ${data.total_blocks}
  已使用: ${data.used_blocks} 块 (${usage}%)
  空闲块: ${data.free_blocks}
  数据区: 从块 ${data.data_start_block} 开始
  状态: ${data.is_mounted ? '已挂载' : '未挂载'}`;
}

async function cmdBuffer() {
    const response = await fetch(`${API_BASE}/api/buffer/status`);
    const data = await response.json();
    
    const hitRate = (data.stats.hit_rate * 100).toFixed(1);
    
    return `缓冲区状态:
  总页数: ${data.stats.total_pages}
  空闲页: ${data.stats.free_pages}
  脏页数: ${data.stats.dirty_pages}
  干净页: ${data.stats.clean_pages}
  命中次数: ${data.stats.hits}
  未命中数: ${data.stats.misses}
  命中率: ${hitRate}%
  置换次数: ${data.stats.evictions}
  写回次数: ${data.stats.writebacks}`;
}

async function cmdPs() {
    const response = await fetch(`${API_BASE}/api/processes`);
    const data = await response.json();
    
    if (!data.processes || data.processes.length === 0) {
        return '(无进程)';
    }
    
    let result = 'PID   STATE        COMMAND      CPU_TIME\n';
    result += '─'.repeat(50) + '\n';
    
    data.processes.forEach(p => {
        result += `${String(p.pid).padEnd(6)}${p.state.padEnd(13)}${(p.command || '-').padEnd(13)}${p.cpu_time.toFixed(3)}s\n`;
    });
    
    return result;
}

function cmdHelp() {
    return `可用命令:
  ls              列出当前目录文件
  cat <file>      查看文件内容
  touch <file> [content]  创建文件
  rm <file>       删除文件
  mkdir <dir>     创建目录
  cd <dir>        切换目录
  info <file>     查看文件详细信息
  disk            查看磁盘状态
  buffer          查看缓冲区状态
  ps              查看进程列表
  clear           清空终端
  help            显示此帮助`;
}

function clearTerminal() {
    document.getElementById('terminalOutput').innerHTML = '';
}

function formatPermissions(perm) {
    const r = perm & 0b100 ? 'r' : '-';
    const w = perm & 0b010 ? 'w' : '-';
    const x = perm & 0b001 ? 'x' : '-';
    return r + w + x;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatTimestamp(ts) {
    const date = new Date(ts * 1000);
    return date.toLocaleTimeString('zh-CN');
}

// ==================== 模态框 ====================
function showCreateFileModal() {
    document.getElementById('modalOverlay').classList.add('active');
    document.getElementById('createFileModal').classList.add('active');
    document.getElementById('newFileName').value = '';
    document.getElementById('newFileContent').value = '';
    document.getElementById('newFileName').focus();
}

function showCreateDirModal() {
    document.getElementById('modalOverlay').classList.add('active');
    document.getElementById('createDirModal').classList.add('active');
    document.getElementById('newDirName').value = '';
    document.getElementById('newDirName').focus();
}

function closeModal() {
    document.getElementById('modalOverlay').classList.remove('active');
    document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
}

async function createFile() {
    const filename = document.getElementById('newFileName').value.trim();
    const content = document.getElementById('newFileContent').value;
    
    if (!filename) {
        showToast('error', '请输入文件名');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/api/files`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename, content })
        });
        
        const data = await response.json();
        if (data.success) {
            closeModal();
            loadFiles();
        } else {
            showToast('error', data.error || '创建失败');
        }
    } catch (error) {
        showToast('error', '创建失败: ' + error.message);
    }
}

async function createDirectory() {
    const dirname = document.getElementById('newDirName').value.trim();
    
    if (!dirname) {
        showToast('error', '请输入目录名');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/api/mkdir`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dirname })
        });
        
        const data = await response.json();
        if (data.success) {
            closeModal();
            loadFiles();
            showToast('success', `目录 ${dirname} 已创建`);
        } else {
            showToast('error', data.error || '创建失败');
        }
    } catch (error) {
        showToast('error', '创建失败: ' + error.message);
    }
}

// ==================== 其他操作 ====================
async function formatDisk() {
    if (!confirm('确定要格式化磁盘吗？所有数据将被清除！')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/api/disk/format`, { method: 'POST' });
        const data = await response.json();
        
        if (data.success) {
            showToast('success', '磁盘已格式化');
            refreshData();
            loadFiles();
        }
    } catch (error) {
        showToast('error', '格式化失败');
    }
}

// ==================== 日志 ====================
function addLog(type, message) {
    const time = new Date().toLocaleTimeString('zh-CN');
    state.logs.unshift({ type, message, time });
    
    // 只保留最近50条
    if (state.logs.length > 50) {
        state.logs = state.logs.slice(0, 50);
    }
    
    renderLogs();
}

function renderLogs() {
    const container = document.getElementById('operationLog');
    
    if (state.logs.length === 0) {
        container.innerHTML = '<div class="log-empty">暂无操作记录</div>';
        return;
    }
    
    container.innerHTML = state.logs.slice(0, 20).map(log => `
        <div class="log-item">
            <span class="log-time">${log.time}</span>
            <span class="log-type ${log.type}">${log.type.toUpperCase()}</span>
            <span class="log-message">${log.message}</span>
        </div>
    `).join('');
}

function clearLogs() {
    state.logs = [];
    renderLogs();
}

// ==================== Toast消息 ====================
function showToast(type, message) {
    const container = document.getElementById('toastContainer');
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <span>${message}</span>
    `;
    
    container.appendChild(toast);
    
    // 3秒后自动移除
    setTimeout(() => {
        toast.style.animation = 'slideInRight 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

