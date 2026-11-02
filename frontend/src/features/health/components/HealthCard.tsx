import React from 'react';
import { Server } from 'lucide-react';
import { Card } from '../../../shared/components/Card';
import { StatusBadge } from '../../../shared/components/StatusBadge';
import { config } from '../../../app/config';
import type { SystemHealthResponse } from '../types';

interface HealthCardProps {
  data: SystemHealthResponse | null;
  loading: boolean;
  error: string | null;
  pingMs: number | null;
}

export const HealthCard: React.FC<HealthCardProps> = ({ data, loading, error, pingMs }) => {
  const isHealthy = data?.status === 'healthy';

  return (
    <Card
      title="Máy Chủ Backend (FastAPI)"
      subtitle="Modular Monolith API Core & REST Endpoints"
      icon={<Server size={22} />}
      action={
        error ? (
          <StatusBadge status="danger" label="Mất Kết Nối" />
        ) : loading && !data ? (
          <StatusBadge status="info" label="Đang Thăm Dò..." />
        ) : isHealthy ? (
          <StatusBadge status="success" label="Hoạt Động Tốt" />
        ) : (
          <StatusBadge status="warning" label="Giảm Cấp" />
        )
      }
      highlight={isHealthy}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        <div className="meta-row">
          <span className="meta-label">Trạng thái API:</span>
          <span className="meta-value" style={{ color: isHealthy ? '#34d399' : '#f87171' }}>
            {data?.status?.toUpperCase() || (error ? 'FAILED' : 'CHECKING')}
          </span>
        </div>

        <div className="meta-row">
          <span className="meta-label">Phiên bản ứng dụng:</span>
          <span className="meta-value">{data?.version || config.version}</span>
        </div>

        <div className="meta-row">
          <span className="meta-label">Môi trường:</span>
          <span className="meta-value">{data?.environment || 'development'}</span>
        </div>

        <div className="meta-row">
          <span className="meta-label">Độ trễ HTTP (Ping):</span>
          <span className="meta-value">
            {pingMs !== null ? `${pingMs} ms` : '--'}
          </span>
        </div>

        <div className="meta-row">
          <span className="meta-label">API Base URL:</span>
          <span className="meta-value" style={{ fontSize: '0.8rem', color: 'var(--accent-gold)' }}>
            {config.apiBaseUrl}
          </span>
        </div>

        {error && (
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
            Lỗi kết nối: {error}
          </div>
        )}
      </div>
    </Card>
  );
};
