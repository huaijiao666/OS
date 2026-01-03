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
    // 自动刷新缓冲区状态
    const interval = setInterval(() => {
      loadStatus();
      loadLogs();
    }, 2000);
    return () => clearInterval(interval);
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <h3 style={{ margin: 0 }}>缓冲页状态 (LRU置换)</h3>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                命中率: {stats ? ((stats.hits / (stats.hits + stats.misses) || 0) * 100).toFixed(1) : 0}%
              </span>
              <button className="btn-secondary" onClick={loadStatus}>刷新</button>
              <button className="btn-primary" onClick={handleFlush}>写回脏页</button>
            </div>
          </div>
          <div className="buffer-pages">
            {pages.map(page => (
              <div 
                key={page.page_id} 
                className={`buffer-page ${page.state.toLowerCase()}`}
                style={{
                  position: 'relative',
                  cursor: 'pointer',
                  transition: 'transform 0.2s'
                }}
                title={`页 #${page.page_id}\n块: ${page.block_id >= 0 ? page.block_id : '无'}\n状态: ${page.state}\n所有者: ${page.owner >= 0 ? `PID ${page.owner}` : '无'}\n访问次数: ${page.access_count}\n数据: ${page.data_preview || '空'}`}
              >
                <div className="page-id" style={{ fontWeight: 'bold' }}>页 #{page.page_id}</div>
                <div className="page-block">{page.block_id >= 0 ? `块 #${page.block_id}` : '空闲'}</div>
                <div className={`page-state ${page.state}`} style={{
                  padding: '2px 6px',
                  borderRadius: '4px',
                  fontSize: '10px',
                  background: page.state === 'DIRTY' ? '#ff4757' : page.state === 'CLEAN' ? '#2ed573' : '#576574',
                  color: 'white'
                }}>
                  {page.state}
                </div>
                {page.owner >= 0 && (
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    PID: {page.owner}
                  </div>
                )}
                {page.is_pinned && (
                  <div style={{ 
                    position: 'absolute', 
                    top: '4px', 
                    right: '4px', 
                    fontSize: '10px',
                    background: '#ffa502',
                    color: 'white',
                    padding: '1px 4px',
                    borderRadius: '4px'
                  }}>
                    📌
                  </div>
                )}
              </div>
            ))}
          </div>
          <div style={{ 
            marginTop: '12px', 
            padding: '8px', 
            background: 'var(--bg-color)', 
            borderRadius: '8px',
            fontSize: '12px',
            color: 'var(--text-secondary)'
          }}>
            <strong>图例:</strong>
            <span style={{ marginLeft: '12px' }}>
              <span style={{ background: '#576574', color: 'white', padding: '2px 6px', borderRadius: '4px', marginRight: '8px' }}>FREE</span>
              空闲页
            </span>
            <span style={{ marginLeft: '12px' }}>
              <span style={{ background: '#2ed573', color: 'white', padding: '2px 6px', borderRadius: '4px', marginRight: '8px' }}>CLEAN</span>
              干净页(与磁盘一致)
            </span>
            <span style={{ marginLeft: '12px' }}>
              <span style={{ background: '#ff4757', color: 'white', padding: '2px 6px', borderRadius: '4px', marginRight: '8px' }}>DIRTY</span>
              脏页(需写回)
            </span>
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
