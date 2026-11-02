import React, { useState, useEffect } from 'react';
import type { InvoiceData, SessionDetails } from '../types';
import { apiClient } from '../../../shared/api/client';
import { X, Receipt, Tag, Sliders, CreditCard, Printer, CheckCircle } from 'lucide-react';
import { Button } from '../../../shared/components/Button';
import { useIsMobile } from '../../../shared/hooks/useIsMobile';

interface BillingModalProps {
  sessionDetails: SessionDetails;
  onClose: () => void;
  onProceedToPayment: (invoice: InvoiceData) => void;
  onOpenReceipt: (invoiceId: string) => void;
}

export const BillingModal: React.FC<BillingModalProps> = ({
  sessionDetails,
  onClose,
  onProceedToPayment,
  onOpenReceipt,
}) => {
  const isMobile = useIsMobile();
  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [loading, setLoading] = useState(true);

  // Discount modal state
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [discountType, setDiscountType] = useState<'PERCENT' | 'FIXED'>('PERCENT');
  const [discountValue, setDiscountValue] = useState('10');
  const [discountItemId, setDiscountItemId] = useState<string>('');
  const [submittingDiscount, setSubmittingDiscount] = useState(false);

  // Adjustment modal state
  const [showAdjModal, setShowAdjModal] = useState(false);
  const [adjAmount, setAdjAmount] = useState('0');
  const [adjReason, setAdjReason] = useState('');
  const [submittingAdj, setSubmittingAdj] = useState(false);

  const loadOrCreateInvoice = async () => {
    setLoading(true);
    try {
      // 1. Create or get existing invoice
      const createRes = await apiClient.post<{ id: string; invoice_number: string }>(
        `/sessions/${sessionDetails.id}/invoice`
      );
      // 2. Fetch full invoice details
      const invDetails = await apiClient.get<InvoiceData>(`/invoices/${createRes.id}`);
      setInvoice(invDetails);
    } catch (err) {
      console.error('Failed to create/load invoice', err);
      alert('Không thể tạo hóa đơn cho phiên này. Vui lòng kiểm tra lại!');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrCreateInvoice();
  }, [sessionDetails.id]);

  const handleApplyDiscount = async () => {
    if (!invoice || submittingDiscount) return;
    const val = parseFloat(discountValue);
    if (isNaN(val) || val <= 0) {
      alert('Giá trị giảm giá không hợp lệ!');
      return;
    }
    setSubmittingDiscount(true);
    try {
      await apiClient.post(`/invoices/${invoice.id}/discounts`, {
        discount_type: discountType,
        value: val.toString(),
        invoice_item_id: discountItemId || undefined,
      });
      setShowDiscountModal(false);
      await loadOrCreateInvoice();
    } catch (err) {
      console.error('Failed to apply discount', err);
      alert('Giảm giá không hợp lệ hoặc vượt quá giá trị cho phép!');
    } finally {
      setSubmittingDiscount(false);
    }
  };

  const handleApplyAdjustment = async () => {
    if (!invoice || submittingAdj) return;
    const amountVal = parseFloat(adjAmount);
    if (isNaN(amountVal) || !adjReason.trim()) {
      alert('Vui lòng nhập số tiền điều chỉnh và lý do hợp lệ!');
      return;
    }
    setSubmittingAdj(true);
    try {
      await apiClient.post(`/invoices/${invoice.id}/adjustments`, {
        amount: amountVal.toString(),
        reason: adjReason.trim(),
      });
      setShowAdjModal(false);
      await loadOrCreateInvoice();
    } catch (err) {
      console.error('Failed to apply adjustment', err);
      alert('Không thể thêm điều chỉnh hóa đơn!');
    } finally {
      setSubmittingAdj(false);
    }
  };

  const formatCurrency = (val?: number) => `${Math.round(val ?? 0).toLocaleString('vi-VN')}đ`;
  const formatQuantity = (qty: number) => {
    if (Number.isInteger(qty)) return qty.toString();
    return parseFloat(qty.toFixed(3)).toString();
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
        zIndex: 1050,
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
          maxWidth: isMobile ? '100vw' : '780px',
          height: isMobile ? '100dvh' : undefined,
          maxHeight: isMobile ? '100dvh' : '90vh',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: isMobile ? 0 : 'var(--radius-xl)',
          overflow: 'hidden',
          background: '#ffffff',
          border: isMobile ? 'none' : '1px solid var(--border-subtle)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.2)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: isMobile ? '0.75rem 1rem' : '1.25rem 1.5rem',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#ffffff',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Receipt size={24} color="var(--accent-gold)" />
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Hóa Đơn Thanh Toán</h2>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--accent-gold)' }}>
                Bàn: {sessionDetails.tables.map((t) => t.display_name.replace(/^Bàn\s+/i, '').trim()).join(', ')}
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'rgba(0, 0, 0, 0.05)',
              border: 'none',
              color: 'var(--text-secondary)',
              borderRadius: '50%',
              width: '36px',
              height: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Invoice Body */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
            Đang tải dữ liệu hóa đơn...
          </div>
        ) : !invoice ? (
          <div style={{ textAlign: 'center', padding: '4rem', color: '#f87171' }}>
            Không thể tải hóa đơn. Vui lòng đóng và thử lại.
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
            {/* Status indicator */}
            {invoice.status === 'PAID' && (
              <div
                style={{
                  padding: '0.75rem 1rem',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--status-success-bg)',
                  border: '1px solid var(--status-success)',
                  color: '#34d399',
                  fontWeight: 700,
                  fontSize: '0.9rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  marginBottom: '1rem',
                }}
              >
                <CheckCircle size={18} />
                <span>Hóa đơn này ĐÃ THANH TOÁN THÀNH CÔNG. Dữ liệu tài chính được bảo toàn bất biến.</span>
              </div>
            )}

            {/* Line items table */}
            <div
              style={{
                borderRadius: 'var(--radius-md)',
                overflow: 'hidden',
                border: '1px solid var(--border-subtle)',
                marginBottom: '1.5rem',
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-subtle)', textAlign: 'left' }}>
                    <th style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>Món</th>
                    <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>SL</th>
                    <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right', color: 'var(--text-secondary)' }}>Đơn giá</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right', color: 'var(--text-secondary)' }}>Thành tiền</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.items?.map((it, idx) => (
                    <tr
                      key={it.id || idx}
                      style={{
                        borderBottom: '1px solid var(--border-subtle)',
                        background: idx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
                      }}
                    >
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>{it.product_name}</td>
                      <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center', fontWeight: 700 }}>{formatQuantity(it.quantity)}</td>
                      <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', color: 'var(--text-secondary)' }}>
                        {formatCurrency(it.unit_price)}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 800, color: 'var(--accent-gold)' }}>
                        {formatCurrency(it.line_total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals Summary Card */}
            <div
              className="glass-panel"
              style={{
                padding: '1.25rem',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(30, 41, 59, 0.4)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                <span>Tổng tiền hàng (Subtotal):</span>
                <span>{formatCurrency(invoice.subtotal)}</span>
              </div>

              {invoice.discount_total > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#f87171' }}>
                  <span>Giảm giá:</span>
                  <span>-{formatCurrency(invoice.discount_total)}</span>
                </div>
              )}

              {invoice.adjustment_total !== 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#fbbf24' }}>
                  <span>Điều chỉnh hóa đơn:</span>
                  <span>{formatCurrency(invoice.adjustment_total)}</span>
                </div>
              )}

              <div
                style={{
                  borderTop: '1px solid var(--border-subtle)',
                  paddingTop: '0.75rem',
                  marginTop: '0.25rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span style={{ fontSize: '1.1rem', fontWeight: 800 }}>TỔNG CẦN THANH TOÁN:</span>
                <span style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--accent-gold)' }}>
                  {formatCurrency(invoice.final_total ?? invoice.total_after_discount)}
                </span>
              </div>
            </div>

            {/* Clean, Large QR Code on Invoice */}
            <div
              style={{
                marginTop: '1.25rem',
                padding: '1.5rem',
                borderRadius: 'var(--radius-md)',
                background: '#ffffff',
                border: '1.5px solid var(--border-subtle)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 15px rgba(0, 0, 0, 0.04)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                <span style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  MÃ QR THANH TOÁN
                </span>
                {invoice.status === 'PAID' ? (
                  <span style={{ padding: '0.2rem 0.6rem', borderRadius: '4px', background: '#d1fae5', color: '#065f46', fontSize: '0.75rem', fontWeight: 800 }}>
                    ✓ ĐÃ THANH TOÁN
                  </span>
                ) : (
                  <span style={{ padding: '0.2rem 0.6rem', borderRadius: '4px', background: '#fef3c7', color: '#92400e', fontSize: '0.75rem', fontWeight: 800 }}>
                    CHỜ THANH TOÁN
                  </span>
                )}
              </div>

              <img
                src="/qr/official_qr.png"
                alt="Mã QR Thanh Toán"
                style={{
                  width: '230px',
                  height: '230px',
                  objectFit: 'contain',
                  borderRadius: '8px',
                  border: '2px solid #111827',
                  padding: '6px',
                  background: '#ffffff',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
                }}
              />

              <div style={{ marginTop: '0.75rem', fontSize: '1.1rem', fontWeight: 900, color: 'var(--accent-gold)' }}>
                {formatCurrency(invoice.final_total ?? invoice.total_after_discount)}
              </div>
            </div>

            {/* Actions for Discounts / Adjustments */}
            {invoice.status !== 'PAID' && (
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem', flexWrap: 'wrap' }}>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowDiscountModal(true)}
                  icon={<Tag size={14} />}
                >
                  Thêm giảm giá
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowAdjModal(true)}
                  icon={<Sliders size={14} />}
                >
                  Điều chỉnh
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        {invoice && (
          <div
            style={{
              padding: isMobile ? '0.85rem 1rem' : '1.25rem 1.5rem',
              borderTop: '1px solid var(--border-subtle)',
              background: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.75rem',
              flexWrap: 'wrap',
            }}
          >
            <Button
              variant="secondary"
              size={isMobile ? 'sm' : 'md'}
              onClick={() => onOpenReceipt(invoice.id)}
              icon={<Printer size={16} />}
            >
              {isMobile ? 'Xem phiếu' : 'Xem & In Phiếu'}
            </Button>

            {invoice.status !== 'PAID' ? (
              <Button
                variant="primary"
                size={isMobile ? 'md' : 'lg'}
                onClick={() => onProceedToPayment(invoice)}
                icon={<CreditCard size={18} />}
              >
                {isMobile ? 'Thanh toán' : 'Xác Nhận & Thanh Toán'}
              </Button>
            ) : (
              <div style={{ fontSize: '0.9rem', color: '#34d399', fontWeight: 700 }}>
                Hóa đơn đã thanh toán
              </div>
            )}
          </div>
        )}

        {/* Discount Sub-modal */}
        {showDiscountModal && invoice && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.85)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '1rem',
              zIndex: 1100,
            }}
          >
            <div
              className="glass-panel"
              style={{
                width: '100%',
                maxWidth: '440px',
                padding: '1.75rem',
                borderRadius: 'var(--radius-lg)',
              }}
            >
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, marginBottom: '1rem' }}>Thêm Giảm Giá</h3>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
                  Loại giảm giá:
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={() => setDiscountType('PERCENT')}
                    style={{
                      padding: '0.6rem',
                      borderRadius: 'var(--radius-sm)',
                      background: discountType === 'PERCENT' ? 'var(--accent-gold)' : 'var(--bg-tertiary)',
                      color: discountType === 'PERCENT' ? '#ffffff' : 'var(--text-primary)',
                      border: 'none',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Phần trăm (%)
                  </button>
                  <button
                    type="button"
                    onClick={() => setDiscountType('FIXED')}
                    style={{
                      padding: '0.6rem',
                      borderRadius: 'var(--radius-sm)',
                      background: discountType === 'FIXED' ? 'var(--accent-gold)' : 'var(--bg-tertiary)',
                      color: discountType === 'FIXED' ? '#ffffff' : 'var(--text-primary)',
                      border: 'none',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Số tiền cố định (đ)
                  </button>
                </div>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
                  {discountType === 'PERCENT' ? 'Phần trăm giảm (1 - 100%):' : 'Số tiền giảm (VND):'}
                </label>
                <input
                  type="number"
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.75rem',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                    fontSize: '1rem',
                    fontWeight: 700,
                    outline: 'none',
                  }}
                />
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
                  Áp dụng cho:
                </label>
                <select
                  value={discountItemId}
                  onChange={(e) => setDiscountItemId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.75rem',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                    fontSize: '0.85rem',
                    outline: 'none',
                  }}
                >
                  <option value="">Toàn bộ hóa đơn</option>
                  {invoice.items?.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.product_name} (x{formatQuantity(it.quantity)} - {formatCurrency(it.line_total)})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <Button variant="secondary" size="md" onClick={() => setShowDiscountModal(false)}>
                  Hủy
                </Button>
                <Button
                  variant="primary"
                  size="md"
                  disabled={submittingDiscount}
                  onClick={handleApplyDiscount}
                >
                  {submittingDiscount ? 'Đang lưu...' : 'Áp Dụng'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Adjustment Sub-modal */}
        {showAdjModal && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.85)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '1rem',
              zIndex: 1100,
            }}
          >
            <div
              className="glass-panel"
              style={{
                width: '100%',
                maxWidth: '440px',
                padding: '1.75rem',
                borderRadius: 'var(--radius-lg)',
              }}
            >
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, marginBottom: '1rem' }}>Điều Chỉnh Hóa Đơn</h3>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
                  Số tiền điều chỉnh (VND, dùng số âm nếu giảm trừ):
                </label>
                <input
                  type="number"
                  value={adjAmount}
                  onChange={(e) => setAdjAmount(e.target.value)}
                  placeholder="Ví dụ: -50000 hoặc 30000"
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.75rem',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                    fontSize: '1rem',
                    fontWeight: 700,
                    outline: 'none',
                  }}
                />
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
                  Lý do điều chỉnh (bắt buộc):
                </label>
                <input
                  type="text"
                  value={adjReason}
                  onChange={(e) => setAdjReason(e.target.value)}
                  placeholder="Ví dụ: Trừ tiền khách quen, phụ thu thêm món ngoài menu..."
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.75rem',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                    fontSize: '0.85rem',
                    outline: 'none',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <Button variant="secondary" size="md" onClick={() => setShowAdjModal(false)}>
                  Hủy
                </Button>
                <Button
                  variant="primary"
                  size="md"
                  disabled={submittingAdj}
                  onClick={handleApplyAdjustment}
                >
                  {submittingAdj ? 'Đang lưu...' : 'Ghi Nhận Điều Chỉnh'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
