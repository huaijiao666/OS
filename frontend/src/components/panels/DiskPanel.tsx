import { useState, useEffect, useCallback } from 'react';
import { getDiskBitmap, getDiskBlock } from '../../services/api';

const SUPERBLOCK_BLOCKS = 1;
const BITMAP_BLOCKS = 2;
const INODE_BLOCKS = 32;
const DATA_START = SUPERBLOCK_BLOCKS + BITMAP_BLOCKS + INODE_BLOCKS;

interface InodeInfo {
  inode_id: number;
  type: string;
  size: number;
}

interface BlockDetail {
  id: number;
  hex: string;
  text: string;
  blockType: string;
}

interface InodeDetail {
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
}

export default function DiskPanel() {
  const [bitmap, setBitmap] = useState<number[]>([]);
  const [selectedBlock, setSelectedBlock] = useState<BlockDetail | null>(null);
  const [inodes, setInodes] = useState<InodeInfo[]>([]);
  const [selectedInode, setSelectedInode] = useState<InodeDetail | null>(null);
  const [viewMode, setViewMode] = useState<'bitmap' | 'inodes'>('bitmap');

  const loadBitmap = useCallback(async () => {
    try {
      const data = await getDiskBitmap();
      setBitmap(data.bitmap || []);
    } catch (error) {
      console.error('加载磁盘位图失败:', error);
    }
  }, []);

  const loadInodes = useCallback(async () => {
    try {
      const resp = await fetch('/api/inode/list');
      const data = await resp.json();
      if (data.success) {
        setInodes(data.inodes || []);
      }
    } catch (error) {
      console.error('加载iNode列表失败:', error);
    }
  }, []);

  useEffect(() => {
    loadBitmap();
    loadInodes();
  }, [loadBitmap, loadInodes]);

  const handleBlockClick = useCallback(async (blockId: number) => {
    try {
      const data = await getDiskBlock(blockId);
      if (data.success) {
        let blockType = '数据块';
        if (blockId < SUPERBLOCK_BLOCKS) blockType = '超级块';
        else if (blockId < SUPERBLOCK_BLOCKS + BITMAP_BLOCKS) blockType = '位图块';
        else if (blockId < DATA_START) blockType = 'iNode块';
        
        setSelectedBlock({
          id: blockId,
          hex: data.data,
          text: data.text,
          blockType,
        });
        setSelectedInode(null);
      }
    } catch (error) {
      console.error('读取块失败:', error);
    }
  }, []);

  const handleInodeClick = useCallback(async (inodeId: number) => {
    try {
      const resp = await fetch(`/api/inode/${inodeId}`);
      const data = await resp.json();
      if (data.success) {
        setSelectedInode(data);
        setSelectedBlock(null);
      }
    } catch (error) {
      console.error('读取iNode失败:', error);
    }
  }, []);

  const getBlockClass = (index: number, used: number): string => {
    if (index < SUPERBLOCK_BLOCKS) return 'superblock';
    if (index < SUPERBLOCK_BLOCKS + BITMAP_BLOCKS) return 'bitmap';
    if (index < DATA_START) return 'inode';
    return used ? 'used' : 'free';
  };

  const formatTime = (timestamp: number): string => {
    if (!timestamp) return '-';
    return new Date(timestamp * 1000).toLocaleString('zh-CN');
  };

  const formatPermissions = (perm: number): string => {
    const r = perm & 0b100 ? 'r' : '-';
    const w = perm & 0b010 ? 'w' : '-';
    const x = perm & 0b001 ? 'x' : '-';
    return r + w + x;
  };

  const refreshAll = useCallback(() => {
    loadBitmap();
    loadInodes();
  }, [loadBitmap, loadInodes]);

  return (
    <section className="panel active">
      <div className="disk-container">
        <div className="disk-info-bar">
          <div className="disk-stat">
            <span className="disk-stat-label">总容量</span>
            <span className="disk-stat-value">64 KB</span>
          </div>
          <div className="disk-stat">
            <span className="disk-stat-label">块大小</span>
            <span className="disk-stat-value">64 B</span>
          </div>
          <div className="disk-stat">
            <span className="disk-stat-label">总块数</span>
            <span className="disk-stat-value">1024</span>
          </div>
          <div className="disk-stat">
            <span className="disk-stat-label">已使用</span>
            <span className="disk-stat-value">{bitmap.filter(b => b).length}</span>
          </div>
          <div className="disk-stat">
            <span className="disk-stat-label">iNode</span>
            <span className="disk-stat-value">{inodes.length}/32</span>
          </div>
          <button className="btn-secondary" onClick={refreshAll} style={{ marginLeft: 'auto' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '16px', height: '16px' }}>
              <polyline points="23 4 23 10 17 10"/>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
            刷新
          </button>
        </div>

        {/* 视图切换标签 */}
        <div className="disk-tabs" style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
          <button 
            className={`btn-secondary ${viewMode === 'bitmap' ? 'active' : ''}`}
            onClick={() => setViewMode('bitmap')}
            style={{ 
              background: viewMode === 'bitmap' ? 'var(--accent-color)' : 'var(--card-bg)',
              color: viewMode === 'bitmap' ? 'white' : 'var(--text-color)'
            }}
          >
            磁盘位图
          </button>
          <button 
            className={`btn-secondary ${viewMode === 'inodes' ? 'active' : ''}`}
            onClick={() => setViewMode('inodes')}
            style={{ 
              background: viewMode === 'inodes' ? 'var(--accent-color)' : 'var(--card-bg)',
              color: viewMode === 'inodes' ? 'white' : 'var(--text-color)'
            }}
          >
            iNode列表 ({inodes.length})
          </button>
        </div>

        {viewMode === 'bitmap' && (
          <>
            <div className="disk-legend">
              <div className="legend-item">
                <span className="legend-color superblock"></span>
                <span>超级块</span>
              </div>
              <div className="legend-item">
                <span className="legend-color bitmap"></span>
                <span>位图区</span>
              </div>
              <div className="legend-item">
                <span className="legend-color inode"></span>
                <span>iNode区</span>
              </div>
              <div className="legend-item">
                <span className="legend-color used"></span>
                <span>已使用</span>
              </div>
              <div className="legend-item">
                <span className="legend-color free"></span>
                <span>空闲</span>
              </div>
            </div>

            <div className="disk-bitmap-container">
              <div className="disk-bitmap">
                {bitmap.map((used, index) => (
                  <div
                    key={index}
                    className={`bitmap-block ${getBlockClass(index, used)}`}
                    title={`块 #${index}${index < DATA_START ? ` (${index < SUPERBLOCK_BLOCKS ? '超级块' : index < SUPERBLOCK_BLOCKS + BITMAP_BLOCKS ? '位图' : 'iNode'})` : ''}`}
                    onClick={() => handleBlockClick(index)}
                  />
                ))}
              </div>
            </div>
          </>
        )}

        {viewMode === 'inodes' && (
          <div className="inode-list" style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', 
            gap: '8px',
            maxHeight: '300px',
            overflowY: 'auto',
            padding: '8px'
          }}>
            {inodes.map((inode) => (
              <div
                key={inode.inode_id}
                className="inode-item"
                onClick={() => handleInodeClick(inode.inode_id)}
                style={{
                  padding: '12px',
                  background: 'var(--card-bg)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  border: selectedInode?.inode_id === inode.inode_id ? '2px solid var(--accent-color)' : '1px solid var(--border-color)',
                  transition: 'all 0.2s'
                }}
              >
                <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                  iNode #{inode.inode_id}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {inode.type} | {inode.size}B
                </div>
              </div>
            ))}
            {inodes.length === 0 && (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                暂无使用中的iNode
              </div>
            )}
          </div>
        )}

        {/* 块详情 */}
        {selectedBlock && (
          <div className="block-detail" style={{ display: 'block', marginTop: '16px' }}>
            <div className="detail-header">
              <h4>块 #{selectedBlock.id} ({selectedBlock.blockType})</h4>
              <button className="btn-icon" onClick={() => setSelectedBlock(null)}>×</button>
            </div>
            <div className="detail-content">
              <div style={{ marginBottom: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                十六进制内容 (64字节):
              </div>
              <div className="detail-hex" style={{ 
                fontFamily: 'monospace', 
                background: 'var(--bg-color)', 
                padding: '8px', 
                borderRadius: '4px',
                wordBreak: 'break-all',
                fontSize: '11px'
              }}>
                {selectedBlock.hex}
              </div>
              <div style={{ marginTop: '12px', marginBottom: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                文本内容:
              </div>
              <div className="detail-text" style={{ 
                fontFamily: 'monospace', 
                background: 'var(--bg-color)', 
                padding: '8px', 
                borderRadius: '4px',
                whiteSpace: 'pre-wrap'
              }}>
                {selectedBlock.text || '(空或二进制数据)'}
              </div>
            </div>
          </div>
        )}

        {/* iNode详情 */}
        {selectedInode && (
          <div className="inode-detail" style={{ 
            display: 'block', 
            marginTop: '16px',
            background: 'var(--card-bg)',
            borderRadius: '8px',
            padding: '16px'
          }}>
            <div className="detail-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h4 style={{ margin: 0 }}>iNode #{selectedInode.inode_id} 详细信息</h4>
              <button className="btn-icon" onClick={() => setSelectedInode(null)}>×</button>
            </div>
            <div className="detail-content" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div><strong>类型:</strong> {selectedInode.type}</div>
              <div><strong>权限:</strong> {formatPermissions(selectedInode.permissions)}</div>
              <div><strong>大小:</strong> {selectedInode.size} 字节</div>
              <div><strong>链接数:</strong> {selectedInode.link_count}</div>
              <div><strong>创建时间:</strong> {formatTime(selectedInode.create_time)}</div>
              <div><strong>修改时间:</strong> {formatTime(selectedInode.modify_time)}</div>
              <div style={{ gridColumn: '1 / -1' }}>
                <strong>直接索引块:</strong> [{selectedInode.direct_blocks_used.join(', ') || '无'}]
              </div>
              <div><strong>一级间接索引:</strong> {selectedInode.single_indirect || '无'}</div>
              <div><strong>二级间接索引:</strong> {selectedInode.double_indirect || '无'}</div>
              <div style={{ gridColumn: '1 / -1', marginTop: '8px' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  RAW数据 (64字节):
                </div>
                <div style={{ 
                  fontFamily: 'monospace', 
                  background: 'var(--bg-color)', 
                  padding: '8px', 
                  borderRadius: '4px',
                  wordBreak: 'break-all',
                  fontSize: '10px'
                }}>
                  {selectedInode.raw_hex}
                </div>
              </div>
            </div>
            {/* 快捷按钮：查看关联的块 */}
            {selectedInode.direct_blocks_used.length > 0 && (
              <div style={{ marginTop: '12px' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                  快速查看数据块:
                </div>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  {selectedInode.direct_blocks_used.map(blockId => (
                    <button 
                      key={blockId}
                      className="btn-secondary"
                      onClick={() => handleBlockClick(blockId)}
                      style={{ padding: '4px 8px', fontSize: '12px' }}
                    >
                      块 #{blockId}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
