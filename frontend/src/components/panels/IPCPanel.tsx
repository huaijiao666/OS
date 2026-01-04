import { useState, useEffect, useCallback } from 'react';
import { getIPCStatus, createSharedMemory, deleteSharedMemory, readSharedMemory, writeSharedMemory } from '../../services/api';
import type { SharedMemorySegment } from '../../types';

interface IPCPanelProps {
  showToast: (type: string, message: string) => void;
}

export default function IPCPanel({ showToast }: IPCPanelProps) {
  const [segments, setSegments] = useState<SharedMemorySegment[]>([]);
  const [totalMemory, setTotalMemory] = useState(0);
  const [selectedKey, setSelectedKey] = useState<number | null>(null);
  const [readResult, setReadResult] = useState<{ data: string; hex: string } | null>(null);

  // 创建共享内存的表单
  const [newSize, setNewSize] = useState(256);

  // 写入数据的表单
  const [writeKey, setWriteKey] = useState<number | null>(null);
  const [writeData, setWriteData] = useState('');
  const [writeOffset, setWriteOffset] = useState(0);

  // 演示日志
  const [demoLogs, setDemoLogs] = useState<Array<{ time: string; action: string; details: string }>>([]);

  const addLog = useCallback((action: string, details: string) => {
    const time = new Date().toLocaleTimeString('zh-CN');
    setDemoLogs(prev => [{ time, action, details }, ...prev.slice(0, 19)]);
  }, []);

  const loadStatus = useCallback(async () => {
    try {
      const data = await getIPCStatus();
      setSegments(data.segments || []);
      setTotalMemory(data.total_memory || 0);
    } catch (error) {
      console.error('加载IPC状态失败:', error);
    }
  }, []);

  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 2000);
    return () => clearInterval(interval);
  }, [loadStatus]);

  const handleCreate = async () => {
    try {
      const result = await createSharedMemory(newSize);
      if (result.success) {
        showToast('success', `共享内存创建成功，Key=${result.key}`);
        addLog('创建', `创建共享内存段 Key=${result.key}, 大小=${newSize}字节`);
        loadStatus();
      } else {
        showToast('error', result.error || '创建失败');
      }
    } catch {
      showToast('error', '创建共享内存失败');
    }
  };

  const handleDelete = async (key: number) => {
    try {
      const result = await deleteSharedMemory(key);
      if (result.success) {
        showToast('success', `共享内存 Key=${key} 已删除`);
        addLog('删除', `删除共享内存段 Key=${key}`);
        if (selectedKey === key) {
          setSelectedKey(null);
          setReadResult(null);
        }
        loadStatus();
      } else {
        showToast('error', result.error || '删除失败');
      }
    } catch {
      showToast('error', '删除共享内存失败');
    }
  };

  const handleRead = async (key: number) => {
    try {
      const result = await readSharedMemory(key);
      if (result.success) {
        setSelectedKey(key);
        setReadResult({ data: result.data, hex: result.hex });
        addLog('读取', `读取共享内存 Key=${key}, 内容="${result.data.slice(0, 50)}${result.data.length > 50 ? '...' : ''}"`);
      } else {
        showToast('error', result.error || '读取失败');
      }
    } catch {
      showToast('error', '读取共享内存失败');
    }
  };

  const handleWrite = async () => {
    if (writeKey === null) return;
    try {
      const result = await writeSharedMemory(writeKey, writeData, writeOffset);
      if (result.success) {
        showToast('success', `写入成功，共 ${result.bytes_written} 字节`);
        addLog('写入', `写入共享内存 Key=${writeKey}, 数据="${writeData.slice(0, 30)}${writeData.length > 30 ? '...' : ''}", 偏移=${writeOffset}`);
        setWriteData('');
        if (selectedKey === writeKey) {
          handleRead(writeKey);
        }
        loadStatus();
      } else {
        showToast('error', result.error || '写入失败');
      }
    } catch {
      showToast('error', '写入共享内存失败');
    }
  };

  const runProducerConsumerDemo = async () => {
    addLog('演示开始', '生产者-消费者模式演示');
    try {
      const createResult = await createSharedMemory(256);
      if (!createResult.success) {
        showToast('error', '演示失败：无法创建共享内存');
        return;
      }
      const key = createResult.key;
      addLog('生产者', `创建共享内存 Key=${key}`);

      const messages = ['消息1: Hello', '消息2: World', '消息3: IPC演示'];
      for (let i = 0; i < messages.length; i++) {
        await new Promise(resolve => setTimeout(resolve, 500));
        await writeSharedMemory(key, messages[i], 0);
        addLog('生产者', `写入: "${messages[i]}"`);
        loadStatus();
        await new Promise(resolve => setTimeout(resolve, 300));
        const readResult = await readSharedMemory(key);
        if (readResult.success) {
          addLog('消费者', `读取: "${readResult.data}"`);
        }
      }

      addLog('演示完成', '生产者-消费者模式演示结束');
      showToast('success', '演示完成');
      loadStatus();
    } catch {
      showToast('error', '演示过程中出错');
    }
  };

  const runMultiProcessDemo = async () => {
    addLog('演示开始', '多进程通信演示');
    try {
      const createResult = await createSharedMemory(512);
      if (!createResult.success) {
        showToast('error', '演示失败');
        return;
      }
      const key = createResult.key;
      addLog('主进程', `创建共享内存 Key=${key}, 大小=512字节`);

      await new Promise(resolve => setTimeout(resolve, 400));
      await writeSharedMemory(key, 'ProcessA: 数据区块1', 0);
      addLog('进程A', '写入数据到偏移0');

      await new Promise(resolve => setTimeout(resolve, 400));
      await writeSharedMemory(key, 'ProcessB: 数据区块2', 100);
      addLog('进程B', '写入数据到偏移100');

      await new Promise(resolve => setTimeout(resolve, 400));
      const readResult = await readSharedMemory(key, 0, 200);
      if (readResult.success) {
        addLog('进程C', `读取全部数据: "${readResult.data}"`);
      }

      addLog('演示完成', '多进程通信演示结束');
      showToast('success', '演示完成');
      loadStatus();
    } catch {
      showToast('error', '演示过程中出错');
    }
  };

  return (
    <section className="panel active">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', height: '100%' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ background: 'var(--card-bg)', padding: '16px', borderRadius: '8px' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '14px' }}>创建共享内存</h3>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <label style={{ fontSize: '12px' }}>大小(字节):</label>
              <input
                type="number"
                value={newSize}
                onChange={e => setNewSize(Math.max(1, parseInt(e.target.value) || 256))}
                style={{
                  width: '100px',
                  padding: '6px 10px',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  color: 'var(--text-primary)',
                  fontSize: '12px'
                }}
                min={1}
                max={65536}
              />
              <button className="btn-primary" onClick={handleCreate}>
                创建 (shmget)
              </button>
            </div>
          </div>

          <div style={{ background: 'var(--card-bg)', padding: '16px', borderRadius: '8px', flex: 1, overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '14px' }}>共享内存段列表 (ipcs)</h3>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                总计: {segments.length} 段, {totalMemory} 字节
              </span>
            </div>

            {segments.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                暂无共享内存段
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {segments.map(seg => (
                  <div
                    key={seg.key}
                    style={{
                      padding: '12px',
                      background: selectedKey === seg.key ? 'rgba(0, 188, 212, 0.1)' : 'var(--bg-secondary)',
                      borderRadius: '6px',
                      border: selectedKey === seg.key ? '1px solid var(--primary)' : '1px solid transparent',
                      cursor: 'pointer'
                    }}
                    onClick={() => handleRead(seg.key)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 'bold', color: 'var(--primary)' }}>Key: {seg.key}</span>
                      <button
                        className="btn-small"
                        onClick={e => { e.stopPropagation(); handleDelete(seg.key); }}
                        style={{ background: '#ff4757', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '4px', fontSize: '11px' }}
                      >
                        删除
                      </button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginTop: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>
                      <span>大小: {seg.size}B</span>
                      <span>读: {seg.read_count}次</span>
                      <span>写: {seg.write_count}次</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ background: 'var(--card-bg)', padding: '16px', borderRadius: '8px' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '14px' }}>写入数据 (shmwrite)</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <label style={{ fontSize: '12px', width: '50px' }}>Key:</label>
                <select
                  value={writeKey ?? ''}
                  onChange={e => setWriteKey(e.target.value ? parseInt(e.target.value) : null)}
                  style={{
                    flex: 1,
                    padding: '6px 10px',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '4px',
                    color: 'var(--text-primary)',
                    fontSize: '12px'
                  }}
                >
                  <option value="">选择共享内存</option>
                  {segments.map(seg => (
                    <option key={seg.key} value={seg.key}>Key {seg.key} ({seg.size}B)</option>
                  ))}
                </select>
                <label style={{ fontSize: '12px' }}>偏移:</label>
                <input
                  type="number"
                  value={writeOffset}
                  onChange={e => setWriteOffset(Math.max(0, parseInt(e.target.value) || 0))}
                  style={{
                    width: '60px',
                    padding: '6px 10px',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '4px',
                    color: 'var(--text-primary)',
                    fontSize: '12px'
                  }}
                  min={0}
                />
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  value={writeData}
                  onChange={e => setWriteData(e.target.value)}
                  placeholder="输入要写入的数据..."
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '4px',
                    color: 'var(--text-primary)',
                    fontSize: '12px'
                  }}
                />
                <button
                  className="btn-primary"
                  onClick={handleWrite}
                  disabled={writeKey === null || !writeData}
                >
                  写入
                </button>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ background: 'var(--card-bg)', padding: '16px', borderRadius: '8px' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '14px' }}>
              读取内容 (shmread) {selectedKey !== null && <span style={{ color: 'var(--primary)' }}>- Key {selectedKey}</span>}
            </h3>
            {readResult ? (
              <div>
                <div style={{ marginBottom: '8px' }}>
                  <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>文本内容:</label>
                  <div style={{
                    padding: '10px',
                    background: 'var(--bg-secondary)',
                    borderRadius: '4px',
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                    maxHeight: '80px',
                    overflow: 'auto'
                  }}>
                    {readResult.data || '(空)'}
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>十六进制:</label>
                  <div style={{
                    padding: '10px',
                    background: 'var(--bg-secondary)',
                    borderRadius: '4px',
                    fontFamily: 'monospace',
                    fontSize: '11px',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                    maxHeight: '60px',
                    overflow: 'auto',
                    color: 'var(--text-muted)'
                  }}>
                    {readResult.hex || '00'}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                点击左侧共享内存段查看内容
              </div>
            )}
          </div>

          <div style={{ background: 'var(--card-bg)', padding: '16px', borderRadius: '8px' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '14px' }}>IPC 通信演示</h3>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button className="btn-secondary" onClick={runProducerConsumerDemo}>
                🔄 生产者-消费者模式
              </button>
              <button className="btn-secondary" onClick={runMultiProcessDemo}>
                🔀 多进程通信演示
              </button>
              <button className="btn-secondary" onClick={() => { setDemoLogs([]); }}>
                🗑️ 清空日志
              </button>
            </div>
          </div>

          <div style={{ background: 'var(--card-bg)', padding: '16px', borderRadius: '8px', flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '14px' }}>演示日志</h3>
            <div style={{ flex: 1, overflow: 'auto' }}>
              {demoLogs.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                  点击上方按钮运行演示
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {demoLogs.map((log, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '8px',
                        background: 'var(--bg-secondary)',
                        borderRadius: '4px',
                        fontSize: '11px',
                        display: 'flex',
                        gap: '8px'
                      }}
                    >
                      <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{log.time}</span>
                      <span style={{
                        color: log.action.includes('生产者') ? '#2ed573' :
                               log.action.includes('消费者') ? '#ffa502' :
                               log.action.includes('进程') ? '#00bcd4' :
                               log.action.includes('演示') ? '#a55eea' : 'var(--text-primary)',
                        fontWeight: 'bold',
                        flexShrink: 0,
                        minWidth: '60px'
                      }}>
                        [{log.action}]
                      </span>
                      <span style={{ color: 'var(--text-secondary)' }}>{log.details}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
