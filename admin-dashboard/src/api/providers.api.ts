import { apiClient } from './client'
import type { Provider, UpdateProviderInput } from '@/types'

export const providersApi = {
  list: () =>
    apiClient.get<{ data: Provider[] }>('/admin/providers').then((r) => r.data.data),

  get: (code: string) =>
    apiClient.get<{ data: Provider }>(`/admin/providers/${code}`).then((r) => r.data.data),

  create: (body: Partial<Provider>) =>
    apiClient.post<{ data: Provider }>('/admin/providers', body).then((r) => r.data.data),

  update: (code: string, body: UpdateProviderInput) =>
    apiClient.patch<{ data: Provider }>(`/admin/providers/${code}`, body).then((r) => r.data.data),

  remove: (code: string) =>
    apiClient.delete(`/admin/providers/${code}`).then((r) => r.data),

  healthCheck: (code: string) =>
    apiClient.post(`/admin/providers/${code}/health-check`).then((r) => r.data),

  resetCircuit: (code: string) =>
    apiClient.post(`/admin/providers/${code}/reset-circuit`).then((r) => r.data),
}
