import React from 'react';
import { Database } from 'lucide-react';
import { Card } from '../../../shared/components/Card';
import { StatusBadge } from '../../../shared/components/StatusBadge';
import type { DatabaseHealth } from '../types';

interface DatabaseStatusProps {
  database: DatabaseHealth | undefined;
  loading: boolean;
}

export const DatabaseStatus: React.FC<DatabaseStatusProps> = ({ database, loading }) => {
  const isConnected = database?.status === 'connected';

  return (
    <Card
      title="Cơ Sở Dữ Liệu PostgreSQL 16"
      subtitle="Docker Compose Persistent Storage & SQLAlchemy 2.x"
      icon={<Database size={22} />}
      action={
        loading && !database ? (
          <StatusBadge status="info" label="Đang Thăm Dò..." />
        ) : isConnected ? (
          <StatusBadge status="success" label="Đã Kết Nối" />
        ) : (
          <StatusBadge status="danger" label="Chưa Kết Nối" />
        )
      }
      highlight={isConnected}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        <div className="meta-row">
          <span className="meta-label">Trạng thái kết nối:</span>
          <span className="meta-value" style={{ color: isConnected ? '#34d399' : '#f87171' }}>
            {database?.status ? database.status.toUpperCase() : 'UNKNOWN'}
          </span>
        </div>

        <div className="meta-row">
          <span className="meta-label">Tên Database:</span>
          <span className="meta-value">{database?.database || 'thanh_duong_pos'}</span>
        </div>

        <div className="meta-row">
          <span className="meta-label">Engine / Phiên bản:</span>
          <span className="meta-value" style={{ fontSize: '0.8rem' }}>
            {database?.version || 'PostgreSQL 16'}
          </span>
        </div>

        <div className="meta-row">
          <span className="meta-label">Độ trễ truy vấn (Query Latency):</span>
          <span className="meta-value">
            {database?.latency_ms !== undefined ? `${database.latency_ms} ms` : '--'}
          </span>
        </div>

        <div className="meta-row">
          <span className="meta-label">Driver bất đồng bộ:</span>
          <span className="meta-value">SQLAlchemy 2.x + asyncpg</span>
        </div>

        {database?.error && (
          <div
            style={{
              marginTop: '0.75rem',
              padding: '0.75rem',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--status-danger-bg)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#f87171',
              fontSize: '0.8rem',
            }}
          >
            Lỗi database: {database.error}
          </div>
        )}
      </div>
    </Card>
  );
};
