import { useState, useEffect, useCallback } from 'react';
import { getProcesses, createProcess, terminateProcess } from '../../services/api';
import type { Process } from '../../types';

interface ProcessPanelProps {
  showToast: (type: string, message: string) => void;
}

export default function ProcessPanel({ showToast }: ProcessPanelProps) {
  const [processes, setProcesses] = useState<Process[]>([]);

  const loadProcesses = useCallback(async () => {
    try {
      const data = await getProcesses();
      setProcesses(data.processes || []);
    } catch (error) {
      console.error('加载进程列表失败:', error);
    }
  }, []);

  useEffect(() => {
    loadProcesses();
    const interval = setInterval(loadProcesses, 2000);
    return () => clearInterval(interval);
  }, [loadProcesses]);

  const handleCreateProcess = useCallback(async () => {
    try {
      const result = await createProcess('ls', {});
      if (result.success) {
        showToast('success', `进程 ${result.pid} 已创建`);
        loadProcesses();
      }
    } catch {
      showToast('error', '创建进程失败');
    }
  }, [showToast, loadProcesses]);

  const handleTerminate = useCallback(async (pid: number) => {
    try {
      const result = await terminateProcess(pid);
      if (result.success) {
        showToast('success', `进程 ${pid} 已终止`);
        loadProcesses();
      }
    } catch {
      showToast('error', '终止进程失败');
    }
  }, [showToast, loadProcesses]);

  // 统计各状态进程数
  const stateCounts = {
    NEW: processes.filter(p => p.state === 'NEW').length,
    READY: processes.filter(p => p.state === 'READY').length,
    RUNNING: processes.filter(p => p.state === 'RUNNING').length,
    BLOCKED: processes.filter(p => p.state === 'BLOCKED').length,
    TERMINATED: processes.filter(p => p.state === 'TERMINATED').length,
  };

  return (
    <section className="panel active">
      <div className="process-container">
        {/* 进程状态图 */}
        <div style={{ 
          background: 'var(--card-bg)', 
          padding: '16px', 
          borderRadius: '8px',
          marginBottom: '16px'
        }}>
          <h4 style={{ margin: '0 0 12px 0' }}>进程状态转换图</h4>
          {/* 完全使用SVG绘制的状态转换图 */}
          <svg width="100%" height="140" viewBox="0 0 600 140" style={{ display: 'block', margin: '0 auto' }}>
            <defs>
              <marker id="arrowhead" markerWidth="8" markerHeight="5" refX="7" refY="2.5" orient="auto">
                <polygon points="0 0, 8 2.5, 0 5" fill="#888" />
              </marker>
            </defs>
            
            {/* NEW 状态框 */}
            <rect x="20" y="50" width="80" height="36" rx="4" fill="#a4b0be" />
            <text x="60" y="73" textAnchor="middle" fill="white" fontSize="12">NEW ({stateCounts.NEW})</text>
            
            {/* READY 状态框 */}
            <rect x="160" y="50" width="100" height="36" rx="4" fill="#ffa502" />
            <text x="210" y="73" textAnchor="middle" fill="white" fontSize="12">READY ({stateCounts.READY})</text>
            
            {/* RUNNING 状态框 */}
            <rect x="320" y="50" width="110" height="36" rx="4" fill="#2ed573" />
            <text x="375" y="73" textAnchor="middle" fill="white" fontSize="12">RUNNING ({stateCounts.RUNNING})</text>
            
            {/* TERMINATED 状态框 */}
            <rect x="490" y="50" width="100" height="36" rx="4" fill="#576574" />
            <text x="540" y="73" textAnchor="middle" fill="white" fontSize="12">TERMINATED ({stateCounts.TERMINATED})</text>
            
            {/* BLOCKED 状态框 - 在READY和RUNNING下方中间 */}
            <rect x="230" y="110" width="110" height="28" rx="4" fill="#ff4757" />
            <text x="285" y="129" textAnchor="middle" fill="white" fontSize="12">BLOCKED ({stateCounts.BLOCKED})</text>
            
            {/* 箭头: NEW → READY */}
            <line x1="100" y1="68" x2="155" y2="68" stroke="#888" strokeWidth="1.5" markerEnd="url(#arrowhead)" />
            
            {/* 箭头: READY → RUNNING (上方) */}
            <line x1="260" y1="60" x2="315" y2="60" stroke="#888" strokeWidth="1.5" markerEnd="url(#arrowhead)" />
            
            {/* 箭头: RUNNING → READY (下方，抢占) */}
            <line x1="320" y1="76" x2="265" y2="76" stroke="#888" strokeWidth="1.5" markerEnd="url(#arrowhead)" />
            
            {/* 箭头: RUNNING → TERMINATED */}
            <line x1="430" y1="68" x2="485" y2="68" stroke="#888" strokeWidth="1.5" markerEnd="url(#arrowhead)" />
            
            {/* 箭头: RUNNING → BLOCKED */}
            <line x1="375" y1="86" x2="320" y2="108" stroke="#888" strokeWidth="1.5" markerEnd="url(#arrowhead)" />
            
            {/* 箭头: BLOCKED → READY */}
            <line x1="250" y1="110" x2="210" y2="90" stroke="#888" strokeWidth="1.5" markerEnd="url(#arrowhead)" />
          </svg>
        </div>

        <div className="process-toolbar" style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          <button className="btn-primary" onClick={handleCreateProcess}>
            创建测试进程 (ls)
          </button>
          <button className="btn-secondary" onClick={loadProcesses}>
            刷新列表
          </button>
          <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: '12px' }}>
            总计: {processes.length} 个进程
          </span>
        </div>

        <div className="process-list-container">
          <h3>进程列表</h3>
          <div className="process-table">
            <div className="table-header">
              <span>PID</span>
              <span>进程名称</span>
              <span>状态</span>
              <span>命令类型</span>
              <span>优先级</span>
              <span>CPU时间</span>
              <span>操作</span>
            </div>
            <div className="table-body">
              {processes.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  暂无进程
                </div>
              ) : (
                processes.map(p => (
                  <div key={p.pid} className="table-row">
                    <span>{p.pid}</span>
                    <span title={p.name}>{p.name.length > 15 ? p.name.slice(0, 15) + '...' : p.name}</span>
                    <span>
                      <span 
                        className={`process-state ${p.state}`}
                        style={{
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          background: 
                            p.state === 'RUNNING' ? '#2ed573' :
                            p.state === 'READY' ? '#ffa502' :
                            p.state === 'BLOCKED' ? '#ff4757' :
                            p.state === 'TERMINATED' ? '#576574' : '#a4b0be',
                          color: 'white'
                        }}
                      >
                        {p.state}
                      </span>
                    </span>
                    <span title={`类型: ${p.command}`}>{p.command === 'longtask' ? '演示任务' : (p.command || '-')}</span>
                    <span>{p.priority ?? 0}</span>
                    <span>{p.cpu_time.toFixed(3)}s</span>
                    <span>
                      {p.state !== 'TERMINATED' ? (
                        <button 
                          className="btn-small" 
                          onClick={() => handleTerminate(p.pid)}
                          style={{ background: '#ff4757', color: 'white', border: 'none' }}
                        >
                          终止
                        </button>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>已结束</span>
                      )}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
