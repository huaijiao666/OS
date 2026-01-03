# -*- coding: utf-8 -*-
"""
操作系统课程设计 - Flask后端应用
提供RESTful API接口和WebSocket实时通信
"""

import os
import sys
import json
import time
import threading
from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO, emit

# 添加路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config import *
from core.disk import VirtualDisk
from core.filesystem import FileSystem
from core.buffer import BufferManager
from core.process import ProcessManager, CommandType
from core.scheduler import RRScheduler
from core.ipc import SharedMemoryManager


# 创建Flask应用 (纯API模式，前后端分离)
app = Flask(__name__)
app.config['SECRET_KEY'] = 'os_filesystem_2025'
CORS(app, resources={r"/api/*": {"origins": "*"}})
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

# 初始化核心组件
disk = VirtualDisk()
filesystem = FileSystem(disk)
buffer_manager = BufferManager(disk)
process_manager = ProcessManager()
scheduler = RRScheduler(process_manager)
shm_manager = SharedMemoryManager()

# 全局锁（用于复杂操作的同步）
global_lock = threading.RLock()


# ==================== 注册命令处理器 ====================
def handle_create_file(args: dict, pid: int) -> dict:
    """处理创建文件命令"""
    filename = args.get('filename', '')
    content = args.get('content', '').encode('utf-8')
    return filesystem.create_file(filename, content)


def handle_read_file(args: dict, pid: int) -> dict:
    """处理读取文件命令"""
    filename = args.get('filename', '')
    block_index = args.get('block_index', -1)
    result = filesystem.read_file(filename, block_index)
    
    # 将字节内容转换为字符串
    if result.get('success') and 'content' in result:
        try:
            result['content'] = result['content'].decode('utf-8', errors='replace')
        except:
            result['content'] = result['content'].hex()
    
    return result


def handle_write_file(args: dict, pid: int) -> dict:
    """处理写入文件命令"""
    filename = args.get('filename', '')
    content = args.get('content', '').encode('utf-8')
    block_index = args.get('block_index', -1)
    return filesystem.write_file(filename, content, block_index)


def handle_delete_file(args: dict, pid: int) -> dict:
    """处理删除文件命令"""
    filename = args.get('filename', '')
    return filesystem.delete_file(filename, pid)


def handle_list_dir(args: dict, pid: int) -> dict:
    """处理列目录命令"""
    return filesystem.list_directory()


def handle_mkdir(args: dict, pid: int) -> dict:
    """处理创建目录命令"""
    dirname = args.get('dirname', '')
    return filesystem.create_directory(dirname)


def handle_cd(args: dict, pid: int) -> dict:
    """处理切换目录命令"""
    dirname = args.get('dirname', '')
    return filesystem.change_directory(dirname)


def handle_file_info(args: dict, pid: int) -> dict:
    """处理获取文件信息命令"""
    filename = args.get('filename', '')
    return filesystem.get_file_info(filename)


def handle_open_file(args: dict, pid: int) -> dict:
    """处理打开文件命令"""
    filename = args.get('filename', '')
    mode = args.get('mode', 'r')
    return filesystem.open_file(filename, pid, mode)


def handle_close_file(args: dict, pid: int) -> dict:
    """处理关闭文件命令"""
    filename = args.get('filename', '')
    return filesystem.close_file(filename, pid)


# 注册处理器
process_manager.register_handler(CommandType.CREATE_FILE, handle_create_file)
process_manager.register_handler(CommandType.READ_FILE, handle_read_file)
process_manager.register_handler(CommandType.WRITE_FILE, handle_write_file)
process_manager.register_handler(CommandType.DELETE_FILE, handle_delete_file)
process_manager.register_handler(CommandType.LIST_DIR, handle_list_dir)
process_manager.register_handler(CommandType.MKDIR, handle_mkdir)
process_manager.register_handler(CommandType.CD, handle_cd)
process_manager.register_handler(CommandType.INFO, handle_file_info)
process_manager.register_handler(CommandType.OPEN, handle_open_file)
process_manager.register_handler(CommandType.CLOSE, handle_close_file)


# ==================== 文件系统API ====================
@app.route('/api/files', methods=['GET'])
def list_files():
    """获取文件列表"""
    result = filesystem.list_directory()
    return jsonify(result)


@app.route('/api/files', methods=['POST'])
def create_file():
    """创建文件"""
    data = request.get_json()
    filename = data.get('filename', '')
    content = data.get('content', '').encode('utf-8')
    
    # 创建进程执行命令
    pid = process_manager.create_process(
        name=f'create_{filename}',
        command=CommandType.CREATE_FILE,
        args={'filename': filename, 'content': data.get('content', '')}
    )
    
    # 通知调度器
    scheduler.add_process(pid)
    
    # 执行并等待结果
    result = process_manager.execute_process(pid)
    
    # 通过WebSocket通知前端更新
    socketio.emit('file_created', {'filename': filename, 'result': result})
    
    return jsonify(result)


@app.route('/api/files/<filename>', methods=['GET'])
def read_file(filename):
    """读取文件"""
    block_index = request.args.get('block', -1, type=int)
    
    pid = process_manager.create_process(
        name=f'read_{filename}',
        command=CommandType.READ_FILE,
        args={'filename': filename, 'block_index': block_index}
    )
    
    scheduler.add_process(pid)
    result = process_manager.execute_process(pid)
    
    return jsonify(result)


@app.route('/api/files/<filename>', methods=['PUT'])
def update_file(filename):
    """修改文件"""
    data = request.get_json()
    content = data.get('content', '')
    block_index = data.get('block_index', -1)
    
    pid = process_manager.create_process(
        name=f'write_{filename}',
        command=CommandType.WRITE_FILE,
        args={'filename': filename, 'content': content, 'block_index': block_index}
    )
    
    scheduler.add_process(pid)
    result = process_manager.execute_process(pid)
    
    socketio.emit('file_updated', {'filename': filename, 'result': result})
    
    return jsonify(result)


@app.route('/api/files/<filename>', methods=['DELETE'])
def delete_file(filename):
    """删除文件"""
    pid = process_manager.create_process(
        name=f'delete_{filename}',
        command=CommandType.DELETE_FILE,
        args={'filename': filename}
    )
    
    scheduler.add_process(pid)
    result = process_manager.execute_process(pid)
    
    socketio.emit('file_deleted', {'filename': filename, 'result': result})
    
    return jsonify(result)


@app.route('/api/files/<filename>/info', methods=['GET'])
def file_info(filename):
    """获取文件信息"""
    result = filesystem.get_file_info(filename)
    return jsonify(result)


@app.route('/api/files/<filename>/open', methods=['POST'])
def open_file(filename):
    """打开文件"""
    data = request.get_json() or {}
    mode = data.get('mode', 'r')
    process_id = data.get('process_id', 0)
    
    result = filesystem.open_file(filename, process_id, mode)
    return jsonify(result)


@app.route('/api/files/<filename>/close', methods=['POST'])
def close_file(filename):
    """关闭文件"""
    data = request.get_json() or {}
    process_id = data.get('process_id', 0)
    
    result = filesystem.close_file(filename, process_id)
    return jsonify(result)


# ==================== 目录API ====================
@app.route('/api/mkdir', methods=['POST'])
def make_directory():
    """创建目录"""
    data = request.get_json()
    dirname = data.get('dirname', '')
    
    result = filesystem.create_directory(dirname)
    socketio.emit('directory_created', {'dirname': dirname, 'result': result})
    
    return jsonify(result)


@app.route('/api/cd', methods=['POST'])
def change_directory():
    """切换目录"""
    data = request.get_json()
    dirname = data.get('dirname', '')
    
    result = filesystem.change_directory(dirname)
    return jsonify(result)


# ==================== 磁盘API ====================
@app.route('/api/disk/info', methods=['GET'])
def disk_info():
    """获取磁盘信息"""
    info = disk.get_disk_info()
    return jsonify(info)


@app.route('/api/disk/bitmap', methods=['GET'])
def disk_bitmap():
    """获取磁盘位图"""
    bitmap = disk.get_bitmap_status()
    return jsonify({
        'bitmap': bitmap,
        'total': len(bitmap),
        'used': sum(bitmap),
        'free': len(bitmap) - sum(bitmap)
    })


@app.route('/api/disk/block/<int:block_id>', methods=['GET'])
def read_block(block_id):
    """读取指定磁盘块"""
    try:
        data = disk.read_block(block_id)
        return jsonify({
            'success': True,
            'block_id': block_id,
            'data': data.hex(),
            'text': data.decode('utf-8', errors='replace')
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@app.route('/api/disk/log', methods=['GET'])
def disk_log():
    """获取磁盘操作日志"""
    log = disk.get_operation_log()
    return jsonify({'log': log})


@app.route('/api/disk/format', methods=['POST'])
def format_disk():
    """格式化磁盘"""
    global disk, filesystem, buffer_manager
    
    with global_lock:
        disk = VirtualDisk()
        filesystem = FileSystem(disk)
        buffer_manager = BufferManager(disk)
    
    socketio.emit('disk_formatted', {'message': '磁盘已格式化'})
    return jsonify({'success': True, 'message': '磁盘格式化完成'})


# ==================== 缓冲区API ====================
@app.route('/api/buffer/status', methods=['GET'])
def buffer_status():
    """获取缓冲区状态"""
    status = buffer_manager.get_buffer_status()
    stats = buffer_manager.get_stats()
    return jsonify({'pages': status, 'stats': stats})


@app.route('/api/buffer/page/<int:page_id>', methods=['GET'])
def buffer_page(page_id):
    """获取指定缓冲页信息"""
    status = buffer_manager.get_buffer_status()
    if 0 <= page_id < len(status):
        return jsonify({'success': True, 'page': status[page_id]})
    return jsonify({'success': False, 'error': '无效的页ID'})


@app.route('/api/buffer/flush', methods=['POST'])
def flush_buffer():
    """刷新所有缓冲页"""
    buffer_manager.flush_all()
    return jsonify({'success': True, 'message': '缓冲区已刷新'})


@app.route('/api/buffer/log', methods=['GET'])
def buffer_log():
    """获取缓冲区置换日志"""
    log = buffer_manager.get_swap_log()
    return jsonify({'log': log})


# ==================== 进程API ====================
@app.route('/api/processes', methods=['GET'])
def list_processes():
    """获取进程列表"""
    processes = process_manager.get_all_processes()
    stats = process_manager.get_process_stats()
    return jsonify({'processes': processes, 'stats': stats})


@app.route('/api/processes', methods=['POST'])
def create_process():
    """创建进程"""
    data = request.get_json()
    command_str = data.get('command', 'ls')
    args = data.get('args', {})
    
    try:
        command = CommandType(command_str)
    except ValueError:
        return jsonify({'success': False, 'error': f'未知命令: {command_str}'})
    
    pid = process_manager.create_process(
        name=f'{command_str}_{int(time.time())}',
        command=command,
        args=args
    )
    
    scheduler.add_process(pid)
    
    return jsonify({'success': True, 'pid': pid})


@app.route('/api/processes/<int:pid>', methods=['GET'])
def get_process(pid):
    """获取进程信息"""
    process = process_manager.get_process(pid)
    if process:
        return jsonify({
            'success': True,
            'process': {
                'pid': process.pid,
                'name': process.name,
                'state': process.state.name,
                'command': process.command.value if process.command else None,
                'result': process.result,
                'cpu_time': process.cpu_time
            }
        })
    return jsonify({'success': False, 'error': '进程不存在'})


@app.route('/api/processes/<int:pid>/execute', methods=['POST'])
def execute_process(pid):
    """执行进程"""
    result = process_manager.execute_process(pid)
    socketio.emit('process_completed', {'pid': pid, 'result': result})
    return jsonify(result)


@app.route('/api/processes/<int:pid>/terminate', methods=['POST'])
def terminate_process(pid):
    """终止进程"""
    success = process_manager.terminate_process(pid)
    scheduler.notify_process_terminated(pid)
    return jsonify({'success': success})


# ==================== 调度器API ====================
@app.route('/api/scheduler/status', methods=['GET'])
def scheduler_status():
    """获取调度器状态"""
    stats = scheduler.get_stats()
    ready_queue = scheduler.get_ready_queue()
    return jsonify({'stats': stats, 'ready_queue': ready_queue})


@app.route('/api/scheduler/start', methods=['POST'])
def start_scheduler():
    """启动调度器"""
    scheduler.start()
    return jsonify({'success': True, 'message': '调度器已启动'})


@app.route('/api/scheduler/stop', methods=['POST'])
def stop_scheduler():
    """停止调度器"""
    scheduler.stop()
    return jsonify({'success': True, 'message': '调度器已停止'})


@app.route('/api/scheduler/pause', methods=['POST'])
def pause_scheduler():
    """暂停调度器"""
    scheduler.pause()
    return jsonify({'success': True, 'message': '调度器已暂停'})


@app.route('/api/scheduler/resume', methods=['POST'])
def resume_scheduler():
    """恢复调度器"""
    scheduler.resume()
    return jsonify({'success': True, 'message': '调度器已恢复'})


@app.route('/api/scheduler/events', methods=['GET'])
def scheduler_events():
    """获取调度事件"""
    count = request.args.get('count', 20, type=int)
    events = scheduler.get_events(count)
    return jsonify({'events': events})


@app.route('/api/scheduler/gantt', methods=['GET'])
def scheduler_gantt():
    """获取甘特图数据"""
    data = scheduler.get_gantt_data()
    return jsonify({'gantt': data})


@app.route('/api/scheduler/quantum', methods=['PUT'])
def set_time_quantum():
    """设置时间片大小"""
    data = request.get_json()
    quantum = data.get('quantum', TIME_QUANTUM)
    scheduler.set_time_quantum(quantum)
    return jsonify({'success': True, 'quantum': quantum})


# ==================== 共享内存API ====================
@app.route('/api/shm', methods=['GET'])
def list_shm():
    """获取共享内存段列表"""
    segments = shm_manager.get_all_segments()
    stats = shm_manager.get_stats()
    return jsonify({'segments': segments, 'stats': stats})


@app.route('/api/shm', methods=['POST'])
def create_shm():
    """创建共享内存段"""
    data = request.get_json()
    size = data.get('size', 1024)
    key = data.get('key')
    
    result_key = shm_manager.create(size, key)
    if result_key > 0:
        return jsonify({'success': True, 'key': result_key})
    return jsonify({'success': False, 'error': '创建失败'})


@app.route('/api/shm/<int:key>', methods=['DELETE'])
def destroy_shm(key):
    """销毁共享内存段"""
    success = shm_manager.destroy(key)
    return jsonify({'success': success})


@app.route('/api/shm/<int:key>/read', methods=['POST'])
def read_shm(key):
    """读取共享内存"""
    data = request.get_json()
    offset = data.get('offset', 0)
    length = data.get('length', 64)
    process_id = data.get('process_id', 0)
    
    result = shm_manager.read(key, offset, length, process_id)
    if result:
        return jsonify({
            'success': True,
            'data': result.hex(),
            'text': result.decode('utf-8', errors='replace')
        })
    return jsonify({'success': False, 'error': '读取失败'})


@app.route('/api/shm/<int:key>/write', methods=['POST'])
def write_shm(key):
    """写入共享内存"""
    data = request.get_json()
    offset = data.get('offset', 0)
    content = data.get('data', '').encode('utf-8')
    process_id = data.get('process_id', 0)
    
    success = shm_manager.write(key, offset, content, process_id)
    return jsonify({'success': success})


# ==================== 文件系统统计API ====================
@app.route('/api/stats', methods=['GET'])
def get_all_stats():
    """获取所有统计信息"""
    return jsonify({
        'disk': disk.get_disk_info(),
        'filesystem': filesystem.get_filesystem_stats(),
        'buffer': buffer_manager.get_stats(),
        'processes': process_manager.get_process_stats(),
        'scheduler': scheduler.get_stats(),
        'shm': shm_manager.get_stats()
    })


# ==================== WebSocket事件 ====================
@socketio.on('connect')
def handle_connect():
    """客户端连接"""
    emit('connected', {'message': '已连接到服务器'})


@socketio.on('disconnect')
def handle_disconnect():
    """客户端断开"""
    pass


@socketio.on('get_status')
def handle_get_status():
    """获取系统状态"""
    emit('status', {
        'disk': disk.get_disk_info(),
        'buffer': buffer_manager.get_stats(),
        'processes': process_manager.get_process_stats(),
        'scheduler': scheduler.get_stats()
    })


# 定期推送状态更新
def status_broadcaster():
    """状态广播器"""
    while True:
        time.sleep(1)
        socketio.emit('status_update', {
            'timestamp': time.time(),
            'disk': disk.get_disk_info(),
            'buffer': buffer_manager.get_stats(),
            'scheduler': scheduler.get_stats()
        })


# ==================== 主程序入口 ====================
if __name__ == '__main__':
    # 启动状态广播线程
    broadcaster = threading.Thread(target=status_broadcaster, daemon=True)
    broadcaster.start()
    
    # 启动调度器
    scheduler.start()
    
    print("=" * 50)
    print("操作系统课程设计 - 文件系统模拟器 API 服务")
    print("=" * 50)
    print(f"磁盘大小: {DISK_SIZE} 字节 ({BLOCK_COUNT} 块 x {BLOCK_SIZE} 字节)")
    print(f"缓冲区大小: {BUFFER_PAGE_COUNT} 页 x {BUFFER_PAGE_SIZE} 字节")
    print(f"时间片: {TIME_QUANTUM} 毫秒")
    print("=" * 50)
    print("API/SocketIO: http://localhost:3456 (前后端分离模式)")
    print("前端由独立 React/Vite 项目提供，需自行启动前端服务")
    print("=" * 50)
    
    # 启动Flask应用
    socketio.run(app, host='0.0.0.0', port=3456, debug=False, allow_unsafe_werkzeug=True)
