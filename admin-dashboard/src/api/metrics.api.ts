import { apiClient } from './client'
import type { ProviderCircuitState, ProviderHealthDashboard, HealthWindow } from '@/types'

export const metricsApi = {
  // Rich windowed dashboard — primary data source for the health page
  dashboard: (params?: { window?: HealthWindow; service_type?: string; provider?: string }) =>
    apiClient
      .get<{ success: boolean; data: ProviderHealthDashboard[] }>('/admin/provider-health-dashboard', { params })
      .then((r) => r.data.data),

  // Legacy circuit-state endpoints (kept for backwards compatibility)
  list: () =>
    apiClient
      .get<{ data: ProviderCircuitState[] }>('/admin/provider-health-metrics')
      .then((r) => r.data.data),

  get: (providerCode: string) =>
    apiClient
      .get<{ data: ProviderCircuitState }>(`/admin/provider-health-metrics/${providerCode}`)
      .then((r) => r.data.data),

  resetCircuit: (providerCode: string) =>
    apiClient
      .post(`/admin/providers/${providerCode}/reset-circuit`)
      .then((r) => r.data),
}
