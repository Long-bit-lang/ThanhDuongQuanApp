import React, { useState } from 'react';
import type { DiningTableData, OrderItemData } from '../types';
import { apiClient } from '../../../shared/api/client';
import { X, ArrowRightLeft, Split, CheckSquare, Square } from 'lucide-react';
import { Button } from '../../../shared/components/Button';
import { useIsMobile } from '../../../shared/hooks/useIsMobile';
import { formatCurrency, formatQuantity } from '../../../shared/utils/formatters';

interface MergeSplitModalProps {
  mode: 'MERGE' | 'SPLIT';
  tables: DiningTableData[];
  selectedTable?: DiningTableData;
  splitItems?: OrderItemData[];
  onClose: () => void;
  onSuccess: () => void;
}

export const MergeSplitModal: React.FC<MergeSplitModalProps> = ({
  mode,
  tables,
  selectedTable,
  splitItems = [],
  onClose,
  onSuccess,
}) => {
  const isMobile = useIsMobile();
  // Merge state: select multiple occupied tables
  const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>([]);

  // Split state
  const [targetTableId, setTargetTableId] = useState<string>('');
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const occupiedTables = tables.filter((t) => t.status === 'OCCUPIED' && t.active_session_id);
  const availableTables = tables.filter((t) => t.status === 'AVAILABLE');

  const toggleSessionSelection = (sessionId: string) => {
    setSelectedSessionIds((prev) =>
      prev.includes(sessionId) ? prev.filter((id) => id !== sessionId) : [...prev, sessionId]
    );
  };

  const toggleItemSelection = (itemId: string) => {
    setSelectedItemIds((prev) =>
      prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId]
    );
  };

  const handleMerge = async () => {
    if (selectedSessionIds.length < 2 || loading) return;
    setLoading(true);
    setError(null);
    try {
      await apiClient.post('/sessions/merge', {
        session_ids: selectedSessionIds,
      });
      onSuccess();
      onClose();
    } catch (err: unknown) {
      console.error('Merge failed', err);
      setError('Gộp bàn thất bại. Vui lòng đảm bảo các bàn đều đang mở phiên phục vụ!');
    } finally {
      setLoading(false);
    }
  };

  const handleSplit = async () => {
    if (!selectedTable?.active_session_id || !targetTableId || selectedItemIds.length === 0 || loading) return;
    setLoading(true);
    setError(null);
    try {
      await apiClient.post('/sessions/split', {
        source_session_id: selectedTable.active_session_id,
        target_table_id: targetTableId,
        order_item_ids: selectedItemIds,
      });
      onSuccess();
      onClose();
    } catch (err: unknown) {
      console.error('Split failed', err);
      setError('Tách bàn thất bại. Vui lòng kiểm tra lại bàn đích và danh sách món!');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="modal-overlay-responsive"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(8px)',
        zIndex: 1150,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: isMobile ? 0 : '1rem',
      }}
    >
      <div
        className="glass-panel modal-container-responsive"
        style={{
          width: '100%',
          maxWidth: isMobile ? '100vw' : '540px',
          height: isMobile ? '100dvh' : undefined,
          maxHeight: isMobile ? '100dvh' : '92vh',
          overflowY: 'auto',
          padding: isMobile
            ? 'calc(env(safe-area-inset-top, 0px) + 0.85rem) 1rem calc(env(safe-area-inset-bottom, 0px) + 1.25rem) 1rem'
            : '2rem',
          borderRadius: isMobile ? 0 : 'var(--radius-xl)',
          border: isMobile ? 'none' : '1px solid var(--border-subtle)',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.5)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {mode === 'MERGE' ? <ArrowRightLeft size={22} color="var(--accent-gold)" /> : <Split size={22} color="var(--accent-gold)" />}
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800 }}>
              {mode === 'MERGE' ? 'Gộp Phiên Nhiều Bàn' : `Tách Món Từ Bàn ${selectedTable?.code}`}
            </h2>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: 'none',
              color: 'var(--text-secondary)',
              borderRadius: '50%',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {error && (
          <div
            style={{
              padding: '0.75rem',
              borderRadius: 'var(--radius-md)',
              background: 'var(--status-danger-bg)',
              border: '1px solid var(--status-danger)',
              color: '#fca5a5',
              fontSize: '0.85rem',
              marginBottom: '1rem',
            }}
          >
            {error}
          </div>
        )}

        {mode === 'MERGE' ? (
          /* MERGE FORM */
          <div>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              Chọn từ 2 bàn đang phục vụ trở lên để gộp thành 1 phiên chung. Bàn đầu tiên được chọn sẽ là bàn chính.
            </p>

            <div
              style={{
                maxHeight: '260px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
                marginBottom: '1.5rem',
              }}
            >
              {occupiedTables.length < 2 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                  Cần ít nhất 2 bàn đang có khách để thực hiện gộp bàn.
                </div>
              ) : (
                occupiedTables.map((t) => {
                  const isSelected = selectedSessionIds.includes(t.active_session_id!);
                  return (
                    <div
                      key={t.id}
                      onClick={() => toggleSessionSelection(t.active_session_id!)}
                      style={{
                        padding: '0.75rem 1rem',
                        borderRadius: 'var(--radius-md)',
                        background: isSelected ? 'rgba(245, 158, 11, 0.2)' : 'var(--bg-tertiary)',
                        border: isSelected ? '1px solid var(--accent-gold)' : '1px solid var(--border-subtle)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        {isSelected ? <CheckSquare size={18} color="var(--accent-gold)" /> : <Square size={18} color="var(--text-muted)" />}
                        <span style={{ fontWeight: 800, fontSize: '0.95rem' }}>{t.code} - {t.display_name}</span>
                      </div>
                      <span style={{ fontWeight: 700, color: 'var(--accent-gold)', fontSize: '0.85rem' }}>
                        {Math.round(t.running_subtotal ?? 0).toLocaleString('vi-VN')}đ
                      </span>
                    </div>
                  );
                })
              )}
            </div>

            <Button
              variant="primary"
              size="lg"
              disabled={selectedSessionIds.length < 2 || loading}
              onClick={handleMerge}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              {loading ? 'Đang gộp...' : `Xác Nhận Gộp (${selectedSessionIds.length} Bàn)`}
            </Button>
          </div>
        ) : (
          /* SPLIT FORM */
          <div>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              Chọn các món cần chuyển sang một bàn trống mới:
            </p>

            {/* Target Table Dropdown */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
                Chọn bàn đích (Bàn trống):
              </label>
              <select
                value={targetTableId}
                onChange={(e) => setTargetTableId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.7rem 0.75rem',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  outline: 'none',
                }}
              >
                <option value="">-- Chọn bàn trống --</option>
                {availableTables.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.code} - {t.display_name}
                  </option>
                ))}
              </select>
            </div>

            {/* Items checklist */}
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
              Chọn các món cần tách ({selectedItemIds.length}/{splitItems.length}):
            </label>
            <div
              style={{
                maxHeight: '200px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
                marginBottom: '1.5rem',
              }}
            >
              {splitItems.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1.5rem' }}>
                  Bàn này chưa có món nào để tách.
                </div>
              ) : (
                splitItems.map((it) => {
                  const isSelected = selectedItemIds.includes(it.id);
                  return (
                    <div
                      key={it.id}
                      onClick={() => toggleItemSelection(it.id)}
                      style={{
                        padding: '0.75rem',
                        borderRadius: 'var(--radius-md)',
                        background: isSelected ? 'rgba(245, 158, 11, 0.2)' : 'var(--bg-tertiary)',
                        border: isSelected ? '1px solid var(--accent-gold)' : '1px solid var(--border-subtle)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {isSelected ? <CheckSquare size={16} color="var(--accent-gold)" /> : <Square size={16} color="var(--text-muted)" />}
                        <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                          {it.product_name} (x{formatQuantity(it.quantity)})
                        </span>
                      </div>
                      <span style={{ fontWeight: 700, color: 'var(--accent-gold)', fontSize: '0.85rem' }}>
                        {formatCurrency(it.line_total)}
                      </span>
                    </div>
                  );
                })
              )}
            </div>

            <Button
              variant="primary"
              size="lg"
              disabled={!targetTableId || selectedItemIds.length === 0 || loading}
              onClick={handleSplit}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              {loading ? 'Đang tách...' : `Xác Nhận Tách (${selectedItemIds.length} Món)`}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
