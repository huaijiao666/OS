# -*- coding: utf-8 -*-
"""
操作系统课程设计 - 进程调度模块
实现时间片轮转（Round Robin, RR）调度算法
"""

import os
import threading
import time
import queue
from typing import Optional, Dict, List, Any, Callable
from dataclasses import dataclass
from enum import Enum
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import *
from .process import ProcessManager, Process, ProcessState, CommandType


class SchedulerState(Enum):
    """调度器状态"""
    STOPPED = 0
    RUNNING = 1
    PAUSED = 2


@dataclass
class ScheduleEvent:
    """调度事件"""
    timestamp: float
    event_type: str  # 'dispatch', 'preempt', 'complete', 'block', 'unblock'
    pid: int
    details: str = ''


class RRScheduler:
    """
    时间片轮转调度器
    实现Round Robin调度算法
    """
    
    def __init__(self, process_manager: ProcessManager, time_quantum: int = TIME_QUANTUM):
        """
        初始化调度器
        
        Args:
            process_manager: 进程管理器
            time_quantum: 时间片大小（毫秒）
        """
        self.process_manager = process_manager
        self.time_quantum = time_quantum
        
        self.lock = threading.RLock()
        self.condition = threading.Condition(self.lock)
        
        # 就绪队列（循环队列实现）
        self.ready_queue: List[int] = []
        
        # 当前运行的进程
        self.current_pid: Optional[int] = None
        self.current_start_time: float = 0.0
        
        # 调度器状态
        self.state = SchedulerState.STOPPED
        
        # 调度线程
        self.scheduler_thread: Optional[threading.Thread] = None
        
        # 调度事件日志
        self.events: List[ScheduleEvent] = []
        self.max_events = 100
        
        # 统计信息
        self.stats = {
            'total_schedules': 0,      # 总调度次数
            'context_switches': 0,      # 上下文切换次数
            'time_slices_used': 0,      # 使用的时间片数
            'preemptions': 0,           # 抢占次数
            'idle_time': 0.0,           # 空闲时间
            'start_time': 0.0           # 调度器启动时间
        }
        
        # 回调函数
        self.on_schedule: Optional[Callable[[int], None]] = None
        self.on_preempt: Optional[Callable[[int], None]] = None
    
    def start(self):
        """启动调度器"""
        with self.lock:
            if self.state == SchedulerState.RUNNING:
                return
            
            self.state = SchedulerState.RUNNING
            self.stats['start_time'] = time.time()
            
            self.scheduler_thread = threading.Thread(
                target=self._scheduler_loop,
                name="RRScheduler",
                daemon=True
            )
            self.scheduler_thread.start()
    
    def stop(self):
        """停止调度器"""
        with self.condition:
            self.state = SchedulerState.STOPPED
            self.condition.notify_all()
        
        if self.scheduler_thread:
            self.scheduler_thread.join(timeout=2.0)
    
    def pause(self):
        """暂停调度器"""
        with self.lock:
            if self.state == SchedulerState.RUNNING:
                self.state = SchedulerState.PAUSED
    
    def resume(self):
        """恢复调度器"""
        with self.condition:
            if self.state == SchedulerState.PAUSED:
                self.state = SchedulerState.RUNNING
                self.condition.notify_all()
    
    def add_process(self, pid: int):
        """将进程添加到就绪队列"""
        with self.condition:
            if pid not in self.ready_queue:
                self.ready_queue.append(pid)
                self._log_event('enqueue', pid, f'进程 {pid} 加入就绪队列')
                self.condition.notify_all()
    
    def remove_process(self, pid: int):
        """从就绪队列移除进程"""
        with self.lock:
            if pid in self.ready_queue:
                self.ready_queue.remove(pid)
    
    def _scheduler_loop(self):
        """调度器主循环"""
        while True:
            with self.condition:
                # 检查状态
                if self.state == SchedulerState.STOPPED:
                    break
                
                while self.state == SchedulerState.PAUSED:
                    self.condition.wait()
                    if self.state == SchedulerState.STOPPED:
                        return
                
                # 获取下一个要调度的进程
                next_pid = self._select_next_process()
                
                if next_pid is None:
                    # 没有就绪进程，等待
                    idle_start = time.time()
                    self.condition.wait(timeout=0.1)
                    self.stats['idle_time'] += time.time() - idle_start
                    continue
                
                # 调度新进程
                self._dispatch(next_pid)
            
            # 让进程运行一个时间片
            self._run_time_slice()
    
    def _select_next_process(self) -> Optional[int]:
        """选择下一个要运行的进程（RR算法）"""
        while self.ready_queue:
            pid = self.ready_queue[0]
            
            # 检查进程是否仍然有效
            process = self.process_manager.get_process(pid)
            if process and process.state == ProcessState.READY:
                return pid
            
            # 进程无效，从队列移除
            self.ready_queue.pop(0)
        
        return None
    
    def _dispatch(self, pid: int):
        """调度进程运行"""
        # 如果有当前运行的进程，先处理
        if self.current_pid is not None and self.current_pid != pid:
            self._preempt_current()
        
        self.current_pid = pid
        self.current_start_time = time.time()
        
        # 从队列头部移除
        if pid in self.ready_queue:
            self.ready_queue.remove(pid)
        
        # 更新进程状态
        process = self.process_manager.get_process(pid)
        if process:
            process.state = ProcessState.RUNNING
        
        self.stats['total_schedules'] += 1
        self._log_event('dispatch', pid, f'调度进程 {pid} 运行')
        
        # 调用回调
        if self.on_schedule:
            self.on_schedule(pid)
    
    def _preempt_current(self):
        """抢占当前进程"""
        if self.current_pid is None:
            return
        
        pid = self.current_pid
        process = self.process_manager.get_process(pid)
        
        if process and process.state == ProcessState.RUNNING:
            # 计算已使用的时间
            used_time = time.time() - self.current_start_time
            process.cpu_time += used_time
            process.remaining_time = max(0, process.remaining_time - int(used_time * 1000))
            
            # 设置为就绪状态
            process.state = ProcessState.READY
            
            # 重新加入队列尾部（RR特性）
            self.ready_queue.append(pid)
            
            # 恢复时间片
            process.remaining_time = process.time_slice
        
        self.stats['preemptions'] += 1
        self.stats['context_switches'] += 1
        self._log_event('preempt', pid, f'抢占进程 {pid}')
        
        # 调用回调
        if self.on_preempt:
            self.on_preempt(pid)
        
        self.current_pid = None
    
    def _run_time_slice(self):
        """运行一个时间片"""
        if self.current_pid is None:
            return
        
        pid = self.current_pid
        process = self.process_manager.get_process(pid)
        
        if not process:
            self.current_pid = None
            return
        
        # 模拟时间片运行
        slice_time = self.time_quantum / 1000.0  # 转换为秒
        
        # 分段睡眠，以便响应停止请求
        slice_start = time.time()
        while time.time() - slice_start < slice_time:
            if self.state == SchedulerState.STOPPED:
                return
            
            # 检查进程是否完成
            process = self.process_manager.get_process(pid)
            if not process or process.state == ProcessState.TERMINATED:
                self._log_event('complete', pid, f'进程 {pid} 完成')
                self.current_pid = None
                return
            
            if process.state == ProcessState.BLOCKED:
                self._log_event('block', pid, f'进程 {pid} 阻塞')
                self.current_pid = None
                return
            
            time.sleep(0.01)  # 10ms 检查间隔
        
        # 时间片用完，更新统计
        self.stats['time_slices_used'] += 1
        
        # 检查进程状态
        process = self.process_manager.get_process(pid)
        if process:
            if process.state == ProcessState.RUNNING:
                # 时间片用完，抢占
                with self.lock:
                    self._preempt_current()
            elif process.state == ProcessState.TERMINATED:
                self._log_event('complete', pid, f'进程 {pid} 完成')
                self.current_pid = None
    
    def _log_event(self, event_type: str, pid: int, details: str = ''):
        """记录调度事件"""
        event = ScheduleEvent(
            timestamp=time.time(),
            event_type=event_type,
            pid=pid,
            details=details
        )
        self.events.append(event)
        
        # 限制事件数量
        if len(self.events) > self.max_events:
            self.events = self.events[-self.max_events:]
    
    def get_current_process(self) -> Optional[int]:
        """获取当前运行的进程"""
        with self.lock:
            return self.current_pid
    
    def get_ready_queue(self) -> List[int]:
        """获取就绪队列"""
        with self.lock:
            return self.ready_queue.copy()
    
    def get_events(self, count: int = 20) -> List[Dict[str, Any]]:
        """获取最近的调度事件"""
        with self.lock:
            events = self.events[-count:]
            return [
                {
                    'timestamp': e.timestamp,
                    'type': e.event_type,
                    'pid': e.pid,
                    'details': e.details
                }
                for e in events
            ]
    
    def get_stats(self) -> Dict[str, Any]:
        """获取调度统计信息"""
        with self.lock:
            uptime = time.time() - self.stats['start_time'] if self.stats['start_time'] > 0 else 0
            cpu_utilization = 1 - (self.stats['idle_time'] / uptime) if uptime > 0 else 0
            
            return {
                **self.stats,
                'state': self.state.name,
                'time_quantum': self.time_quantum,
                'current_process': self.current_pid,
                'ready_queue_size': len(self.ready_queue),
                'uptime': uptime,
                'cpu_utilization': cpu_utilization
            }
    
    def get_gantt_data(self) -> List[Dict[str, Any]]:
        """获取甘特图数据（用于可视化）"""
        with self.lock:
            gantt = []
            for event in self.events:
                if event.event_type in ('dispatch', 'preempt', 'complete'):
                    gantt.append({
                        'pid': event.pid,
                        'time': event.timestamp,
                        'type': event.event_type
                    })
            return gantt
    
    def set_time_quantum(self, quantum: int):
        """设置时间片大小"""
        with self.lock:
            self.time_quantum = quantum
    
    def notify_process_ready(self, pid: int):
        """通知进程就绪"""
        self.add_process(pid)
    
    def notify_process_blocked(self, pid: int):
        """通知进程阻塞"""
        with self.lock:
            if pid == self.current_pid:
                self.current_pid = None
            self.remove_process(pid)
            self._log_event('block', pid, f'进程 {pid} 阻塞')
    
    def notify_process_terminated(self, pid: int):
        """通知进程终止"""
        with self.lock:
            if pid == self.current_pid:
                self.current_pid = None
            self.remove_process(pid)
            self._log_event('complete', pid, f'进程 {pid} 终止')

