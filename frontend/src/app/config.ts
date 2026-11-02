/**
 * Runtime environment configuration for Thanh Đường Quán POS frontend.
 * Reads API and WebSocket endpoints from Vite environment variables.
 */

export const config = {
  appName: 'Thanh Đường Quán POS',
  phase: 'Phase 1: Khởi Tạo Nền Tảng',
  version: '0.1.0',
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000',
  wsBaseUrl: import.meta.env.VITE_WS_URL || 'ws://localhost:8000',
  endpoints: {
    health: '/api/v1/health',
    healthDb: '/api/v1/health/db',
    healthLive: '/api/v1/health/live',
    healthReady: '/api/v1/health/ready',
    docs: '/docs',
  },
  roles: ['OWNER', 'CASHIER', 'WAITER'] as const,
} as const;

export type AppConfig = typeof config;
