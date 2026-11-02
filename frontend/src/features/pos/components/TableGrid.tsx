import React, { useState, useMemo } from 'react';
import type { DiningTableData } from '../types';
import { Search, PlusCircle, ShoppingBag, Clock, ArrowRightLeft, CheckCircle } from 'lucide-react';
import { Button } from '../../../shared/components/Button';
import { apiClient } from '../../../shared/api/client';
import { useIsMobile } from '../../../shared/hooks/useIsMobile';

interface TableGridProps {
  tables: DiningTableData[];
  loading: boolean;
  onOpenSession: (table: DiningTableData) => void;
  onSelectTableForOrder: (table: DiningTableData) => void;
  onSelectTableForBilling?: (table: DiningTableData) => void;
  onOpenMergeModal: () => void;
  onOpenSplitModal?: (table: DiningTableData) => void;
  onRefreshTables?: () => void;
}

export const TableGrid: React.FC<TableGridProps> = ({
  tables,
  loading,
  onOpenSession,
  onSelectTableForOrder,
  onSelectTableForBilling,
  onOpenMergeModal,
  onOpenSplitModal: _onOpenSplitModal,
  onRefreshTables,
}) => {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'UNPAID' | 'PAID' | 'AVAILABLE'>('ALL');
  const [closingSessionId, setClosingSessionId] = useState<string | null>(null);

  const unpaidCount = useMemo(
    () => tables.filter((t) => t.status === 'OCCUPIED' && t.payment_status !== 'PAID').length,
    [tables]
  );
  const paidCount = useMemo(
    () => tables.filter((t) => t.status === 'OCCUPIED' && t.payment_status === 'PAID').length,
    [tables]
  );
  const availableCount = useMemo(() => tables.filter((t) => t.status === 'AVAILABLE').length, [tables]);

  const filteredTables = useMemo(() => {
    return tables.filter((table) => {
      const isPaid = table.status === 'OCCUPIED' && table.payment_status === 'PAID';
      const isUnpaid = table.status === 'OCCUPIED' && table.payment_status !== 'PAID';

      const matchFilter =
        filter === 'ALL' ||
        (filter === 'UNPAID' && isUnpaid) ||
        (filter === 'PAID' && isPaid) ||
        (filter === 'AVAILABLE' && table.status === 'AVAILABLE');

      const matchSearch =
        table.code.toLowerCase().includes(search.toLowerCase()) ||
        table.display_name.toLowerCase().includes(search.toLowerCase());

      return matchFilter && matchSearch;
    });
  }, [tables, filter, search]);

  const formatElapsed = (openedAt?: string | null) => {
    if (!openedAt) return null;
    const diffMs = Date.now() - new Date(openedAt).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) return `${diffMins}p`;
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    return `${hours}h ${mins}p`;
  };

  const formatCurrency = (val?: number | null) => {
    if (val === undefined || val === null) return '0đ';
    return `${Math.round(val).toLocaleString('vi-VN')}đ`;
  };

  const handleQuickCloseSession = async (e: React.MouseEvent, table: DiningTableData) => {
    e.stopPropagation();
    if (!table.active_session_id || closingSessionId) return;
    const confirmMsg = `Xác nhận dọn dẹp và hoàn tất bàn ${table.code} để đưa về trạng thái TRỐNG đón khách mới?`;
    if (!window.confirm(confirmMsg)) return;

    setClosingSessionId(table.active_session_id);
    try {
      await apiClient.post(`/sessions/${table.active_session_id}/close`);
      if (onRefreshTables) {
        onRefreshTables();
      }
    } catch (err) {
      console.error('Failed to close session', err);
      alert('Không thể hoàn tất bàn. Vui lòng thử lại!');
    } finally {
      setClosingSessionId(null);
    }
  };

  return (
    <div>
      {/* Top Bar with Status Filters & Actions */}
      <div
        style={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          alignItems: isMobile ? 'stretch' : 'center',
          justifyContent: 'space-between',
          gap: isMobile ? '0.65rem' : '1rem',
          marginBottom: isMobile ? '0.85rem' : '1.25rem',
        }}
      >
        <div
          className="mobile-scroll-x"
          style={{
            display: 'flex',
            gap: '0.4rem',
            width: isMobile ? '100%' : 'auto',
            paddingBottom: isMobile ? '0.25rem' : 0,
            flexWrap: isMobile ? 'nowrap' : 'wrap',
          }}
        >
          <button
            onClick={() => setFilter('ALL')}
            style={{
              flexShrink: 0,
              padding: isMobile ? '0.45rem 0.75rem' : '0.5rem 1rem',
              borderRadius: 'var(--radius-md)',
              background: filter === 'ALL' ? 'var(--accent-gold)' : 'var(--bg-tertiary)',
              color: filter === 'ALL' ? '#ffffff' : 'var(--text-secondary)',
              fontWeight: 700,
              fontSize: isMobile ? '0.8rem' : '0.85rem',
              border: '1px solid var(--border-subtle)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              whiteSpace: 'nowrap',
            }}
          >
            Tất cả ({tables.length})
          </button>

          <button
            onClick={() => setFilter('UNPAID')}
            style={{
              flexShrink: 0,
              padding: isMobile ? '0.45rem 0.75rem' : '0.5rem 1rem',
              borderRadius: 'var(--radius-md)',
              background: filter === 'UNPAID' ? '#fef3c7' : 'var(--bg-tertiary)',
              color: filter === 'UNPAID' ? '#92400e' : 'var(--text-secondary)',
              fontWeight: 700,
              fontSize: isMobile ? '0.8rem' : '0.85rem',
              border: filter === 'UNPAID' ? '1.5px solid #d97706' : '1px solid var(--border-subtle)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              whiteSpace: 'nowrap',
            }}
          >
            🟡 Chưa TT ({unpaidCount})
          </button>

          <button
            onClick={() => setFilter('PAID')}
            style={{
              flexShrink: 0,
              padding: isMobile ? '0.45rem 0.75rem' : '0.5rem 1rem',
              borderRadius: 'var(--radius-md)',
              background: filter === 'PAID' ? '#d1fae5' : 'var(--bg-tertiary)',
              color: filter === 'PAID' ? '#065f46' : 'var(--text-secondary)',
              fontWeight: 700,
              fontSize: isMobile ? '0.8rem' : '0.85rem',
              border: filter === 'PAID' ? '1.5px solid #059669' : '1px solid var(--border-subtle)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              whiteSpace: 'nowrap',
            }}
          >
            🟢 Đã TT ({paidCount})
          </button>

          <button
            onClick={() => setFilter('AVAILABLE')}
            style={{
              flexShrink: 0,
              padding: isMobile ? '0.45rem 0.75rem' : '0.5rem 1rem',
              borderRadius: 'var(--radius-md)',
              background: filter === 'AVAILABLE' ? '#f1f5f9' : 'var(--bg-tertiary)',
              color: filter === 'AVAILABLE' ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontWeight: 700,
              fontSize: isMobile ? '0.8rem' : '0.85rem',
              border: filter === 'AVAILABLE' ? '1.5px solid #64748b' : '1px solid var(--border-subtle)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              whiteSpace: 'nowrap',
            }}
          >
            ⚪ Bàn trống ({availableCount})
          </button>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', width: isMobile ? '100%' : 'auto' }}>
          <div style={{ position: 'relative', flex: isMobile ? 1 : undefined, width: isMobile ? 'auto' : '220px' }}>
            <Search
              size={16}
              style={{
                position: 'absolute',
                left: '0.75rem',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
              }}
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm số bàn..."
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem 0.5rem 2.25rem',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
                fontSize: '0.85rem',
                outline: 'none',
              }}
            />
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={onOpenMergeModal}
            icon={<ArrowRightLeft size={15} />}
          >
            Gộp bàn
          </Button>
        </div>
      </div>

      {loading && tables.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
          Đang tải dữ liệu 50 bàn...
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile
              ? 'repeat(auto-fill, minmax(130px, 1fr))'
              : 'repeat(auto-fill, minmax(150px, 1fr))',
            gap: isMobile ? '0.55rem' : '0.85rem',
          }}
        >
          {filteredTables.map((table) => {
            const isOccupied = table.status === 'OCCUPIED';
            const isPaid = isOccupied && table.payment_status === 'PAID';
            const isUnpaid = isOccupied && !isPaid;
            const elapsed = formatElapsed(table.session_opened_at);

            return (
              <div
                key={table.id}
                className="glass-panel"
                onClick={() => {
                  if (isPaid && onSelectTableForBilling) {
                    onSelectTableForBilling(table);
                  } else if (isOccupied) {
                    onSelectTableForOrder(table);
                  } else {
                    onOpenSession(table);
                  }
                }}
                style={{
                  padding: isMobile ? '0.65rem 0.55rem' : '0.85rem 0.75rem',
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                  border: isPaid
                    ? '1.5px solid #10b981'
                    : isUnpaid
                    ? '1.5px solid #f59e0b'
                    : '1px solid var(--border-subtle)',
                  background: isPaid ? '#f0fdf4' : isUnpaid ? '#fffbeb' : '#ffffff',
                  boxShadow: isPaid
                    ? '0 4px 12px rgba(16, 185, 129, 0.12)'
                    : isUnpaid
                    ? '0 4px 12px rgba(217, 119, 6, 0.12)'
                    : 'var(--shadow-card)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  minHeight: '140px',
                  position: 'relative',
                  overflow: 'hidden',
                  transition: 'all 0.15s ease',
                }}
              >
                {/* Status Top Indicator Bar */}
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: '4px',
                    background: isPaid ? '#10b981' : isUnpaid ? '#f59e0b' : '#cbd5e1',
                  }}
                />

                {/* Header: Table Code & Status Badge */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '1.2rem', fontWeight: 900, color: 'var(--text-primary)' }}>
                    {table.code}
                  </span>
                  <span
                    style={{
                      fontSize: '0.65rem',
                      fontWeight: 800,
                      padding: '0.15rem 0.45rem',
                      borderRadius: 'var(--radius-sm)',
                      background: isPaid ? '#d1fae5' : isUnpaid ? '#fef3c7' : '#f1f5f9',
                      color: isPaid ? '#065f46' : isUnpaid ? '#92400e' : '#64748b',
                      border: isPaid ? '1px solid #10b981' : isUnpaid ? '1px solid #f59e0b' : '1px solid #cbd5e1',
                    }}
                  >
                    {isPaid ? 'ĐÃ TT' : isUnpaid ? 'CHƯA TT' : 'TRỐNG'}
                  </span>
                </div>

                {/* Table Name & Merged indicator */}
                <div style={{ margin: '0.25rem 0' }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                    {table.display_name}
                  </div>
                  {table.active_table_codes && table.active_table_codes.length > 1 && (
                    <div style={{ fontSize: '0.675rem', color: '#b45309', fontWeight: 700, marginTop: '0.1rem' }}>
                      Gộp: {table.active_table_codes.join(', ')}
                    </div>
                  )}
                  {isPaid && table.invoice_number && (
                    <div style={{ fontSize: '0.675rem', color: '#047857', fontWeight: 700, marginTop: '0.1rem' }}>
                      HĐ: {table.invoice_number}
                    </div>
                  )}
                </div>

                {/* Body Details: Amounts, Elapsed Time, or Free Action */}
                {isPaid ? (
                  <div>
                    <div
                      style={{
                        fontSize: '0.9rem',
                        fontWeight: 900,
                        color: '#047857',
                        letterSpacing: '-0.01em',
                      }}
                    >
                      {formatCurrency(table.running_subtotal)}
                    </div>
                    <button
                      onClick={(e) => handleQuickCloseSession(e, table)}
                      disabled={closingSessionId === table.active_session_id}
                      title="Dọn bàn và đưa về trạng thái trống"
                      style={{
                        width: '100%',
                        marginTop: '0.35rem',
                        padding: '0.35rem 0.5rem',
                        borderRadius: 'var(--radius-sm)',
                        background: '#10b981',
                        color: '#ffffff',
                        border: 'none',
                        fontSize: '0.725rem',
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.25rem',
                        boxShadow: '0 2px 5px rgba(16, 185, 129, 0.3)',
                      }}
                    >
                      <CheckCircle size={12} />
                      <span>{closingSessionId === table.active_session_id ? 'Đang đóng...' : 'Dọn bàn / Trả'}</span>
                    </button>
                  </div>
                ) : isUnpaid ? (
                  <div>
                    <div
                      style={{
                        fontSize: '0.95rem',
                        fontWeight: 900,
                        color: 'var(--accent-gold)',
                        letterSpacing: '-0.01em',
                      }}
                    >
                      {formatCurrency(table.running_subtotal)}
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: '0.7rem',
                        color: 'var(--text-muted)',
                        marginTop: '0.2rem',
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                        <ShoppingBag size={11} /> {table.order_count ?? 0} đợt
                      </span>
                      {elapsed && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                          <Clock size={11} /> {elapsed}
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      color: '#059669',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      paddingTop: '0.5rem',
                    }}
                  >
                    <PlusCircle size={14} />
                    <span>Chạm mở bàn</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
