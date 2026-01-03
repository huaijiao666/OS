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
  getCurrentPath,
  updateFile,
  formatDisk,
  getSchedulerStatus,
  startScheduler,
  stopScheduler,
  pauseScheduler,
  resumeScheduler,
  setTimeQuantum,
  flushBuffer,
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

// 终端欢迎信息
const WELCOME_MESSAGE = [
  `╔═══════════════════════════════════════════════════════════════════════╗`,
  `║              OS FileSystem 模拟器终端 v2.0 (Linux风格)                ║`,
  `╠═══════════════════════════════════════════════════════════════════════╣`,
  `║  文件操作 (标准Linux命令):                                            ║`,
  `║    ls [-l]          列出目录      cat <file>      查看文件内容       ║`,
  `║    touch <file>     创建空文件    echo <t> > <f>  写入/覆盖文件       ║`,
  `║    echo <t> >> <f>  追加到文件    rm [-r] <file>  删除文件/目录       ║`,
  `║    mkdir <dir>      创建目录      cd <dir>        切换目录            ║`,
  `║    pwd              当前路径      stat <file>     文件详细信息        ║`,
  `║    cp <src> <dst>   复制文件      mv <src> <dst>  移动/重命名         ║`,
  `║    chmod <mode> <f> 修改权限                                          ║`,
  `╠═══════════════════════════════════════════════════════════════════════╣`,
  `║  磁盘与系统:                                                          ║`,
  `║    df               磁盘使用情况  free            内存/缓冲区状态     ║`,
  `║    sync             同步缓冲区    mkfs            格式化磁盘          ║`,
  `║    hexdump <blk>    查看块内容    dumpe2fs        文件系统信息        ║`,
  `╠═══════════════════════════════════════════════════════════════════════╣`,
  `║  进程管理:                                                            ║`,
  `║    ps               进程列表      top             调度器状态          ║`,
  `║    kill <pid>       终止进程      nice <cmd>      创建任务            ║`,
  `║    jobs             后台任务      bg/fg           后台/前台           ║`,
  `╠═══════════════════════════════════════════════════════════════════════╣`,
  `║  IPC共享内存:                                                         ║`,
  `║    ipcs             IPC资源列表   ipcrm <key>     删除IPC资源         ║`,
  `║    shmget <size>    创建共享内存  shmread <key>   读取共享内存        ║`,
  `║    shmwrite <k> <d> 写入共享内存                                      ║`,
  `╠═══════════════════════════════════════════════════════════════════════╣`,
  `║  其他: help - 完整帮助  clear - 清屏  history - 命令历史              ║`,
  `╚═══════════════════════════════════════════════════════════════════════╝`,
];

// 从localStorage加载命令历史
function loadHistoryFromStorage(): string[] {
  try {
    const saved = localStorage.getItem('terminal_history');
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

// 保存命令历史到localStorage
function saveHistoryToStorage(history: string[]) {
  try {
    // 只保存最近100条命令
    const toSave = history.slice(-100);
    localStorage.setItem('terminal_history', JSON.stringify(toSave));
  } catch {
    // 忽略存储错误
  }
}

// 从localStorage加载终端输出
function loadOutputFromStorage(): string[] {
  try {
    const saved = localStorage.getItem('terminal_output');
    if (saved) {
      const parsed = JSON.parse(saved);
      // 限制输出行数，避免存储过大
      return parsed.slice(-500);
    }
  } catch {
    // 忽略加载错误
  }
  return WELCOME_MESSAGE;
}

// 保存终端输出到localStorage
function saveOutputToStorage(output: string[]) {
  try {
    // 只保存最近500行
    const toSave = output.slice(-500);
    localStorage.setItem('terminal_output', JSON.stringify(toSave));
  } catch {
    // 忽略存储错误
  }
}

export default function TerminalPanel() {
  const [output, setOutput] = useState<string[]>(() => loadOutputFromStorage());
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>(() => loadHistoryFromStorage());
  const [historyIndex, setHistoryIndex] = useState(-1);
  const outputRef = useRef<HTMLDivElement>(null);

  // 当output变化时保存到localStorage
  useEffect(() => {
    saveOutputToStorage(output);
  }, [output]);

  // 当history变化时保存到localStorage
  useEffect(() => {
    saveHistoryToStorage(history);
  }, [history]);

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

        case 'pwd': {
          const data = await getCurrentPath();
          result = data.success ? data.current_path : (data.error || '错误');
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
            result = '用法: rm <文件名或目录名>\n提示: 删除目录时，目录必须为空';
          } else {
            const data = await deleteFile(args[0]);
            result = data.success ? `'${args[0]}' 已删除` : (data.error || '错误');
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
            result = '用法: cd <dirname>\n提示: 使用 cd .. 返回上级目录';
          } else {
            const data = await changeDirectory(args[0]);
            if (data.success) {
              const path = data.current_path || args[0];
              result = `当前目录: ${path}`;
            } else {
              result = data.error || '错误';
            }
          }
          break;
        }

        case 'stat':
        case 'info': {
          if (!args[0]) {
            result = '用法: stat <filename>';
          } else {
            const data = await getFileInfo(args[0]);
            if (!data.success) {
              result = data.error || '错误';
            } else {
              result = [
                `  File: ${data.name}`,
                `  Size: ${data.size}       Blocks: ${data.block_count}    IO Block: 64`,
                `  Type: ${data.type === 'DIRECTORY' ? 'directory' : 'regular file'}`,
                `Device: /dev/vdisk    Inode: ${data.inode_id || '-'}    Links: 1`,
                `Access: (${formatPermissions(data.permissions)})`,
                `Access: ${formatTime(data.modify_time)}`,
                `Modify: ${formatTime(data.modify_time)}`,
                `Change: ${formatTime(data.create_time)}`,
                ` Birth: ${formatTime(data.create_time)}`,
                `Blocks: [${data.blocks.join(', ')}]`,
                `Status: ${data.is_open ? 'open' : 'closed'}`,
              ].join('\n');
            }
          }
          break;
        }

        case 'df':
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
            `Filesystem     1K-blocks    Used  Available  Use%  Mounted on`,
            `/dev/vdisk     ${String(data.total_size/1024).padStart(9)}  ${String(data.used_blocks * 64/1024).padStart(6)}  ${String(data.free_blocks * 64/1024).padStart(9)}   ${usage.padStart(3)}%  /`,
            ``,
            `Block size: ${data.block_size} bytes`,
            `Total blocks: ${data.total_blocks}`,
            `Used blocks: ${data.used_blocks}`,
            `Free blocks: ${data.free_blocks}`,
            `Data area starts at block: ${data.data_start_block}`,
            `Mount status: ${data.is_mounted ? 'mounted' : 'unmounted'}`,
          ].join('\n');
          break;
        }

        case 'free':
        case 'buffer': {
          const data = await getBufferStatus();
          const hitRate = (data.stats.hit_rate * 100).toFixed(1);
          const totalKB = data.stats.total_pages * 64 / 1024;
          const usedKB = (data.stats.dirty_pages + data.stats.clean_pages) * 64 / 1024;
          const freeKB = data.stats.free_pages * 64 / 1024;
          result = [
            `              total        used        free      shared  buff/cache   available`,
            `Mem:          ${String(totalKB).padStart(5)}K      ${String(usedKB).padStart(5)}K      ${String(freeKB).padStart(5)}K           0K          0K      ${String(freeKB).padStart(5)}K`,
            ``,
            `Buffer Pool Statistics:`,
            `  Total pages: ${data.stats.total_pages}`,
            `  Free pages:  ${data.stats.free_pages}`,
            `  Dirty pages: ${data.stats.dirty_pages}`,
            `  Clean pages: ${data.stats.clean_pages}`,
            `  Cache hits:  ${data.stats.hits}`,
            `  Cache miss:  ${data.stats.misses}`,
            `  Hit rate:    ${hitRate}%`,
            `  Evictions:   ${data.stats.evictions}`,
            `  Writebacks:  ${data.stats.writebacks}`,
          ].join('\n');
          break;
        }

        case 'ps': {
          const data = await getProcesses();
          if (!data.processes || data.processes.length === 0) {
            result = '(无进程)';
          } else {
            const lines = ['PID   STATE        NAME              TYPE         CPU_TIME', '─'.repeat(65)];
            data.processes.forEach(p => {
              const name = p.name.length > 15 ? p.name.slice(0, 12) + '...' : p.name;
              const cmdType = p.command === 'longtask' ? '演示任务' : (p.command || '-');
              lines.push(
                `${String(p.pid).padEnd(6)}${p.state.padEnd(13)}${name.padEnd(18)}${cmdType.padEnd(13)}${p.cpu_time.toFixed(3)}s`
              );
            });
            result = lines.join('\n');
          }
          break;
        }

        case 'clear':
          setOutput(WELCOME_MESSAGE);
          localStorage.removeItem('terminal_output');
          return;

        case 'history': {
          if (history.length === 0) {
            result = '(无历史记录)';
          } else {
            result = history.map((h, i) => `  ${i + 1}  ${h}`).join('\n');
          }
          break;
        }

        case 'echo': {
          // 支持 echo "content" > file 和 echo "content" >> file
          const redirectIdx = args.findIndex(a => a === '>' || a === '>>');
          if (redirectIdx === -1) {
            // 普通 echo，直接输出
            result = args.join(' ');
          } else {
            const content = args.slice(0, redirectIdx).join(' ');
            const filename = args[redirectIdx + 1];
            const isAppend = args[redirectIdx] === '>>';
            
            if (!filename) {
              result = 'bash: syntax error near unexpected token `newline\'';
            } else if (isAppend) {
              // 追加模式：先读取现有内容
              const existing = await readFile(filename);
              const newContent = existing.success ? (existing.content || '') + '\n' + content : content;
              const data = await updateFile(filename, newContent);
              result = data.success ? '' : (data.error || '错误');
            } else {
              // 覆盖模式：检查文件是否存在
              const existing = await readFile(filename);
              if (existing.success) {
                // 文件存在，更新内容
                const data = await updateFile(filename, content);
                result = data.success ? '' : (data.error || '错误');
              } else {
                // 文件不存在，创建新文件
                const data = await createFile(filename, content);
                result = data.success ? '' : (data.error || '错误');
              }
            }
          }
          break;
        }

        case 'write': {
          if (args.length < 2) {
            result = '用法: write <filename> <content>';
          } else {
            const filename = args[0];
            const content = args.slice(1).join(' ');
            const data = await updateFile(filename, content);
            result = data.success ? `文件 '${filename}' 已修改` : (data.error || '错误');
          }
          break;
        }

        case 'open': {
          if (!args[0]) {
            result = '用法: open <filename>';
          } else {
            const resp = await fetch(`/api/files/${encodeURIComponent(args[0])}/open`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ mode: 'rw', process_id: 0 })
            });
            const data = await resp.json();
            result = data.success ? `文件 '${args[0]}' 已打开` : (data.error || '错误');
          }
          break;
        }

        case 'close': {
          if (!args[0]) {
            result = '用法: close <filename>';
          } else {
            const resp = await fetch(`/api/files/${encodeURIComponent(args[0])}/close`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ process_id: 0 })
            });
            const data = await resp.json();
            result = data.success ? `文件 '${args[0]}' 已关闭` : (data.error || '错误');
          }
          break;
        }

        case 'hexdump':
        case 'block': {
          if (!args[0]) {
            result = '用法: hexdump <block_id>\n示例: hexdump 35 (查看块35的内容)';
          } else {
            const blockId = parseInt(args[0]);
            const resp = await fetch(`/api/disk/block/${blockId}`);
            const data = await resp.json();
            if (data.success) {
              // 格式化为hexdump风格输出
              const hex = data.data;
              const lines = [];
              for (let i = 0; i < hex.length; i += 32) {
                const offset = (i / 2).toString(16).padStart(8, '0');
                const hexPart = hex.slice(i, i + 32).match(/.{1,2}/g)?.join(' ') || '';
                const textPart = data.text.slice(i / 2, i / 2 + 16).replace(/[^\x20-\x7E]/g, '.');
                lines.push(`${offset}  ${hexPart.padEnd(48)}  |${textPart}|`);
              }
              result = lines.join('\n');
            } else {
              result = data.error || '读取失败';
            }
          }
          break;
        }

        case 'sync':
        case 'flush': {
          const data = await flushBuffer();
          result = data.success ? '' : (data.error || '同步失败');
          break;
        }

        case 'mkfs':
        case 'format': {
          result = '警告: mkfs 将格式化磁盘，所有数据将丢失！\n请使用 mkfs --force 确认操作';
          if (args[0] === '--force' || args[0] === '-f') {
            const data = await formatDisk();
            result = data.success ? 'mke2fs: filesystem created successfully' : (data.error || '格式化失败');
          }
          break;
        }

        case 'dumpe2fs': {
          // 显示文件系统详细信息
          const diskData = await getDiskInfo() as {
            total_size: number;
            block_size: number;
            total_blocks: number;
            used_blocks: number;
            free_blocks: number;
            data_start_block: number;
            is_mounted: boolean;
          };
          const inodeResp = await fetch('/api/inode/list');
          const inodeData = await inodeResp.json();
          
          result = [
            `dumpe2fs 1.0 (OS-Simulator)`,
            `Filesystem volume name:   <none>`,
            `Last mounted on:          /`,
            `Filesystem UUID:          osfs-2025-simulator`,
            `Filesystem magic number:  0x4F534653`,
            `Filesystem state:         ${diskData.is_mounted ? 'clean' : 'not clean'}`,
            `Errors behavior:          Continue`,
            `Block count:              ${diskData.total_blocks}`,
            `Reserved block count:     ${diskData.data_start_block}`,
            `Free blocks:              ${diskData.free_blocks}`,
            `First data block:         ${diskData.data_start_block}`,
            `Block size:               ${diskData.block_size}`,
            `Inode count:              32`,
            `Free inodes:              ${32 - (inodeData.inodes?.length || 0)}`,
            `Inodes per group:         32`,
            ``,
            `Disk Layout:`,
            `  Block 0:       Superblock`,
            `  Blocks 1-2:    Block bitmap`,
            `  Blocks 3-34:   Inode table`,
            `  Blocks 35+:    Data blocks`,
            ``,
            `Index Structure: Hybrid indexing`,
            `  Direct blocks:          6`,
            `  Single indirect:        1 (32 pointers)`,
            `  Double indirect:        1 (32x32 pointers)`,
            `  Max file size:          ~66KB`,
          ].join('\n');
          break;
        }

        case 'inode': {
          if (!args[0]) {
            result = '用法: inode <inode_id>\n示例: inode 0 (查看根目录iNode)';
          } else {
            const inodeId = parseInt(args[0]);
            const resp = await fetch(`/api/inode/${inodeId}`);
            const data = await resp.json();
            if (data.success) {
              result = [
                `Inode: ${data.inode_id}   Type: ${data.type}   Mode: ${formatPermissions(data.permissions)}`,
                `Links: ${data.link_count}   Size: ${data.size}`,
                `Blocks: ${data.direct_blocks_used.length}`,
                `Access: ${formatTime(data.modify_time)}`,
                `Modify: ${formatTime(data.modify_time)}`,
                `Change: ${formatTime(data.create_time)}`,
                ` Birth: ${formatTime(data.create_time)}`,
                ``,
                `Direct blocks: ${data.direct_blocks_used.join(', ') || 'none'}`,
                `Indirect block: ${data.single_indirect || 'none'}`,
                `Double indirect: ${data.double_indirect || 'none'}`,
                ``,
                `Raw inode data:`,
                `${data.raw_hex}`,
              ].join('\n');
            } else {
              result = data.error || '读取失败';
            }
          }
          break;
        }

        case 'inodes': {
          const resp = await fetch('/api/inode/list');
          const data = await resp.json();
          if (data.success && data.inodes.length > 0) {
            const lines = ['ID    TYPE      SIZE', '─'.repeat(30)];
            data.inodes.forEach((inode: { inode_id: number; type: string; size: number }) => {
              lines.push(`${String(inode.inode_id).padEnd(6)}${inode.type.padEnd(10)}${inode.size}B`);
            });
            lines.push(`─`.repeat(30));
            lines.push(`共 ${data.total} 个iNode在使用中`);
            result = lines.join('\n');
          } else {
            result = '没有使用中的iNode';
          }
          break;
        }


        case 'kill': {
          if (!args[0]) {
            result = '用法: kill <pid>';
          } else {
            const pid = parseInt(args[0]);
            const resp = await fetch(`/api/processes/${pid}/terminate`, { method: 'POST' });
            const data = await resp.json();
            result = data.success ? '' : `bash: kill: (${pid}) - ${data.error || '进程不存在'}`;
          }
          break;
        }

        case 'nice':
        case 'run': {
          if (!args[0]) {
            result = '用法: nice <命令名> [持续时间秒]\n示例: nice task1 5 (创建持续5秒的后台任务)';
          } else {
            const taskName = args[0];
            const duration = parseInt(args[1] || '5');
            const resp = await fetch('/api/processes/longtask', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: taskName, duration, steps: 10 })
            });
            const data = await resp.json();
            result = data.success ? `[${data.pid}] ${taskName} &` : (data.error || '创建失败');
          }
          break;
        }

        case 'jobs': {
          const data = await getProcesses();
          const running = data.processes?.filter(p => p.state === 'RUNNING' || p.state === 'READY') || [];
          if (running.length === 0) {
            result = '';
          } else {
            result = running.map((p, i) => `[${i + 1}]+  ${p.state === 'RUNNING' ? 'Running' : 'Stopped'}   ${p.name}`).join('\n');
          }
          break;
        }

        case 'batch': {
          const count = parseInt(args[0] || '3');
          const duration = parseInt(args[1] || '3');
          const resp = await fetch('/api/processes/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ count, duration })
          });
          const data = await resp.json();
          if (data.success) {
            result = data.pids.map((pid: number, i: number) => `[${pid}] task_${i + 1} &`).join('\n');
          } else {
            result = data.error || '创建失败';
          }
          break;
        }

        case 'top':
        case 'scheduler': {
          const schedData = await getSchedulerStatus();
          const procData = await getProcesses();
          const stats = schedData.stats;
          const uptime = stats.uptime || 0;
          const cpuUtil = ((stats.cpu_utilization || 0) * 100).toFixed(1);
          
          const lines = [
            `top - ${new Date().toLocaleTimeString('zh-CN')} up ${Math.floor(uptime / 60)} min, load average: ${cpuUtil}%`,
            `Tasks: ${procData.processes?.length || 0} total, ${procData.processes?.filter(p => p.state === 'RUNNING').length || 0} running, ${procData.processes?.filter(p => p.state === 'READY').length || 0} sleeping`,
            `%Cpu(s): ${cpuUtil} us, 0.0 sy, 0.0 ni, ${(100 - parseFloat(cpuUtil)).toFixed(1)} id`,
            ``,
            `Scheduler: ${stats.state}  Quantum: ${stats.time_quantum}ms  Switches: ${stats.context_switches}  Preempts: ${stats.preemptions}`,
            ``,
            `  PID USER      STATE        TIME+ COMMAND`,
          ];
          
          procData.processes?.slice(0, 15).forEach(p => {
            const name = p.name.length > 20 ? p.name.slice(0, 17) + '...' : p.name;
            lines.push(`${String(p.pid).padStart(5)} root      ${p.state.padEnd(12)} ${p.cpu_time.toFixed(2).padStart(6)} ${name}`);
          });
          
          result = lines.join('\n');
          break;
        }

        case 'sched': {
          if (!args[0]) {
            result = '用法: sched <start|stop|pause|resume|quantum N>\n示例: sched start / sched quantum 200';
          } else {
            const subcmd = args[0].toLowerCase();
            let data;
            switch (subcmd) {
              case 'start':
                data = await startScheduler();
                result = data.success ? '调度器已启动' : (data.error || '启动失败');
                break;
              case 'stop':
                data = await stopScheduler();
                result = data.success ? '调度器已停止' : (data.error || '停止失败');
                break;
              case 'pause':
                data = await pauseScheduler();
                result = data.success ? '调度器已暂停' : (data.error || '暂停失败');
                break;
              case 'resume':
                data = await resumeScheduler();
                result = data.success ? '调度器已恢复' : (data.error || '恢复失败');
                break;
              case 'quantum':
                if (!args[1]) {
                  result = '用法: sched quantum <毫秒>';
                } else {
                  data = await setTimeQuantum(parseInt(args[1]));
                  result = data.success ? `时间片已设置为 ${args[1]} ms` : (data.error || '设置失败');
                }
                break;
              default:
                result = `未知子命令: ${subcmd}`;
            }
          }
          break;
        }

        case 'ipcs':
        case 'shm': {
          const resp = await fetch('/api/shm');
          const data = await resp.json();
          const lines = [
            `------ Shared Memory Segments --------`,
            `key        shmid      owner      perms      bytes      nattch     status`,
          ];
          if (data.segments && data.segments.length > 0) {
            data.segments.forEach((seg: { key: number; size: number; attached_count: number; read_count: number; write_count: number }) => {
              lines.push(`0x${seg.key.toString(16).padStart(8, '0')}  ${String(seg.key).padEnd(10)} root       666        ${String(seg.size).padEnd(10)} ${seg.attached_count}`);
            });
          }
          lines.push(``);
          lines.push(`Total: ${data.segments?.length || 0} segment(s), ${data.stats?.total_size || 0} bytes`);
          result = lines.join('\n');
          break;
        }

        case 'shmget':
        case 'shm_create': {
          const size = parseInt(args[0] || '1024');
          const resp = await fetch('/api/shm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ size })
          });
          const data = await resp.json();
          result = data.success ? `shmget: created segment, key=${data.key}, size=${size}` : (data.error || '创建失败');
          break;
        }

        case 'shmread':
        case 'shm_read': {
          if (!args[0]) {
            result = '用法: shmread <key> [offset] [length]';
          } else {
            const key = parseInt(args[0]);
            const offset = parseInt(args[1] || '0');
            const length = parseInt(args[2] || '64');
            const resp = await fetch(`/api/shm/${key}/read`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ offset, length, process_id: 0 })
            });
            const data = await resp.json();
            if (data.success) {
              result = data.text || '(empty)';
            } else {
              result = `shmread: ${data.error || '读取失败'}`;
            }
          }
          break;
        }

        case 'shmwrite':
        case 'shm_write': {
          if (args.length < 2) {
            result = '用法: shmwrite <key> <content>';
          } else {
            const key = parseInt(args[0]);
            const content = args.slice(1).join(' ');
            const resp = await fetch(`/api/shm/${key}/write`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ data: content, offset: 0, process_id: 0 })
            });
            const data = await resp.json();
            result = data.success ? '' : `shmwrite: ${data.error || '写入失败'}`;
          }
          break;
        }

        case 'ipcrm': {
          if (!args[0]) {
            result = '用法: ipcrm <key>';
          } else {
            const key = parseInt(args[0]);
            const resp = await fetch(`/api/shm/${key}`, { method: 'DELETE' });
            const data = await resp.json();
            result = data.success ? '' : `ipcrm: ${data.error || '删除失败'}`;
          }
          break;
        }

        case 'help':
        case 'man': {
          result = [
            `OS FileSystem Simulator - 命令帮助 (Linux标准命令风格)`,
            `═══════════════════════════════════════════════════════════════`,
            ``,
            `文件操作命令:`,
            `  ls                     列出当前目录文件`,
            `  pwd                    显示当前工作目录`,
            `  cd <dir>               切换目录 (cd .. 返回上级)`,
            `  mkdir <dir>            创建目录`,
            `  touch <file>           创建空文件`,
            `  cat <file>             查看文件内容`,
            `  echo <text> > <file>   写入/覆盖文件内容`,
            `  echo <text> >> <file>  追加内容到文件`,
            `  rm <file>              删除文件或空目录`,
            `  stat <file>            显示文件详细信息(inode, 块等)`,
            `  open <file>            打开文件(设置文件锁)`,
            `  close <file>           关闭文件(释放文件锁)`,
            ``,
            `磁盘与系统命令:`,
            `  df                     显示磁盘使用情况`,
            `  free                   显示内存/缓冲区状态`,
            `  sync                   同步缓冲区(写回脏页到磁盘)`,
            `  mkfs --force           格式化磁盘(清除所有数据)`,
            `  hexdump <block_id>     以十六进制查看磁盘块内容`,
            `  inode <inode_id>       查看iNode详细信息`,
            `  inodes                 列出所有使用中的iNode`,
            ``,
            `进程管理命令:`,
            `  ps                     显示进程列表`,
            `  top                    显示调度器状态和进程信息`,
            `  kill <pid>             终止指定进程`,
            `  nice <name> [seconds]  创建后台任务(演示调度)`,
            `  batch <count>          批量创建任务(演示并发调度)`,
            `  jobs                   显示后台运行的任务`,
            ``,
            `调度器控制命令:`,
            `  sched start            启动调度器`,
            `  sched stop             停止调度器`,
            `  sched pause            暂停调度器`,
            `  sched resume           恢复调度器`,
            `  sched quantum <ms>     设置时间片大小(毫秒)`,
            ``,
            `IPC共享内存命令:`,
            `  ipcs                   列出IPC共享内存段`,
            `  shmget <size>          创建共享内存段`,
            `  shmread <key>          读取共享内存内容`,
            `  shmwrite <key> <data>  写入数据到共享内存`,
            `  ipcrm <key>            删除共享内存段`,
            ``,
            `其他命令:`,
            `  clear                  清空终端屏幕`,
            `  history                显示命令历史`,
            `  help                   显示此帮助信息`,
            `═══════════════════════════════════════════════════════════════`,
          ].join('\n');
          break;
        }

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
