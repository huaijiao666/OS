import { useState, useEffect, useCallback } from 'react';
import {
  getSchedulerStatus,
  startScheduler,
  stopScheduler,
  pauseScheduler,
  resumeScheduler,
  setTimeQuantum,
  getSchedulerEvents,
  clearSchedulerEvents,
  createLongTask,
  getSocket,
} from '../../services/api';
import type { SystemStats } from '../../types';

interface SchedulerPanelProps {
  stats: SystemStats | null;
  showToast: (type: string, message: string) => void;
}

interface TaskProgress {
  pid: number;
  name: string;
  progress: number;
  status: string;
  current_step?: number;
  total_steps?: number;
}

function formatTimestamp(ts: number): string {
  const date = new Date(ts * 1000);
  return date.toLocaleTimeString('zh-CN');
}

export default function SchedulerPanel({ stats, showToast }: SchedulerPanelProps) {
  const [readyQueue, setReadyQueue] = useState<number[]>([]);
  const [events, setEvents] = useState<Array<{ timestamp: number; type: string; pid: number; details: string; remaining_time?: number | string | null }>>([]);
  const [quantum, setQuantum] = useState(100);
  const [schedulerStats, setSchedulerStats] = useState<{
    context_switches: number;
    preemptions: number;
    cpu_utilization: number;
    current_process: number | null;
    time_slices_used: number;
  } | null>(null);
  const [taskProgress, setTaskProgress] = useState<Map<number, TaskProgress>>(new Map());
  const [singleDurationMs, setSingleDurationMs] = useState<number>(3000);

  const loadStatus = useCallback(async () => {
    try {
      const data = await getSchedulerStatus();
      setReadyQueue(data.ready_queue || []);
      setSchedulerStats({
        context_switches: data.stats.context_switches,
        preemptions: data.stats.preemptions,
        cpu_utilization: data.stats.cpu_utilization,
        current_process: data.stats.current_process,
        time_slices_used: data.stats.time_slices_used,
      });
    } catch (error) {
      console.error('加载调度器状态失败:', error);
    }
  }, []);

  const loadEvents = useCallback(async () => {
    try {
      const data = await getSchedulerEvents(200);
      setEvents(prev => {
        const combined = [...prev, ...(data.events || [])];
        const seen = new Set<string>();
        const merged: typeof combined = [];
        for (const e of combined) {
          const key = `${e.timestamp}-${e.type}-${e.pid}-${e.details}`;
          if (!seen.has(key)) {
            seen.add(key);
            merged.push(e);
          }
        }
        return merged.slice(-200); // 保留历史，最多200条
      });
    } catch (error) {
      console.error('加载调度事件失败:', error);
    }
  }, []);

  useEffect(() => {
    loadStatus();
    loadEvents();
    const interval = setInterval(() => {
      loadStatus();
      loadEvents();
    }, 1000);  // 更频繁地刷新以观察调度变化
    
    // 订阅进程进度事件
    const socket = getSocket();
    if (socket) {
      socket.on('process_progress', (data: TaskProgress) => {
        setTaskProgress(prev => {
          const newMap = new Map(prev);
          newMap.set(data.pid, data);
          // 如果任务完成，3秒后移除
          if (data.status === 'completed') {
            setTimeout(() => {
              setTaskProgress(p => {
                const m = new Map(p);
                m.delete(data.pid);
                return m;
              });
            }, 3000);
          }
          return newMap;
        });
      });
    }
    
    return () => {
      clearInterval(interval);
      if (socket) {
        socket.off('process_progress');
      }
    };
  }, [loadStatus, loadEvents]);

  const handleStart = useCallback(async () => {
    try {
      await startScheduler();
      showToast('success', '调度器已启动');
      loadStatus();
    } catch {
      showToast('error', '启动调度器失败');
    }
  }, [showToast, loadStatus]);

  const handleStop = useCallback(async () => {
    try {
      await stopScheduler();
      showToast('success', '调度器已停止');
      loadStatus();
    } catch {
      showToast('error', '停止调度器失败');
    }
  }, [showToast, loadStatus]);

  const handlePause = useCallback(async () => {
    try {
      await pauseScheduler();
      showToast('info', '调度器已暂停');
      loadStatus();
    } catch {
      showToast('error', '暂停调度器失败');
    }
  }, [showToast, loadStatus]);

  const handleResume = useCallback(async () => {
    try {
      await resumeScheduler();
      showToast('success', '调度器已恢复');
      loadStatus();
    } catch {
      showToast('error', '恢复调度器失败');
    }
  }, [showToast, loadStatus]);

  const handleCreateTask = useCallback(async () => {
    try {
      const name = `Task_${Date.now() % 10000}`;
      const durationMs = Math.max(50, singleDurationMs || 50);
      const durationSec = durationMs / 1000;
      const result = await createLongTask(name, durationSec, 10);
      if (result.success) {
        showToast('success', `已创建任务 ${name}，PID: ${result.pid}，时长: ${durationMs}ms`);
        loadStatus();
        loadEvents();
      } else {
        showToast('error', '创建任务失败');
      }
    } catch {
      showToast('error', '创建任务失败');
    }
  }, [showToast, loadStatus, loadEvents, singleDurationMs]);

  const handleSetQuantum = useCallback(async () => {
    if (quantum < 10 || quantum > 1000) {
      showToast('error', '时间片必须在 10-1000ms 之间');
      return;
    }
    try {
      await setTimeQuantum(quantum);
      showToast('success', `时间片已设置为 ${quantum}ms`);
    } catch {
      showToast('error', '设置时间片失败');
    }
  }, [quantum, showToast]);

  const schedulerState = stats?.scheduler?.state || 'STOPPED';

  return (
    <section className="panel active">
      <div className="scheduler-container">
        <div className="scheduler-controls">
          <div className="control-group">
            <label>调度器状态</label>
            <span className={`scheduler-state ${schedulerState}`}>{schedulerState}</span>
          </div>
          <div className="control-group">
            <label>时间片 (ms)</label>
            <input
              type="number"
              value={quantum}
              onChange={e => setQuantum(parseInt(e.target.value) || 100)}
              min="10"
              max="1000"
            />
            <button className="btn-small" onClick={handleSetQuantum}>设置</button>
          </div>
          <div className="control-group">
            <button className="btn-primary" onClick={handleStart}>启动</button>
            <button className="btn-secondary" onClick={handlePause}>暂停</button>
            <button className="btn-secondary" onClick={handleResume}>恢复</button>
            <button className="btn-danger" onClick={handleStop}>停止</button>
          </div>
        </div>

        {/* 创建单个任务 */}
        <div className="task-controls" style={{ 
          display: 'flex', 
          gap: '8px', 
          padding: '12px 0',
          borderBottom: '1px solid var(--border-color)',
          marginBottom: '12px'
        }}>
          <span style={{ color: 'var(--text-secondary)', marginRight: '8px' }}>演示调度:</span>
          <button className="btn-primary" onClick={handleCreateTask}>
            创建单个任务
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <input
              type="number"
              min={50}
              max={60000}
              step={50}
              value={singleDurationMs}
              onChange={e => setSingleDurationMs(parseInt(e.target.value) || 50)}
              style={{ width: '110px', padding: '6px 8px', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '6px' }}
              placeholder="任务时长 ms"
              title="设置任务时长 (毫秒)"
            />
            <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>默认 3000ms，可自行调整</span>
          </div>
        </div>

        <div className="scheduler-stats">
          <div className="sched-stat">
            <span className="sched-stat-value">{schedulerStats?.current_process ?? '-'}</span>
            <span className="sched-stat-label">当前进程</span>
          </div>
          <div className="sched-stat">
            <span className="sched-stat-value">{schedulerStats?.time_slices_used ?? 0}</span>
            <span className="sched-stat-label">时间片使用</span>
          </div>
          <div className="sched-stat">
            <span className="sched-stat-value">{schedulerStats?.context_switches ?? 0}</span>
            <span className="sched-stat-label">上下文切换</span>
          </div>
          <div className="sched-stat">
            <span className="sched-stat-value">{schedulerStats?.preemptions ?? 0}</span>
            <span className="sched-stat-label">抢占次数</span>
          </div>
          {/* <div className="sched-stat">
            <span className="sched-stat-value">
              {((schedulerStats?.cpu_utilization ?? 0) * 100).toFixed(1)}%
            </span>
            <span className="sched-stat-label">CPU利用率</span>
          </div> */}
        </div>

        {/* 任务进度显示 */}
        {taskProgress.size > 0 && (
          <div style={{ 
            background: 'var(--card-bg)', 
            padding: '12px', 
            borderRadius: '8px', 
            marginBottom: '12px' 
          }}>
            <h4 style={{ margin: '0 0 8px 0' }}>任务执行进度</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {Array.from(taskProgress.values()).map(task => (
                <div key={task.pid} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ minWidth: '100px', fontWeight: 'bold' }}>{task.name}</span>
                  <span style={{ minWidth: '60px', color: 'var(--text-muted)' }}>PID {task.pid}</span>
                  <div style={{ 
                    flex: 1, 
                    background: 'var(--bg-color)', 
                    borderRadius: '4px', 
                    height: '20px',
                    overflow: 'hidden'
                  }}>
                    <div style={{
                      width: `${task.progress}%`,
                      height: '100%',
                      background: task.status === 'completed' ? '#2ed573' : 
                                  task.status === 'running' ? '#ffa502' : '#576574',
                      transition: 'width 0.3s ease'
                    }} />
                  </div>
                  <span style={{ minWidth: '60px', textAlign: 'right' }}>
                    {task.progress.toFixed(0)}%
                  </span>
                  <span style={{ 
                    minWidth: '80px',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    background: task.status === 'completed' ? '#2ed573' : 
                                task.status === 'running' ? '#ffa502' : '#576574',
                    color: 'white',
                    textAlign: 'center'
                  }}>
                    {task.status === 'completed' ? '已完成' : 
                     task.status === 'running' ? '运行中' : '等待中'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="ready-queue-container">
          <h3>就绪队列 (RR算法)</h3>
          <div className="ready-queue">
            {readyQueue.length === 0 ? (
              <span className="queue-empty">队列为空</span>
            ) : (
              readyQueue.map(pid => (
                <div key={pid} className="queue-item">PID {pid}</div>
              ))
            )}
          </div>
        </div>

        <div className="scheduler-events">
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px', gap: '8px' }}>
            <h3 style={{ margin: 0, flex: 1 }}>调度事件</h3>
            <button className="btn-small" onClick={async () => {
              try {
                await clearSchedulerEvents();
                setEvents([]);
                showToast('info', '调度事件已清空');
              } catch {
                showToast('error', '清空失败');
              }
            }}>清空</button>
          </div>
          <div className="event-list">
            {events.length === 0 ? (
              <div style={{ padding: '20px', color: 'var(--text-muted)' }}>暂无事件</div>
            ) : (
              events.slice().reverse().map((e, index) => {
                const remainingRaw = e.remaining_time;
                const remainingMs = typeof remainingRaw === 'string' ? parseFloat(remainingRaw) : remainingRaw;
                const showRemaining = Number.isFinite(remainingMs as number);
                return (
                  <div key={index} className="event-item">
                    <span style={{ color: 'var(--text-muted)' }}>{formatTimestamp(e.timestamp)}</span>
                    <span className={`event-type ${e.type}`}>{e.type}</span>
                    <span>PID {e.pid}</span>
                    <span style={{ color: 'var(--text-secondary)', flex: 1 }}>{e.details}</span>
                    {showRemaining && (
                      <span style={{ color: 'var(--text-muted)', minWidth: '120px', textAlign: 'right' }}>
                        剩余时间: {(remainingMs as number).toFixed(0)} ms
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
