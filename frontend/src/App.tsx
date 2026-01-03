import { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import Dashboard from './components/panels/Dashboard';
import FilesPanel from './components/panels/FilesPanel';
import DiskPanel from './components/panels/DiskPanel';
import BufferPanel from './components/panels/BufferPanel';
import ProcessPanel from './components/panels/ProcessPanel';
import SchedulerPanel from './components/panels/SchedulerPanel';
import TerminalPanel from './components/panels/TerminalPanel';
import Toast from './components/Toast';
import { connectSocket, getStats, formatDisk } from './services/api';
import type { PanelType, SystemStats, LogEntry } from './types';

function App() {
  const [currentPanel, setCurrentPanel] = useState<PanelType>('dashboard');
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [isOnline, setIsOnline] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [toasts, setToasts] = useState<Array<{ id: number; type: string; message: string }>>([]);

  const showToast = useCallback((type: string, message: string) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  }, []);

  const addLog = useCallback((type: string, message: string) => {
    const time = new Date().toLocaleTimeString('zh-CN');
    setLogs(prev => [{ type, message, time }, ...prev.slice(0, 49)]);
  }, []);

  const refreshData = useCallback(async () => {
    try {
      const data = await getStats();
      setStats(data);
    } catch (error) {
      console.error('刷新数据失败:', error);
    }
  }, []);

  const handleFormatDisk = useCallback(async () => {
    if (!window.confirm('确定要格式化磁盘吗？所有数据将被清除！')) {
      return;
    }
    try {
      const result = await formatDisk();
      if (result.success) {
        showToast('success', '磁盘已格式化');
        refreshData();
      }
    } catch (error) {
      showToast('error', '格式化失败');
    }
  }, [refreshData, showToast]);

  useEffect(() => {
    const socket = connectSocket();

    socket.on('connect', () => {
      console.log('WebSocket 已连接');
      setIsOnline(true);
    });

    socket.on('disconnect', () => {
      console.log('WebSocket 已断开');
      setIsOnline(false);
    });

    socket.on('status_update', (data: Partial<SystemStats>) => {
      setStats(prev => prev ? { ...prev, ...data } : null);
    });

    socket.on('file_created', (data: { filename: string; result: { success: boolean } }) => {
      if (data.result.success) {
        showToast('success', `文件 ${data.filename} 创建成功`);
        addLog('create', `创建文件 ${data.filename}`);
      }
    });

    socket.on('file_updated', (data: { filename: string; result: { success: boolean } }) => {
      if (data.result.success) {
        showToast('success', `文件 ${data.filename} 修改成功`);
        addLog('write', `修改文件 ${data.filename}`);
      }
    });

    socket.on('file_deleted', (data: { filename: string; result: { success: boolean } }) => {
      if (data.result.success) {
        showToast('success', `文件 ${data.filename} 删除成功`);
        addLog('delete', `删除文件 ${data.filename}`);
      }
    });

    socket.on('disk_formatted', (data: { message: string }) => {
      showToast('info', data.message);
      refreshData();
    });

    refreshData();
    const interval = setInterval(refreshData, 2000);

    return () => {
      clearInterval(interval);
      socket.off('connect');
      socket.off('disconnect');
      socket.off('status_update');
      socket.off('file_created');
      socket.off('file_updated');
      socket.off('file_deleted');
      socket.off('disk_formatted');
    };
  }, [refreshData, showToast, addLog]);

  const panelTitles: Record<PanelType, string> = {
    dashboard: '仪表盘',
    files: '文件管理',
    disk: '磁盘可视化',
    buffer: '内存缓冲',
    process: '进程管理',
    scheduler: '调度器',
    terminal: '终端',
  };

  const renderPanel = () => {
    switch (currentPanel) {
      case 'dashboard':
        return <Dashboard stats={stats} logs={logs} onClearLogs={() => setLogs([])} showToast={showToast} />;
      case 'files':
        return <FilesPanel showToast={showToast} addLog={addLog} />;
      case 'disk':
        return <DiskPanel />;
      case 'buffer':
        return <BufferPanel showToast={showToast} />;
      case 'process':
        return <ProcessPanel showToast={showToast} />;
      case 'scheduler':
        return <SchedulerPanel stats={stats} showToast={showToast} />;
      case 'terminal':
        return <TerminalPanel />;
      default:
        return <Dashboard stats={stats} logs={logs} onClearLogs={() => setLogs([])} showToast={showToast} />;
    }
  };

  return (
    <>
      <div className="bg-grid"></div>
      <div className="bg-gradient"></div>
      
      <div className="app-container">
        <Sidebar
          currentPanel={currentPanel}
          onPanelChange={setCurrentPanel}
          isOnline={isOnline}
        />
        
        <main className="main-content">
          <TopBar
            title={panelTitles[currentPanel]}
            onRefresh={refreshData}
            onFormat={handleFormatDisk}
          />
          
          <div className="panels-container">
            {renderPanel()}
          </div>
        </main>
      </div>

      <div className="toast-container">
        {toasts.map(toast => (
          <Toast key={toast.id} type={toast.type} message={toast.message} />
        ))}
      </div>
    </>
  );
}

export default App;
