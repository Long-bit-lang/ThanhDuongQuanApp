import React, { useState, useEffect } from 'react';
import { apiClient } from '../../shared/api/client';
import { useAuth } from '../auth/AuthContext';
import { DollarSign, Calendar, TrendingUp, AlertTriangle, FileText, RefreshCw } from 'lucide-react';
import { Button } from '../../shared/components/Button';

interface RevenueSummary {
  invoice_count: number;
  subtotal?: number;
  discount_total?: number;
  invoice_value: number;
  paid_amount: number;
  adjustments: number;
  difference: number;
  net_revenue?: number;
  cash_amount?: number;
  vietqr_amount?: number;
}

interface DailyRevenue {
  date: string;
  invoice_count?: number;
  subtotal?: number;
  discount_total?: number;
  invoice_value: number;
  adjustments: number;
  net_revenue?: number;
}

export const RevenueReport: React.FC = () => {
  const { canViewRevenue } = useAuth();
  const [summary, setSummary] = useState<RevenueSummary | null>(null);
  const [dailyData, setDailyData] = useState<DailyRevenue[]>([]);
  const [loading, setLoading] = useState(true);

  // Date filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const loadReports = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (startDate) params.set('start', `${startDate}T00:00:00Z`);
      if (endDate) params.set('end', `${endDate}T23:59:59Z`);

      const queryStr = params.toString() ? `?${params.toString()}` : '';
      const [sumData, dailyRes] = await Promise.all([
        apiClient.get<RevenueSummary>(`/reports/revenue/summary${queryStr}`),
        apiClient.get<DailyRevenue[]>(`/reports/revenue/daily${queryStr}`),
      ]);
      setSummary(sumData);
      setDailyData(dailyRes);
    } catch (err) {
      console.error('Failed to load revenue reports', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canViewRevenue) {
      loadReports();
    }
  }, [canViewRevenue]);

  const formatCurrency = (val?: number) => `${Math.round(val ?? 0).toLocaleString('vi-VN')}đ`;

  if (!canViewRevenue) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
        <h2 style={{ fontSize: '1.25rem', color: '#f87171' }}>Truy cập bị từ chối</h2>
        <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
          Nhân viên phục vụ (WAITER) không được phép truy cập xem báo cáo doanh thu tài chính.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Top Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Báo Cáo Tổng Doanh Thu Quán</h2>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Dành cho Chủ Quán & Thu Ngân • Đối soát hóa đơn, tiền thực thu và điều chỉnh
          </div>
        </div>

        {/* Date Filters */}
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            <Calendar size={14} />
            <span>Từ:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{
                padding: '0.4rem 0.6rem',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
                fontSize: '0.8rem',
              }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            <span>Đến:</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={{
                padding: '0.4rem 0.6rem',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
                fontSize: '0.8rem',
              }}
            />
          </div>

          <Button variant="primary" size="sm" onClick={loadReports} icon={<RefreshCw size={14} />}>
            Lọc Báo Cáo
          </Button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
          Đang tổng hợp số liệu doanh thu...
        </div>
      ) : summary ? (
        <div>
          {/* KPI Cards Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
              gap: '1rem',
              marginBottom: '1.5rem',
            }}
          >
            {/* 1. Paid amount */}
            <div
              className="glass-panel"
              style={{
                padding: '1.25rem',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid rgba(16, 185, 129, 0.4)',
                background: 'rgba(16, 185, 129, 0.08)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#34d399', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>TỔNG TIỀN ĐÃ THU</span>
                <TrendingUp size={18} />
              </div>
              <div style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--text-primary)' }}>
                {formatCurrency(summary.paid_amount)}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                Tiền mặt & VietQR đã ghi nhận
              </div>
            </div>

            {/* 2. Invoices value */}
            <div
              className="glass-panel"
              style={{
                padding: '1.25rem',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid rgba(245, 158, 11, 0.4)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--accent-gold)', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>TỔNG GIÁ TRỊ HÓA ĐƠN</span>
                <DollarSign size={18} />
              </div>
              <div style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--text-primary)' }}>
                {formatCurrency(summary.invoice_value)}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                Sau khi trừ giảm giá
              </div>
            </div>

            {/* 3. Invoices count */}
            <div
              className="glass-panel"
              style={{
                padding: '1.25rem',
                borderRadius: 'var(--radius-lg)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#60a5fa', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>SỐ HÓA ĐƠN ĐÃ LẬP</span>
                <FileText size={18} />
              </div>
              <div style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--text-primary)' }}>
                {summary.invoice_count}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                Tổng lượt thanh toán hoàn tất
              </div>
            </div>

            {/* 4. Post-payment Adjustments & Difference */}
            <div
              className="glass-panel"
              style={{
                padding: '1.25rem',
                borderRadius: 'var(--radius-lg)',
                border: summary.difference !== 0 ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid var(--border-subtle)',
                background: summary.difference !== 0 ? 'rgba(239, 68, 68, 0.08)' : 'var(--bg-card)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#f87171', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>ĐIỀU CHỈNH / CHÊNH LỆCH</span>
                <AlertTriangle size={18} />
              </div>
              <div style={{ fontSize: '1.6rem', fontWeight: 900, color: summary.difference !== 0 ? '#f87171' : 'var(--text-primary)' }}>
                {formatCurrency(summary.difference)}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                Điều chỉnh: {formatCurrency(summary.adjustments)}
              </div>
            </div>

            {/* 5. Cash Total */}
            <div
              className="glass-panel"
              style={{
                padding: '1.25rem',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#10b981', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>TIỀN MẶT (CASH)</span>
                <DollarSign size={18} />
              </div>
              <div style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--text-primary)' }}>
                {formatCurrency(summary.cash_amount ?? 0)}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                Thu tiền mặt tại quầy
              </div>
            </div>

            {/* 6. VietQR Total */}
            <div
              className="glass-panel"
              style={{
                padding: '1.25rem',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#3b82f6', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>CHUYỂN KHOẢN VIETQR</span>
                <TrendingUp size={18} />
              </div>
              <div style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--text-primary)' }}>
                {formatCurrency(summary.vietqr_amount ?? 0)}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                Quét mã VietQR ngân hàng
              </div>
            </div>

            {/* 7. Total Discounts */}
            <div
              className="glass-panel"
              style={{
                padding: '1.25rem',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#eab308', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>TỔNG GIẢM GIÁ</span>
                <DollarSign size={18} />
              </div>
              <div style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--text-primary)' }}>
                {formatCurrency(summary.discount_total ?? 0)}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                Ưu đãi & chiết khấu đã áp dụng
              </div>
            </div>
          </div>

          {/* Daily Table */}
          <div
            className="glass-panel"
            style={{
              borderRadius: 'var(--radius-lg)',
              overflow: 'hidden',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-subtle)', fontWeight: 800 }}>
              Bảng Tổng Hợp Doanh Thu Theo Từng Ngày
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-subtle)', textAlign: 'left' }}>
                  <th style={{ padding: '0.875rem 1rem', color: 'var(--text-secondary)' }}>Ngày</th>
                  <th style={{ padding: '0.875rem 1rem', textAlign: 'right', color: 'var(--text-secondary)' }}>Giá trị hóa đơn</th>
                  <th style={{ padding: '0.875rem 1rem', textAlign: 'right', color: 'var(--text-secondary)' }}>Điều chỉnh</th>
                  <th style={{ padding: '0.875rem 1rem', textAlign: 'right', color: 'var(--text-secondary)' }}>Doanh thu thực tính</th>
                </tr>
              </thead>
              <tbody>
                {dailyData.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                      Chưa có phát sinh giao dịch trong khoảng thời gian đã chọn.
                    </td>
                  </tr>
                ) : (
                  dailyData.map((d, idx) => (
                    <tr
                      key={d.date || idx}
                      style={{
                        borderBottom: '1px solid var(--border-subtle)',
                        background: idx % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'transparent',
                      }}
                    >
                      <td style={{ padding: '0.875rem 1rem', fontWeight: 700 }}>{d.date}</td>
                      <td style={{ padding: '0.875rem 1rem', textAlign: 'right' }}>{formatCurrency(d.invoice_value)}</td>
                      <td style={{ padding: '0.875rem 1rem', textAlign: 'right', color: d.adjustments !== 0 ? '#f87171' : 'inherit' }}>
                        {formatCurrency(d.adjustments)}
                      </td>
                      <td style={{ padding: '0.875rem 1rem', textAlign: 'right', fontWeight: 800, color: 'var(--accent-gold)' }}>
                        {formatCurrency(d.invoice_value + d.adjustments)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
};
