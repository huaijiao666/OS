import { useState, useEffect, useCallback } from 'react';
import { getDiskBitmap, getDiskBlock } from '../../services/api';

const SUPERBLOCK_BLOCKS = 1;
const BITMAP_BLOCKS = 2;
const INODE_BLOCKS = 32;
const DATA_START = SUPERBLOCK_BLOCKS + BITMAP_BLOCKS + INODE_BLOCKS;

export default function DiskPanel() {
  const [bitmap, setBitmap] = useState<number[]>([]);
  const [selectedBlock, setSelectedBlock] = useState<{ id: number; hex: string; text: string } | null>(null);

  const loadBitmap = useCallback(async () => {
    try {
      const data = await getDiskBitmap();
      setBitmap(data.bitmap || []);
    } catch (error) {
      console.error('加载磁盘位图失败:', error);
    }
  }, []);

  useEffect(() => {
    loadBitmap();
  }, [loadBitmap]);

  const handleBlockClick = useCallback(async (blockId: number) => {
    try {
      const data = await getDiskBlock(blockId);
      if (data.success) {
        setSelectedBlock({
          id: blockId,
          hex: data.data,
          text: data.text,
        });
      }
    } catch (error) {
      console.error('读取块失败:', error);
    }
  }, []);

  const getBlockClass = (index: number, used: number): string => {
    if (index < SUPERBLOCK_BLOCKS) return 'superblock';
    if (index < SUPERBLOCK_BLOCKS + BITMAP_BLOCKS) return 'bitmap';
    if (index < DATA_START) return 'inode';
    return used ? 'used' : 'free';
  };

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
            <span className="disk-stat-label">数据区起始</span>
            <span className="disk-stat-value">{DATA_START}</span>
          </div>
        </div>

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
                title={`块 #${index}`}
                onClick={() => handleBlockClick(index)}
              />
            ))}
          </div>
        </div>

        {selectedBlock && (
          <div className="block-detail" style={{ display: 'block' }}>
            <div className="detail-header">
              <h4>块 #{selectedBlock.id}</h4>
              <button className="btn-icon" onClick={() => setSelectedBlock(null)}>×</button>
            </div>
            <div className="detail-content">
              <div className="detail-hex">{selectedBlock.hex}</div>
              <div className="detail-text">{selectedBlock.text}</div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
