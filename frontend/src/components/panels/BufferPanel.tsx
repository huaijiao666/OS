import { useState, useEffect, useCallback } from 'react';
import { getBufferStatus, getBufferLog, flushBuffer } from '../../services/api';
import type { BufferPage, BufferStats } from '../../types';

interface BufferPanelProps {
  showToast: (type: string, message: string) => void;
}

function formatTimestamp(ts: number): string {
  const date = new Date(ts * 1000);
  return date.toLocaleTimeString('zh-CN');
}

export default function BufferPanel({ showToast }: BufferPanelProps) {
  const [pages, setPages] = useState<BufferPage[]>([]);
  const [stats, setStats] = useState<BufferStats | null>(null);
  const [logs, setLogs] = useState<Array<{ timestamp: number; type: string; page_id: number; block_id: number }>>([]);

  const loadStatus = useCallback(async () => {
    try {
      const data = await getBufferStatus();
      setPages(data.pages || []);
      setStats(data.stats || null);
    } catch (error) {
      console.error('加载缓冲区状态失败:', error);
    }
  }, []);

  const loadLogs = useCallback(async () => {
    try {
      const data = await getBufferLog();
      setLogs(data.log || []);
    } catch (error) {
      console.error('加载缓冲区日志失败:', error);
    }
  }, []);

  useEffect(() => {
    loadStatus();
    loadLogs();
  }, [loadStatus, loadLogs]);

  const handleFlush = useCallback(async () => {
    try {
      const result = await flushBuffer();
      if (result.success) {
        showToast('success', '缓冲区已刷新');
        loadStatus();
      }
    } catch {
      showToast('error', '刷新失败');
    }
  }, [showToast, loadStatus]);

  return (
    <section className="panel active">
      <div className="buffer-container">
        <div className="buffer-stats">
          <div className="buffer-stat-card">
            <div className="stat-number">{stats?.hits ?? 0}</div>
            <div className="stat-text">命中次数</div>
          </div>
          <div className="buffer-stat-card">
            <div className="stat-number">{stats?.misses ?? 0}</div>
            <div className="stat-text">未命中</div>
          </div>
          <div className="buffer-stat-card">
            <div className="stat-number">{stats?.evictions ?? 0}</div>
            <div className="stat-text">置换次数</div>
          </div>
          <div className="buffer-stat-card">
            <div className="stat-number">{stats?.writebacks ?? 0}</div>
            <div className="stat-text">写回次数</div>
          </div>
        </div>

        <div className="buffer-pages-container">
          <h3>缓冲页状态 (LRU置换)</h3>
          <button className="btn-secondary" onClick={handleFlush} style={{ marginBottom: '16px' }}>
            刷新缓冲区
          </button>
          <div className="buffer-pages">
            {pages.map(page => (
              <div key={page.page_id} className={`buffer-page ${page.state.toLowerCase()}`}>
                <div className="page-id">页 #{page.page_id}</div>
                <div className="page-block">{page.block_id >= 0 ? `块 ${page.block_id}` : '-'}</div>
                <div className={`page-state ${page.state}`}>{page.state}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="buffer-log-container">
          <h3>置换日志</h3>
          <div className="buffer-log">
            {logs.length === 0 ? (
              <div style={{ color: 'var(--text-muted)' }}>暂无日志</div>
            ) : (
              logs.slice(-20).reverse().map((log, index) => (
                <div key={index} className="buffer-log-item">
                  <span style={{ color: 'var(--text-muted)' }}>{formatTimestamp(log.timestamp)}</span>
                  <span style={{ color: 'var(--accent-primary)' }}>{log.type}</span>
                  <span>页{log.page_id} ↔ 块{log.block_id}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
