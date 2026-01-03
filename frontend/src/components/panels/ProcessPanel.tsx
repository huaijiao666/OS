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
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            gap: '8px',
            flexWrap: 'wrap',
            fontSize: '12px'
          }}>
            <div style={{ padding: '8px 16px', background: '#a4b0be', color: 'white', borderRadius: '4px' }}>
              NEW ({stateCounts.NEW})
            </div>
            <span>→</span>
            <div style={{ padding: '8px 16px', background: '#ffa502', color: 'white', borderRadius: '4px' }}>
              READY ({stateCounts.READY})
            </div>
            <span>⇄</span>
            <div style={{ padding: '8px 16px', background: '#2ed573', color: 'white', borderRadius: '4px' }}>
              RUNNING ({stateCounts.RUNNING})
            </div>
            <span>→</span>
            <div style={{ padding: '8px 16px', background: '#576574', color: 'white', borderRadius: '4px' }}>
              TERMINATED ({stateCounts.TERMINATED})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginLeft: '16px' }}>
              <span>↓ ↑</span>
              <div style={{ padding: '8px 16px', background: '#ff4757', color: 'white', borderRadius: '4px' }}>
                BLOCKED ({stateCounts.BLOCKED})
              </div>
            </div>
          </div>
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
