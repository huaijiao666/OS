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
from core.filesystem import FileSystem, set_progress_callback
from core.buffer import BufferManager
from core.process import ProcessManager, CommandType, ProcessState
from core.scheduler import RRScheduler, SchedulerState
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

# 将调度事件推送给前端
def _emit_scheduler_event(evt: dict):
    try:
        socketio.emit('scheduler_event', evt)
    except Exception:
        pass


scheduler.set_event_emitter(_emit_scheduler_event)

# 设置文件操作进度回调（用于可视化延时）
def on_file_progress(progress_info):
    """文件操作进度回调"""
    socketio.emit('file_progress', progress_info)

set_progress_callback(on_file_progress)

# 全局锁（用于复杂操作的同步）
global_lock = threading.RLock()


# ==================== 注册命令处理器 ====================
def handle_create_file(args: dict, pid: int) -> dict:
    """处理创建文件命令 - 通过缓冲区创建"""
    filename = args.get('filename', '')
    content = args.get('content', '').encode('utf-8')
    
    # 创建文件
    result = filesystem.create_file(filename, content)
    
    if result.get('success') and content:
        # 获取新文件的块列表，写入缓冲区
        file_info = filesystem.get_file_info(filename)
        blocks = file_info.get('blocks', [])
        
        content_offset = 0
        for block_id in blocks:
            block_content = content[content_offset:content_offset + BLOCK_SIZE]
            if block_content:
                buffer_manager.write_page(block_id, block_content, pid)
                content_offset += BLOCK_SIZE
    
    return result


def handle_read_file(args: dict, pid: int) -> dict:
    """处理读取文件命令 - 通过缓冲区读取"""
    filename = args.get('filename', '')
    block_index = args.get('block_index', -1)
    
    # 获取文件信息以找到数据块
    file_info = filesystem.get_file_info(filename)
    if not file_info.get('success'):
        return file_info
    
    blocks = file_info.get('blocks', [])
    
    # 通过缓冲区读取
    content = b''
    if not blocks:
        # 空文件
        content_str = ''
    elif block_index >= 0 and block_index < len(blocks):
        # 读取指定块
        block_id = blocks[block_index]
        data = buffer_manager.read_page(block_id, pid)
        if data:
            content = data.rstrip(b'\x00')
    else:
        # 读取所有块
        for block_id in blocks:
            data = buffer_manager.read_page(block_id, pid)
            if data:
                content += data.rstrip(b'\x00')
    
    # 将字节内容转换为字符串
    try:
        content_str = content.decode('utf-8', errors='replace')
    except:
        content_str = content.hex()
    
    # 返回完整的文件信息（包括元数据）
    return {
        'success': True,
        'content': content_str,
        'blocks_read': len(blocks) if block_index < 0 else 1,
        # 添加前端需要的元数据
        'size': file_info.get('size', 0),
        'blocks': blocks,
        'create_time': file_info.get('create_time', 0),
        'modify_time': file_info.get('modify_time', 0),
        'block_count': file_info.get('block_count', len(blocks)),
        'inode_id': file_info.get('inode_id', -1)
    }


def handle_write_file(args: dict, pid: int) -> dict:
    """处理写入文件命令 - 通过缓冲区写入"""
    filename = args.get('filename', '')
    content = args.get('content', '').encode('utf-8')
    block_index = args.get('block_index', -1)
    
    # 先通过文件系统写入（这会分配块等）
    result = filesystem.write_file(filename, content, block_index)
    
    if result.get('success'):
        # 获取文件的块列表，通过缓冲区标记为已修改
        file_info = filesystem.get_file_info(filename)
        blocks = file_info.get('blocks', [])
        
        # 将内容写入缓冲区（标记为脏页）
        content_offset = 0
        for i, block_id in enumerate(blocks):
            if block_index >= 0 and i != block_index:
                continue
            
            block_content = content[content_offset:content_offset + BLOCK_SIZE]
            if block_content:
                buffer_manager.write_page(block_id, block_content, pid)
                content_offset += BLOCK_SIZE
    
    return result


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


# ==================== 扩展命令处理器 ====================
def handle_read_block(args: dict, pid: int) -> dict:
    """处理读取特定块命令"""
    filename = args.get('filename', '')
    block_index = args.get('block_index', 0)
    result = filesystem.read_file(filename, block_index)
    if result.get('success') and 'content' in result:
        try:
            result['content'] = result['content'].decode('utf-8', errors='replace')
        except:
            result['content'] = result['content'].hex()
    return result


def handle_write_block(args: dict, pid: int) -> dict:
    """处理写入特定块命令"""
    filename = args.get('filename', '')
    content = args.get('content', '').encode('utf-8')
    block_index = args.get('block_index', 0)
    return filesystem.write_file(filename, content, block_index)


def handle_view_inode(args: dict, pid: int) -> dict:
    """处理查看iNode命令"""
    inode_id = args.get('inode_id', 0)
    try:
        inode_data = disk.read_inode(inode_id)
        import struct
        inode_id_val = struct.unpack_from('<H', inode_data, 0)[0]
        file_type = struct.unpack_from('<B', inode_data, 2)[0]
        permissions = struct.unpack_from('<B', inode_data, 3)[0]
        size = struct.unpack_from('<I', inode_data, 4)[0]
        create_time = struct.unpack_from('<Q', inode_data, 8)[0]
        modify_time = struct.unpack_from('<Q', inode_data, 16)[0]
        link_count = struct.unpack_from('<H', inode_data, 24)[0]
        direct_blocks = [struct.unpack_from('<H', inode_data, 26 + i * 2)[0] for i in range(6)]
        single_indirect = struct.unpack_from('<H', inode_data, 38)[0]
        double_indirect = struct.unpack_from('<H', inode_data, 40)[0]
        
        type_names = {0: '空闲', 1: '目录', 2: '普通文件'}
        return {
            'success': True,
            'inode_id': inode_id_val,
            'type': type_names.get(file_type, '未知'),
            'type_code': file_type,
            'permissions': permissions,
            'size': size,
            'create_time': create_time,
            'modify_time': modify_time,
            'link_count': link_count,
            'direct_blocks': [b for b in direct_blocks if b > 0],
            'single_indirect': single_indirect,
            'double_indirect': double_indirect,
            'raw_hex': inode_data.hex()
        }
    except Exception as e:
        return {'success': False, 'error': str(e)}


def handle_long_task(args: dict, pid: int) -> dict:
    """
    处理长任务命令（占位符）
    注意：实际的长任务通过 execute_scheduled_long_task 在独立线程中执行
    这个处理器仅用于通过 process_manager.execute_process 直接调用时
    """
    task_name = args.get('name', f'task_{pid}')
    return {
        'success': True,
        'message': f'任务 {task_name} 已启动（通过独立线程执行）'
    }


def handle_shm_create(args: dict, pid: int) -> dict:
    """处理创建共享内存命令"""
    size = args.get('size', 1024)
    key = args.get('key')
    result_key = shm_manager.create(size, key)
    if result_key > 0:
        return {'success': True, 'key': result_key, 'size': size}
    return {'success': False, 'error': '创建共享内存失败'}


def handle_shm_read(args: dict, pid: int) -> dict:
    """处理读取共享内存命令"""
    key = args.get('key', 1)
    offset = args.get('offset', 0)
    length = args.get('length', 64)
    data = shm_manager.read(key, offset, length, pid)
    if data:
        return {
            'success': True,
            'data_hex': data.hex(),
            'data_text': data.decode('utf-8', errors='replace')
        }
    return {'success': False, 'error': '读取共享内存失败'}


def handle_shm_write(args: dict, pid: int) -> dict:
    """处理写入共享内存命令"""
    key = args.get('key', 1)
    offset = args.get('offset', 0)
    content = args.get('content', '').encode('utf-8')
    success = shm_manager.write(key, offset, content, pid)
    return {'success': success, 'message': '写入成功' if success else '写入失败'}


def handle_shm_list(args: dict, pid: int) -> dict:
    """处理列出共享内存命令"""
    segments = shm_manager.get_all_segments()
    return {'success': True, 'segments': segments}


def handle_sched_status(args: dict, pid: int) -> dict:
    """处理调度器状态命令"""
    stats = scheduler.get_stats()
    queue = scheduler.get_ready_queue()
    return {'success': True, 'stats': stats, 'ready_queue': queue}


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
# 注册扩展处理器
process_manager.register_handler(CommandType.READ_BLOCK, handle_read_block)
process_manager.register_handler(CommandType.WRITE_BLOCK, handle_write_block)
process_manager.register_handler(CommandType.VIEW_INODE, handle_view_inode)
process_manager.register_handler(CommandType.LONG_TASK, handle_long_task)
process_manager.register_handler(CommandType.SHM_CREATE, handle_shm_create)
process_manager.register_handler(CommandType.SHM_READ, handle_shm_read)
process_manager.register_handler(CommandType.SHM_WRITE, handle_shm_write)
process_manager.register_handler(CommandType.SHM_LIST, handle_shm_list)
process_manager.register_handler(CommandType.SCHED_STATUS, handle_sched_status)


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
    socketio.emit('directory_changed', {'dirname': dirname, 'result': result})
    return jsonify(result)


@app.route('/api/pwd', methods=['GET'])
def get_current_path():
    """获取当前工作目录"""
    result = filesystem.get_current_path()
    return jsonify(result)


# ==================== iNode API ====================
@app.route('/api/inode/<int:inode_id>', methods=['GET'])
def get_inode_info(inode_id):
    """获取iNode详细信息"""
    try:
        inode_data = disk.read_inode(inode_id)
        import struct
        inode_id_val = struct.unpack_from('<H', inode_data, 0)[0]
        file_type = struct.unpack_from('<B', inode_data, 2)[0]
        permissions = struct.unpack_from('<B', inode_data, 3)[0]
        size = struct.unpack_from('<I', inode_data, 4)[0]
        create_time = struct.unpack_from('<Q', inode_data, 8)[0]
        modify_time = struct.unpack_from('<Q', inode_data, 16)[0]
        link_count = struct.unpack_from('<H', inode_data, 24)[0]
        direct_blocks = [struct.unpack_from('<H', inode_data, 26 + i * 2)[0] for i in range(6)]
        single_indirect = struct.unpack_from('<H', inode_data, 38)[0]
        double_indirect = struct.unpack_from('<H', inode_data, 40)[0]
        
        type_names = {0: '空闲', 1: '目录', 2: '普通文件'}
        return jsonify({
            'success': True,
            'inode_id': inode_id_val,
            'type': type_names.get(file_type, '未知'),
            'type_code': file_type,
            'permissions': permissions,
            'size': size,
            'create_time': create_time,
            'modify_time': modify_time,
            'link_count': link_count,
            'direct_blocks': direct_blocks,
            'direct_blocks_used': [b for b in direct_blocks if b > 0],
            'single_indirect': single_indirect,
            'double_indirect': double_indirect,
            'raw_hex': inode_data.hex()
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@app.route('/api/inode/list', methods=['GET'])
def list_inodes():
    """列出所有使用中的iNode"""
    try:
        inodes = []
        import struct
        for i in range(32):  # MAX_INODES
            inode_data = disk.read_inode(i)
            file_type = struct.unpack_from('<B', inode_data, 2)[0]
            if file_type != 0:  # 非空闲
                size = struct.unpack_from('<I', inode_data, 4)[0]
                type_names = {1: '目录', 2: '文件'}
                inodes.append({
                    'inode_id': i,
                    'type': type_names.get(file_type, '未知'),
                    'size': size
                })
        return jsonify({'success': True, 'inodes': inodes, 'total': len(inodes)})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


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
        # 删除旧的磁盘文件
        disk_path = disk.disk_path
        if os.path.exists(disk_path):
            os.remove(disk_path)
        
        # 重新创建磁盘和文件系统
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


@app.route('/api/buffer/access', methods=['POST'])
def buffer_access_block():
    """访问指定磁盘块；若不在缓冲中则触发置换"""
    data = request.get_json(silent=True) or {}
    try:
        block_id = int(data.get('block_id', -1))
    except Exception:
        return jsonify({'success': False, 'error': 'block_id 需为整数'}), 400
    if block_id < 0:
        return jsonify({'success': False, 'error': 'block_id 必须 >= 0'}), 400

    result = buffer_manager.access_block(block_id)
    return jsonify(result)


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
    
    # 对于普通命令，直接执行（不经过调度器）
    # 只有长任务才需要调度器
    result = process_manager.execute_process(pid)
    
    return jsonify({'success': True, 'pid': pid, 'result': result})


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


def _compute_steps_for_duration(duration_seconds: float) -> int:
    """按当前时间片推导步数，使每步不超过一个时间片"""
    quantum_sec = max(0.01, scheduler.time_quantum / 1000.0)
    return max(1, min(1000, int((duration_seconds / quantum_sec) + 0.999)))


@app.route('/api/processes/longtask', methods=['POST'])
def create_long_task():
    """创建长时间运行的任务（用于演示调度）"""
    data = request.get_json() or {}
    try:
        duration = float(data.get('duration', 3))
    except Exception:
        duration = 3.0
    task_name = data.get('name', '长任务')
    steps = data.get('steps')
    try:
        steps = int(steps) if steps is not None else None
    except Exception:
        steps = None
    if steps is None or steps <= 0:
        steps = _compute_steps_for_duration(duration)
    
    pid = process_manager.create_process(
        name=task_name,
        command=CommandType.LONG_TASK,
        args={'duration': duration, 'steps': steps, 'name': task_name}
    )
    # 初始化剩余时间（毫秒）
    proc = process_manager.get_process(pid)
    if proc:
        proc.remaining_time = int(max(0, duration) * 1000)
    
    # 将进程添加到调度器的就绪队列
    scheduler.add_process(pid)
    
    # 如果调度器未运行，自动启动
    if scheduler.state == SchedulerState.STOPPED:
        scheduler.start()
    
    # 启动一个工作线程来执行任务，但任务会协作式地让出CPU
    def run_scheduled_task(task_pid):
        execute_scheduled_long_task(task_pid, duration, steps, task_name)
    
    thread = threading.Thread(target=run_scheduled_task, args=(pid,), daemon=True)
    thread.start()
    
    return jsonify({
        'success': True,
        'pid': pid,
        'message': f'长任务 {task_name} 已创建，PID: {pid}'
    })


def execute_scheduled_long_task(pid: int, duration: float, steps: int, task_name: str):
    """执行受调度器控制的长任务 - 时间片轮转协作"""
    process = process_manager.get_process(pid)
    if not process:
        return
    
    socketio.emit('process_progress', {
        'pid': pid,
        'name': task_name,
        'status': 'started',
        'progress': 0
    })
    
    time_quantum_sec = max(0.01, scheduler.time_quantum / 1000.0)  # 将毫秒转换为秒
    # 将每步时间限制为一个时间片，步数足够覆盖总时长
    time_per_step = time_quantum_sec
    steps = max(1, int((duration / time_per_step) + 0.999))
    completed_steps = 0
    if process:
        process.remaining_time = int(max(0, duration) * 1000)
    
    last_slice_seen = -1
    while completed_steps < steps:
        # 检查进程状态
        process = process_manager.get_process(pid)
        if not process or process.state == ProcessState.TERMINATED:
            break

        # 等待一个新的时间片并且当前进程被调度
        with scheduler.condition:
            scheduler.condition.wait_for(
                lambda: scheduler.state == SchedulerState.RUNNING
                and scheduler.current_pid == pid
                and scheduler.stats['time_slices_used'] > last_slice_seen,
                timeout=2.0
            )
            current_slice = scheduler.stats['time_slices_used']
            # 若未满足条件则重试
            if scheduler.current_pid != pid or scheduler.state != SchedulerState.RUNNING or current_slice == last_slice_seen:
                continue
            # 确认被调度，设置为运行态
            process = process_manager.get_process(pid)
            if process and process.state != ProcessState.TERMINATED:
                process.state = ProcessState.RUNNING

        # 在该时间片内执行一个步骤
        time.sleep(min(time_per_step, 0.02))
        completed_steps += 1
        last_slice_seen = current_slice

        # 发送进度更新（剩余时间由调度器扣减）
        progress = (completed_steps / steps) * 100
        socketio.emit('process_progress', {
            'pid': pid,
            'name': task_name,
            'status': 'running',
            'progress': progress,
            'current_step': completed_steps,
            'total_steps': steps
        })
    
    # 任务完成
    with process_manager.lock:
        process = process_manager.get_process(pid)
        if process:
            process.state = ProcessState.TERMINATED
            process.end_time = time.time()
            process.remaining_time = 0
    
    scheduler.notify_process_terminated(pid)
    
    socketio.emit('process_progress', {
        'pid': pid,
        'name': task_name,
        'status': 'completed',
        'progress': 100
    })


@app.route('/api/processes/batch', methods=['POST'])
def create_batch_tasks():
    """批量创建任务（用于演示多进程调度）"""
    data = request.get_json() or {}
    count = data.get('count', 3)
    duration_raw = data.get('duration', 3)
    durations_raw = data.get('durations')
    steps = 5

    def normalize_duration(val, fallback):
        try:
            v = float(val)
        except (TypeError, ValueError):
            v = fallback
        try:
            v = float(v)
        except Exception:
            return None
        # 如果数值大于100，按毫秒处理（300 -> 0.3s，3000 -> 3s）
        if v > 100:
            v = v / 1000.0
        return max(0.05, v)

    # 组装每个任务的时长，兼容 duration 传数组的情况
    durations_list = []
    source_list = durations_raw if isinstance(durations_raw, list) else (duration_raw if isinstance(duration_raw, list) else None)

    if source_list is not None:
        for i in range(count):
            src = source_list[i] if i < len(source_list) else duration_raw
            norm = normalize_duration(src, duration_raw)
            durations_list.append(norm if norm is not None else 0.3)
    else:
        norm = normalize_duration(duration_raw, 3)
        durations_list = [norm if norm is not None else 0.3] * count
    
    pids = []
    for i in range(count):
        task_name = f'批量任务_{i+1}'
        steps_for_task = _compute_steps_for_duration(durations_list[i])
        pid = process_manager.create_process(
            name=task_name,
            command=CommandType.LONG_TASK,
            args={'duration': durations_list[i], 'steps': steps_for_task, 'name': task_name}
        )
        proc = process_manager.get_process(pid)
        if proc:
            proc.remaining_time = int(max(0, durations_list[i]) * 1000)
        scheduler.add_process(pid)
        pids.append(pid)
    
    # 如果调度器未运行，自动启动
    if scheduler.state == SchedulerState.STOPPED:
        scheduler.start()
    
    # 启动工作线程
    for i, pid in enumerate(pids):
        task_name = f'批量任务_{i+1}'
        def run_task(p, d, s, n):
            execute_scheduled_long_task(p, d, s, n)
        
        thread = threading.Thread(
            target=run_task, 
            args=(pid, durations_list[i], _compute_steps_for_duration(durations_list[i]), task_name), 
            daemon=True
        )
        thread.start()
    
    return jsonify({
        'success': True,
        'pids': pids,
        'durations_used': durations_list,
        'message': f'已创建 {count} 个任务'
    })


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


@app.route('/api/scheduler/events/clear', methods=['POST'])
def scheduler_clear_events():
    """清空调度事件"""
    scheduler.clear_events()
    return jsonify({'success': True, 'message': '已清空调度事件'})


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
        try:
            socketio.sleep(1)  # 使用 socketio.sleep 替代 time.sleep
            socketio.emit('status_update', {
                'timestamp': time.time(),
                'disk': disk.get_disk_info(),
                'buffer': buffer_manager.get_stats(),
                'scheduler': scheduler.get_stats()
            })
        except Exception as e:
            # 忽略广播过程中的错误，避免线程崩溃
            pass


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
