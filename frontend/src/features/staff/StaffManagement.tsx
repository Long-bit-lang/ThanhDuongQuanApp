import React, { useState, useEffect } from 'react';
import type { UserProfile, Role } from '../auth/types';
import { apiClient } from '../../shared/api/client';
import { useAuth } from '../auth/AuthContext';
import { UserPlus, Key } from 'lucide-react';
import { Button } from '../../shared/components/Button';

export const StaffManagement: React.FC = () => {
  const { isOwner } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  // Create staff modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('WAITER');
  const [submitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Reset password modal
  const [resetUser, setResetUser] = useState<UserProfile | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetMsg, setResetMsg] = useState<string | null>(null);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const data = await apiClient.get<UserProfile[]>('/users');
      setUsers(data);
    } catch (err) {
      console.error('Failed to load users', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOwner) {
      loadUsers();
    }
  }, [isOwner]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setCreateError(null);
    try {
      await apiClient.post('/users', {
        username: username.trim().toLowerCase(),
        full_name: fullName.trim(),
        password,
        role,
      });
      setIsCreateOpen(false);
      setUsername('');
      setFullName('');
      setPassword('');
      await loadUsers();
    } catch (err: unknown) {
      console.error('Failed to create user', err);
      const msg =
        err && typeof err === 'object' && 'body' in err && err.body && typeof err.body === 'object' && 'detail' in err.body
          ? String((err.body as { detail: unknown }).detail)
          : 'Không thể tạo nhân viên. Vui lòng kiểm tra độ mạnh mật khẩu và username!';
      setCreateError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (u: UserProfile) => {
    const actionName = u.is_active ? 'vô hiệu hóa' : 'kích hoạt lại';
    if (!window.confirm(`Bạn có chắc muốn ${actionName} tài khoản "${u.username}"?`)) return;
    try {
      await apiClient.patch(`/users/${u.id}`, { is_active: !u.is_active });
      await loadUsers();
    } catch (err: unknown) {
      console.error('Toggle active error', err);
      alert('Không thể cập nhật trạng thái nhân viên (bảo vệ invariant chủ quán cuối cùng)!');
    }
  };

  const handleChangeRole = async (u: UserProfile, newRole: Role) => {
    if (u.role === newRole) return;
    try {
      await apiClient.patch(`/users/${u.id}`, { role: newRole });
      await loadUsers();
    } catch (err) {
      console.error('Change role error', err);
      alert('Không thể thay đổi vai trò nhân viên!');
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetUser || resetSubmitting) return;
    setResetSubmitting(true);
    setResetMsg(null);
    try {
      await apiClient.post(`/users/${resetUser.id}/reset-password`, {
        new_password: newPassword,
      });
      alert(`Đã đặt lại mật khẩu cho tài khoản ${resetUser.username}. Mọi phiên đăng nhập cũ đã được thu hồi an toàn!`);
      setResetUser(null);
      setNewPassword('');
    } catch (err: unknown) {
      console.error('Reset password error', err);
      const msg =
        err && typeof err === 'object' && 'body' in err && err.body && typeof err.body === 'object' && 'detail' in err.body
          ? String((err.body as { detail: unknown }).detail)
          : 'Mật khẩu mới không đạt chuẩn bảo mật (cần ít nhất 8 ký tự, chữ hoa, chữ thường, số, ký tự đặc biệt)!';
      setResetMsg(msg);
    } finally {
      setResetSubmitting(false);
    }
  };

  if (!isOwner) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
        <h2 style={{ fontSize: '1.25rem', color: '#f87171' }}>Truy cập bị từ chối</h2>
        <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
          Chỉ tài khoản Chủ Quán (OWNER) mới có quyền quản lý tài khoản nhân viên và phân quyền.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Top action bar */}
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
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Quản Lý Tài Khoản Nhân Viên</h2>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Phân quyền 3 vai trò độc quyền: Chủ quán (OWNER), Thu ngân (CASHIER), Phục vụ (WAITER)
          </div>
        </div>

        <Button variant="primary" size="md" onClick={() => setIsCreateOpen(true)} icon={<UserPlus size={16} />}>
          Tạo Nhân Viên Mới
        </Button>
      </div>

      {/* Staff Table */}
      <div
        className="glass-panel"
        style={{
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
          border: '1px solid var(--border-subtle)',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-subtle)', textAlign: 'left' }}>
              <th style={{ padding: '0.875rem 1rem', color: 'var(--text-secondary)' }}>Họ và tên</th>
              <th style={{ padding: '0.875rem 1rem', color: 'var(--text-secondary)' }}>Tên đăng nhập</th>
              <th style={{ padding: '0.875rem 1rem', color: 'var(--text-secondary)' }}>Vai trò</th>
              <th style={{ padding: '0.875rem 1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Trạng thái</th>
              <th style={{ padding: '0.875rem 1rem', textAlign: 'right', color: 'var(--text-secondary)' }}>Hành động</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                  Đang tải danh sách nhân viên...
                </td>
              </tr>
            ) : users.map((u, idx) => (
              <tr
                key={u.id}
                style={{
                  borderBottom: '1px solid var(--border-subtle)',
                  background: idx % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'transparent',
                  opacity: u.is_active ? 1 : 0.6,
                }}
              >
                <td style={{ padding: '0.875rem 1rem', fontWeight: 700 }}>{u.full_name}</td>
                <td style={{ padding: '0.875rem 1rem', fontFamily: 'var(--font-mono)', color: 'var(--accent-gold)' }}>
                  {u.username}
                </td>
                <td style={{ padding: '0.875rem 1rem' }}>
                  <select
                    value={u.role}
                    onChange={(e) => handleChangeRole(u, e.target.value as Role)}
                    style={{
                      padding: '0.35rem 0.6rem',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--bg-tertiary)',
                      border: '1px solid var(--border-subtle)',
                      color: u.role === 'OWNER' ? 'var(--accent-gold)' : u.role === 'CASHIER' ? '#60a5fa' : '#34d399',
                      fontWeight: 700,
                      fontSize: '0.8rem',
                      outline: 'none',
                    }}
                  >
                    <option value="OWNER">Chủ quán (OWNER)</option>
                    <option value="CASHIER">Thu ngân (CASHIER)</option>
                    <option value="WAITER">Phục vụ (WAITER)</option>
                  </select>
                </td>
                <td style={{ padding: '0.875rem 1rem', textAlign: 'center' }}>
                  {u.is_active ? (
                    <span
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        padding: '0.2rem 0.5rem',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--status-success-bg)',
                        color: '#34d399',
                      }}
                    >
                      Đang hoạt động
                    </span>
                  ) : (
                    <span
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        padding: '0.2rem 0.5rem',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--status-danger-bg)',
                        color: '#f87171',
                      }}
                    >
                      Đã khóa
                    </span>
                  )}
                </td>
                <td style={{ padding: '0.875rem 1rem', textAlign: 'right' }}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                    <button
                      onClick={() => {
                        setResetUser(u);
                        setNewPassword('');
                        setResetMsg(null);
                      }}
                      title="Đặt lại mật khẩu"
                      style={{
                        padding: '0.35rem 0.6rem',
                        borderRadius: 'var(--radius-sm)',
                        background: 'rgba(255, 255, 255, 0.08)',
                        border: '1px solid var(--border-subtle)',
                        color: 'var(--text-secondary)',
                        fontSize: '0.75rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                      }}
                    >
                      <Key size={13} /> Reset pass
                    </button>

                    <button
                      onClick={() => handleToggleActive(u)}
                      style={{
                        padding: '0.35rem 0.65rem',
                        borderRadius: 'var(--radius-sm)',
                        background: u.is_active ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                        border: 'none',
                        color: u.is_active ? '#f87171' : '#34d399',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {u.is_active ? 'Khóa' : 'Mở khóa'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create Modal */}
      {isCreateOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            zIndex: 1100,
          }}
        >
          <div
            className="glass-panel"
            style={{
              width: '100%',
              maxWidth: '460px',
              padding: '2rem',
              borderRadius: 'var(--radius-lg)',
            }}
          >
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '1.25rem' }}>
              Tạo Tài Khoản Nhân Viên
            </h3>

            {createError && (
              <div
                style={{
                  padding: '0.75rem',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--status-danger-bg)',
                  border: '1px solid var(--status-danger)',
                  color: '#fca5a5',
                  fontSize: '0.85rem',
                  marginBottom: '1rem',
                }}
              >
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateUser} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  Họ và tên nhân viên:
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Ví dụ: Nguyễn Văn An"
                  style={{
                    width: '100%',
                    padding: '0.7rem 0.75rem',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                    fontSize: '0.9rem',
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  Tên đăng nhập (3 - 30 ký tự, viết thường, không dấu):
                </label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Ví dụ: vanan, thungan01..."
                  style={{
                    width: '100%',
                    padding: '0.7rem 0.75rem',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                    fontSize: '0.9rem',
                    fontFamily: 'var(--font-mono)',
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  Mật khẩu khởi tạo:
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Ít nhất 8 ký tự, chữ hoa, số & ký tự đặc biệt"
                  style={{
                    width: '100%',
                    padding: '0.7rem 0.75rem',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                    fontSize: '0.9rem',
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  Vai trò (Role):
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as Role)}
                  style={{
                    width: '100%',
                    padding: '0.7rem 0.75rem',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    outline: 'none',
                  }}
                >
                  <option value="WAITER">Nhân viên phục vụ (WAITER)</option>
                  <option value="CASHIER">Thu ngân (CASHIER)</option>
                  <option value="OWNER">Chủ quán (OWNER)</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <Button variant="secondary" size="md" onClick={() => setIsCreateOpen(false)}>
                  Hủy
                </Button>
                <Button variant="primary" size="md" type="submit" disabled={submitting}>
                  {submitting ? 'Đang tạo...' : 'Tạo Tài Khoản'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetUser && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            zIndex: 1100,
          }}
        >
          <div
            className="glass-panel"
            style={{
              width: '100%',
              maxWidth: '440px',
              padding: '2rem',
              borderRadius: 'var(--radius-lg)',
            }}
          >
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '0.5rem' }}>
              Đặt Lại Mật Khẩu
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
              Đặt lại mật khẩu cho tài khoản <strong>{resetUser.username}</strong> ({resetUser.full_name}).
              Tất cả các phiên làm việc hiện tại của nhân viên này sẽ bị thu hồi.
            </p>

            {resetMsg && (
              <div
                style={{
                  padding: '0.75rem',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--status-danger-bg)',
                  border: '1px solid var(--status-danger)',
                  color: '#fca5a5',
                  fontSize: '0.85rem',
                  marginBottom: '1rem',
                }}
              >
                {resetMsg}
              </div>
            )}

            <form onSubmit={handleResetPassword}>
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  Mật khẩu mới:
                </label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Nhập mật khẩu mới..."
                  style={{
                    width: '100%',
                    padding: '0.7rem 0.75rem',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                    fontSize: '0.9rem',
                    outline: 'none',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <Button variant="secondary" size="md" onClick={() => setResetUser(null)}>
                  Hủy
                </Button>
                <Button variant="primary" size="md" type="submit" disabled={resetSubmitting}>
                  {resetSubmitting ? 'Đang cập nhật...' : 'Xác Nhận Đổi Mật Khẩu'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
