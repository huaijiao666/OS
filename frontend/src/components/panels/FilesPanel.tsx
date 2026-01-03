import { useState, useEffect, useCallback } from 'react';
import { listFiles, readFile, updateFile, deleteFile, createFile, createDirectory, changeDirectory } from '../../services/api';
import { CreateFileModal, CreateDirModal } from '../Modal';
import type { FileEntry } from '../../types';

interface FilesPanelProps {
  showToast: (type: string, message: string) => void;
  addLog: (type: string, message: string) => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatTime(timestamp: number): string {
  if (!timestamp) return '-';
  const date = new Date(timestamp * 1000);
  return date.toLocaleString('zh-CN');
}

export default function FilesPanel({ showToast, addLog }: FilesPanelProps) {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [currentFile, setCurrentFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [fileMeta, setFileMeta] = useState<{ size: number; blocks: number[]; create_time: number; modify_time: number } | null>(null);
  const [showCreateFile, setShowCreateFile] = useState(false);
  const [showCreateDir, setShowCreateDir] = useState(false);

  const loadFiles = useCallback(async () => {
    try {
      const data = await listFiles();
      if (data.success) {
        setFiles(data.files || []);
      }
    } catch (error) {
      console.error('加载文件列表失败:', error);
    }
  }, []);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const handleOpenFile = useCallback(async (filename: string, isDir: boolean) => {
    if (isDir) {
      try {
        const result = await changeDirectory(filename);
        if (result.success) {
          loadFiles();
        }
      } catch (error) {
        console.error('切换目录失败:', error);
      }
    } else {
      try {
        const data = await readFile(filename);
        if (data.success) {
          setCurrentFile(filename);
          setFileContent(data.content || '');
          setFileMeta({
            size: data.size,
            blocks: data.blocks,
            create_time: data.create_time,
            modify_time: data.modify_time,
          });
        }
      } catch (error) {
        console.error('打开文件失败:', error);
      }
    }
  }, [loadFiles]);

  const handleSaveFile = useCallback(async () => {
    if (!currentFile) return;

    try {
      const result = await updateFile(currentFile, fileContent);
      if (result.success) {
        showToast('success', '文件保存成功');
        addLog('write', `修改文件 ${currentFile}`);
      } else {
        showToast('error', result.error || '保存失败');
      }
    } catch {
      showToast('error', '保存失败');
    }
  }, [currentFile, fileContent, showToast, addLog]);

  const handleDeleteFile = useCallback(async () => {
    if (!currentFile) return;
    if (!window.confirm(`确定要删除文件 "${currentFile}" 吗？`)) return;

    try {
      const result = await deleteFile(currentFile);
      if (result.success) {
        showToast('success', '文件删除成功');
        addLog('delete', `删除文件 ${currentFile}`);
        setCurrentFile(null);
        setFileMeta(null);
        loadFiles();
      } else {
        showToast('error', result.error || '删除失败');
      }
    } catch {
      showToast('error', '删除失败');
    }
  }, [currentFile, showToast, addLog, loadFiles]);

  const handleCreateFile = useCallback(async (filename: string, content: string) => {
    try {
      const result = await createFile(filename, content);
      if (result.success) {
        showToast('success', `文件 ${filename} 创建成功`);
        addLog('create', `创建文件 ${filename}`);
        loadFiles();
      } else {
        showToast('error', result.error || '创建失败');
      }
    } catch {
      showToast('error', '创建失败');
    }
  }, [showToast, addLog, loadFiles]);

  const handleCreateDir = useCallback(async (dirname: string) => {
    try {
      const result = await createDirectory(dirname);
      if (result.success) {
        showToast('success', `目录 ${dirname} 创建成功`);
        addLog('create', `创建目录 ${dirname}`);
        loadFiles();
      } else {
        showToast('error', result.error || '创建失败');
      }
    } catch {
      showToast('error', '创建失败');
    }
  }, [showToast, addLog, loadFiles]);

  return (
    <section className="panel active">
      <div className="files-container">
        <div className="files-toolbar">
          <div className="path-breadcrumb">
            <span className="path-icon">📁</span>
            <span className="path-text">/root</span>
          </div>
          <div className="toolbar-actions">
            <button className="btn-primary" onClick={() => setShowCreateFile(true)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              新建文件
            </button>
            <button className="btn-secondary" onClick={() => setShowCreateDir(true)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
              </svg>
              新建目录
            </button>
          </div>
        </div>

        <div className="files-grid">
          {files.length === 0 ? (
            <div className="file-empty" style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
              <p>目录为空</p>
              <p style={{ fontSize: '0.85rem' }}>点击"新建文件"开始</p>
            </div>
          ) : (
            files.map(file => {
              const isDir = file.type === 'DIRECTORY';
              return (
                <div
                  key={file.name}
                  className="file-item"
                  onClick={() => handleOpenFile(file.name, isDir)}
                >
                  <div className={`file-icon-large ${isDir ? 'folder' : 'file'}`}>
                    {isDir ? (
                      <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                      </svg>
                    )}
                  </div>
                  <div className="file-name">{file.name}</div>
                  <div className="file-size">{isDir ? `${file.blocks} 块` : formatSize(file.size)}</div>
                </div>
              );
            })
          )}
        </div>

        {currentFile && fileMeta && (
          <div className="file-preview" style={{ display: 'flex' }}>
            <div className="preview-header">
              <h3>{currentFile}</h3>
              <button className="btn-icon" onClick={() => { setCurrentFile(null); setFileMeta(null); }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="preview-meta">
              大小: {formatSize(fileMeta.size)} | 
              块数: {fileMeta.blocks.length} | 
              创建: {formatTime(fileMeta.create_time)} | 
              修改: {formatTime(fileMeta.modify_time)}
            </div>
            <div className="preview-content">
              <textarea
                value={fileContent}
                onChange={e => setFileContent(e.target.value)}
                placeholder="文件内容"
              />
            </div>
            <div className="preview-actions">
              <button className="btn-primary" onClick={handleSaveFile}>保存修改</button>
              <button className="btn-danger" onClick={handleDeleteFile}>删除文件</button>
            </div>
          </div>
        )}
      </div>

      <CreateFileModal
        isOpen={showCreateFile}
        onClose={() => setShowCreateFile(false)}
        onSubmit={handleCreateFile}
      />
      <CreateDirModal
        isOpen={showCreateDir}
        onClose={() => setShowCreateDir(false)}
        onSubmit={handleCreateDir}
      />
    </section>
  );
}
