import { useState, useEffect, useCallback } from "react";
import { getBufferStatus, getBufferLog, flushBuffer, accessBufferBlock } from "../../services/api";
import type { BufferPage, BufferStats } from "../../types";

interface BufferPanelProps {
  showToast: (type: string, message: string) => void;
}

function formatTimestamp(ts: number): string {
  const date = new Date(ts * 1000);
  return date.toLocaleTimeString("zh-CN");
}

export default function BufferPanel({ showToast }: BufferPanelProps) {
  const [pages, setPages] = useState<BufferPage[]>([]);
  const [stats, setStats] = useState<BufferStats | null>(null);
  const [logs, setLogs] = useState<Array<{ timestamp: number; type: string; page_id: number; block_id: number }>>([]);
  const [blockInput, setBlockInput] = useState("");
  const [accessLoading, setAccessLoading] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const data = await getBufferStatus();
      setPages(data.pages || []);
      setStats(data.stats || null);
    } catch (error) {
      console.error("加载缓冲区状态失败:", error);
    }
  }, []);

  const loadLogs = useCallback(async () => {
    try {
      const data = await getBufferLog();
      setLogs(data.log || []);
    } catch (error) {
      console.error("加载缓冲区日志失败:", error);
    }
  }, []);

  useEffect(() => {
    loadStatus();
    loadLogs();
    const interval = setInterval(() => {
      loadStatus();
      loadLogs();
    }, 2000);
    return () => clearInterval(interval);
  }, [loadStatus, loadLogs]);

  const handleFlush = useCallback(async () => {
    try {
      const result = await flushBuffer();
      if (result.success) {
        showToast("success", "缓冲区已刷新");
        loadStatus();
        loadLogs();
      } else {
        showToast("error", result.error || "刷新失败");
      }
    } catch (error) {
      console.error("刷新缓冲区失败:", error);
      showToast("error", "刷新失败");
    }
  }, [showToast, loadStatus, loadLogs]);

  const handleAccessBlock = useCallback(async () => {
    if (accessLoading) return;
    const trimmed = blockInput.trim();
    if (!trimmed) {
      showToast("error", "请输入块号");
      return;
    }
    const blockId = Number(trimmed);
    if (Number.isNaN(blockId) || blockId < 0) {
      showToast("error", "块号必须是非负整数");
      return;
    }

    setAccessLoading(true);
    try {
      const res = await accessBufferBlock(blockId);
      if (res.success) {
        setPages(res.pages || []);
        setStats(res.stats as BufferStats);
        setLogs(res.log || []);
        const hitText = res.hit ? "命中" : "缺页/置换";
        showToast("success", `访问块 ${blockId}：${hitText}`);
      } else {
        showToast("error", res.error || "访问失败");
      }
    } catch (error) {
      console.error("访问块失败:", error);
      showToast("error", "访问块失败");
    } finally {
      setAccessLoading(false);
    }
  }, [accessLoading, blockInput, showToast]);

  const hitRate = stats ? ((stats.hits / (stats.hits + stats.misses || 1)) * 100).toFixed(1) : "0.0";

  return (
    <section className="panel active">
      <div className="panel-header">
        <div>
          <h2>缓冲区管理</h2>
          <p className="text-muted">LRU 置换，手动访问块触发置换</p>
        </div>
      </div>

      <div className="panel-body buffer-layout">
        <div className="buffer-main">
          <div className="buffer-stats">
            <div className="buffer-stat-card">
              <div className="stat-number">{stats?.total_pages ?? 0}</div>
              <div className="stat-text">总页数</div>
            </div>
            <div className="buffer-stat-card">
              <div className="stat-number">{stats?.hits ?? 0}</div>
              <div className="stat-text">命中</div>
            </div>
            <div className="buffer-stat-card">
              <div className="stat-number">{stats?.misses ?? 0}</div>
              <div className="stat-text">未命中</div>
            </div>
            <div className="buffer-stat-card">
              <div className="stat-number">{stats?.evictions ?? 0}</div>
              <div className="stat-text">置换次数</div>
            </div>
            <div className="buffer-stat-card">
              <div className="stat-number">{stats?.dirty_pages ?? 0}</div>
              <div className="stat-text">脏页</div>
            </div>
          </div>

          <div className="buffer-controls" style={{ marginTop: "12px" }}>
            <h3 style={{ margin: 0 }}>缓冲页状态 (LRU置换)</h3>
            <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                命中率: {hitRate}%
              </span>
              <input
                type="number"
                min={0}
                placeholder="输入块号"
                value={blockInput}
                onChange={e => setBlockInput(e.target.value)}
                style={{ width: "140px", padding: "6px 8px", background: "var(--bg-tertiary)", border: "1px solid var(--border-color)", borderRadius: "6px", color: "var(--text-primary)" }}
              />
              <button className="btn-primary" onClick={handleAccessBlock} disabled={accessLoading}>
                {accessLoading ? "访问中..." : "访问块并可能置换"}
              </button>
              <button className="btn-secondary" onClick={loadStatus}>刷新</button>
              <button className="btn-primary" onClick={handleFlush}>写回脏页</button>
            </div>
          </div>

          <div className="buffer-pages">
            {pages.length === 0 ? (
              <div
                style={{
                  gridColumn: "1 / -1",
                  padding: "12px",
                  border: "1px dashed var(--border-color)",
                  borderRadius: "8px",
                  color: "var(--text-muted)",
                  textAlign: "center"
                }}
              >
                暂无缓冲页数据，请确认后端缓冲服务已启动并返回状态
              </div>
            ) : (
              pages.map(page => (
                <div
                  key={page.page_id}
                  className={`buffer-page ${page.state.toLowerCase()}`}
                  style={{
                    position: "relative",
                    cursor: "pointer",
                    transition: "transform 0.2s"
                  }}
                  title={`页 #${page.page_id}\n块: ${page.block_id >= 0 ? page.block_id : "无"}\n状态: ${page.state}\n所有者: ${page.owner >= 0 ? `PID ${page.owner}` : "无"}\n访问次数: ${page.access_count}\n数据: ${page.data_preview || "空"}`}
                >
                  <div className="page-id" style={{ fontWeight: "bold" }}>页 #{page.page_id}</div>
                  <div className="page-block">{page.block_id >= 0 ? `块 #${page.block_id}` : "空闲"}</div>
                  <div
                    className={`page-state ${page.state}`}
                    style={{
                      padding: "2px 6px",
                      borderRadius: "4px",
                      fontSize: "10px",
                      background: page.state === "DIRTY" ? "#ff4757" : page.state === "CLEAN" ? "#2ed573" : "#576574",
                      color: "white"
                    }}
                  >
                    {page.state}
                  </div>
                  {page.owner >= 0 && (
                    <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "4px" }}>
                      PID: {page.owner}
                    </div>
                  )}
                  {page.is_pinned && (
                    <div
                      style={{
                        position: "absolute",
                        top: "4px",
                        right: "4px",
                        fontSize: "10px",
                        background: "#ffa502",
                        color: "white",
                        padding: "1px 4px",
                        borderRadius: "4px"
                      }}
                    >
                      PIN
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          <div
            style={{
              marginTop: "12px",
              padding: "8px",
              background: "var(--bg-color)",
              borderRadius: "8px",
              fontSize: "12px",
              color: "var(--text-secondary)"
            }}
          >
            <strong>图例:</strong>
            <span style={{ marginLeft: "12px" }}>
              <span style={{ background: "#576574", color: "white", padding: "2px 6px", borderRadius: "4px", marginRight: "8px" }}>FREE</span>
              空闲页
            </span>
            <span style={{ marginLeft: "12px" }}>
              <span style={{ background: "#2ed573", color: "white", padding: "2px 6px", borderRadius: "4px", marginRight: "8px" }}>CLEAN</span>
              干净页(与磁盘一致)
            </span>
            <span style={{ marginLeft: "12px" }}>
              <span style={{ background: "#ff4757", color: "white", padding: "2px 6px", borderRadius: "4px", marginRight: "8px" }}>DIRTY</span>
              脏页(需写回)
            </span>
          </div>
        </div>

        <div className="buffer-log-container">
          <h3>置换日志</h3>
          <div className="buffer-log">
            {logs.length === 0 ? (
              <div style={{ color: "var(--text-muted)" }}>暂无日志</div>
            ) : (
              logs
                .slice(-20)
                .reverse()
                .map((log, index) => (
                  <div key={index} className="buffer-log-item">
                    <span style={{ color: "var(--text-muted)" }}>{formatTimestamp(log.timestamp)}</span>
                    <span style={{ color: "var(--accent-primary)" }}>{log.type}</span>
                    <span>页{log.page_id} &lt;-&gt; 块{log.block_id}</span>
                  </div>
                ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
