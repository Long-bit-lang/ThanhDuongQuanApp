import React, { useState, useEffect, useMemo } from 'react';
import type { InvoiceData, VietQrMockData } from '../types';
import { apiClient } from '../../../shared/api/client';
import { X, Banknote, QrCode, CheckCircle, AlertCircle, Printer, ArrowRight } from 'lucide-react';
import { Button } from '../../../shared/components/Button';
import { useIsMobile } from '../../../shared/hooks/useIsMobile';

interface PaymentModalProps {
  invoice: InvoiceData;
  onClose: () => void;
  onPaymentSuccess: (invoiceId: string) => void;
  onOpenReceipt: (invoiceId: string) => void;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  invoice,
  onClose,
  onPaymentSuccess,
  onOpenReceipt,
}) => {
  const isMobile = useIsMobile();
  const [method, setMethod] = useState<'CASH' | 'VIETQR_MOCK'>('CASH');
  const [vietQrData, setVietQrData] = useState<VietQrMockData | null>(null);
  const [loadingQr, setLoadingQr] = useState(false);

  // Cash calculation
  const totalDue = invoice.final_total ?? invoice.total_after_discount ?? 0;
  const [cashGiven, setCashGiven] = useState(totalDue.toString());

  // Idempotency key generated once per modal session
  const idempotencyKey = useMemo(() => {
    return `PAY_${Date.now()}_${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
  }, []);

  const [processing, setProcessing] = useState(false);
  const [paidSuccess, setPaidSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Load VietQR mock details when method is QR
  useEffect(() => {
    if (method === 'VIETQR_MOCK' && !vietQrData) {
      setLoadingQr(true);
      apiClient
        .get<VietQrMockData>(`/invoices/${invoice.id}/vietqr-mock`)
        .then((data) => setVietQrData(data))
        .catch((err) => console.error('Failed to load VietQR data', err))
        .finally(() => setLoadingQr(false));
    }
  }, [method, invoice.id, vietQrData]);

  const changeDue = useMemo(() => {
    const given = parseFloat(cashGiven) || 0;
    return Math.max(0, given - totalDue);
  }, [cashGiven, totalDue]);

  const handlePay = async () => {
    if (processing || paidSuccess) return;
    setProcessing(true);
    setErrorMessage(null);
    try {
      await apiClient.post(`/invoices/${invoice.id}/payments`, {
        method,
        idempotency_key: idempotencyKey,
      });
      setPaidSuccess(true);
      onPaymentSuccess(invoice.id);
    } catch (err: unknown) {
      console.error('Payment error', err);
      const msg =
        err && typeof err === 'object' && 'body' in err && err.body && typeof err.body === 'object' && 'detail' in err.body
          ? String((err.body as { detail: unknown }).detail)
          : 'Thanh toán thất bại. Vui lòng kiểm tra lại!';
      setErrorMessage(msg);
    } finally {
      setProcessing(false);
    }
  };

  const formatCurrency = (val: number) => `${Math.round(val).toLocaleString('vi-VN')}đ`;

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
        zIndex: 1100,
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
          maxWidth: isMobile ? '100vw' : '560px',
          height: isMobile ? '100dvh' : undefined,
          maxHeight: isMobile ? '100dvh' : '92vh',
          overflowY: 'auto',
          padding: isMobile ? '1.25rem 1rem' : '2rem',
          borderRadius: isMobile ? 0 : 'var(--radius-xl)',
          border: isMobile ? 'none' : '1px solid var(--border-glow)',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.85)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 800 }}>Xác Nhận Thanh Toán</h2>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Số hóa đơn: {invoice.invoice_number}
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
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

        {paidSuccess ? (
          /* Payment Success View */
          <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: 'rgba(16, 185, 129, 0.15)',
                color: '#34d399',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1rem auto',
                border: '2px solid #10b981',
              }}
            >
              <CheckCircle size={36} />
            </div>
            <h3 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
              Thanh Toán Thành Công!
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
              Đã ghi nhận thanh toán <strong>{formatCurrency(totalDue)}</strong> qua{' '}
              {method === 'CASH' ? 'Tiền mặt' : 'VietQR (Mô phỏng)'}. Lịch sử tài chính được bảo toàn bất biến.
            </p>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <Button
                variant="primary"
                size="lg"
                onClick={() => onOpenReceipt(invoice.id)}
                icon={<Printer size={18} />}
              >
                In Hóa Đơn 80mm
              </Button>
              <Button variant="secondary" size="lg" onClick={onClose}>
                Đóng
              </Button>
            </div>
          </div>
        ) : (
          /* Payment Form View */
          <div>
            {/* Amount Banner */}
            <div
              style={{
                padding: '1.25rem',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(245, 158, 11, 0.1)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                textAlign: 'center',
                marginBottom: '1.5rem',
              }}
            >
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Tổng tiền cần thu:</div>
              <div style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--accent-gold)' }}>
                {formatCurrency(totalDue)}
              </div>
            </div>

            {errorMessage && (
              <div
                style={{
                  padding: '0.75rem 1rem',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--status-danger-bg)',
                  border: '1px solid var(--status-danger)',
                  color: '#fca5a5',
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  marginBottom: '1rem',
                }}
              >
                <AlertCircle size={18} />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Method Selector */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.5rem' }}>
              <button
                type="button"
                onClick={() => setMethod('CASH')}
                style={{
                  padding: '1rem',
                  borderRadius: 'var(--radius-md)',
                  background: method === 'CASH' ? 'rgba(245, 158, 11, 0.2)' : 'var(--bg-tertiary)',
                  border: method === 'CASH' ? '2px solid var(--accent-gold)' : '1px solid var(--border-subtle)',
                  color: method === 'CASH' ? 'var(--accent-gold)' : 'var(--text-primary)',
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.5rem',
                  cursor: 'pointer',
                }}
              >
                <Banknote size={24} />
                <span>Tiền Mặt (Cash)</span>
              </button>

              <button
                type="button"
                onClick={() => setMethod('VIETQR_MOCK')}
                style={{
                  padding: '1rem',
                  borderRadius: 'var(--radius-md)',
                  background: method === 'VIETQR_MOCK' ? 'rgba(59, 130, 246, 0.2)' : 'var(--bg-tertiary)',
                  border: method === 'VIETQR_MOCK' ? '2px solid #3b82f6' : '1px solid var(--border-subtle)',
                  color: method === 'VIETQR_MOCK' ? '#60a5fa' : 'var(--text-primary)',
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.5rem',
                  cursor: 'pointer',
                }}
              >
                <QrCode size={24} />
                <span>Chuyển Khoản QR</span>
              </button>
            </div>

            {/* Cash Input */}
            {method === 'CASH' ? (
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
                  Tiền khách đưa:
                </label>
                <input
                  type="number"
                  value={cashGiven}
                  onChange={(e) => setCashGiven(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                    fontSize: '1.25rem',
                    fontWeight: 800,
                    outline: 'none',
                    marginBottom: '0.5rem',
                  }}
                />

                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                  {[totalDue, 50000, 100000, 200000, 500000].map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setCashGiven(preset.toString())}
                      style={{
                        padding: '0.35rem 0.6rem',
                        borderRadius: 'var(--radius-sm)',
                        background: 'rgba(255, 255, 255, 0.08)',
                        border: '1px solid var(--border-subtle)',
                        color: 'var(--text-secondary)',
                        fontSize: '0.75rem',
                        cursor: 'pointer',
                      }}
                    >
                      {formatCurrency(preset)}
                    </button>
                  ))}
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '0.75rem',
                    borderRadius: 'var(--radius-sm)',
                    background: 'rgba(16, 185, 129, 0.1)',
                    border: '1px solid rgba(16, 185, 129, 0.25)',
                  }}
                >
                  <span style={{ fontSize: '0.85rem', color: '#34d399', fontWeight: 600 }}>Tiền thối lại cho khách:</span>
                  <span style={{ fontSize: '1.1rem', fontWeight: 900, color: '#34d399' }}>
                    {formatCurrency(changeDue)}
                  </span>
                </div>
              </div>
            ) : (
              /* VietQR Mock Details */
              <div
                style={{
                  marginBottom: '1.5rem',
                  padding: '1.25rem',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-subtle)',
                  textAlign: 'center',
                }}
              >
                {loadingQr ? (
                  <div style={{ color: 'var(--text-muted)', padding: '1rem' }}>Đang tạo mã VietQR...</div>
                ) : vietQrData ? (
                  <div>
                    <img
                      src={vietQrData.mock_qr_url || '/qr/official_qr.png'}
                      alt="Mã QR Chuyển Khoản"
                      style={{
                        width: '200px',
                        height: '200px',
                        borderRadius: '8px',
                        background: '#ffffff',
                        border: '2px solid #111827',
                        padding: '6px',
                        margin: '0 auto 1rem auto',
                        display: 'block',
                      }}
                    />
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 700 }}>
                      {vietQrData.bank_name} • {vietQrData.account_no}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      Tên TK: <strong>{vietQrData.account_name}</strong>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--accent-gold)', marginTop: '0.25rem' }}>
                      Nội dung: <strong>{vietQrData.transfer_content}</strong>
                    </div>
                  </div>
                ) : (
                  <div style={{ color: '#f87171' }}>Không tải được thông tin VietQR</div>
                )}
              </div>
            )}

            {/* Confirm Payment Button with Idempotency Guard */}
            <Button
              variant="primary"
              size="lg"
              disabled={processing}
              onClick={handlePay}
              icon={<ArrowRight size={18} />}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              {processing
                ? 'Đang xử lý...'
                : method === 'CASH'
                ? `Xác Nhận Đã Nhận ${formatCurrency(totalDue)} Tiền Mặt`
                : `Xác Nhận Đã Nhận Chuyển Khoản ${formatCurrency(totalDue)} (Mô phỏng)`}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
