import { useState } from 'react';

interface ModalProps {
  title: string;
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export function Modal({ title, isOpen, onClose, children }: ModalProps) {
  if (!isOpen) return null;

  return (
    <>
      <div className="modal-overlay active" onClick={onClose}></div>
      <div className="modal active">
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="btn-icon" onClick={onClose}>×</button>
        </div>
        {children}
      </div>
    </>
  );
}

interface CreateFileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (filename: string, content: string) => void;
}

export function CreateFileModal({ isOpen, onClose, onSubmit }: CreateFileModalProps) {
  const [filename, setFilename] = useState('');
  const [content, setContent] = useState('');

  const handleSubmit = () => {
    if (!filename.trim()) return;
    onSubmit(filename.trim(), content);
    setFilename('');
    setContent('');
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && filename.trim()) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <Modal title="新建文件" isOpen={isOpen} onClose={onClose}>
      <div className="modal-body">
        <div className="form-group">
          <label>文件名</label>
          <input
            type="text"
            value={filename}
            onChange={e => setFilename(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="example.txt"
            autoFocus
          />
        </div>
        <div className="form-group">
          <label>文件内容</label>
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="输入文件内容..."
          />
        </div>
      </div>
      <div className="modal-footer">
        <button className="btn-secondary" onClick={onClose}>取消</button>
        <button className="btn-primary" onClick={handleSubmit}>创建</button>
      </div>
    </Modal>
  );
}

interface CreateDirModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (dirname: string) => void;
}

export function CreateDirModal({ isOpen, onClose, onSubmit }: CreateDirModalProps) {
  const [dirname, setDirname] = useState('');

  const handleSubmit = () => {
    if (!dirname.trim()) return;
    onSubmit(dirname.trim());
    setDirname('');
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && dirname.trim()) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <Modal title="新建目录" isOpen={isOpen} onClose={onClose}>
      <div className="modal-body">
        <div className="form-group">
          <label>目录名</label>
          <input
            type="text"
            value={dirname}
            onChange={e => setDirname(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="new_folder"
            autoFocus
          />
        </div>
      </div>
      <div className="modal-footer">
        <button className="btn-secondary" onClick={onClose}>取消</button>
        <button className="btn-primary" onClick={handleSubmit}>创建</button>
      </div>
    </Modal>
  );
}
