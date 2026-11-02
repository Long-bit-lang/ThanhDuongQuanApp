export interface DatabaseHealth {
  status: 'connected' | 'disconnected';
  database?: string;
  version?: string;
  latency_ms: number;
  error?: string;
}

export interface SystemHealthResponse {
  status: 'healthy' | 'degraded';
  app_name: string;
  version: string;
  environment: string;
  timestamp: string;
  database: DatabaseHealth;
}

export interface HealthState {
  data: SystemHealthResponse | null;
  loading: boolean;
  error: string | null;
  lastChecked: Date | null;
  pingMs: number | null;
}
