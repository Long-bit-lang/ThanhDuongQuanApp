import React, { useState, useEffect } from 'react';
import { apiClient } from '../../shared/api/client';
import { useAuth } from '../auth/AuthContext';
import { RefreshCw } from 'lucide-react';
import { Button } from '../../shared/components/Button';

interface AuditRecord {
  id: number;
  actor_username: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: Record<string, unknown>;
  created_at: string;
}

export const AuditLogView: React.FC = () => {
  const { isOwner } = useAuth();
  const [logs, setLogs] = useState<AuditRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAuditLogs = async () => {
    setLoading(true);
    try {
      const data = await apiClient.get<AuditRecord[]>('/audit-logs?limit=100');
      setLogs(data);
    } catch (err) {
      console.error('Failed to load audit logs', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOwner) {
      loadAuditLogs();
    }
  }, [isOwner]);

  if (!isOwner) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
        <h2 style={{ fontSize: '1.25rem', color: '#f87171' }}>Truy cập bị từ chối</h2>
        <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
          Chỉ tài khoản Chủ quán (OWNER) mới có quyền kiểm tra nhật ký hệ thống (Audit Logs).
        </p>
      </div>
    );
  }

  return (
    <div>
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
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Nhật Ký Hệ Thống (Audit Logs)</h2>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Lưu vết bất biến (Append-only) mọi thao tác nhạy cảm, bảo mật và tài chính
          </div>
        </div>

        <Button variant="secondary" size="sm" onClick={loadAuditLogs} icon={<RefreshCw size={14} />}>
          Làm Mới Nhật Ký
        </Button>
      </div>

      <div
        className="glass-panel"
        style={{
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
          border: '1px solid var(--border-subtle)',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-subtle)', textAlign: 'left' }}>
              <th style={{ padding: '0.875rem 1rem', color: 'var(--text-secondary)' }}>Thời gian</th>
              <th style={{ padding: '0.875rem 1rem', color: 'var(--text-secondary)' }}>Người thực hiện</th>
              <th style={{ padding: '0.875rem 1rem', color: 'var(--text-secondary)' }}>Hành động</th>
              <th style={{ padding: '0.875rem 1rem', color: 'var(--text-secondary)' }}>Đối tượng</th>
              <th style={{ padding: '0.875rem 1rem', color: 'var(--text-secondary)' }}>Chi tiết</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                  Đang tải nhật ký...
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                  Chưa có nhật ký nào.
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr
                  key={log.id}
                  style={{
                    borderBottom: '1px solid var(--border-subtle)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.785rem',
                  }}
                >
                  <td style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)' }}>
                    {new Date(log.created_at).toLocaleString('vi-VN')}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', color: 'var(--accent-gold)', fontWeight: 700 }}>
                    {log.actor_username}
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <span
                      style={{
                        padding: '0.2rem 0.5rem',
                        borderRadius: '4px',
                        background: 'rgba(255, 255, 255, 0.08)',
                        color: 'var(--text-primary)',
                        fontWeight: 600,
                      }}
                    >
                      {log.action}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>
                    {log.entity_type} #{log.entity_id.substring(0, 8)}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', color: '#94a3b8', maxWidth: '300px', wordBreak: 'break-all' }}>
                    {JSON.stringify(log.details)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
