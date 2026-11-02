import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../../../shared/api/client';
import { config } from '../../../app/config';
import type { HealthState, SystemHealthResponse } from '../types';

export function useHealthCheck(autoRefreshIntervalMs: number = 10000) {
  const [state, setState] = useState<HealthState>({
    data: null,
    loading: true,
    error: null,
    lastChecked: null,
    pingMs: null,
  });

  const checkHealth = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    const startTime = performance.now();

    try {
      const data = await apiClient.get<SystemHealthResponse>(config.endpoints.health);
      const pingMs = Math.round(performance.now() - startTime);

      setState({
        data,
        loading: false,
        error: null,
        lastChecked: new Date(),
        pingMs,
      });
    } catch (err) {
      const pingMs = Math.round(performance.now() - startTime);
      setState({
        data: null,
        loading: false,
        error: err instanceof Error ? err.message : 'Không thể kết nối đến máy chủ backend',
        lastChecked: new Date(),
        pingMs,
      });
    }
  }, []);

  useEffect(() => {
    checkHealth();
    if (autoRefreshIntervalMs > 0) {
      const timer = setInterval(checkHealth, autoRefreshIntervalMs);
      return () => clearInterval(timer);
    }
  }, [checkHealth, autoRefreshIntervalMs]);

  return {
    ...state,
    refetch: checkHealth,
  };
}
