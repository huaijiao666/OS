interface TopBarProps {
  title: string;
  onRefresh: () => void;
  onFormat: () => void;
}

export default function TopBar({ title, onRefresh, onFormat }: TopBarProps) {
  return (
    <header className="top-bar">
      <div className="page-title">
        <h1>{title}</h1>
      </div>
      <div className="top-actions">
        <button className="btn-icon" onClick={onRefresh} title="刷新数据">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="23 4 23 10 17 10"/>
            <polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
        </button>
        <button className="btn-icon" onClick={onFormat} title="格式化磁盘">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
          </svg>
        </button>
      </div>
    </header>
  );
}
