// 系统状态类型定义
export interface DiskInfo {
  total_blocks: number;
  used_blocks: number;
  free_blocks: number;
  total_size: number;
  block_size: number;
  data_start_block: number;
  is_mounted: boolean;
}

export interface FilesystemStats {
  total_inodes: number;
  used_inodes: number;
  free_inodes: number;
}

export interface BufferStats {
  total_pages: number;
  free_pages: number;
  dirty_pages: number;
  clean_pages: number;
  hits: number;
  misses: number;
  hit_rate: number;
  evictions: number;
  writebacks: number;
}

export interface ProcessStats {
  running: number;
  ready: number;
  blocked: number;
  total: number;
  terminated: number;
}

export interface SchedulerStats {
  state: string;
  context_switches: number;
  preemptions: number;
  cpu_utilization: number;
  time_quantum: number;
  current_process: number | null;
  ready_queue_size: number;
  time_slices_used: number;
  total_schedules: number;
  uptime: number;
  idle_time: number;
}

export interface SystemStats {
  disk: DiskInfo;
  filesystem: FilesystemStats;
  buffer: BufferStats;
  processes: ProcessStats;
  scheduler: SchedulerStats;
  shm: {
    total_segments: number;
    total_memory: number;
  };
}

// 文件相关类型
export interface FileEntry {
  name: string;
  type: 'FILE' | 'DIRECTORY';
  size: number;
  blocks: number;
  permissions: number;
  create_time: number;
  modify_time: number;
}

export interface FileDetail extends FileEntry {
  content: string;
  block_count: number;
  is_open: boolean;
}

// 进程相关类型
export interface Process {
  pid: number;
  name: string;
  state: 'NEW' | 'READY' | 'RUNNING' | 'BLOCKED' | 'TERMINATED';
  command: string | null;
  cpu_time: number;
  priority?: number;
  remaining_time?: number;
  result?: unknown;
}

// 缓冲页类型
export interface BufferPage {
  page_id: number;
  block_id: number;
  owner: number;
  state: string;
  is_pinned: boolean;
  access_time: number;
  access_count: number;
  data_preview: string;
}

// 调度事件类型
export interface SchedulerEvent {
  timestamp: number;
  type: string;
  pid: number;
  details: string;
}

// 日志类型
export interface LogEntry {
  type: string;
  message: string;
  time: string;
}

// API响应类型
export interface ApiResponse<T = unknown> {
  success: boolean;
  error?: string;
  message?: string;
  data?: T;
}

export interface FilesResponse extends ApiResponse {
  files: FileEntry[];
  current_path?: string;
  can_go_back?: boolean;
}

export interface FileReadResponse extends ApiResponse {
  content: string;
  size: number;
  blocks: number[];
  create_time: number;
  modify_time: number;
}

export interface ProcessesResponse extends ApiResponse {
  processes: Process[];
  stats: ProcessStats;
}

export interface BufferStatusResponse extends ApiResponse {
  pages: BufferPage[];
  stats: BufferStats;
}

export interface SchedulerStatusResponse extends ApiResponse {
  stats: SchedulerStats;
  ready_queue: number[];
}

// 共享内存段类型
export interface SharedMemorySegment {
  key: number;
  size: number;
  attached_count: number;
  read_count: number;
  write_count: number;
  create_time: number;
  last_access: number;
  data_preview?: string;
}

export interface IPCStatusResponse extends ApiResponse {
  segments: SharedMemorySegment[];
  total_segments: number;
  total_memory: number;
}

// 面板类型
export type PanelType = 'dashboard' | 'files' | 'disk' | 'buffer' | 'process' | 'scheduler' | 'terminal' | 'ipc';
