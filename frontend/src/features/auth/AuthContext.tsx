import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { UserProfile, LoginResponse } from './types';
import { apiClient, setSession, clearSession, refreshOnce } from '../../shared/api/client';

interface AuthContextType {
  user: UserProfile | null;
  loading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  isOwner: boolean;
  isCashier: boolean;
  isWaiter: boolean;
  canManageMenu: boolean;
  canBill: boolean;
  canViewRevenue: boolean;
  canManageUsers: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Restore session via HttpOnly refresh cookie on application startup
  const restoreSession = useCallback(async () => {
    setLoading(true);
    try {
      const refreshed = await refreshOnce();
      if (refreshed) {
        const me = await apiClient.get<UserProfile>('/auth/me');
        setUser(me);
      } else {
        setUser(null);
      }
    } catch {
      clearSession();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  const login = async (username: string, password: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.post<LoginResponse>('/auth/login', { username, password });
      setSession(data.access_token, data.csrf_token);
      setUser(data.user);
      return true;
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'body' in err && err.body && typeof err.body === 'object' && 'detail' in err.body
        ? String((err.body as { detail: unknown }).detail)
        : 'Đăng nhập không thành công. Vui lòng kiểm tra lại tài khoản hoặc mật khẩu.';
      setError(msg);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    try {
      await apiClient.post('/auth/logout');
    } catch {
      // Ignore network errors on logout
    } finally {
      clearSession();
      setUser(null);
    }
  };

  const isOwner = user?.role === 'OWNER';
  const isCashier = user?.role === 'CASHIER';
  const isWaiter = user?.role === 'WAITER';

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        error,
        login,
        logout,
        isOwner,
        isCashier,
        isWaiter,
        canManageMenu: isOwner || isCashier,
        canBill: isOwner || isCashier,
        canViewRevenue: isOwner || isCashier,
        canManageUsers: isOwner,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
