import React, { useState, useEffect, useCallback } from 'react';
import { AuthProvider, useAuth } from '../features/auth/AuthContext';
import { LoginForm } from '../features/auth/components/LoginForm';
import { TableGrid } from '../features/pos/components/TableGrid';
import { OrderModal } from '../features/pos/components/OrderModal';
import { BillingModal } from '../features/pos/components/BillingModal';
import { PaymentModal } from '../features/pos/components/PaymentModal';
import { ReceiptModal } from '../features/pos/components/ReceiptModal';
import { MergeSplitModal } from '../features/pos/components/MergeSplitModal';
import { MenuManagement } from '../features/menu/MenuManagement';
import { StaffManagement } from '../features/staff/StaffManagement';
import { RevenueReport } from '../features/reports/RevenueReport';
import { AuditLogView } from '../features/audit/AuditLogView';
import { ErrorBoundary } from '../shared/components/ErrorBoundary';

// Phase 1 Diagnostic Views (Preserved in 'Kiểm tra hệ thống' tab)
import { HealthCard } from '../features/health/components/HealthCard';
import { DatabaseStatus } from '../features/health/components/DatabaseStatus';
import { SystemOverview } from '../features/dashboard/components/SystemOverview';
import { DevicePreview } from '../features/dashboard/components/DevicePreview';
import { useHealthCheck } from '../features/health/hooks/useHealthCheck';
import { useWebSocket } from '../shared/hooks/useWebSocket';
import { useIsMobile } from '../shared/hooks/useIsMobile';

import type { DiningTableData, SessionDetails, InvoiceData, OrderItemData } from '../features/pos/types';
import { apiClient } from '../shared/api/client';
import {
  LayoutGrid,
  UtensilsCrossed,
  BarChart3,
  Users,
  Shield,
  Activity,
  LogOut,
  Radio,
  Bell,
} from 'lucide-react';

type ActiveTab = 'FLOOR' | 'MENU' | 'REVENUE' | 'STAFF' | 'AUDIT' | 'SYSTEM';

const MainPOSApp: React.FC = () => {
  const { user, logout, isOwner, isCashier, canManageMenu, canViewRevenue, canManageUsers } = useAuth();
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState<ActiveTab>('FLOOR');

  // Tables State
  const [tables, setTables] = useState<DiningTableData[]>([]);
  const [loadingTables, setLoadingTables] = useState(false);

  // Active Modals State
  const [orderTable, setOrderTable] = useState<DiningTableData | null>(null);
  const [billingSession, setBillingSession] = useState<SessionDetails | null>(null);
  const [paymentInvoice, setPaymentInvoice] = useState<InvoiceData | null>(null);
  const [receiptInvoiceId, setReceiptInvoiceId] = useState<string | null>(null);

  // Merge / Split Modal State
  const [mergeSplitConfig, setMergeSplitConfig] = useState<{
    isOpen: boolean;
    mode: 'MERGE' | 'SPLIT';
    selectedTable?: DiningTableData;
    splitItems?: OrderItemData[];
  }>({ isOpen: false, mode: 'MERGE' });

  // Toast notification state
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((current) => (current === msg ? null : current));
    }, 4000);
  };

  // Load all 50 tables with session data
  const loadTables = useCallback(async () => {
    setLoadingTables(true);
    try {
      const data = await apiClient.get<DiningTableData[]>('/tables');
      setTables(data);
    } catch (err) {
      console.error('Failed to load tables', err);
    } finally {
      setLoadingTables(false);
    }
  }, []);

  useEffect(() => {
    loadTables();
  }, [loadTables]);

  // WebSocket realtime synchronization
  const { status: wsStatus, lastMessage } = useWebSocket('floor');

  useEffect(() => {
    if (lastMessage && typeof lastMessage === 'object' && 'type' in lastMessage) {
      const eventType = String(lastMessage.type);
      console.log('Realtime POS event received:', eventType, lastMessage);

      // Auto refresh table state on any floor/order/payment change
      if (
        [
          'TABLE_STATUS_CHANGED',
          'SESSION_OPENED',
          'SESSION_CLOSED',
          'ORDER_CREATED',
          'ORDER_ITEM_ADDED',
          'ORDER_ITEM_CANCELLED',
          'SESSION_MERGED',
          'SESSION_SPLIT',
          'ITEM_TRANSFERRED',
          'PAYMENT_CONFIRMED',
          'PRODUCT_AVAILABILITY_CHANGED',
        ].includes(eventType)
      ) {
        loadTables();

        if (eventType === 'ORDER_CREATED') showToast('🔔 Đơn gọi món mới đã được cập nhật!');
        if (eventType === 'PAYMENT_CONFIRMED') showToast('💰 Thanh toán hóa đơn thành công!');
        if (eventType === 'SESSION_OPENED') showToast('🪑 Bàn mới vừa được mở phiên phục vụ!');
        if (eventType === 'SESSION_CLOSED') showToast('✅ Phiên bàn đã được đóng!');
      }
    }
  }, [lastMessage, loadTables]);

  // Open table session handler
  const handleOpenSession = async (table: DiningTableData) => {
    try {
      const res = await apiClient.post<{ id: string; status: string }>(`/tables/${table.id}/open-session`);
      await loadTables();
      // Open order modal immediately for newly opened table
      setOrderTable({ ...table, status: 'OCCUPIED', active_session_id: res.id });
      showToast(`Đã mở phiên phục vụ cho ${table.code} (${table.display_name})`);
    } catch (err) {
      console.error('Failed to open session', err);
      alert('Không thể mở bàn. Bàn có thể đang có khách!');
    }
  };

  // Phase 1 diagnostic hook for "Kiểm tra hệ thống" tab
  const { data: healthData, loading: healthLoading, error: healthError, pingMs } = useHealthCheck(15000);

  return (
    <div className="app-container">
      {/* Top Header */}
      <header
        className="app-header-responsive"
        style={{
          borderBottom: '1px solid var(--border-subtle)',
          background: '#ffffff',
          position: 'sticky',
          top: 0,
          zIndex: 900,
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
        }}
      >
        <div
          style={{
            maxWidth: '1380px',
            margin: '0 auto',
            padding: isMobile ? '0.5rem 0.75rem' : '0.75rem 1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: isMobile ? '0.5rem' : '1rem',
            flexWrap: 'wrap',
          }}
        >
          {/* Brand Logo & Name */}
          <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '0.5rem' : '0.75rem' }}>
            <div
              style={{
                width: isMobile ? '32px' : '38px',
                height: isMobile ? '32px' : '38px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 900,
                color: '#ffffff',
                fontSize: isMobile ? '0.95rem' : '1.1rem',
                boxShadow: '0 4px 12px rgba(217, 119, 6, 0.25)',
              }}
            >
              TD
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: isMobile ? '0.95rem' : '1.05rem', letterSpacing: '-0.01em', color: 'var(--text-primary)' }}>
                THANH DƯƠNG QUÁN
              </div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>POS Bán Hàng</div>
            </div>
          </div>

          {/* Desktop Nav Tabs */}
          <nav style={{ display: isMobile ? 'none' : 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
            <button
              onClick={() => setActiveTab('FLOOR')}
              style={{
                padding: '0.5rem 0.875rem',
                borderRadius: 'var(--radius-md)',
                background: activeTab === 'FLOOR' ? 'var(--accent-gold)' : 'transparent',
                color: activeTab === 'FLOOR' ? '#ffffff' : 'var(--text-secondary)',
                fontWeight: 700,
                fontSize: '0.85rem',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
              }}
            >
              <LayoutGrid size={15} /> Sơ đồ bàn (50)
            </button>

            {canManageMenu && (
              <button
                onClick={() => setActiveTab('MENU')}
                style={{
                  padding: '0.5rem 0.875rem',
                  borderRadius: 'var(--radius-md)',
                  background: activeTab === 'MENU' ? 'var(--accent-gold)' : 'transparent',
                  color: activeTab === 'MENU' ? '#ffffff' : 'var(--text-secondary)',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                }}
              >
                <UtensilsCrossed size={15} /> Thực đơn
              </button>
            )}

            {canViewRevenue && (
              <button
                onClick={() => setActiveTab('REVENUE')}
                style={{
                  padding: '0.5rem 0.875rem',
                  borderRadius: 'var(--radius-md)',
                  background: activeTab === 'REVENUE' ? 'var(--accent-gold)' : 'transparent',
                  color: activeTab === 'REVENUE' ? '#ffffff' : 'var(--text-secondary)',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                }}
              >
                <BarChart3 size={15} /> Doanh thu
              </button>
            )}

            {canManageUsers && (
              <button
                onClick={() => setActiveTab('STAFF')}
                style={{
                  padding: '0.5rem 0.875rem',
                  borderRadius: 'var(--radius-md)',
                  background: activeTab === 'STAFF' ? 'var(--accent-gold)' : 'transparent',
                  color: activeTab === 'STAFF' ? '#ffffff' : 'var(--text-secondary)',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                }}
              >
                <Users size={15} /> Nhân viên
              </button>
            )}

            {isOwner && (
              <button
                onClick={() => setActiveTab('AUDIT')}
                style={{
                  padding: '0.5rem 0.875rem',
                  borderRadius: 'var(--radius-md)',
                  background: activeTab === 'AUDIT' ? 'var(--accent-gold)' : 'transparent',
                  color: activeTab === 'AUDIT' ? '#ffffff' : 'var(--text-secondary)',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                }}
              >
                <Shield size={15} /> Audit log
              </button>
            )}

            {isOwner && (
              <button
                onClick={() => setActiveTab('SYSTEM')}
                style={{
                  padding: '0.5rem 0.875rem',
                  borderRadius: 'var(--radius-md)',
                  background: activeTab === 'SYSTEM' ? 'var(--accent-gold)' : 'transparent',
                  color: activeTab === 'SYSTEM' ? '#ffffff' : 'var(--text-secondary)',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                }}
              >
                <Activity size={15} /> Kỹ thuật
              </button>
            )}
          </nav>

          {/* Right User & Socket Pill */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.25rem 0.5rem',
                borderRadius: 'var(--radius-sm)',
                background: wsStatus === 'connected' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                color: wsStatus === 'connected' ? '#34d399' : '#f87171',
                fontSize: '0.725rem',
                fontWeight: 700,
              }}
            >
              <Radio size={12} />
              <span>{wsStatus === 'connected' ? 'Live WS' : 'Mất WS'}</span>
            </div>

            {user && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.825rem', fontWeight: 700 }}>{user.full_name}</div>
                  <div
                    style={{
                      fontSize: '0.675rem',
                      fontWeight: 800,
                      color: isOwner ? 'var(--accent-gold)' : isCashier ? '#60a5fa' : '#34d399',
                    }}
                  >
                    {isOwner ? 'CHỦ QUÁN' : isCashier ? 'THU NGÂN' : 'PHỤC VỤ'}
                  </div>
                </div>

                <button
                  onClick={logout}
                  title="Đăng xuất"
                  style={{
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-secondary)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '0.45rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <LogOut size={16} />
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="main-content" style={{ maxWidth: '1380px', paddingBottom: isMobile ? '5.5rem' : '2rem' }}>
        {/* Toast Notification */}
        {toastMessage && (
          <div
            style={{
              position: 'fixed',
              top: '4.5rem',
              right: '1.5rem',
              padding: '0.875rem 1.25rem',
              borderRadius: 'var(--radius-md)',
              background: '#ffffff',
              border: '1px solid var(--accent-gold)',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.12), 0 0 15px rgba(217, 119, 6, 0.15)',
              color: 'var(--text-primary)',
              fontSize: '0.875rem',
              fontWeight: 700,
              zIndex: 1300,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <Bell size={16} color="var(--accent-gold)" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Tab Content Rendering */}
        {activeTab === 'FLOOR' && (
          <TableGrid
            tables={tables}
            loading={loadingTables}
            onOpenSession={handleOpenSession}
            onSelectTableForOrder={(table) => setOrderTable(table)}
            onSelectTableForBilling={(table) => {
              if (table.active_session_id) {
                apiClient
                  .get<SessionDetails>(`/sessions/${table.active_session_id}`)
                  .then((sess) => setBillingSession(sess));
              }
            }}
            onOpenMergeModal={() => setMergeSplitConfig({ isOpen: true, mode: 'MERGE' })}
            onOpenSplitModal={(table) => {
              if (table.active_session_id) {
                apiClient
                  .get<SessionDetails>(`/sessions/${table.active_session_id}`)
                  .then((sess) => {
                    setMergeSplitConfig({
                      isOpen: true,
                      mode: 'SPLIT',
                      selectedTable: table,
                      splitItems: sess.active_items,
                    });
                  });
              }
            }}
            onRefreshTables={loadTables}
          />
        )}

        {activeTab === 'MENU' && <MenuManagement />}

        {activeTab === 'REVENUE' && <RevenueReport />}

        {activeTab === 'STAFF' && <StaffManagement />}

        {activeTab === 'AUDIT' && <AuditLogView />}

        {activeTab === 'SYSTEM' && (
          <div>
            <div style={{ marginBottom: '1.5rem' }}>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Kiểm Tra Kỹ Thuật Nền Tảng (Phase 1 Baseline)</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                Giám sát tình trạng PostgreSQL container, API Probes, và thử nghiệm WebSocket Event Bus
              </p>
            </div>

            <div className="grid-2">
              <HealthCard data={healthData} loading={healthLoading} error={healthError} pingMs={pingMs} />
              <DatabaseStatus database={healthData?.database} loading={healthLoading} />
            </div>

            <div style={{ marginTop: '1.5rem' }}>
              <SystemOverview />
            </div>

            <div style={{ marginTop: '1.5rem' }}>
              <DevicePreview />
            </div>
          </div>
        )}
      </main>

      {/* POS Dialogs & Modals */}
      {orderTable && (
        <OrderModal
          table={orderTable}
          onClose={() => setOrderTable(null)}
          onOpenBilling={(sessionDetails) => {
            setOrderTable(null);
            setBillingSession(sessionDetails);
          }}
          onOpenSplit={(table, items) => {
            setOrderTable(null);
            setMergeSplitConfig({
              isOpen: true,
              mode: 'SPLIT',
              selectedTable: table,
              splitItems: items,
            });
          }}
          onRefreshTables={loadTables}
        />
      )}

      {billingSession && (
        <BillingModal
          sessionDetails={billingSession}
          onClose={() => setBillingSession(null)}
          onProceedToPayment={(inv) => {
            setBillingSession(null);
            setPaymentInvoice(inv);
          }}
          onOpenReceipt={(invId) => {
            setReceiptInvoiceId(invId);
          }}
        />
      )}

      {paymentInvoice && (
        <PaymentModal
          invoice={paymentInvoice}
          onClose={() => setPaymentInvoice(null)}
          onPaymentSuccess={(_invId) => {
            loadTables();
          }}
          onOpenReceipt={(invId) => {
            setPaymentInvoice(null);
            setReceiptInvoiceId(invId);
          }}
        />
      )}

      {receiptInvoiceId && (
        <ErrorBoundary
          fallbackTitle="Không thể hiển thị phiếu thanh toán"
          onReset={() => setReceiptInvoiceId(null)}
        >
          <ReceiptModal
            invoiceId={receiptInvoiceId}
            onClose={() => setReceiptInvoiceId(null)}
          />
        </ErrorBoundary>
      )}

      {mergeSplitConfig.isOpen && (
        <MergeSplitModal
          mode={mergeSplitConfig.mode}
          tables={tables}
          selectedTable={mergeSplitConfig.selectedTable}
          splitItems={mergeSplitConfig.splitItems}
          onClose={() => setMergeSplitConfig({ isOpen: false, mode: 'MERGE' })}
          onSuccess={() => {
            loadTables();
            showToast(mergeSplitConfig.mode === 'MERGE' ? 'Đã gộp bàn thành công!' : 'Đã tách bàn thành công!');
          }}
        />
      )}

      {/* Mobile Bottom Navigation Bar */}
      {isMobile && (
        <nav className="mobile-bottom-nav">
          <button
            className={`mobile-nav-item ${activeTab === 'FLOOR' ? 'active' : ''}`}
            onClick={() => setActiveTab('FLOOR')}
          >
            <LayoutGrid size={18} />
            <span>Sơ đồ bàn</span>
          </button>

          {canManageMenu && (
            <button
              className={`mobile-nav-item ${activeTab === 'MENU' ? 'active' : ''}`}
              onClick={() => setActiveTab('MENU')}
            >
              <UtensilsCrossed size={18} />
              <span>Thực đơn</span>
            </button>
          )}

          {canViewRevenue && (
            <button
              className={`mobile-nav-item ${activeTab === 'REVENUE' ? 'active' : ''}`}
              onClick={() => setActiveTab('REVENUE')}
            >
              <BarChart3 size={18} />
              <span>Doanh thu</span>
            </button>
          )}

          {canManageUsers && (
            <button
              className={`mobile-nav-item ${activeTab === 'STAFF' ? 'active' : ''}`}
              onClick={() => setActiveTab('STAFF')}
            >
              <Users size={18} />
              <span>Nhân viên</span>
            </button>
          )}

          {isOwner && (
            <button
              className={`mobile-nav-item ${activeTab === 'AUDIT' ? 'active' : ''}`}
              onClick={() => setActiveTab('AUDIT')}
            >
              <Shield size={18} />
              <span>Nhật ký</span>
            </button>
          )}

          {isOwner && (
            <button
              className={`mobile-nav-item ${activeTab === 'SYSTEM' ? 'active' : ''}`}
              onClick={() => setActiveTab('SYSTEM')}
            >
              <Activity size={18} />
              <span>Kỹ thuật</span>
            </button>
          )}
        </nav>
      )}
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <AuthConsumerWrapper />
    </AuthProvider>
  );
};

const AuthConsumerWrapper: React.FC = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-primary)',
          color: 'var(--accent-gold)',
          fontWeight: 700,
          fontSize: '1rem',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>🍻</div>
          <div>Đang khởi động Thanh Dương Quán POS...</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginForm />;
  }

  return <MainPOSApp />;
};

export default App;
