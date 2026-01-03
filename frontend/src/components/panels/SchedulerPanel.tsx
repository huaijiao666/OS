import { useState, useEffect, useCallback } from 'react';
import {
  getSchedulerStatus,
  startScheduler,
  stopScheduler,
  pauseScheduler,
  setTimeQuantum,
  getSchedulerEvents,
} from '../../services/api';
import type { SystemStats } from '../../types';

interface SchedulerPanelProps {
  stats: SystemStats | null;
  showToast: (type: string, message: string) => void;
}

function formatTimestamp(ts: number): string {
  const date = new Date(ts * 1000);
  return date.toLocaleTimeString('zh-CN');
}

export default function SchedulerPanel({ stats, showToast }: SchedulerPanelProps) {
  const [readyQueue, setReadyQueue] = useState<number[]>([]);
  const [events, setEvents] = useState<Array<{ timestamp: number; type: string; pid: number; details: string }>>([]);
  const [quantum, setQuantum] = useState(100);
  const [schedulerStats, setSchedulerStats] = useState<{
    context_switches: number;
    preemptions: number;
    cpu_utilization: number;
  } | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const data = await getSchedulerStatus();
      setReadyQueue(data.ready_queue || []);
      setSchedulerStats({
        context_switches: data.stats.context_switches,
        preemptions: data.stats.preemptions,
        cpu_utilization: data.stats.cpu_utilization,
      });
    } catch (error) {
      console.error('加载调度器状态失败:', error);
    }
  }, []);

  const loadEvents = useCallback(async () => {
    try {
      const data = await getSchedulerEvents(20);
      setEvents(data.events || []);
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
    }, 2000);
    return () => clearInterval(interval);
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
            <button className="btn-danger" onClick={handleStop}>停止</button>
          </div>
        </div>

        <div className="scheduler-stats">
          <div className="sched-stat">
            <span className="sched-stat-value">{schedulerStats?.context_switches ?? 0}</span>
            <span className="sched-stat-label">上下文切换</span>
          </div>
          <div className="sched-stat">
            <span className="sched-stat-value">{schedulerStats?.preemptions ?? 0}</span>
            <span className="sched-stat-label">抢占次数</span>
          </div>
          <div className="sched-stat">
            <span className="sched-stat-value">
              {((schedulerStats?.cpu_utilization ?? 0) * 100).toFixed(1)}%
            </span>
            <span className="sched-stat-label">CPU利用率</span>
          </div>
        </div>

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
          <h3>调度事件</h3>
          <div className="event-list">
            {events.length === 0 ? (
              <div style={{ padding: '20px', color: 'var(--text-muted)' }}>暂无事件</div>
            ) : (
              events.slice().reverse().map((e, index) => (
                <div key={index} className="event-item">
                  <span style={{ color: 'var(--text-muted)' }}>{formatTimestamp(e.timestamp)}</span>
                  <span className={`event-type ${e.type}`}>{e.type}</span>
                  <span>PID {e.pid}</span>
                  <span style={{ color: 'var(--text-secondary)' }}>{e.details}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
