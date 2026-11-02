import React, { useState, useEffect, useMemo } from 'react';
import type { DiningTableData, ProductData, SessionDetails, OrderItemData } from '../types';
import { apiClient } from '../../../shared/api/client';
import { useAuth } from '../../auth/AuthContext';
import { useIsMobile } from '../../../shared/hooks/useIsMobile';
import {
  X,
  Search,
  Plus,
  Minus,
  Trash2,
  Send,
  Receipt,
  Utensils,
  History,
  AlertCircle,
  ArrowRightLeft,
  CheckCircle2,
  ShoppingCart,
  ArrowLeft,
  ArrowRight,
  Edit3,
} from 'lucide-react';
import { Button } from '../../../shared/components/Button';

interface OrderModalProps {
  table: DiningTableData;
  onClose: () => void;
  onOpenBilling: (sessionDetails: SessionDetails) => void;
  onOpenSplit: (table: DiningTableData, items: OrderItemData[]) => void;
  onRefreshTables: () => void;
}

interface CartItem {
  product: ProductData;
  quantity: number;
  note: string;
}

export const OrderModal: React.FC<OrderModalProps> = ({
  table,
  onClose,
  onOpenBilling,
  onOpenSplit,
  onRefreshTables,
}) => {
  const { canBill } = useAuth();
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState<'NEW_ORDER' | 'ORDERED_ITEMS'>('NEW_ORDER');
  const [mobileOrderView, setMobileOrderView] = useState<'CATALOG' | 'CART'>('CATALOG');

  const [products, setProducts] = useState<ProductData[]>([]);
  const [sessionDetails, setSessionDetails] = useState<SessionDetails | null>(null);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [loadingSession, setLoadingSession] = useState(false);

  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [sendingOrder, setSendingOrder] = useState(false);
  const [orderSuccessMessage, setOrderSuccessMessage] = useState<string | null>(null);

  // Cancellation modal state
  const [cancellingItem, setCancellingItem] = useState<OrderItemData | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [submittingCancel, setSubmittingCancel] = useState(false);

  // Edit quantity modal state
  const [editingItem, setEditingItem] = useState<OrderItemData | null>(null);
  const [editingQuantity, setEditingQuantity] = useState<string>('');
  const [submittingEditQty, setSubmittingEditQty] = useState(false);

  // Load products
  const loadProducts = async () => {
    setLoadingProducts(true);
    try {
      const data = await apiClient.get<ProductData[]>('/products');
      setProducts(data);
    } catch (err) {
      console.error('Failed to load products', err);
    } finally {
      setLoadingProducts(false);
    }
  };

  // Load session details
  const loadSession = async () => {
    if (!table.active_session_id) return;
    setLoadingSession(true);
    try {
      const data = await apiClient.get<SessionDetails>(`/sessions/${table.active_session_id}`);
      setSessionDetails(data);
    } catch (err) {
      console.error('Failed to load session', err);
    } finally {
      setLoadingSession(false);
    }
  };

  useEffect(() => {
    loadProducts();
    loadSession();
  }, [table.active_session_id]);

  const [categoryFilter, setCategoryFilter] = useState<'ALL' | 'FOOD' | 'DRINK'>('ALL');

  const isDrink = (name: string, desc?: string) => {
    const text = `${name} ${desc || ''}`.toLowerCase();
    const drinkKeywords = [
      'bia', 'nước', 'coca', 'pepsi', 'tiger', 'saigon', 'sài gòn', 'heineken',
      'ken', 'trà', 'rượu', 'sting', 'redbull', 'suối', 'aquafina', 'cam',
      'chanh', 'soda', 'lavie', '7up', 'bò húc'
    ];
    return drinkKeywords.some((kw) => text.includes(kw));
  };

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchSearch = p.name.toLowerCase().includes(search.toLowerCase());
      if (!matchSearch) return false;
      if (categoryFilter === 'DRINK') return isDrink(p.name, p.description);
      if (categoryFilter === 'FOOD') return !isDrink(p.name, p.description);
      return true;
    });
  }, [products, search, categoryFilter]);

  const addToCart = (product: ProductData) => {
    if (!product.is_available) return;
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { product, quantity: 1, note: '' }];
    });
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.product.id === productId) {
            const newQ = Math.round((item.quantity + delta) * 1000) / 1000;
            return newQ > 0 ? { ...item, quantity: newQ } : null;
          }
          return item;
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const setExactQuantity = (productId: string, quantity: number) => {
    if (isNaN(quantity) || quantity <= 0) return;
    const cleanQty = Math.min(9999, Math.max(0.001, Math.round(quantity * 1000) / 1000));
    setCart((prev) =>
      prev.map((item) =>
        item.product.id === productId ? { ...item, quantity: cleanQty } : item
      )
    );
  };

  const updateNote = (productId: string, note: string) => {
    setCart((prev) =>
      prev.map((item) => (item.product.id === productId ? { ...item, note } : item))
    );
  };

  const cartSubtotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.product.sale_price * item.quantity, 0);
  }, [cart]);

  const handleSendOrder = async () => {
    if (!table.active_session_id || cart.length === 0 || sendingOrder) return;
    setSendingOrder(true);
    try {
      const itemsCount = cart.reduce((sum, item) => sum + item.quantity, 0);
      const payload = {
        items: cart.map((item) => ({
          product_id: item.product.id,
          quantity: item.quantity,
          note: item.note.trim() || undefined,
        })),
      };
      await apiClient.post(`/sessions/${table.active_session_id}/orders`, payload);
      setCart([]);
      await loadSession();
      onRefreshTables();
      setActiveTab('ORDERED_ITEMS');
      setOrderSuccessMessage(`Đã xác nhận và thêm thành công ${itemsCount} món vào danh sách món đã gọi của ${table.code}!`);
      setTimeout(() => setOrderSuccessMessage(null), 5000);
    } catch (err) {
      console.error('Failed to send order', err);
      alert('Không thể gửi order. Vui lòng kiểm tra lại kết nối!');
    } finally {
      setSendingOrder(false);
      setMobileOrderView('CATALOG');
    }
  };

  const handleConfirmCancel = async () => {
    if (!cancellingItem || submittingCancel) return;
    setSubmittingCancel(true);
    try {
      await apiClient.post(`/order-items/${cancellingItem.id}/cancel`, {
        reason: cancelReason.trim() || undefined,
      });
      setCancellingItem(null);
      setCancelReason('');
      await loadSession();
      onRefreshTables();
    } catch (err) {
      console.error('Failed to cancel item', err);
      alert('Không thể hủy món này!');
    } finally {
      setSubmittingCancel(false);
    }
  };

  const formatCurrency = (val: number) => `${Math.round(val).toLocaleString('vi-VN')}đ`;

  const formatQuantity = (qty: number) => {
    if (Number.isInteger(qty)) return qty.toString();
    return parseFloat(qty.toFixed(3)).toString();
  };

  const handleStartEdit = (it: OrderItemData) => {
    setEditingItem(it);
    setEditingQuantity(formatQuantity(it.quantity));
  };

  const handleConfirmEditQuantity = async () => {
    if (!editingItem || submittingEditQty) return;
    const q = parseFloat(editingQuantity);
    if (isNaN(q) || q <= 0) {
      alert('Vui lòng nhập số lượng hợp lệ lớn hơn 0 (ví dụ: 0.5, 0.22, 1, 24...)');
      return;
    }
    setSubmittingEditQty(true);
    try {
      await apiClient.patch(`/order-items/${editingItem.id}/quantity`, {
        quantity: q,
      });
      setOrderSuccessMessage(`Đã cập nhật số lượng món "${editingItem.product_name}" thành ${formatQuantity(q)}!`);
      setTimeout(() => setOrderSuccessMessage(null), 5000);
      setEditingItem(null);
      await loadSession();
      onRefreshTables();
    } catch (err: any) {
      console.error('Failed to update quantity', err);
      alert(err.response?.data?.detail || 'Không thể cập nhật số lượng món!');
    } finally {
      setSubmittingEditQty(false);
    }
  };

  return (
    <div
      className="modal-overlay-responsive"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(15, 23, 42, 0.45)',
        backdropFilter: 'blur(8px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: isMobile ? 0 : '1rem',
      }}
    >
      <div
        className="glass-panel modal-container-responsive"
        style={{
          width: '100%',
          maxWidth: isMobile ? '100vw' : '1050px',
          height: isMobile ? '100dvh' : '92vh',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: isMobile ? 0 : 'var(--radius-xl)',
          overflow: 'hidden',
          background: '#ffffff',
          border: isMobile ? 'none' : '1px solid var(--border-subtle)',
          boxShadow: isMobile ? 'none' : '0 25px 50px -12px rgba(0, 0, 0, 0.18)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: isMobile ? '0.75rem 1rem' : '1.25rem 1.5rem',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#ffffff',
            gap: '0.5rem',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '0.4rem' : '0.75rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: isMobile ? '1.25rem' : '1.5rem', fontWeight: 900, color: 'var(--accent-gold)' }}>
                {table.code}
              </span>
              <span style={{ fontSize: isMobile ? '0.95rem' : '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {table.display_name}
              </span>
              <span
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  padding: '0.15rem 0.5rem',
                  borderRadius: 'var(--radius-sm)',
                  background: table.payment_status === 'PAID' ? '#d1fae5' : 'rgba(217, 119, 6, 0.12)',
                  color: table.payment_status === 'PAID' ? '#065f46' : '#b45309',
                }}
              >
                {table.payment_status === 'PAID' ? '✓ Đã TT' : 'Đang phục vụ'}
              </span>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
              Tạm tính:{' '}
              <strong style={{ color: 'var(--accent-gold)' }}>
                {formatCurrency(sessionDetails?.running_subtotal ?? table.running_subtotal ?? 0)}
              </strong>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '0.4rem' : '0.75rem' }}>
            {canBill && sessionDetails && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => onOpenBilling(sessionDetails)}
                icon={<Receipt size={14} />}
              >
                {isMobile ? 'Tính tiền' : 'Lập Hóa Đơn & Tính Tiền'}
              </Button>
            )}

            <button
              onClick={onClose}
              style={{
                background: 'rgba(0, 0, 0, 0.05)',
                border: 'none',
                color: 'var(--text-secondary)',
                borderRadius: '50%',
                width: isMobile ? '32px' : '36px',
                height: isMobile ? '32px' : '36px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <X size={isMobile ? 18 : 20} />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div
          style={{
            display: 'flex',
            background: '#ffffff',
            borderBottom: '1px solid var(--border-subtle)',
            padding: isMobile ? '0 0.5rem' : '0 1.5rem',
          }}
        >
          <button
            onClick={() => {
              setActiveTab('NEW_ORDER');
              if (isMobile) setMobileOrderView('CATALOG');
            }}
            style={{
              padding: isMobile ? '0.65rem 0.85rem' : '0.875rem 1.25rem',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'NEW_ORDER' ? '3px solid var(--accent-gold)' : '3px solid transparent',
              color: activeTab === 'NEW_ORDER' ? 'var(--accent-gold)' : 'var(--text-secondary)',
              fontWeight: 700,
              fontSize: isMobile ? '0.825rem' : '0.9rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
            }}
          >
            <Utensils size={15} />
            Gọi Món Mới {cart.length > 0 && `(${formatQuantity(cart.reduce((s, i) => s + i.quantity, 0))})`}
          </button>
          <button
            onClick={() => setActiveTab('ORDERED_ITEMS')}
            style={{
              padding: isMobile ? '0.65rem 0.85rem' : '0.875rem 1.25rem',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'ORDERED_ITEMS' ? '3px solid var(--accent-gold)' : '3px solid transparent',
              color: activeTab === 'ORDERED_ITEMS' ? 'var(--accent-gold)' : 'var(--text-secondary)',
              fontWeight: 700,
              fontSize: isMobile ? '0.825rem' : '0.9rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
            }}
          >
            <History size={15} />
            Món Đã Gọi ({formatQuantity(sessionDetails?.active_items?.reduce((sum, it) => sum + it.quantity, 0) ?? 0)})
          </button>
        </div>

        {/* Success Confirmation Toast Banner */}
        {orderSuccessMessage && (
          <div
            style={{
              padding: '0.85rem 1.5rem',
              background: '#ecfdf5',
              borderBottom: '1px solid #10b981',
              color: '#065f46',
              fontWeight: 700,
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.75rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <CheckCircle2 size={18} color="#059669" />
              <span>{orderSuccessMessage}</span>
            </div>
            <button
              onClick={() => setOrderSuccessMessage(null)}
              style={{
                background: 'none',
                border: 'none',
                color: '#059669',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: '0.8rem',
              }}
            >
              Đóng
            </button>
          </div>
        )}

        {/* Paid Status Alert */}
        {table.payment_status === 'PAID' && (
          <div
            style={{
              padding: '0.75rem 1.5rem',
              background: '#f0fdf4',
              borderBottom: '1px solid #10b981',
              color: '#065f46',
              fontWeight: 700,
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.75rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <CheckCircle2 size={16} color="#059669" />
              <span>
                Bàn này <strong>ĐÃ THANH TOÁN XONG</strong> {table.invoice_number ? `(Hóa đơn: ${table.invoice_number})` : ''}. Bạn vẫn có thể tiếp tục gọi thêm món mới nếu khách dùng thêm.
              </span>
            </div>
            {canBill && sessionDetails && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onOpenBilling(sessionDetails)}
                icon={<Receipt size={14} />}
              >
                Xem Hóa Đơn & QR
              </Button>
            )}
          </div>
        )}

        {/* Tab Content */}
        {activeTab === 'NEW_ORDER' ? (
          <div
            style={{
              flex: 1,
              minHeight: 0,
              height: '100%',
              display: isMobile ? 'flex' : 'grid',
              flexDirection: isMobile ? 'column' : undefined,
              gridTemplateColumns: isMobile ? undefined : '1.4fr 1fr',
              overflow: 'hidden',
            }}
          >
            {/* Product Catalog */}
            {(!isMobile || mobileOrderView === 'CATALOG') && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  height: '100%',
                  minHeight: 0,
                  overflow: 'hidden',
                  borderRight: isMobile ? 'none' : '1px solid var(--border-subtle)',
                  width: '100%',
                }}
              >
                <div style={{ flexShrink: 0, padding: isMobile ? '0.6rem 0.75rem' : '0.75rem 1rem', borderBottom: '1px solid var(--border-subtle)', background: '#ffffff' }}>
                  <div style={{ position: 'relative' }}>
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
                      placeholder="Tìm món ăn, bia, đồ uống..."
                      style={{
                        width: '100%',
                        padding: '0.6rem 0.75rem 0.6rem 2.25rem',
                        borderRadius: 'var(--radius-md)',
                        background: 'var(--bg-tertiary)',
                        border: '1px solid var(--border-subtle)',
                        color: 'var(--text-primary)',
                        fontSize: '0.85rem',
                        outline: 'none',
                      }}
                    />
                  </div>

                  {/* Category Filter Pills */}
                  <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.5rem', overflowX: 'auto', paddingBottom: '0.15rem' }}>
                    <button
                      type="button"
                      onClick={() => setCategoryFilter('ALL')}
                      style={{
                        padding: '0.25rem 0.6rem',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        border: 'none',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        background: categoryFilter === 'ALL' ? 'var(--accent-gold)' : 'var(--bg-tertiary)',
                        color: categoryFilter === 'ALL' ? '#ffffff' : 'var(--text-secondary)',
                      }}
                    >
                      Tất cả ({products.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setCategoryFilter('FOOD')}
                      style={{
                        padding: '0.25rem 0.6rem',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        border: 'none',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        background: categoryFilter === 'FOOD' ? 'var(--accent-gold)' : 'var(--bg-tertiary)',
                        color: categoryFilter === 'FOOD' ? '#ffffff' : 'var(--text-secondary)',
                      }}
                    >
                      🍲 Món ăn
                    </button>
                    <button
                      type="button"
                      onClick={() => setCategoryFilter('DRINK')}
                      style={{
                        padding: '0.25rem 0.6rem',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        border: 'none',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        background: categoryFilter === 'DRINK' ? 'var(--accent-gold)' : 'var(--bg-tertiary)',
                        color: categoryFilter === 'DRINK' ? '#ffffff' : 'var(--text-secondary)',
                      }}
                    >
                      🍺 Bia & Đồ uống
                    </button>
                  </div>
                </div>

                <div
                  style={{
                    flex: 1,
                    minHeight: 0,
                    overflowY: 'auto',
                    padding: isMobile ? '0.75rem' : '1rem',
                    display: 'grid',
                    gridTemplateColumns: isMobile
                      ? 'repeat(auto-fill, minmax(135px, 1fr))'
                      : 'repeat(auto-fill, minmax(170px, 1fr))',
                    gap: isMobile ? '0.6rem' : '0.75rem',
                    alignContent: 'start',
                  }}
                >
                  {loadingProducts ? (
                    <div style={{ gridColumn: '1 / -1', padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                      Đang tải danh sách món...
                    </div>
                  ) : filteredProducts.map((p) => {
                    const inCart = cart.find((c) => c.product.id === p.id);
                    return (
                      <div
                        key={p.id}
                        onClick={() => addToCart(p)}
                        style={{
                          padding: isMobile ? '0.75rem 0.65rem' : '0.875rem',
                          borderRadius: 'var(--radius-md)',
                          background: inCart ? '#fef3c7' : '#ffffff',
                          border: inCart ? '1.5px solid var(--accent-gold)' : '1px solid var(--border-subtle)',
                          boxShadow: inCart ? '0 4px 12px rgba(217, 119, 6, 0.15)' : '0 1px 3px rgba(0, 0, 0, 0.04)',
                          cursor: p.is_available ? 'pointer' : 'not-allowed',
                          opacity: p.is_available ? 1 : 0.5,
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          minHeight: isMobile ? '90px' : '100px',
                          transition: 'all 0.15s ease',
                          WebkitTapHighlightColor: 'transparent',
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 700, fontSize: isMobile ? '0.85rem' : '0.9rem', color: 'var(--text-primary)', lineHeight: 1.25 }}>
                            {p.name}
                          </div>
                          {p.description && !isMobile && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                              {p.description}
                            </div>
                          )}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
                          <span style={{ fontWeight: 800, color: 'var(--accent-gold)', fontSize: isMobile ? '0.9rem' : '0.95rem' }}>
                            {formatCurrency(p.sale_price)}
                          </span>
                          {!p.is_available ? (
                            <span style={{ fontSize: '0.675rem', color: '#ef4444', fontWeight: 700 }}>HẾT MÓN</span>
                          ) : inCart ? (
                            <span
                              style={{
                                background: 'var(--accent-gold)',
                                color: '#ffffff',
                                fontWeight: 800,
                                fontSize: '0.75rem',
                                width: '24px',
                                height: '24px',
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifySelf: 'center',
                                justifyContent: 'center',
                                boxShadow: '0 2px 6px rgba(217, 119, 6, 0.3)',
                              }}
                            >
                              {inCart.quantity}
                            </span>
                          ) : (
                            <div
                              style={{
                                width: '24px',
                                height: '24px',
                                borderRadius: '50%',
                                background: 'var(--bg-tertiary)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              <Plus size={14} color="var(--text-secondary)" />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Mobile Floating Cart Summary Bar */}
                {isMobile && cart.length > 0 && (
                  <div
                    onClick={() => setMobileOrderView('CART')}
                    style={{
                      flexShrink: 0,
                      padding: '0.85rem 1rem',
                      background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      boxShadow: '0 -4px 16px rgba(5, 150, 105, 0.35)',
                      zIndex: 20,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <div
                        style={{
                          background: 'rgba(255, 255, 255, 0.25)',
                          borderRadius: '50%',
                          width: '32px',
                          height: '32px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <ShoppingCart size={18} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>
                          {cart.reduce((s, i) => s + i.quantity, 0)} món • {formatCurrency(cartSubtotal)}
                        </div>
                        <div style={{ fontSize: '0.72rem', opacity: 0.9 }}>Chạm để kiểm tra & xác nhận gọi món</div>
                      </div>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        fontWeight: 800,
                        fontSize: '0.85rem',
                        background: '#ffffff',
                        color: '#047857',
                        padding: '0.45rem 0.85rem',
                        borderRadius: 'var(--radius-md)',
                      }}
                    >
                      <span>Xem giỏ</span>
                      <ArrowRight size={15} />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Cart Drawer */}
            {(!isMobile || mobileOrderView === 'CART') && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  height: '100%',
                  minHeight: 0,
                  overflow: 'hidden',
                  background: 'var(--bg-tertiary)',
                  width: '100%',
                }}
              >
                {/* Cart Drawer Header */}
                <div
                  style={{
                    flexShrink: 0,
                    padding: isMobile ? '0.65rem 0.85rem' : '0.85rem 1rem',
                    borderBottom: '1px solid var(--border-subtle)',
                    fontWeight: 800,
                    fontSize: '0.95rem',
                    color: 'var(--text-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: '#ffffff',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {isMobile && (
                      <button
                        onClick={() => setMobileOrderView('CATALOG')}
                        style={{
                          background: 'rgba(0, 0, 0, 0.05)',
                          border: 'none',
                          borderRadius: 'var(--radius-sm)',
                          padding: '0.35rem 0.6rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          color: 'var(--text-primary)',
                          fontWeight: 700,
                          fontSize: '0.8rem',
                          cursor: 'pointer',
                        }}
                      >
                        <ArrowLeft size={15} />
                        <span>Thêm món</span>
                      </button>
                    )}
                    <span>Đợt gọi món mới</span>
                    {cart.length > 0 && (
                      <span
                        style={{
                          background: 'var(--accent-gold)',
                          color: '#ffffff',
                          fontSize: '0.75rem',
                          fontWeight: 800,
                          padding: '0.15rem 0.5rem',
                          borderRadius: '9999px',
                        }}
                      >
                        {cart.reduce((s, i) => s + i.quantity, 0)} món
                      </span>
                    )}
                  </div>
                  {cart.length > 0 && (
                    <button
                      onClick={() => setCart([])}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#ef4444',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      Xóa giỏ
                    </button>
                  )}
                </div>

                {/* Cart Items List */}
                <div
                  style={{
                    flex: 1,
                    minHeight: 0,
                    overflowY: 'auto',
                    padding: isMobile ? '0.75rem' : '1rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.65rem',
                  }}
                >
                  {cart.length === 0 ? (
                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '4rem', fontSize: '0.875rem' }}>
                      {isMobile ? (
                        <div>
                          <div>Chưa có món nào trong giỏ.</div>
                          <button
                            onClick={() => setMobileOrderView('CATALOG')}
                            style={{
                              marginTop: '1rem',
                              padding: '0.5rem 1rem',
                              background: 'var(--accent-gold)',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: 'var(--radius-md)',
                              fontWeight: 700,
                              fontSize: '0.85rem',
                              cursor: 'pointer',
                            }}
                          >
                            Quay lại chọn món
                          </button>
                        </div>
                      ) : (
                        'Chạm vào món bên trái để thêm vào đợt gọi'
                      )}
                    </div>
                  ) : (
                    cart.map((item) => (
                      <div
                        key={item.product.id}
                        style={{
                          padding: isMobile ? '0.65rem 0.75rem' : '0.75rem',
                          borderRadius: 'var(--radius-md)',
                          background: '#ffffff',
                          border: '1px solid var(--border-subtle)',
                          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 700, fontSize: isMobile ? '0.85rem' : '0.875rem', color: 'var(--text-primary)' }}>
                            {item.product.name}
                          </span>
                          <span style={{ fontWeight: 800, color: 'var(--accent-gold)', fontSize: isMobile ? '0.85rem' : '0.875rem' }}>
                            {formatCurrency(item.product.sale_price * item.quantity)}
                          </span>
                        </div>

                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginTop: '0.5rem',
                            gap: '0.5rem',
                            flexWrap: 'wrap',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <button
                              onClick={() => updateQuantity(item.product.id, -1)}
                              style={{
                                width: isMobile ? '32px' : '26px',
                                height: isMobile ? '32px' : '26px',
                                borderRadius: '4px',
                                background: '#f1f5f9',
                                border: '1px solid var(--border-subtle)',
                                color: 'var(--text-primary)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              <Minus size={14} />
                            </button>
                            <input
                              type="number"
                              step="any"
                              min="0.001"
                              max="9999"
                              value={item.quantity}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value);
                                if (!isNaN(val) && val > 0) {
                                  setExactQuantity(item.product.id, val);
                                }
                              }}
                              onFocus={(e) => e.target.select()}
                              title="Bấm để nhập số lượng trực tiếp (ví dụ 0.5, 0.22, 24)"
                              style={{
                                width: isMobile ? '56px' : '52px',
                                height: isMobile ? '32px' : '26px',
                                textAlign: 'center',
                                fontWeight: 800,
                                fontSize: isMobile ? '0.95rem' : '0.9rem',
                                borderRadius: '4px',
                                border: '1.5px solid var(--accent-gold)',
                                background: '#ffffff',
                                color: 'var(--text-primary)',
                                outline: 'none',
                                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
                              }}
                            />
                            <button
                              onClick={() => updateQuantity(item.product.id, 1)}
                              style={{
                                width: isMobile ? '32px' : '26px',
                                height: isMobile ? '32px' : '26px',
                                borderRadius: '4px',
                                background: '#f1f5f9',
                                border: '1px solid var(--border-subtle)',
                                color: 'var(--text-primary)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              <Plus size={14} />
                            </button>
                          </div>

                          <input
                            type="text"
                            value={item.note}
                            onChange={(e) => updateNote(item.product.id, e.target.value)}
                            placeholder="Ghi chú (ít đá, cay...)"
                            style={{
                              flex: 1,
                              minWidth: '120px',
                              maxWidth: isMobile ? '100%' : '160px',
                              padding: '0.35rem 0.5rem',
                              borderRadius: 'var(--radius-sm)',
                              background: '#ffffff',
                              border: '1px solid var(--border-subtle)',
                              color: 'var(--text-primary)',
                              fontSize: '0.75rem',
                              outline: 'none',
                            }}
                          />
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Cart Footer with Prominent Confirmation Button */}
                <div
                  style={{
                    flexShrink: 0,
                    padding: isMobile ? '0.85rem 1rem' : '1.15rem 1.25rem',
                    borderTop: '1px solid var(--border-subtle)',
                    background: '#ffffff',
                    boxShadow: '0 -4px 15px rgba(0, 0, 0, 0.04)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.65rem' }}>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600 }}>
                      Tổng đợt gọi này:
                    </span>
                    <span style={{ fontSize: isMobile ? '1.15rem' : '1.25rem', fontWeight: 900, color: 'var(--accent-gold)' }}>
                      {formatCurrency(cartSubtotal)}
                    </span>
                  </div>

                  <button
                    disabled={cart.length === 0 || sendingOrder}
                    onClick={handleSendOrder}
                    style={{
                      width: '100%',
                      padding: isMobile ? '0.85rem' : '0.9rem 1rem',
                      borderRadius: 'var(--radius-md)',
                      background: cart.length > 0 ? 'linear-gradient(135deg, #059669 0%, #047857 100%)' : 'var(--bg-tertiary)',
                      color: cart.length > 0 ? '#ffffff' : 'var(--text-muted)',
                      fontWeight: 800,
                      fontSize: isMobile ? '0.9rem' : '0.95rem',
                      border: 'none',
                      cursor: cart.length > 0 && !sendingOrder ? 'pointer' : 'not-allowed',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.5rem',
                      boxShadow: cart.length > 0 ? '0 4px 15px rgba(5, 150, 105, 0.35)' : 'none',
                      transition: 'all 0.2s ease',
                      WebkitTapHighlightColor: 'transparent',
                    }}
                  >
                    <Send size={18} />
                    {sendingOrder
                      ? 'Đang gửi...'
                      : cart.length > 0
                      ? `✓ XÁC NHẬN GỌI MÓN (${cart.reduce((s, i) => s + i.quantity, 0)} món)`
                      : 'Chọn món để xác nhận gọi'}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Tab: Ordered Items */
          <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 800 }}>Danh sách món đã gọi của bàn</h3>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Tổng cộng: {sessionDetails?.active_items?.length ?? 0} món đang phục vụ
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setActiveTab('NEW_ORDER')}
                  icon={<Plus size={14} />}
                >
                  Gọi Thêm Món
                </Button>
                {sessionDetails && sessionDetails.active_items.length > 0 && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onOpenSplit(table, sessionDetails.active_items)}
                    icon={<ArrowRightLeft size={14} />}
                  >
                    Tách món
                  </Button>
                )}
              </div>
            </div>

            {loadingSession ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                Đang tải danh sách món...
              </div>
            ) : !sessionDetails || (sessionDetails.active_items.length === 0 && sessionDetails.cancelled_items.length === 0) ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                Chưa có món nào được gọi trong phiên này.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {sessionDetails.active_items.map((it) => (
                  <div
                    key={it.id}
                    style={{
                      padding: '1rem',
                      borderRadius: 'var(--radius-md)',
                      background: '#ffffff',
                      border: '1px solid var(--border-subtle)',
                      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '0.5rem',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>{it.product_name}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                        <span style={{ fontWeight: 800, color: 'var(--text-primary)', background: '#f1f5f9', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>
                          {formatQuantity(it.quantity)}
                        </span>{' '}
                        x {formatCurrency(it.unit_price)}
                        {it.note && <span style={{ color: 'var(--accent-gold)', marginLeft: '0.5rem' }}>• {it.note}</span>}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 900, fontSize: '1.05rem', color: 'var(--accent-gold)', marginRight: '0.35rem' }}>
                        {formatCurrency(it.line_total)}
                      </span>
                      <button
                        onClick={() => handleStartEdit(it)}
                        title="Bấm để chỉnh lại số lượng món này (hỗ trợ số thực như 0.5, 0.22...)"
                        style={{
                          padding: '0.4rem 0.65rem',
                          borderRadius: 'var(--radius-sm)',
                          background: 'rgba(217, 119, 6, 0.12)',
                          border: '1px solid rgba(217, 119, 6, 0.35)',
                          color: '#d97706',
                          fontWeight: 700,
                          fontSize: '0.775rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                        }}
                      >
                        <Edit3 size={13} /> Sửa SL
                      </button>
                      <button
                        onClick={() => {
                          setCancellingItem(it);
                          setCancelReason('');
                        }}
                        style={{
                          padding: '0.4rem 0.65rem',
                          borderRadius: 'var(--radius-sm)',
                          background: 'rgba(239, 68, 68, 0.15)',
                          border: '1px solid rgba(239, 68, 68, 0.3)',
                          color: '#f87171',
                          fontWeight: 700,
                          fontSize: '0.775rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                        }}
                      >
                        <Trash2 size={13} /> Hủy món
                      </button>
                    </div>
                  </div>
                ))}

                {/* Cancelled items audit list */}
                {sessionDetails.cancelled_items.length > 0 && (
                  <div style={{ marginTop: '1.5rem' }}>
                    <div
                      style={{
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        color: 'var(--text-muted)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        marginBottom: '0.5rem',
                      }}
                    >
                      Lịch sử món đã hủy (Bảo toàn dữ liệu):
                    </div>
                    {sessionDetails.cancelled_items.map((it) => (
                      <div
                        key={it.id}
                        style={{
                          padding: '0.75rem 1rem',
                          borderRadius: 'var(--radius-md)',
                          background: 'rgba(239, 68, 68, 0.05)',
                          border: '1px dashed rgba(239, 68, 68, 0.25)',
                          color: 'var(--text-muted)',
                          fontSize: '0.825rem',
                          display: 'flex',
                          justifyContent: 'space-between',
                          marginBottom: '0.4rem',
                        }}
                      >
                        <span>
                          <del>{it.product_name}</del> x {it.quantity}
                          {it.cancellation_reason && <em> — Lý do: {it.cancellation_reason}</em>}
                        </span>
                        <span style={{ color: '#f87171', fontWeight: 600 }}>ĐÃ HỦY</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Cancellation confirmation dialog */}
        {cancellingItem && (
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
                maxWidth: '420px',
                padding: '1.75rem',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid rgba(239, 68, 68, 0.4)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#f87171', marginBottom: '1rem' }}>
                <AlertCircle size={22} />
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800 }}>Xác nhận hủy món</h3>
              </div>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                Bạn có chắc chắn muốn hủy món <strong>{cancellingItem.product_name}</strong> (x
                {cancellingItem.quantity})?
              </p>

              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.775rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                  Lý do hủy (không bắt buộc):
                </label>
                <input
                  type="text"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Ví dụ: Khách đổi ý, bếp báo hết nguyên liệu..."
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.75rem',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                    fontSize: '0.85rem',
                    outline: 'none',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <Button variant="secondary" size="md" onClick={() => setCancellingItem(null)}>
                  Bỏ qua
                </Button>
                <Button
                  variant="primary"
                  size="md"
                  disabled={submittingCancel}
                  onClick={handleConfirmCancel}
                  style={{ background: '#ef4444', borderColor: '#ef4444' }}
                >
                  {submittingCancel ? 'Đang hủy...' : 'Đồng Ý Hủy Món'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Quantity Modal */}
        {editingItem && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.75)',
              backdropFilter: 'blur(4px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1100,
              padding: '1rem',
            }}
          >
            <div
              className="glass-panel"
              style={{
                width: '100%',
                maxWidth: '440px',
                padding: '1.75rem',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--accent-gold)',
                background: '#ffffff',
                boxShadow: '0 20px 40px rgba(0, 0, 0, 0.25)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-gold)' }}>
                  <Edit3 size={20} />
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)' }}>Chỉnh sửa số lượng món</h3>
                </div>
                <button
                  onClick={() => setEditingItem(null)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                >
                  <X size={20} />
                </button>
              </div>

              <div style={{ background: '#f8fafc', padding: '0.85rem 1rem', borderRadius: 'var(--radius-md)', marginBottom: '1.25rem', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--text-primary)' }}>{editingItem.product_name}</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                  Đơn giá: <strong>{formatCurrency(editingItem.unit_price)}</strong> • Đang phục vụ: <strong>{formatQuantity(editingItem.quantity)}</strong>
                </div>
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
                  Nhập số lượng mới (hỗ trợ số thực ví dụ 0.5, 0.22, 1, 24...):
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={() => {
                      const cur = parseFloat(editingQuantity) || 0;
                      const next = cur > 1 ? cur - 1 : Math.max(0.01, cur - 0.1);
                      setEditingQuantity(formatQuantity(Math.round(next * 100) / 100));
                    }}
                    style={{
                      width: '42px',
                      height: '42px',
                      borderRadius: 'var(--radius-md)',
                      background: '#f1f5f9',
                      border: '1px solid var(--border-subtle)',
                      fontWeight: 800,
                      fontSize: '1.1rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Minus size={18} />
                  </button>

                  <input
                    type="number"
                    step="any"
                    min="0.001"
                    max="9999"
                    value={editingQuantity}
                    onChange={(e) => setEditingQuantity(e.target.value)}
                    autoFocus
                    onFocus={(e) => e.target.select()}
                    placeholder="0.5 hoặc 0.22..."
                    style={{
                      flex: 1,
                      height: '42px',
                      padding: '0 0.75rem',
                      borderRadius: 'var(--radius-md)',
                      border: '2px solid var(--accent-gold)',
                      fontSize: '1.15rem',
                      fontWeight: 800,
                      textAlign: 'center',
                      outline: 'none',
                      color: 'var(--text-primary)',
                      background: '#ffffff',
                    }}
                  />

                  <button
                    type="button"
                    onClick={() => {
                      const cur = parseFloat(editingQuantity) || 0;
                      const next = cur >= 1 ? cur + 1 : Math.round((cur + 0.1) * 100) / 100;
                      setEditingQuantity(formatQuantity(next));
                    }}
                    style={{
                      width: '42px',
                      height: '42px',
                      borderRadius: 'var(--radius-md)',
                      background: '#f1f5f9',
                      border: '1px solid var(--border-subtle)',
                      fontWeight: 800,
                      fontSize: '1.1rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Plus size={18} />
                  </button>
                </div>

                {/* Quick preset buttons */}
                <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Gợi ý nhanh:</span>
                  {[0.22, 0.5, 1, 2, 5, 12, 24].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setEditingQuantity(val.toString())}
                      style={{
                        padding: '0.25rem 0.55rem',
                        borderRadius: 'var(--radius-sm)',
                        background: editingQuantity === val.toString() ? 'var(--accent-gold)' : '#f1f5f9',
                        color: editingQuantity === val.toString() ? '#ffffff' : 'var(--text-secondary)',
                        border: '1px solid var(--border-subtle)',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {val}
                    </button>
                  ))}
                </div>
              </div>

              {/* Total preview */}
              <div
                style={{
                  padding: '0.85rem 1rem',
                  borderRadius: 'var(--radius-md)',
                  background: '#fef3c7',
                  border: '1px solid #f59e0b',
                  marginBottom: '1.5rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#92400e' }}>Thành tiền mới:</span>
                <span style={{ fontSize: '1.15rem', fontWeight: 900, color: '#b45309' }}>
                  {formatCurrency(editingItem.unit_price * (parseFloat(editingQuantity) || 0))}
                </span>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <Button variant="secondary" size="md" onClick={() => setEditingItem(null)}>
                  Bỏ qua
                </Button>
                <Button
                  variant="primary"
                  size="md"
                  disabled={submittingEditQty || !parseFloat(editingQuantity) || parseFloat(editingQuantity) <= 0}
                  onClick={handleConfirmEditQuantity}
                >
                  {submittingEditQty ? 'Đang lưu...' : 'Lưu Thay Đổi'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
