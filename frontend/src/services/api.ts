import { io, Socket } from 'socket.io-client';
import type {
  SystemStats,
  FilesResponse,
  FileReadResponse,
  ProcessesResponse,
  BufferStatusResponse,
  SchedulerStatusResponse,
  ApiResponse,
} from '../types';

const API_BASE = '';

// HTTP API 调用
async function fetchApi<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  return response.json();
}

// 系统统计
export async function getStats(): Promise<SystemStats> {
  return fetchApi<SystemStats>('/api/stats');
}

// 文件系统API
export async function listFiles(): Promise<FilesResponse> {
  return fetchApi<FilesResponse>('/api/files');
}

export async function createFile(filename: string, content: string): Promise<ApiResponse> {
  return fetchApi<ApiResponse>('/api/files', {
    method: 'POST',
    body: JSON.stringify({ filename, content }),
  });
}

export async function readFile(filename: string): Promise<FileReadResponse> {
  return fetchApi<FileReadResponse>(`/api/files/${encodeURIComponent(filename)}`);
}

export async function updateFile(filename: string, content: string): Promise<ApiResponse> {
  return fetchApi<ApiResponse>(`/api/files/${encodeURIComponent(filename)}`, {
    method: 'PUT',
    body: JSON.stringify({ content }),
  });
}

export async function deleteFile(filename: string): Promise<ApiResponse> {
  return fetchApi<ApiResponse>(`/api/files/${encodeURIComponent(filename)}`, {
    method: 'DELETE',
  });
}

export async function createDirectory(dirname: string): Promise<ApiResponse> {
  return fetchApi<ApiResponse>('/api/mkdir', {
    method: 'POST',
    body: JSON.stringify({ dirname }),
  });
}

export async function changeDirectory(dirname: string): Promise<ApiResponse & { current_path?: string; can_go_back?: boolean }> {
  return fetchApi<ApiResponse & { current_path?: string; can_go_back?: boolean }>('/api/cd', {
    method: 'POST',
    body: JSON.stringify({ dirname }),
  });
}

export async function getCurrentPath(): Promise<ApiResponse & { current_path: string; can_go_back: boolean }> {
  return fetchApi('/api/pwd');
}

export async function getFileInfo(filename: string): Promise<ApiResponse & { name: string; type: string; size: number; block_count: number; blocks: number[]; permissions: number; create_time: number; modify_time: number; is_open: boolean }> {
  return fetchApi(`/api/files/${encodeURIComponent(filename)}/info`);
}

// 磁盘API
export async function getDiskBitmap(): Promise<{ bitmap: number[]; total: number; used: number; free: number }> {
  return fetchApi('/api/disk/bitmap');
}

export async function getDiskBlock(blockId: number): Promise<{ success: boolean; block_id: number; data: string; text: string }> {
  return fetchApi(`/api/disk/block/${blockId}`);
}

export async function formatDisk(): Promise<ApiResponse> {
  return fetchApi<ApiResponse>('/api/disk/format', { method: 'POST' });
}

export async function getDiskInfo() {
  return fetchApi('/api/disk/info');
}

// 缓冲区API
export async function getBufferStatus(): Promise<BufferStatusResponse> {
  return fetchApi<BufferStatusResponse>('/api/buffer/status');
}

export async function flushBuffer(): Promise<ApiResponse> {
  return fetchApi<ApiResponse>('/api/buffer/flush', { method: 'POST' });
}

export async function getBufferLog(): Promise<{ log: Array<{ timestamp: number; type: string; page_id: number; block_id: number }> }> {
  return fetchApi('/api/buffer/log');
}

// 进程API
export async function getProcesses(): Promise<ProcessesResponse> {
  return fetchApi<ProcessesResponse>('/api/processes');
}

export async function createProcess(command: string, args: Record<string, unknown> = {}): Promise<ApiResponse & { pid: number }> {
  return fetchApi('/api/processes', {
    method: 'POST',
    body: JSON.stringify({ command, args }),
  });
}

export async function terminateProcess(pid: number): Promise<ApiResponse> {
  return fetchApi<ApiResponse>(`/api/processes/${pid}/terminate`, { method: 'POST' });
}

// 调度器API
export async function getSchedulerStatus(): Promise<SchedulerStatusResponse> {
  return fetchApi<SchedulerStatusResponse>('/api/scheduler/status');
}

export async function startScheduler(): Promise<ApiResponse> {
  return fetchApi<ApiResponse>('/api/scheduler/start', { method: 'POST' });
}

export async function stopScheduler(): Promise<ApiResponse> {
  return fetchApi<ApiResponse>('/api/scheduler/stop', { method: 'POST' });
}

export async function pauseScheduler(): Promise<ApiResponse> {
  return fetchApi<ApiResponse>('/api/scheduler/pause', { method: 'POST' });
}

export async function resumeScheduler(): Promise<ApiResponse> {
  return fetchApi<ApiResponse>('/api/scheduler/resume', { method: 'POST' });
}

export async function setTimeQuantum(quantum: number): Promise<ApiResponse> {
  return fetchApi<ApiResponse>('/api/scheduler/quantum', {
    method: 'PUT',
    body: JSON.stringify({ quantum }),
  });
}

export async function getSchedulerEvents(count = 20): Promise<{ events: Array<{ timestamp: number; type: string; pid: number; details: string }> }> {
  return fetchApi(`/api/scheduler/events?count=${count}`);
}

export async function getGanttData(): Promise<{ gantt: Array<{ pid: number; time: number; type: string }> }> {
  return fetchApi('/api/scheduler/gantt');
}

// iNode API
export async function getInodeInfo(inodeId: number): Promise<ApiResponse & { 
  inode_id: number;
  type: string;
  type_code: number;
  permissions: number;
  size: number;
  create_time: number;
  modify_time: number;
  link_count: number;
  direct_blocks: number[];
  direct_blocks_used: number[];
  single_indirect: number;
  double_indirect: number;
  raw_hex: string;
}> {
  return fetchApi(`/api/inode/${inodeId}`);
}

export async function listInodes(): Promise<ApiResponse & { 
  inodes: Array<{ inode_id: number; type: string; size: number }>;
  total: number;
}> {
  return fetchApi('/api/inode/list');
}

// 长任务API
export async function createLongTask(name: string, duration: number, steps = 10): Promise<ApiResponse & { pid: number }> {
  return fetchApi('/api/processes/longtask', {
    method: 'POST',
    body: JSON.stringify({ name, duration, steps })
  });
}

export async function createBatchTasks(count: number, duration = 3): Promise<ApiResponse & { pids: number[] }> {
  return fetchApi('/api/processes/batch', {
    method: 'POST',
    body: JSON.stringify({ count, duration })
  });
}

// WebSocket 连接
let socket: Socket | null = null;

export function connectSocket(): Socket {
  if (!socket) {
    socket = io({
      transports: ['websocket', 'polling'],
    });
  }
  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
