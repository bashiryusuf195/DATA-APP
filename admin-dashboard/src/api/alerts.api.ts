import { apiClient } from './client'

export type AlertSeverity = 'info' | 'warning' | 'critical'
export type AlertCategory = 'provider' | 'payment' | 'transaction'
export type AlertType =
  | 'provider_down'
  | 'wallet_low'
  | 'gateway_down'
  | 'large_transaction'
  | 'repeated_failures'

export interface AdminAlert {
  id:          string
  type:        AlertType
  severity:    AlertSeverity
  category:    AlertCategory
  title:       string
  message:     string
  metadata:    Record<string, unknown>
  is_read:     boolean
  is_resolved: boolean
  resolved_at: string | null
  resolved_by: string | null
  created_at:  string
  updated_at:  string
}

export interface AlertsResponse {
  data:  AdminAlert[]
  total: number
  page:  number
  limit: number
}

export const alertsApi = {
  list: (params: {
    severity?: AlertSeverity
    category?: AlertCategory
    unread?:   boolean
    page?:     number
    limit?:    number
  } = {}): Promise<AlertsResponse> =>
    apiClient
      .get<{ success: boolean } & AlertsResponse>('/admin/alerts', { params })
      .then((r) => ({ data: r.data.data, total: r.data.total, page: r.data.page, limit: r.data.limit })),

  count: (): Promise<number> =>
    apiClient
      .get<{ success: boolean; data: { unread: number } }>('/admin/alerts/count')
      .then((r) => r.data.data.unread),

  markRead: (id: string): Promise<void> =>
    apiClient.put(`/admin/alerts/${id}/read`).then(() => undefined),

  markAllRead: (): Promise<void> =>
    apiClient.put('/admin/alerts/read-all').then(() => undefined),

  resolve: (id: string): Promise<void> =>
    apiClient.put(`/admin/alerts/${id}/resolve`).then(() => undefined),

  delete: (id: string): Promise<void> =>
    apiClient.delete(`/admin/alerts/${id}`).then(() => undefined),
}
