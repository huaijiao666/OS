# -*- coding: utf-8 -*-
"""
操作系统课程设计 - 进程管理模块
实现进程的创建、管理和同步控制
采用条件变量实现进程间同步与互斥
"""

import os
import threading
import time
import queue
from typing import Optional, Dict, List, Any, Callable
from dataclasses import dataclass, field
from enum import Enum
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import *


class ProcessState(Enum):
    """进程状态"""
    NEW = 0         # 新建
    READY = 1       # 就绪
    RUNNING = 2     # 运行
    BLOCKED = 3     # 阻塞
    TERMINATED = 4  # 终止


class CommandType(Enum):
    """命令类型"""
    CREATE_FILE = 'create'
    READ_FILE = 'read'
    WRITE_FILE = 'write'
    DELETE_FILE = 'delete'
    LIST_DIR = 'ls'
    MKDIR = 'mkdir'
    CD = 'cd'
    INFO = 'info'
    OPEN = 'open'
    CLOSE = 'close'


@dataclass
class Process:
    """
    进程控制块 (PCB)
    """
    pid: int                              # 进程ID
    name: str                             # 进程名称
    state: ProcessState = ProcessState.NEW  # 进程状态
    priority: int = 0                     # 优先级
    command: CommandType = None           # 执行的命令类型
    args: Dict[str, Any] = field(default_factory=dict)  # 命令参数
    result: Any = None                    # 执行结果
    
    # 时间相关
    create_time: float = 0.0              # 创建时间
    start_time: float = 0.0               # 开始执行时间
    end_time: float = 0.0                 # 结束时间
    cpu_time: float = 0.0                 # CPU使用时间
    wait_time: float = 0.0                # 等待时间
    
    # 时间片相关（用于RR调度）
    time_slice: int = TIME_QUANTUM        # 分配的时间片
    remaining_time: int = TIME_QUANTUM    # 剩余时间片
    
    # 资源相关
    open_files: List[int] = field(default_factory=list)  # 打开的文件iNode列表
    allocated_pages: List[int] = field(default_factory=list)  # 分配的缓冲页


class ProcessManager:
    """
    进程管理器
    管理进程的创建、调度和同步
    采用条件变量实现进程间同步与互斥
    """
    
    def __init__(self):
        """初始化进程管理器"""
        self.lock = threading.RLock()
        self.condition = threading.Condition(self.lock)
        
        # 进程表
        self.processes: Dict[int, Process] = {}
        self.next_pid = 1
        
        # 进程队列
        self.ready_queue: queue.Queue = queue.Queue()
        self.blocked_queue: List[int] = []
        
        # 当前运行的进程
        self.current_process: Optional[int] = None
        
        # 线程池（用于执行进程）
        self.threads: Dict[int, threading.Thread] = {}
        
        # 回调函数（用于执行实际命令）
        self.command_handlers: Dict[CommandType, Callable] = {}
        
        # 统计信息
        self.stats = {
            'total_created': 0,
            'total_completed': 0,
            'total_terminated': 0,
            'context_switches': 0
        }
        
        # 运行标志
        self.running = True
    
    def register_handler(self, command_type: CommandType, handler: Callable):
        """注册命令处理函数"""
        self.command_handlers[command_type] = handler
    
    def create_process(self, name: str, command: CommandType, 
                       args: Dict[str, Any] = None, priority: int = 0) -> int:
        """
        创建新进程
        
        Args:
            name: 进程名称
            command: 命令类型
            args: 命令参数
            priority: 优先级
            
        Returns:
            进程ID
        """
        with self.condition:
            pid = self.next_pid
            self.next_pid += 1
            
            process = Process(
                pid=pid,
                name=name,
                command=command,
                args=args or {},
                priority=priority,
                create_time=time.time(),
                time_slice=TIME_QUANTUM,
                remaining_time=TIME_QUANTUM
            )
            
            self.processes[pid] = process
            self.stats['total_created'] += 1
            
            # 设置为就绪状态并加入就绪队列
            process.state = ProcessState.READY
            self.ready_queue.put(pid)
            
            # 通知调度器
            self.condition.notify_all()
            
            return pid
    
    def terminate_process(self, pid: int, force: bool = False) -> bool:
        """
        终止进程
        
        Args:
            pid: 进程ID
            force: 是否强制终止
            
        Returns:
            是否成功
        """
        with self.condition:
            if pid not in self.processes:
                return False
            
            process = self.processes[pid]
            
            if process.state == ProcessState.TERMINATED:
                return True
            
            # 设置终止状态
            process.state = ProcessState.TERMINATED
            process.end_time = time.time()
            
            # 从阻塞队列移除
            if pid in self.blocked_queue:
                self.blocked_queue.remove(pid)
            
            # 停止线程
            if pid in self.threads:
                # 线程会检查进程状态并退出
                pass
            
            self.stats['total_terminated'] += 1
            self.condition.notify_all()
            
            return True
    
    def get_process(self, pid: int) -> Optional[Process]:
        """获取进程信息"""
        with self.lock:
            return self.processes.get(pid)
    
    def block_process(self, pid: int, reason: str = ''):
        """
        阻塞进程
        
        Args:
            pid: 进程ID
            reason: 阻塞原因
        """
        with self.condition:
            if pid in self.processes:
                process = self.processes[pid]
                if process.state == ProcessState.RUNNING:
                    process.state = ProcessState.BLOCKED
                    self.blocked_queue.append(pid)
                    if self.current_process == pid:
                        self.current_process = None
                    self.condition.notify_all()
    
    def unblock_process(self, pid: int):
        """
        解除进程阻塞
        
        Args:
            pid: 进程ID
        """
        with self.condition:
            if pid in self.processes and pid in self.blocked_queue:
                process = self.processes[pid]
                process.state = ProcessState.READY
                self.blocked_queue.remove(pid)
                self.ready_queue.put(pid)
                self.condition.notify_all()
    
    def wait_for_process(self, pid: int, timeout: float = None) -> Optional[Any]:
        """
        等待进程完成（条件变量实现）
        
        Args:
            pid: 进程ID
            timeout: 超时时间
            
        Returns:
            进程执行结果
        """
        with self.condition:
            start_time = time.time()
            
            while True:
                if pid not in self.processes:
                    return None
                
                process = self.processes[pid]
                if process.state == ProcessState.TERMINATED:
                    return process.result
                
                # 计算剩余等待时间
                if timeout is not None:
                    elapsed = time.time() - start_time
                    remaining = timeout - elapsed
                    if remaining <= 0:
                        return None
                    self.condition.wait(remaining)
                else:
                    self.condition.wait()
    
    def execute_process(self, pid: int) -> Any:
        """
        执行进程命令
        
        Args:
            pid: 进程ID
            
        Returns:
            执行结果
        """
        with self.condition:
            if pid not in self.processes:
                return {'success': False, 'error': '进程不存在'}
            
            process = self.processes[pid]
            
            if process.command not in self.command_handlers:
                return {'success': False, 'error': f'未知命令: {process.command}'}
            
            # 设置为运行状态
            process.state = ProcessState.RUNNING
            process.start_time = time.time()
            self.current_process = pid
        
        try:
            # 执行命令（在锁外执行，避免死锁）
            handler = self.command_handlers[process.command]
            result = handler(process.args, pid)
            
            with self.condition:
                process.result = result
                process.state = ProcessState.TERMINATED
                process.end_time = time.time()
                process.cpu_time = process.end_time - process.start_time
                
                if self.current_process == pid:
                    self.current_process = None
                
                self.stats['total_completed'] += 1
                self.condition.notify_all()
            
            return result
            
        except Exception as e:
            with self.condition:
                process.result = {'success': False, 'error': str(e)}
                process.state = ProcessState.TERMINATED
                process.end_time = time.time()
                
                if self.current_process == pid:
                    self.current_process = None
                
                self.condition.notify_all()
            
            return process.result
    
    def run_process_async(self, pid: int) -> threading.Thread:
        """
        异步执行进程
        
        Args:
            pid: 进程ID
            
        Returns:
            执行线程
        """
        def worker():
            self.execute_process(pid)
        
        thread = threading.Thread(target=worker, name=f"Process-{pid}")
        self.threads[pid] = thread
        thread.start()
        return thread
    
    def get_ready_process(self) -> Optional[int]:
        """获取就绪队列中的下一个进程"""
        try:
            return self.ready_queue.get_nowait()
        except queue.Empty:
            return None
    
    def get_all_processes(self) -> List[Dict[str, Any]]:
        """获取所有进程信息"""
        with self.lock:
            result = []
            for pid, process in self.processes.items():
                result.append({
                    'pid': process.pid,
                    'name': process.name,
                    'state': process.state.name,
                    'command': process.command.value if process.command else None,
                    'priority': process.priority,
                    'create_time': process.create_time,
                    'cpu_time': process.cpu_time,
                    'remaining_time': process.remaining_time
                })
            return result
    
    def get_process_stats(self) -> Dict[str, Any]:
        """获取进程统计信息"""
        with self.lock:
            running = sum(1 for p in self.processes.values() 
                         if p.state == ProcessState.RUNNING)
            ready = sum(1 for p in self.processes.values() 
                       if p.state == ProcessState.READY)
            blocked = len(self.blocked_queue)
            
            return {
                **self.stats,
                'running': running,
                'ready': ready,
                'blocked': blocked,
                'total_processes': len(self.processes)
            }
    
    def cleanup_terminated(self):
        """清理已终止的进程"""
        with self.lock:
            terminated = [pid for pid, p in self.processes.items() 
                         if p.state == ProcessState.TERMINATED]
            for pid in terminated:
                if pid in self.threads:
                    del self.threads[pid]
                # 保留进程记录用于查询
    
    def shutdown(self):
        """关闭进程管理器"""
        with self.condition:
            self.running = False
            # 终止所有进程
            for pid in list(self.processes.keys()):
                self.terminate_process(pid, force=True)
            self.condition.notify_all()

