# -*- coding: utf-8 -*-
"""
操作系统课程设计 - 进程调度模块（时间片轮转）

重写要点：
1) 逻辑时钟：使用 10ms 最小刻度的自增累加器模拟时间，禁止依赖真实时间；
2) 强制时间片流程：即使只有一个进程，也执行调度-运行-抢占-重新入队的完整周期；
3) 主动推送事件：每个时间片将事件及其开始执行的时间推送给前端。
"""

import os
import threading
import queue
from typing import Optional, Dict, List, Any, Callable
from dataclasses import dataclass
from enum import Enum
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import *  # noqa: E402,F401
from .process import ProcessManager, Process, ProcessState, CommandType  # noqa: E402,F401


class SchedulerState(Enum):
    STOPPED = 0
    RUNNING = 1
    PAUSED = 2


@dataclass
class ScheduleEvent:
    timestamp: float
    event_type: str
    pid: int
    details: str = ''
    remaining_time: Optional[float] = None


class RRScheduler:
    """时间片轮转调度器（逻辑时钟驱动）"""

    def __init__(self, process_manager: ProcessManager, time_quantum: int = TIME_QUANTUM):
        self.process_manager = process_manager
        self.time_quantum = time_quantum

        self.lock = threading.RLock()
        self.condition = threading.Condition(self.lock)

        self.ready_queue: List[int] = []
        self.current_pid: Optional[int] = None
        self.current_start_time: float = 0.0

        self.state = SchedulerState.STOPPED
        self.scheduler_thread: Optional[threading.Thread] = None

        self.events: List[ScheduleEvent] = []
        self.max_events = 200

        # 逻辑时钟（毫秒）
        self.logical_time_ms: int = 0

        self.stats = {
            'total_schedules': 0,
            'context_switches': 0,
            'time_slices_used': 0,
            'preemptions': 0,
            'idle_time': 0.0,
            'idle_time_ms': 0,
            'start_time_ms': 0,
        }

        # 回调
        self.on_schedule: Optional[Callable[[int], None]] = None
        self.on_preempt: Optional[Callable[[int], None]] = None
        self.event_emitter: Optional[Callable[[Dict[str, Any]], None]] = None

        self._min_tick_ms = 10

    # ------------------------- 外部接口 -------------------------
    def start(self):
        with self.lock:
            if self.state == SchedulerState.RUNNING:
                return
            self.state = SchedulerState.RUNNING
            self.stats['start_time_ms'] = self.logical_time_ms
            self.scheduler_thread = threading.Thread(
                target=self._scheduler_loop,
                name="RRScheduler",
                daemon=True,
            )
            self.scheduler_thread.start()

    def stop(self):
        with self.condition:
            self.state = SchedulerState.STOPPED
            self.condition.notify_all()
        if self.scheduler_thread:
            self.scheduler_thread.join(timeout=2.0)

    def pause(self):
        with self.lock:
            if self.state == SchedulerState.RUNNING:
                self.state = SchedulerState.PAUSED

    def resume(self):
        with self.condition:
            if self.state == SchedulerState.PAUSED:
                self.state = SchedulerState.RUNNING
                self.condition.notify_all()

    def set_event_emitter(self, emitter: Callable[[Dict[str, Any]], None]):
        self.event_emitter = emitter

    def add_process(self, pid: int):
        with self.condition:
            if pid not in self.ready_queue:
                self.ready_queue.append(pid)
                proc = self.process_manager.get_process(pid)
                if proc and proc.state != ProcessState.BLOCKED:
                    proc.state = ProcessState.READY
                self._log_event('enqueue', pid, f'进程 {pid} 加入就绪队列')
                self.condition.notify_all()

    def remove_process(self, pid: int):
        with self.lock:
            if pid in self.ready_queue:
                self.ready_queue.remove(pid)

    def notify_process_ready(self, pid: int):
        self.add_process(pid)

    def notify_process_blocked(self, pid: int):
        with self.lock:
            if pid == self.current_pid:
                self.current_pid = None
            self.remove_process(pid)
            self._log_event('block', pid, f'进程 {pid} 阻塞')

    def notify_process_terminated(self, pid: int):
        with self.lock:
            if pid == self.current_pid:
                self.current_pid = None
            self.remove_process(pid)
            if not any(e.event_type == 'complete' and e.pid == pid for e in reversed(self.events)):
                self._log_event('complete', pid, f'进程 {pid} 终止')

    def get_current_process(self) -> Optional[int]:
        with self.lock:
            return self.current_pid

    def get_ready_queue(self) -> List[int]:
        with self.lock:
            return list(self.ready_queue)

    def get_events(self, count: int = 20) -> List[Dict[str, Any]]:
        with self.lock:
            events = self.events[-count:]
            return [
                {
                    'timestamp': e.timestamp,
                    'type': e.event_type,
                    'pid': e.pid,
                    'details': e.details,
                    'remaining_time': e.remaining_time,
                    'logical_time_ms': int(e.timestamp * 1000),
                }
                for e in events
            ]

    def clear_events(self):
        with self.lock:
            self.events.clear()

    def get_stats(self) -> Dict[str, Any]:
        with self.lock:
            uptime = self.logical_time_ms / 1000.0
            busy_time = max(0.0, uptime - (self.stats['idle_time_ms'] / 1000.0))
            cpu_utilization = (busy_time / uptime) if uptime > 0 else 0
            return {
                **self.stats,
                'state': self.state.name,
                'time_quantum': self.time_quantum,
                'current_process': self.current_pid,
                'ready_queue_size': len(self.ready_queue),
                'uptime': uptime,
                'cpu_utilization': cpu_utilization,
                'idle_time': self.stats['idle_time_ms'] / 1000.0,
            }

    def get_gantt_data(self) -> List[Dict[str, Any]]:
        with self.lock:
            gantt = []
            for event in self.events:
                if event.event_type in ('dispatch', 'preempt', 'complete'):
                    gantt.append({
                        'pid': event.pid,
                        'time': event.timestamp,
                        'type': event.event_type,
                    })
            return gantt

    def set_time_quantum(self, quantum: int):
        with self.lock:
            self.time_quantum = self._quantize_ms(quantum)

    # ------------------------- 内部逻辑 -------------------------
    def _scheduler_loop(self):
        while True:
            with self.condition:
                if self.state == SchedulerState.STOPPED:
                    break
                while self.state == SchedulerState.PAUSED:
                    self.condition.wait()
                    if self.state == SchedulerState.STOPPED:
                        return

                if self.current_pid is None:
                    next_pid = self._select_next_process()
                    if next_pid is None:
                        self._log_event('idle', -1, 'CPU 空闲')
                        self._advance_time(self._min_tick_ms)
                        self.stats['idle_time_ms'] += self._min_tick_ms
                        self.condition.wait()
                        continue
                    self._dispatch(next_pid)
                    self.condition.notify_all()

            self._run_time_slice()

    def _select_next_process(self) -> Optional[int]:
        while self.ready_queue:
            pid = self.ready_queue[0]
            proc = self.process_manager.get_process(pid)
            if proc and proc.state in (ProcessState.READY, ProcessState.RUNNING):
                return pid
            self.ready_queue.pop(0)
        return None

    def _dispatch(self, pid: int):
        if self.current_pid is not None and self.current_pid != pid:
            self._preempt_current()

        self.current_pid = pid
        self.current_start_time = self.logical_time_ms / 1000.0
        if pid in self.ready_queue:
            self.ready_queue.remove(pid)

        proc = self.process_manager.get_process(pid)
        if proc:
            proc.state = ProcessState.RUNNING

        self.stats['total_schedules'] += 1
        slice_ms = max(self._min_tick_ms, self._quantize_ms(self.time_quantum))
        self._log_event('dispatch', pid, f'调度进程 {pid} 开始时间片 ({slice_ms}ms)', self._get_remaining_time(pid))

        if self.on_schedule:
            self.on_schedule(pid)

    def _preempt_current(self):
        if self.current_pid is None:
            return
        pid = self.current_pid
        proc = self.process_manager.get_process(pid)
        if proc and proc.state == ProcessState.RUNNING:
            proc.state = ProcessState.READY
            if pid not in self.ready_queue:
                self.ready_queue.append(pid)

        self.stats['preemptions'] += 1
        self.stats['context_switches'] += 1
        self._log_event('preempt', pid, f'进程 {pid} 被抢占', self._get_remaining_time(pid))

        with self.condition:
            self.condition.notify_all()

        if self.on_preempt:
            self.on_preempt(pid)

        self.current_pid = None

    def _run_time_slice(self):
        with self.lock:
            if self.current_pid is None:
                return
            pid = self.current_pid
            proc = self.process_manager.get_process(pid)
            if not proc:
                self.current_pid = None
                return

            slice_ms = max(self._min_tick_ms, self._quantize_ms(self.time_quantum))
            remaining_before = self._get_remaining_time(pid)

            self._advance_time(slice_ms)
            self.stats['time_slices_used'] += 1

            proc.cpu_time += slice_ms / 1000.0
            if proc.remaining_time is not None:
                proc.remaining_time = max(0, proc.remaining_time - slice_ms)

            proc = self.process_manager.get_process(pid)
            if not proc:
                self.current_pid = None
            elif proc.state == ProcessState.BLOCKED:
                self._log_event('block', pid, f'进程 {pid} 阻塞', self._get_remaining_time(pid))
                self.current_pid = None
            elif proc.state == ProcessState.TERMINATED or (proc.remaining_time is not None and proc.remaining_time <= 0):
                proc.state = ProcessState.TERMINATED
                proc.remaining_time = 0
                self._log_event('complete', pid, f'进程 {pid} 完成', 0)
                self.current_pid = None
            else:
                # 即便只有一个进程也要完整抢占-入队
                self._preempt_current()

        with self.condition:
            self.condition.notify_all()

    def _log_event(self, event_type: str, pid: int, details: str = '', remaining_time: Optional[float] = None):
        if remaining_time is None:
            remaining_time = self._get_remaining_time(pid)
        timestamp = self.logical_time_ms / 1000.0
        event = ScheduleEvent(timestamp, event_type, pid, details, remaining_time)
        self.events.append(event)
        if len(self.events) > self.max_events:
            self.events = self.events[-self.max_events:]

        if self.event_emitter:
            payload = {
                'timestamp': timestamp,
                'type': event_type,
                'pid': pid,
                'details': details,
                'remaining_time': remaining_time,
                'logical_time_ms': self.logical_time_ms,
            }
            try:
                self.event_emitter(payload)
            except Exception:
                pass

    def _advance_time(self, delta_ms: int):
        step = self._quantize_ms(delta_ms)
        self.logical_time_ms += step

    def _quantize_ms(self, value: int) -> int:
        if value <= 0:
            return self._min_tick_ms
        if value % self._min_tick_ms == 0:
            return value
        return ((value + self._min_tick_ms - 1) // self._min_tick_ms) * self._min_tick_ms

    def _get_remaining_time(self, pid: int) -> Optional[float]:
        proc = self.process_manager.get_process(pid)
        if not proc:
            return None
        if getattr(proc, 'remaining_time', None) is not None:
            return proc.remaining_time
        total_duration = None
        try:
            total_duration = float(proc.args.get('duration'))
        except Exception:
            total_duration = None
        if total_duration is not None:
            remaining_ms = max(0.0, total_duration * 1000.0 - proc.cpu_time * 1000.0)
            return remaining_ms
        return getattr(proc, 'remaining_time', None)

