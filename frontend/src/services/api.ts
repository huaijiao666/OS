import { io, Socket } from 'socket.io-client';
import type {
  SystemStats,
  FilesResponse,
  FileReadResponse,
  ProcessesResponse,
  BufferStatusResponse,
  BufferStats,
  BufferPage,
  SchedulerStatusResponse,
  ApiResponse,
} from '../types';

const API_BASE = '';

// HTTP API helper
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

// System stats
export async function getStats(): Promise<SystemStats> {
  return fetchApi<SystemStats>('/api/stats');
}

// File system APIs
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

export async function getFileInfo(filename: string): Promise<ApiResponse & {
  name: string;
  type: string;
  size: number;
  block_count: number;
  blocks: number[];
  permissions: number;
  create_time: number;
  modify_time: number;
  is_open: boolean;
}> {
  return fetchApi(`/api/files/${encodeURIComponent(filename)}/info`);
}

// Disk APIs
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

// Buffer APIs
export async function getBufferStatus(): Promise<BufferStatusResponse> {
  return fetchApi<BufferStatusResponse>('/api/buffer/status');
}

export async function flushBuffer(): Promise<ApiResponse> {
  return fetchApi<ApiResponse>('/api/buffer/flush', { method: 'POST' });
}

export async function getBufferLog(): Promise<{ log: Array<{ timestamp: number; type: string; page_id: number; block_id: number }> }> {
  return fetchApi('/api/buffer/log');
}

export async function accessBufferBlock(blockId: number): Promise<ApiResponse & {
  success: boolean;
  hit?: boolean;
  block_id?: number;
  page_id?: number | null;
  stats?: BufferStats;
  log?: Array<{ timestamp: number; type: string; page_id: number; block_id: number; process_id?: number }>;
  pages?: BufferPage[];
}> {
  return fetchApi('/api/buffer/access', {
    method: 'POST',
    body: JSON.stringify({ block_id: blockId }),
  });
}

// Process APIs
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

// Scheduler APIs
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

export async function getSchedulerEvents(count = 20): Promise<{ events: Array<{ timestamp: number; type: string; pid: number; details: string; remaining_time?: number | string | null }> }> {
  return fetchApi(`/api/scheduler/events?count=${count}`);
}

export async function clearSchedulerEvents(): Promise<ApiResponse> {
  return fetchApi<ApiResponse>('/api/scheduler/events/clear', { method: 'POST' });
}

export async function getGanttData(): Promise<{ gantt: Array<{ pid: number; time: number; type: string }> }> {
  return fetchApi('/api/scheduler/gantt');
}

// Inode APIs
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

// Long tasks APIs
export async function createLongTask(name: string, duration: number, steps = 10): Promise<ApiResponse & { pid: number }> {
  return fetchApi('/api/processes/longtask', {
    method: 'POST',
    body: JSON.stringify({ name, duration, steps }),
  });
}

export async function createBatchTasks(count: number, durationOrDurations: number | number[] = 3): Promise<ApiResponse & { pids: number[] }> {
  const body = Array.isArray(durationOrDurations)
    ? { count, durations: durationOrDurations }
    : { count, duration: durationOrDurations };

  return fetchApi('/api/processes/batch', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

// IPC / Shared Memory APIs
export async function getIPCStatus(): Promise<{ segments: Array<{ key: number; size: number; attached_count: number; read_count: number; write_count: number; create_time: number; last_access: number }>; total_segments: number; total_memory: number }> {
  return fetchApi('/api/shm');
}

export async function createSharedMemory(size: number): Promise<ApiResponse & { key: number }> {
  return fetchApi<ApiResponse & { key: number }>('/api/shm', {
    method: 'POST',
    body: JSON.stringify({ size }),
  });
}

export async function deleteSharedMemory(key: number): Promise<ApiResponse> {
  return fetchApi(`/api/shm/${key}`, { method: 'DELETE' });
}

export async function readSharedMemory(key: number, offset = 0, length?: number): Promise<ApiResponse & { data: string; hex: string }> {
  return fetchApi(`/api/shm/${key}/read`, {
    method: 'POST',
    body: JSON.stringify({ offset, length }),
  });
}

export async function writeSharedMemory(key: number, data: string, offset = 0): Promise<ApiResponse & { bytes_written: number }> {
  return fetchApi(`/api/shm/${key}/write`, {
    method: 'POST',
    body: JSON.stringify({ data, offset }),
  });
}

// WebSocket connection
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
