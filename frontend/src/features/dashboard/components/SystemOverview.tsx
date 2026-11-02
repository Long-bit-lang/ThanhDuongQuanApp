import React from 'react';
import { Layers } from 'lucide-react';
import { Card } from '../../../shared/components/Card';
import { StatusBadge } from '../../../shared/components/StatusBadge';

export const SystemOverview: React.FC = () => {
  const modules = [
    { name: 'Core API & Health', phase: 'Phase 1', status: 'ready', desc: 'FastAPI, Pydantic Settings, Lifespan' },
    { name: 'Database & Alembic', phase: 'Phase 1', status: 'ready', desc: 'PostgreSQL 16, AsyncPG, Migrations' },
    { name: 'Frontend React/TS', phase: 'Phase 1', status: 'ready', desc: 'Vite, Responsive Glassmorphism UI' },
    { name: 'WebSocket Bus', phase: 'Phase 1', status: 'ready', desc: 'Realtime Channels & Socket Manager' },
    { name: 'Identity & RBAC', phase: 'Phase 2', status: 'pending', desc: 'Owner, Cashier, Waiter Accounts' },
    { name: 'Catalog & 50 Tables', phase: 'Phase 3', status: 'pending', desc: 'Menu Items, Table Projection' },
    { name: 'Service Sessions', phase: 'Phase 4', status: 'pending', desc: 'Order Batches, Notes, Cancels' },
    { name: 'Billing & Payments', phase: 'Phase 6-7', status: 'pending', desc: 'Discounts, VietQR Mock, Receipts' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '1.5rem' }}>
      <Card
        title="Kiến Trúc Modular Monolith – Thanh Đường Quán POS"
        subtitle="Mô hình phân tầng: API Layer ➔ Application Services ➔ Domain Modules ➔ Repositories ➔ PostgreSQL"
        icon={<Layers size={22} />}
      >
        <div className="grid-4" style={{ marginTop: '0.5rem' }}>
          {modules.map((m) => (
            <div
              key={m.name}
              style={{
                padding: '1rem',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                  {m.name}
                </span>
                <StatusBadge
                  status={m.status === 'ready' ? 'success' : 'info'}
                  label={m.status === 'ready' ? 'Hoàn thành' : 'Giai đoạn sau'}
                  showDot={m.status === 'ready'}
                />
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{m.desc}</p>
              <span style={{ fontSize: '0.7rem', color: 'var(--accent-gold)', fontWeight: 600 }}>
                {m.phase}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};
