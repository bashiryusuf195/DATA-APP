import { apiClient } from './client'

// ── Types ──────────────────────────────────────────────────────────────────────

export type ComponentStatus = 'ok' | 'degraded' | 'error'

export interface QueueEntry {
  name:                  string
  waiting:               number
  active:                number
  failed:                number
  delayed:               number
  paused:                boolean
  oldest_waiting_age_ms: number | null
}

export interface ProviderEntry {
  code:                  string
  name:                  string
  computed_health:       'healthy' | 'degraded' | 'down'
  circuit_open:          boolean
  consecutive_failures:  number
  success_rate:          number | null
  last_failure_at:       string | null
  recent_failure_reason: string | null
}

export interface SystemHealthData {
  status:          ComponentStatus
  uptime_seconds:  number
  version:         string
  database: {
    status:     ComponentStatus
    latency_ms: number | null
  }
  redis: {
    status: ComponentStatus
  }
  queues: {
    status:        ComponentStatus
    total_waiting: number
    total_active:  number
    total_failed:  number
    queue_count:   number
    queues:        QueueEntry[]
  }
  providers: {
    status:    ComponentStatus
    healthy:   number
    degraded:  number
    down:      number
    providers: ProviderEntry[]
  }
  payment_gateways?: Record<string, {
    configured:         boolean
    base_url:           string
    has_webhook_secret: boolean
  }>
  timestamp: string
}

// ── API calls ─────────────────────────────────────────────────────────────────

export const healthApi = {
  async getSystemHealth(): Promise<SystemHealthData> {
    const res = await apiClient.get<{ success: boolean; data: SystemHealthData }>('/admin/system-health')
    return res.data.data
  },
}
