import { apiClient } from './client'
import type { ProviderCircuitState } from '@/types'

export const metricsApi = {
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
