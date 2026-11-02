import React, { useState } from 'react';
import { Header } from '../shared/components/Header';
import { HealthCard } from '../features/health/components/HealthCard';
import { DatabaseStatus } from '../features/health/components/DatabaseStatus';
import { SystemOverview } from '../features/dashboard/components/SystemOverview';
import { DevicePreview } from '../features/dashboard/components/DevicePreview';
import { Card } from '../shared/components/Card';
import { Button } from '../shared/components/Button';
import { StatusBadge } from '../shared/components/StatusBadge';
import { useHealthCheck } from '../features/health/hooks/useHealthCheck';
import { useWebSocket } from '../shared/hooks/useWebSocket';
import { config } from './config';
import { Radio, ExternalLink, Send, Terminal } from 'lucide-react';

export const App: React.FC = () => {
  const { data, loading, error, pingMs, refetch } = useHealthCheck(15000);
  const { status: wsStatus, lastMessage, sendMessage, reconnect: wsReconnect } = useWebSocket('floor');
  const [wsInput, setWsInput] = useState('{"action":"PING_TABLE","table_id":10}');
  const [wsHistory, setWsHistory] = useState<string[]>([]);

  const handleSendWs = () => {
    try {
      const parsed = JSON.parse(wsInput);
      sendMessage(parsed);
      setWsHistory((prev) => [`[SENT] ${wsInput}`, ...prev.slice(0, 4)]);
    } catch {
      sendMessage({ raw: wsInput });
      setWsHistory((prev) => [`[SENT] ${wsInput}`, ...prev.slice(0, 4)]);
    }
  };

  React.useEffect(() => {
    if (lastMessage) {
      setWsHistory((prev) => [`[RECEIVED] ${JSON.stringify(lastMessage)}`, ...prev.slice(0, 4)]);
    }
  }, [lastMessage]);

  const backendStatus = error
    ? 'error'
    : loading && !data
    ? 'checking'
    : data?.status === 'healthy'
    ? 'healthy'
    : 'degraded';

  return (
    <div className="app-container">
      <Header backendStatus={backendStatus} onRefresh={refetch} isRefreshing={loading} />

      <main className="main-content">
        {/* Hero Banner */}
        <section className="hero-banner">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <span className="brand-badge">PHASE 1</span>
              <span style={{ fontSize: '0.85rem', color: 'var(--accent-gold)', fontWeight: 600 }}>
                KHỞI TẠO NỀN TẢNG THÀNH CÔNG
              </span>
            </div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: '0.5rem' }}>
              Thanh Đường Quán POS Platform
            </h1>
            <p style={{ color: 'var(--text-secondary)', maxWidth: '640px', fontSize: '0.95rem' }}>
              Hệ thống POS quản lý quán nhậu kiến trúc Modular Monolith. Đã kết nối thành công FastAPI, SQLAlchemy 2.x,
              PostgreSQL 16, Alembic Migration và React TypeScript Client.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <Button
              variant="primary"
              onClick={() => window.open(`${config.apiBaseUrl}/docs`, '_blank')}
              icon={<ExternalLink size={16} />}
            >
              Swagger API Docs
            </Button>
            <Button variant="secondary" onClick={refetch}>
              Kiểm Tra Lại Kết Nối
            </Button>
          </div>
        </section>

        {/* Live Service Probes */}
        <div className="grid-2">
          <HealthCard data={data} loading={loading} error={error} pingMs={pingMs} />
          <DatabaseStatus database={data?.database} loading={loading} />
        </div>

        {/* WebSocket Realtime Probe */}
        <div style={{ marginTop: '1.5rem' }}>
          <Card
            title="Kênh Truyền Thông Thời Gian Thực (WebSocket Event Bus)"
            subtitle="Sẵn sàng cho cập nhật trạng thái 50 bàn và đơn hàng thời gian thực trong Phase 4"
            icon={<Radio size={22} />}
            action={
              <StatusBadge
                status={wsStatus === 'connected' ? 'success' : wsStatus === 'connecting' ? 'info' : 'warning'}
                label={wsStatus === 'connected' ? 'WS Đã Kết Nối' : wsStatus === 'connecting' ? 'Đang Nối...' : 'WS Chưa Kết Nối'}
              />
            }
            highlight={wsStatus === 'connected'}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  value={wsInput}
                  onChange={(e) => setWsInput(e.target.value)}
                  style={{
                    flex: 1,
                    minWidth: '240px',
                    padding: '0.5rem 0.75rem',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.85rem',
                  }}
                  placeholder="Nhập JSON tin nhắn..."
                />
                <Button variant="primary" size="sm" onClick={handleSendWs} icon={<Send size={14} />}>
                  Gửi Socket Event
                </Button>
                <Button variant="secondary" size="sm" onClick={wsReconnect}>
                  Nối Lại Socket
                </Button>
              </div>

              {wsHistory.length > 0 && (
                <div
                  style={{
                    padding: '0.75rem',
                    borderRadius: 'var(--radius-md)',
                    background: 'rgba(0,0,0,0.4)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.775rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.25rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)' }}>
                    <Terminal size={14} />
                    <span>Nhật ký truyền tin WebSocket (/ws/floor):</span>
                  </div>
                  {wsHistory.map((item, idx) => (
                    <div
                      key={idx}
                      style={{
                        color: item.startsWith('[SENT]') ? 'var(--accent-gold)' : '#34d399',
                        wordBreak: 'break-all',
                      }}
                    >
                      {item}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Modular Monolith Architecture Breakdown */}
        <SystemOverview />

        {/* Responsive Device Testing Guide */}
        <div style={{ marginTop: '1.5rem' }}>
          <DevicePreview />
        </div>
      </main>

      {/* Footer */}
      <footer
        style={{
          borderTop: '1px solid var(--border-subtle)',
          padding: '1.5rem',
          textAlign: 'center',
          fontSize: '0.8rem',
          color: 'var(--text-muted)',
          background: 'rgba(9, 13, 22, 0.95)',
        }}
      >
        <div style={{ maxWidth: '1280px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div>
            <strong>{config.appName}</strong> • Kiến trúc Modular Monolith cho nhà hàng / quán nhậu.
          </div>
          <div>
            Truy cập local LAN: <code>http://192.168.1.22:5173</code> (Phone/SUNMI) hoặc <code>http://localhost:5173</code> (Desktop).
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
