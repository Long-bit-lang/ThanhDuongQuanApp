import React, { useState, useEffect, useMemo } from 'react';
import type { ProductData } from '../pos/types';
import { apiClient } from '../../shared/api/client';
import { useAuth } from '../auth/AuthContext';
import { Plus, Search, Edit2, Archive } from 'lucide-react';
import { Button } from '../../shared/components/Button';

export const MenuManagement: React.FC = () => {
  const { canManageMenu } = useAuth();
  const [products, setProducts] = useState<ProductData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);

  // Form modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductData | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const data = await apiClient.get<ProductData[]>(`/products?include_archived=${includeArchived}`);
      setProducts(data);
    } catch (err) {
      console.error('Failed to load menu products', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, [includeArchived]);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
  }, [products, search]);

  const handleOpenCreate = () => {
    setEditingProduct(null);
    setName('');
    setDescription('');
    setSalePrice('');
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (p: ProductData) => {
    setEditingProduct(p);
    setName(p.name);
    setDescription(p.description || '');
    setSalePrice(p.sale_price.toString());
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const priceNum = parseFloat(salePrice);
    if (!name.trim() || isNaN(priceNum) || priceNum < 0) {
      setFormError('Vui lòng nhập tên món và giá bán hợp lệ!');
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      if (editingProduct) {
        await apiClient.patch(`/products/${editingProduct.id}`, {
          name: name.trim(),
          description: description.trim() || undefined,
          sale_price: priceNum.toString(),
        });
      } else {
        await apiClient.post('/products', {
          name: name.trim(),
          description: description.trim() || undefined,
          sale_price: priceNum.toString(),
          is_available: true,
        });
      }
      setIsModalOpen(false);
      await loadProducts();
    } catch (err: unknown) {
      console.error('Save product error', err);
      const msg =
        err && typeof err === 'object' && 'body' in err && err.body && typeof err.body === 'object' && 'detail' in err.body
          ? String((err.body as { detail: unknown }).detail)
          : 'Không thể lưu món. Tên món có thể đã bị trùng!';
      setFormError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleAvailability = async (p: ProductData) => {
    try {
      await apiClient.post(`/products/${p.id}/toggle-availability`);
      await loadProducts();
    } catch (err) {
      console.error('Failed to toggle product availability', err);
      alert('Không thể thay đổi trạng thái bán của món này!');
    }
  };

  const handleArchive = async (p: ProductData) => {
    if (!window.confirm(`Bạn có chắc muốn lưu trữ (archive) món "${p.name}"? Món này sẽ không xuất hiện trong thực đơn gọi món mới nhưng lịch sử hóa đơn cũ vẫn được bảo toàn nguyên vẹn.`)) {
      return;
    }
    try {
      await apiClient.post(`/products/${p.id}/archive`);
      await loadProducts();
    } catch (err) {
      console.error('Failed to archive product', err);
      alert('Không thể lưu trữ món này!');
    }
  };

  const formatCurrency = (val: number) => `${Math.round(val).toLocaleString('vi-VN')}đ`;

  if (!canManageMenu) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
        <h2 style={{ fontSize: '1.25rem', color: '#f87171' }}>Truy cập bị từ chối</h2>
        <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
          Chỉ Chủ quán (OWNER) và Thu ngân (CASHIER) mới có quyền quản lý thực đơn.
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
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Quản Lý Thực Đơn & Giá Bán</h2>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Tổng số món: {products.length} • Mỗi món có một mức giá cố định
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', width: '220px' }}>
            <Search
              size={16}
              style={{
                position: 'absolute',
                left: '0.75rem',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
              }}
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm kiếm món..."
              style={{
                width: '100%',
                padding: '0.55rem 0.75rem 0.55rem 2.25rem',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
                fontSize: '0.85rem',
                outline: 'none',
              }}
            />
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(e) => setIncludeArchived(e.target.checked)}
            />
            <span>Xem cả món đã lưu trữ</span>
          </label>

          <Button variant="primary" size="md" onClick={handleOpenCreate} icon={<Plus size={16} />}>
            Thêm Món Mới
          </Button>
        </div>
      </div>

      {/* Products Table */}
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
              <th style={{ padding: '0.875rem 1rem', color: 'var(--text-secondary)' }}>Tên món</th>
              <th style={{ padding: '0.875rem 1rem', color: 'var(--text-secondary)' }}>Mô tả</th>
              <th style={{ padding: '0.875rem 1rem', textAlign: 'right', color: 'var(--text-secondary)' }}>Giá bán</th>
              <th style={{ padding: '0.875rem 1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Trạng thái</th>
              <th style={{ padding: '0.875rem 1rem', textAlign: 'right', color: 'var(--text-secondary)' }}>Hành động</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                  Đang tải danh sách món...
                </td>
              </tr>
            ) : filteredProducts.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                  Không tìm thấy món ăn hoặc đồ uống nào.
                </td>
              </tr>
            ) : (
              filteredProducts.map((p, idx) => (
                <tr
                  key={p.id}
                  style={{
                    borderBottom: '1px solid var(--border-subtle)',
                    background: idx % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'transparent',
                    opacity: p.is_archived ? 0.6 : 1,
                  }}
                >
                  <td style={{ padding: '0.875rem 1rem', fontWeight: 700 }}>
                    {p.name}
                    {p.is_archived && <span style={{ marginLeft: '0.5rem', fontSize: '0.7rem', color: '#9ca3af' }}>(Đã lưu trữ)</span>}
                  </td>
                  <td style={{ padding: '0.875rem 1rem', color: 'var(--text-secondary)', fontSize: '0.825rem' }}>
                    {p.description || '---'}
                  </td>
                  <td style={{ padding: '0.875rem 1rem', textAlign: 'right', fontWeight: 800, color: 'var(--accent-gold)' }}>
                    {formatCurrency(p.sale_price)}
                  </td>
                  <td style={{ padding: '0.875rem 1rem', textAlign: 'center' }}>
                    {p.is_archived ? (
                      <span style={{ fontSize: '0.75rem', color: '#9ca3af', fontWeight: 600 }}>ĐÃ LƯU TRỮ</span>
                    ) : p.is_available ? (
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
                        Đang bán
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
                        Hết món
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '0.875rem 1rem', textAlign: 'right' }}>
                    {!p.is_archived && (
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                        <button
                          onClick={() => handleToggleAvailability(p)}
                          title={p.is_available ? 'Đánh dấu hết món' : 'Mở bán lại'}
                          style={{
                            padding: '0.35rem 0.65rem',
                            borderRadius: 'var(--radius-sm)',
                            background: p.is_available ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                            border: 'none',
                            color: p.is_available ? '#f87171' : '#34d399',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          {p.is_available ? 'Báo hết món' : 'Mở bán lại'}
                        </button>
                        <button
                          onClick={() => handleOpenEdit(p)}
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
                          <Edit2 size={13} /> Sửa
                        </button>
                        <button
                          onClick={() => handleArchive(p)}
                          style={{
                            padding: '0.35rem 0.6rem',
                            borderRadius: 'var(--radius-sm)',
                            background: 'rgba(239, 68, 68, 0.1)',
                            border: '1px solid rgba(239, 68, 68, 0.2)',
                            color: '#f87171',
                            fontSize: '0.75rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                          }}
                        >
                          <Archive size={13} /> Lưu trữ
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Create / Edit Modal */}
      {isModalOpen && (
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
              maxWidth: '480px',
              padding: '2rem',
              borderRadius: 'var(--radius-lg)',
            }}
          >
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '1.25rem' }}>
              {editingProduct ? 'Chỉnh Sửa Món' : 'Thêm Món Mới Vào Menu'}
            </h3>

            {formError && (
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
                {formError}
              </div>
            )}

            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  Tên món ăn / đồ uống:
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ví dụ: Bò xào lăng, Bia Tiger Bạc..."
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
                  Giá bán (VND, số nguyên không dấu):
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  step="1000"
                  value={salePrice}
                  onChange={(e) => setSalePrice(e.target.value)}
                  placeholder="Ví dụ: 120000"
                  style={{
                    width: '100%',
                    padding: '0.7rem 0.75rem',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                    fontSize: '0.9rem',
                    fontWeight: 700,
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  Mô tả món (không bắt buộc):
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="Ví dụ: Ăn kèm bánh mì hoặc bún..."
                  style={{
                    width: '100%',
                    padding: '0.7rem 0.75rem',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                    fontSize: '0.85rem',
                    outline: 'none',
                    resize: 'none',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <Button variant="secondary" size="md" onClick={() => setIsModalOpen(false)}>
                  Hủy
                </Button>
                <Button variant="primary" size="md" type="submit" disabled={saving}>
                  {saving ? 'Đang lưu...' : 'Lưu Món'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
