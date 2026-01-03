import { useCallback, useState } from 'react';
import type { SystemStats, LogEntry } from '../../types';
import { flushBuffer, startScheduler, stopScheduler } from '../../services/api';
import { CreateFileModal, CreateDirModal } from '../Modal';
import { createFile, createDirectory } from '../../services/api';

interface DashboardProps {
  stats: SystemStats | null;
  logs: LogEntry[];
  onClearLogs: () => void;
  showToast: (type: string, message: string) => void;
  onFilesChange?: () => void;
}

export default function Dashboard({ stats, logs, onClearLogs, showToast, onFilesChange }: DashboardProps) {
  const [schedulerRunning, setSchedulerRunning] = useState(false);
  const [showCreateFile, setShowCreateFile] = useState(false);
  const [showCreateDir, setShowCreateDir] = useState(false);

  const handleFlushBuffer = useCallback(async () => {
    try {
      const result = await flushBuffer();
      if (result.success) {
        showToast('success', '缓冲区已刷新');
      }
    } catch {
      showToast('error', '刷新失败');
    }
  }, [showToast]);

  const handleToggleScheduler = useCallback(async () => {
    try {
      if (schedulerRunning) {
        await stopScheduler();
        setSchedulerRunning(false);
        showToast('success', '调度器已停止');
      } else {
        await startScheduler();
        setSchedulerRunning(true);
        showToast('success', '调度器已启动');
      }
    } catch {
      showToast('error', '操作失败');
    }
  }, [schedulerRunning, showToast]);

  const handleCreateFile = useCallback(async (filename: string, content: string) => {
    try {
      const result = await createFile(filename, content);
      if (result.success) {
        showToast('success', `文件 ${filename} 创建成功`);
        onFilesChange?.();
      } else {
        showToast('error', result.error || '创建失败');
      }
    } catch {
      showToast('error', '创建失败');
    }
  }, [showToast, onFilesChange]);

  const handleCreateDir = useCallback(async (dirname: string) => {
    try {
      const result = await createDirectory(dirname);
      if (result.success) {
        showToast('success', `目录 ${dirname} 创建成功`);
        onFilesChange?.();
      } else {
        showToast('error', result.error || '创建失败');
      }
    } catch {
      showToast('error', '创建失败');
    }
  }, [showToast, onFilesChange]);

  const diskUsage = stats?.disk 
    ? ((stats.disk.used_blocks / stats.disk.total_blocks) * 100).toFixed(1)
    : '0';
  
  const inodeUsage = stats?.filesystem
    ? ((stats.filesystem.used_inodes / stats.filesystem.total_inodes) * 100).toFixed(1)
    : '0';

  const bufferHitRate = stats?.buffer
    ? (stats.buffer.hit_rate * 100).toFixed(1)
    : '0';

  return (
    <section className="panel active">
      <div className="dashboard-grid">
        {/* 磁盘状态卡片 */}
        <div className="card stat-card">
          <div className="card-header">
            <h3>磁盘状态</h3>
            <div className="card-icon disk-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            </div>
          </div>
          <div className="stat-content">
            <div className="stat-value">{stats?.disk?.used_blocks ?? 0}</div>
            <div className="stat-label">已使用块</div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${diskUsage}%` }}></div>
            </div>
            <div className="stat-detail">
              <span>{stats?.disk?.free_blocks ?? 0}</span> 空闲块 / <span>{stats?.disk?.total_blocks ?? 1024}</span> 总块
            </div>
          </div>
        </div>

        {/* 文件系统卡片 */}
        <div className="card stat-card">
          <div className="card-header">
            <h3>文件系统</h3>
            <div className="card-icon file-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
            </div>
          </div>
          <div className="stat-content">
            <div className="stat-value">{stats?.filesystem?.used_inodes ?? 0}</div>
            <div className="stat-label">已用iNode</div>
            <div className="progress-bar">
              <div className="progress-fill inode-fill" style={{ width: `${inodeUsage}%` }}></div>
            </div>
            <div className="stat-detail">
              <span>{stats?.filesystem?.free_inodes ?? 32}</span> 空闲 / <span>{stats?.filesystem?.total_inodes ?? 32}</span> 总计
            </div>
          </div>
        </div>

        {/* 缓冲区卡片 */}
        <div className="card stat-card">
          <div className="card-header">
            <h3>缓冲区</h3>
            <div className="card-icon buffer-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="2" width="20" height="8" rx="2" ry="2"/>
                <rect x="2" y="14" width="20" height="8" rx="2" ry="2"/>
              </svg>
            </div>
          </div>
          <div className="stat-content">
            <div className="stat-row">
              <div className="mini-stat">
                <span className="mini-value">{bufferHitRate}%</span>
                <span className="mini-label">命中率</span>
              </div>
              <div className="mini-stat">
                <span className="mini-value">{stats?.buffer?.dirty_pages ?? 0}</span>
                <span className="mini-label">脏页</span>
              </div>
            </div>
            <div className="stat-detail">
              <span>{stats?.buffer?.free_pages ?? 16}</span> 空闲 / 16 总页
            </div>
          </div>
        </div>

        {/* 进程卡片 */}
        <div className="card stat-card">
          <div className="card-header">
            <h3>进程状态</h3>
            <div className="card-icon process-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="12 2 2 7 12 12 22 7 12 2"/>
                <polyline points="2 17 12 22 22 17"/>
              </svg>
            </div>
          </div>
          <div className="stat-content">
            <div className="stat-row">
              <div className="mini-stat running">
                <span className="mini-value">{stats?.processes?.running ?? 0}</span>
                <span className="mini-label">运行中</span>
              </div>
              <div className="mini-stat ready">
                <span className="mini-value">{stats?.processes?.ready ?? 0}</span>
                <span className="mini-label">就绪</span>
              </div>
              <div className="mini-stat blocked">
                <span className="mini-value">{stats?.processes?.blocked ?? 0}</span>
                <span className="mini-label">阻塞</span>
              </div>
            </div>
          </div>
        </div>

        {/* 快速操作卡片 */}
        <div className="card quick-actions-card">
          <div className="card-header">
            <h3>快速操作</h3>
          </div>
          <div className="quick-actions">
            <button className="quick-btn" onClick={() => setShowCreateFile(true)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <line x1="12" y1="11" x2="12" y2="17"/>
                <line x1="9" y1="14" x2="15" y2="14"/>
              </svg>
              <span>新建文件</span>
            </button>
            <button className="quick-btn" onClick={() => setShowCreateDir(true)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                <line x1="12" y1="11" x2="12" y2="17"/>
                <line x1="9" y1="14" x2="15" y2="14"/>
              </svg>
              <span>新建目录</span>
            </button>
            <button className="quick-btn" onClick={handleFlushBuffer}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="23 4 23 10 17 10"/>
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
              </svg>
              <span>刷新缓冲</span>
            </button>
            <button className="quick-btn" onClick={handleToggleScheduler}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <polygon points="10 8 16 12 10 16 10 8"/>
              </svg>
              <span>{schedulerRunning ? '停止调度' : '启动调度'}</span>
            </button>
          </div>
        </div>

        {/* 操作日志 */}
        <div className="card log-card">
          <div className="card-header">
            <h3>操作日志</h3>
            <button className="btn-text" onClick={onClearLogs}>清空</button>
          </div>
          <div className="log-list">
            {logs.length === 0 ? (
              <div className="log-empty">暂无操作记录</div>
            ) : (
              logs.slice(0, 20).map((log, index) => (
                <div key={index} className="log-item">
                  <span className="log-time">{log.time}</span>
                  <span className={`log-type ${log.type}`}>{log.type.toUpperCase()}</span>
                  <span className="log-message">{log.message}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <CreateFileModal
        isOpen={showCreateFile}
        onClose={() => setShowCreateFile(false)}
        onSubmit={handleCreateFile}
      />
      <CreateDirModal
        isOpen={showCreateDir}
        onClose={() => setShowCreateDir(false)}
        onSubmit={handleCreateDir}
      />
    </section>
  );
}
