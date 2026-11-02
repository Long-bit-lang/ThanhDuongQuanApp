import React, { useState, useEffect } from 'react';
import type { ReceiptData } from '../types';
import { apiClient } from '../../../shared/api/client';
import { X, Printer, CheckCircle } from 'lucide-react';
import { Button } from '../../../shared/components/Button';
import { useIsMobile } from '../../../shared/hooks/useIsMobile';

interface ReceiptModalProps {
  invoiceId: string;
  onClose: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({ invoiceId, onClose }) => {
  const isMobile = useIsMobile();
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);
  const [printSuccessMsg, setPrintSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    apiClient
      .get<ReceiptData>(`/invoices/${invoiceId}/receipt`)
      .then((data) => setReceipt(data))
      .catch((err) => console.error('Failed to load receipt', err))
      .finally(() => setLoading(false));
  }, [invoiceId]);

  const isNativePrinterAvailable = typeof window !== 'undefined' && Boolean((window as unknown as { ZywellBridge?: { isPrinterReady?: () => boolean } }).ZywellBridge);

  const handlePrint = async () => {
    if (!receipt || printing) return;
    setPrinting(true);
    setPrintSuccessMsg(null);
    try {
      const bridge = (window as unknown as {
        ZywellBridge?: {
          printReceipt?: (json: string) => string;
          printReceiptEscPos?: (base64: string) => string;
          isPrinterReady?: () => boolean;
        };
      }).ZywellBridge;

      // 1. If running inside SUNMI T1-G Android App with USB Bridge
      if (bridge && typeof bridge.printReceipt === 'function') {
        const resultRaw = bridge.printReceipt(JSON.stringify(receipt));
        let result: { success: boolean; message: string } = { success: false, message: '' };
        try {
          result = JSON.parse(resultRaw);
        } catch {
          result = { success: resultRaw === 'true', message: resultRaw };
        }

        if (result.success) {
          setPrintSuccessMsg('In hóa đơn thành công qua máy in nhiệt ZYWELL USB (đã cắt giấy)!');
        } else {
          alert(`Lỗi in hóa đơn qua máy in ZYWELL: ${result.message || 'Máy in chưa sẵn sàng hoặc mất kết nối USB.'}`);
        }
      } else {
        // 2. Standard Web Browser Fallback (PC or mobile phone)
        const res = await apiClient.post<{ status: string; message: string; byte_count: number }>(
          '/printing/mock-print',
          receipt
        );
        setPrintSuccessMsg(`${res.message} (${res.byte_count} bytes ESC/POS)`);

        setTimeout(() => {
          window.print();
        }, 300);
      }
    } catch (err) {
      console.error('Print failed', err);
      alert('Không thể thực hiện lệnh in hóa đơn!');
    } finally {
      setPrinting(false);
    }
  };

  const formatCurrency = (val: number) => `${Math.round(val).toLocaleString('vi-VN')}đ`;
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
        background: 'rgba(0, 0, 0, 0.88)',
        backdropFilter: 'blur(8px)',
        zIndex: 1200,
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
          maxWidth: isMobile ? '100vw' : '460px',
          height: isMobile ? '100dvh' : undefined,
          maxHeight: isMobile ? '100dvh' : '94vh',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: isMobile ? 0 : 'var(--radius-xl)',
          overflow: 'hidden',
          background: '#ffffff',
          border: isMobile ? 'none' : '1px solid var(--border-subtle)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.2)',
        }}
      >
        {/* Top bar */}
        <div
          style={{
            padding: '1rem 1.25rem',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#ffffff',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Printer size={18} color="var(--accent-gold)" />
              <h3 style={{ fontSize: '1rem', fontWeight: 800 }}>Xem Trước Phiếu Thanh Toán (80mm)</h3>
            </div>
            <div>
              {isNativePrinterAvailable ? (
                <span style={{ fontSize: '0.72rem', background: 'rgba(16, 185, 129, 0.15)', color: '#059669', padding: '0.15rem 0.5rem', borderRadius: '4px', fontWeight: 700 }}>
                  🟢 Máy in ZYWELL USB (Sẵn sàng)
                </span>
              ) : (
                <span style={{ fontSize: '0.72rem', background: 'rgba(59, 130, 246, 0.1)', color: '#2563eb', padding: '0.15rem 0.5rem', borderRadius: '4px', fontWeight: 600 }}>
                  🔵 In trình duyệt / Xem trước
                </span>
              )}
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'rgba(0, 0, 0, 0.05)',
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

        {/* Paper Container */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem', background: '#f1f5f9' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
              Đang tạo phiếu thanh toán...
            </div>
          ) : !receipt ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#f87171' }}>
              Không tải được dữ liệu hóa đơn.
            </div>
          ) : (
            <div>
              {printSuccessMsg && (
                <div
                  style={{
                    padding: '0.75rem',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--status-success-bg)',
                    border: '1px solid var(--status-success)',
                    color: '#34d399',
                    fontSize: '0.8rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    marginBottom: '1rem',
                  }}
                >
                  <CheckCircle size={16} />
                  <span>{printSuccessMsg}</span>
                </div>
              )}

              {/* Thermal Receipt Paper Mockup */}
              <div
                id="thermal-receipt"
                style={{
                  background: '#ffffff',
                  color: '#111827',
                  padding: '1.75rem 1.25rem',
                  borderRadius: '4px',
                  boxShadow: '0 8px 30px rgba(0, 0, 0, 0.5)',
                  fontFamily: 'monospace',
                  fontSize: '0.825rem',
                  lineHeight: '1.4',
                }}
              >
                <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
                  <div style={{ fontSize: '1.15rem', fontWeight: 900, letterSpacing: '-0.01em' }}>
                    {receipt.restaurant_name}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#4b5563' }}>{receipt.tagline}</div>
                  <div style={{ fontSize: '0.725rem', color: '#4b5563' }}>
                    ĐC: {receipt.address} - ĐT: 0975 776 376
                  </div>
                  <div style={{ borderBottom: '2px solid #111827', margin: '0.75rem 0' }} />
                  <div style={{ fontSize: '1rem', fontWeight: 800 }}>PHIẾU THANH TOÁN</div>
                  <div style={{ borderBottom: '2px solid #111827', margin: '0.75rem 0' }} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <span style={{ fontWeight: 800, fontSize: '0.9rem' }}>
                    Bàn: {receipt.table_names.map((t) => t.replace(/^Bàn\s+/i, '').trim()).join(', ') || '---'}
                  </span>
                  <span>Giờ: {receipt.date_time}</span>
                </div>

                <div style={{ borderBottom: '1px dashed #9ca3af', marginBottom: '0.75rem' }} />

                {/* Items */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  {receipt.items.map((it, idx) => (
                    <div key={idx}>
                      <div style={{ fontWeight: 700 }}>{it.name}</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#374151' }}>
                        <span>
                          &nbsp;&nbsp;{formatQuantity(it.quantity)} x {formatCurrency(it.unit_price)}
                        </span>
                        <span style={{ fontWeight: 700, color: '#111827' }}>{formatCurrency(it.line_total)}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ borderBottom: '1px dashed #9ca3af', margin: '0.75rem 0' }} />

                {/* Subtotals & Discounts */}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                  <span>Tổng tiền hàng:</span>
                  <span>{formatCurrency(receipt.subtotal)}</span>
                </div>

                {receipt.discount_total > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#dc2626', marginBottom: '0.25rem' }}>
                    <span>Giảm giá:</span>
                    <span>-{formatCurrency(receipt.discount_total)}</span>
                  </div>
                )}

                {receipt.adjustment_total !== 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                    <span>Điều chỉnh:</span>
                    <span>{formatCurrency(receipt.adjustment_total)}</span>
                  </div>
                )}

                <div style={{ borderBottom: '2px solid #111827', margin: '0.75rem 0' }} />

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1rem', fontWeight: 900 }}>
                  <span>TỔNG CỘNG:</span>
                  <span>{formatCurrency(receipt.final_total)}</span>
                </div>

                <div style={{ borderBottom: '2px solid #111827', margin: '0.75rem 0' }} />

                {/* Payments */}
                {receipt.payments.map((p, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                    <span>Đã trả ({p.method === 'CASH' ? 'Tiền mặt' : 'Chuyển khoản'}):</span>
                    <span style={{ fontWeight: 700 }}>{formatCurrency(p.amount)}</span>
                  </div>
                ))}

                {receipt.difference > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#dc2626', marginTop: '0.25rem' }}>
                    <span>Chênh lệch sau điều chỉnh:</span>
                    <span style={{ fontWeight: 700 }}>{formatCurrency(receipt.difference)}</span>
                  </div>
                )}

                {receipt.qr_code_url && (
                  <div style={{ textAlign: 'center', margin: '1rem 0 0.5rem 0' }}>
                    <div style={{ borderBottom: '1px dashed #9ca3af', marginBottom: '1rem' }} />
                    <img
                      src={receipt.qr_code_url || '/qr/official_qr.png'}
                      alt="Mã QR Thanh Toán"
                      style={{
                        maxWidth: '260px',
                        width: '100%',
                        height: 'auto',
                        aspectRatio: '1 / 1',
                        margin: '0 auto',
                        display: 'block',
                        borderRadius: '6px',
                        border: '2px solid #111827',
                        padding: '6px',
                        background: '#ffffff',
                      }}
                    />
                  </div>
                )}

                <div style={{ borderBottom: '1px dashed #9ca3af', margin: '1rem 0 0.75rem 0' }} />

                <div style={{ textAlign: 'center', marginTop: '1rem' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{receipt.thank_you_note}</div>
                  <div style={{ fontSize: '0.7rem', color: '#6b7280', marginTop: '0.25rem' }}>
                    Thanh Dương Quán POS • Máy in ZYWELL 80mm
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: '1rem 1.25rem',
            borderTop: '1px solid var(--border-subtle)',
            background: '#ffffff',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Button variant="secondary" size="md" onClick={onClose}>
            Đóng
          </Button>

          <Button
            variant="primary"
            size="md"
            disabled={!receipt || printing}
            onClick={handlePrint}
            icon={<Printer size={16} />}
          >
            {printing ? 'Đang gửi in...' : 'In Hóa Đơn Ngay'}
          </Button>
        </div>
      </div>
    </div>
  );
};
