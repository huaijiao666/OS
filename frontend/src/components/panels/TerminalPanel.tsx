import { useState, useCallback, useRef, useEffect } from 'react';
import {
  listFiles,
  readFile,
  createFile,
  deleteFile,
  createDirectory,
  changeDirectory,
  getFileInfo,
  getDiskInfo,
  getBufferStatus,
  getProcesses,
} from '../../services/api';

function formatPermissions(perm: number): string {
  const r = perm & 0b100 ? 'r' : '-';
  const w = perm & 0b010 ? 'w' : '-';
  const x = perm & 0b001 ? 'x' : '-';
  return r + w + x;
}

function formatTime(timestamp: number): string {
  if (!timestamp) return '-';
  const date = new Date(timestamp * 1000);
  return date.toLocaleString('zh-CN');
}

export default function TerminalPanel() {
  const [output, setOutput] = useState<string[]>([
    `╔═══════════════════════════════════════════════════════════════╗`,
    `║           OS FileSystem 模拟器终端 v1.0                        ║`,
    `║                                                               ║`,
    `║  可用命令:                                                     ║`,
    `║    ls          - 列出当前目录文件                               ║`,
    `║    cat <file>  - 查看文件内容                                   ║`,
    `║    touch <file> [content] - 创建文件                            ║`,
    `║    rm <file>   - 删除文件                                       ║`,
    `║    mkdir <dir> - 创建目录                                       ║`,
    `║    cd <dir>    - 切换目录                                       ║`,
    `║    info <file> - 查看文件信息                                   ║`,
    `║    disk        - 查看磁盘状态                                   ║`,
    `║    buffer      - 查看缓冲区状态                                 ║`,
    `║    ps          - 查看进程列表                                   ║`,
    `║    help        - 显示帮助                                       ║`,
    `║    clear       - 清空终端                                       ║`,
    `╚═══════════════════════════════════════════════════════════════╝`,
  ]);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  const addOutput = useCallback((lines: string | string[]) => {
    setOutput(prev => [...prev, ...(Array.isArray(lines) ? lines : [lines])]);
  }, []);

  const executeCommand = useCallback(async (cmdLine: string) => {
    if (!cmdLine.trim()) return;

    addOutput(`root@osfs:~$ ${cmdLine}`);

    const parts = cmdLine.trim().split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    let result = '';

    try {
      switch (cmd) {
        case 'ls': {
          const data = await listFiles();
          if (!data.success) {
            result = data.error || '错误';
          } else if (!data.files || data.files.length === 0) {
            result = '(空目录)';
          } else {
            result = data.files.map(f => {
              const type = f.type === 'DIRECTORY' ? 'd' : '-';
              const perm = formatPermissions(f.permissions);
              return `${type}${perm}  ${f.blocks}块  ${String(f.size).padStart(6)}B  ${f.name}`;
            }).join('\n');
          }
          break;
        }

        case 'cat': {
          if (!args[0]) {
            result = '用法: cat <filename>';
          } else {
            const data = await readFile(args[0]);
            result = data.success ? (data.content || '(空文件)') : (data.error || '错误');
          }
          break;
        }

        case 'touch': {
          if (!args[0]) {
            result = '用法: touch <filename> [content]';
          } else {
            const data = await createFile(args[0], args.slice(1).join(' '));
            result = data.success ? `文件 '${args[0]}' 已创建` : (data.error || '错误');
          }
          break;
        }

        case 'rm': {
          if (!args[0]) {
            result = '用法: rm <filename>';
          } else {
            const data = await deleteFile(args[0]);
            result = data.success ? `文件 '${args[0]}' 已删除` : (data.error || '错误');
          }
          break;
        }

        case 'mkdir': {
          if (!args[0]) {
            result = '用法: mkdir <dirname>';
          } else {
            const data = await createDirectory(args[0]);
            result = data.success ? `目录 '${args[0]}' 已创建` : (data.error || '错误');
          }
          break;
        }

        case 'cd': {
          if (!args[0]) {
            result = '用法: cd <dirname>';
          } else {
            const data = await changeDirectory(args[0]);
            result = data.success ? `已切换到 '${args[0]}'` : (data.error || '错误');
          }
          break;
        }

        case 'info': {
          if (!args[0]) {
            result = '用法: info <filename>';
          } else {
            const data = await getFileInfo(args[0]);
            if (!data.success) {
              result = data.error || '错误';
            } else {
              result = [
                `文件: ${data.name}`,
                `类型: ${data.type}`,
                `大小: ${data.size} 字节`,
                `块数: ${data.block_count}`,
                `块号: [${data.blocks.join(', ')}]`,
                `权限: ${formatPermissions(data.permissions)}`,
                `创建: ${formatTime(data.create_time)}`,
                `修改: ${formatTime(data.modify_time)}`,
                `打开: ${data.is_open ? '是' : '否'}`,
              ].join('\n');
            }
          }
          break;
        }

        case 'disk': {
          const data = await getDiskInfo() as {
            total_size: number;
            block_size: number;
            total_blocks: number;
            used_blocks: number;
            free_blocks: number;
            data_start_block: number;
            is_mounted: boolean;
          };
          const usage = ((data.used_blocks / data.total_blocks) * 100).toFixed(1);
          result = [
            `磁盘信息:`,
            `  总容量: ${data.total_size} 字节 (${data.total_size / 1024} KB)`,
            `  块大小: ${data.block_size} 字节`,
            `  总块数: ${data.total_blocks}`,
            `  已使用: ${data.used_blocks} 块 (${usage}%)`,
            `  空闲块: ${data.free_blocks}`,
            `  数据区: 从块 ${data.data_start_block} 开始`,
            `  状态: ${data.is_mounted ? '已挂载' : '未挂载'}`,
          ].join('\n');
          break;
        }

        case 'buffer': {
          const data = await getBufferStatus();
          const hitRate = (data.stats.hit_rate * 100).toFixed(1);
          result = [
            `缓冲区状态:`,
            `  总页数: ${data.stats.total_pages}`,
            `  空闲页: ${data.stats.free_pages}`,
            `  脏页数: ${data.stats.dirty_pages}`,
            `  干净页: ${data.stats.clean_pages}`,
            `  命中次数: ${data.stats.hits}`,
            `  未命中数: ${data.stats.misses}`,
            `  命中率: ${hitRate}%`,
            `  置换次数: ${data.stats.evictions}`,
            `  写回次数: ${data.stats.writebacks}`,
          ].join('\n');
          break;
        }

        case 'ps': {
          const data = await getProcesses();
          if (!data.processes || data.processes.length === 0) {
            result = '(无进程)';
          } else {
            const lines = ['PID   STATE        COMMAND      CPU_TIME', '─'.repeat(50)];
            data.processes.forEach(p => {
              lines.push(
                `${String(p.pid).padEnd(6)}${p.state.padEnd(13)}${(p.command || '-').padEnd(13)}${p.cpu_time.toFixed(3)}s`
              );
            });
            result = lines.join('\n');
          }
          break;
        }

        case 'clear':
          setOutput([]);
          return;

        case 'help':
          result = [
            `可用命令:`,
            `  ls              列出当前目录文件`,
            `  cat <file>      查看文件内容`,
            `  touch <file> [content]  创建文件`,
            `  rm <file>       删除文件`,
            `  mkdir <dir>     创建目录`,
            `  cd <dir>        切换目录`,
            `  info <file>     查看文件详细信息`,
            `  disk            查看磁盘状态`,
            `  buffer          查看缓冲区状态`,
            `  ps              查看进程列表`,
            `  clear           清空终端`,
            `  help            显示此帮助`,
          ].join('\n');
          break;

        default:
          result = `命令未找到: ${cmd}\n输入 'help' 查看可用命令`;
      }
    } catch (error) {
      result = `错误: ${error instanceof Error ? error.message : '未知错误'}`;
    }

    if (result) {
      addOutput(result.split('\n'));
    }
  }, [addOutput]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      executeCommand(input);
      setHistory(prev => [...prev, input]);
      setHistoryIndex(-1);
      setInput('');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length > 0) {
        const newIndex = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
        setHistoryIndex(newIndex);
        setInput(history[newIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex >= 0) {
        const newIndex = historyIndex + 1;
        if (newIndex >= history.length) {
          setHistoryIndex(-1);
          setInput('');
        } else {
          setHistoryIndex(newIndex);
          setInput(history[newIndex]);
        }
      }
    }
  }, [input, history, historyIndex, executeCommand]);

  return (
    <section className="panel active">
      <div className="terminal-container">
        <div className="terminal-header">
          <span className="terminal-title">OS FileSystem Terminal</span>
          <button className="btn-icon" onClick={() => setOutput([])}>清空</button>
        </div>
        <div className="terminal-output" ref={outputRef}>
          {output.map((line, index) => (
            <div key={index} className="terminal-output-text">
              {line}
            </div>
          ))}
        </div>
        <div className="terminal-input-line">
          <span className="terminal-prompt">root@osfs:~$</span>
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入命令..."
            autoFocus
          />
        </div>
      </div>
    </section>
  );
}
