/**
 * Typed API Client for Thanh Đường Quán POS backend.
 * Uses configured base URL without hardcoding.
 * Keeps JWT access token and CSRF token strictly in-memory.
 */

import { config } from '../../app/config';

export class ApiError extends Error {
  status: number;
  statusText: string;
  body: unknown;

  constructor(status: number, statusText: string, body: unknown, message?: string) {
    super(message || `API Error ${status}: ${statusText}`);
    this.name = 'ApiError';
    this.status = status;
    this.statusText = statusText;
    this.body = body;
  }
}

let accessToken: string | null = null;
let csrfToken: string | null = null;
let refreshFlight: Promise<boolean> | null = null;

export function setSession(access: string | null, csrf: string | null): void {
  accessToken = access;
  csrfToken = csrf;
}

export function clearSession(): void {
  setSession(null, null);
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function getCsrfToken(): string | null {
  return csrfToken;
}

export async function refreshOnce(): Promise<boolean> {
  if (!refreshFlight) {
    refreshFlight = (async () => {
      try {
        const result = await request<{ access_token: string; csrf_token: string }>('/auth/refresh', {
          method: 'POST',
          headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : {},
        });
        setSession(result.access_token, result.csrf_token);
        return true;
      } catch {
        clearSession();
        return false;
      } finally {
        refreshFlight = null;
      }
    })();
  }
  return refreshFlight;
}

function normalizePath(path: string): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  if (clean.startsWith('/api/v1')) {
    return clean;
  }
  return `/api/v1${clean}`;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const fullPath = normalizePath(path);
  const url = `${config.apiBaseUrl}${fullPath}`;

  const headers = new Headers(options.headers || {});
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (accessToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }
  if (csrfToken && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(options.method ?? 'GET') && !fullPath.endsWith('/auth/login')) {
    headers.set('X-CSRF-Token', csrfToken);
  }

  try {
    let response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include',
    });

    // A singleton refresh prevents simultaneous failed requests from rotating the
    // refresh cookie twice. Tokens deliberately live only in this module's memory.
    if (response.status === 401 && !fullPath.endsWith('/auth/refresh') && !fullPath.endsWith('/auth/login') && (await refreshOnce())) {
      headers.set('Authorization', `Bearer ${accessToken}`);
      response = await fetch(url, { ...options, headers, credentials: 'include' });
    }

    let data: unknown;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    if (!response.ok) {
      throw new ApiError(response.status, response.statusText, data);
    }

    return data as T;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(0, 'Network Error', null, error instanceof Error ? error.message : 'Unknown network failure');
  }
}

export const apiClient = {
  get: <T>(path: string, options?: RequestInit) => request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: RequestInit) =>
    request<T>(path, {
      ...options,
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    }),
  patch: <T>(path: string, body?: unknown, options?: RequestInit) =>
    request<T>(path, {
      ...options,
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    }),
  delete: <T>(path: string, options?: RequestInit) =>
    request<T>(path, {
      ...options,
      method: 'DELETE',
    }),
};
