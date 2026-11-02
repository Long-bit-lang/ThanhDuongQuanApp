import React from 'react';
import { Store, Wifi, RefreshCw } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import { Button } from './Button';
import { config } from '../../app/config';

interface HeaderProps {
  backendStatus: 'healthy' | 'degraded' | 'checking' | 'error';
  onRefresh: () => void;
  isRefreshing?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ backendStatus, onRefresh, isRefreshing = false }) => {
  const getStatusBadge = () => {
    switch (backendStatus) {
      case 'healthy':
        return <StatusBadge status="success" label="API Sẵn Sàng" />;
      case 'degraded':
        return <StatusBadge status="warning" label="API Giảm Cấp" />;
      case 'error':
        return <StatusBadge status="danger" label="Mất Kết Nối API" />;
      case 'checking':
      default:
        return <StatusBadge status="info" label="Đang Kiểm Tra..." />;
    }
  };

  return (
    <header className="navbar">
      <div className="navbar-inner">
        <div className="brand-section">
          <div className="brand-badge">
            <Store size={18} />
          </div>
          <div>
            <div className="brand-title">{config.appName}</div>
            <div className="brand-subtitle">{config.phase}</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ display: 'none', alignItems: 'center', gap: '0.5rem' }}>
            <Wifi size={14} color="var(--accent-gold)" />
          </div>
          {getStatusBadge()}
          <Button
            variant="secondary"
            size="sm"
            onClick={onRefresh}
            loading={isRefreshing}
            icon={<RefreshCw size={14} className={isRefreshing ? 'status-dot' : ''} />}
          >
            Làm Mới
          </Button>
        </div>
      </div>
    </header>
  );
};
