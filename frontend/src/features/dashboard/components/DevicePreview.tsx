import React from 'react';
import { Laptop, Tablet, Smartphone, Sparkles } from 'lucide-react';
import { Card } from '../../../shared/components/Card';

export const DevicePreview: React.FC = () => {
  const devices = [
    {
      title: 'Desktop / Laptop (Owner & Cashier)',
      icon: <Laptop size={24} />,
      width: 'Full Width (>= 1024px)',
      desc: 'Hiển thị đa cột, bảng quản lý bàn, thu ngân, cấu hình thực đơn và báo cáo doanh thu.',
      badge: 'Desktop Ready',
    },
    {
      title: 'Máy POS SUNMI T1-G / Tablet',
      icon: <Tablet size={24} />,
      width: 'Màn hình 10-14" (>= 768px)',
      desc: 'Giao diện cảm ứng quầy thu ngân, thao tác nhanh chọn món, in hóa đơn và mã VietQR.',
      badge: 'Touch POS Ready',
    },
    {
      title: 'Điện Thoại Di Động (Waiter / Order)',
      icon: <Smartphone size={24} />,
      width: 'Màn hình nhỏ (<= 640px)',
      desc: 'Thiết kế một cột tối ưu ngón tay cái, phục vụ nhân viên gọi món tại bàn, chuyển/ghép bàn.',
      badge: 'Mobile First',
    },
  ];

  return (
    <Card
      title="Khả Năng Thích Ứng Thiết Bị (Responsive Design)"
      subtitle="Thiết kế chuẩn hóa cho 3 nhóm thiết bị mục tiêu theo tài liệu ARCHITECTURE.md"
      icon={<Sparkles size={22} />}
    >
      <div className="grid-3" style={{ marginTop: '0.5rem' }}>
        {devices.map((d) => (
          <div
            key={d.title}
            style={{
              padding: '1.25rem',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--accent-gold)' }}>
              {d.icon}
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--status-info)' }}>
                {d.badge}
              </span>
            </div>
            <div>
              <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.25rem' }}>{d.title}</h4>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                {d.width}
              </span>
            </div>
            <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>{d.desc}</p>
          </div>
        ))}
      </div>
    </Card>
  );
};
