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

  return (
    <section className="panel active">
      <div className="process-container">
        <div className="process-toolbar">
          <button className="btn-primary" onClick={handleCreateProcess}>
            创建测试进程
          </button>
        </div>

        <div className="process-list-container">
          <h3>进程列表</h3>
          <div className="process-table">
            <div className="table-header">
              <span>PID</span>
              <span>名称</span>
              <span>状态</span>
              <span>命令</span>
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
                    <span>{p.name}</span>
                    <span>
                      <span className={`process-state ${p.state}`}>{p.state}</span>
                    </span>
                    <span>{p.command || '-'}</span>
                    <span>{p.cpu_time.toFixed(3)}s</span>
                    <span>
                      {p.state !== 'TERMINATED' ? (
                        <button className="btn-small" onClick={() => handleTerminate(p.pid)}>
                          终止
                        </button>
                      ) : (
                        '-'
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
