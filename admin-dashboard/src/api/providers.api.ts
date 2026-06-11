import { apiClient } from './client'
import type {
  Provider, UpdateProviderInput,
  ProviderRegistryRow, ProviderRegistryDetail,
  CreateProviderInput, UpdateProviderRegistryInput,
  UpsertProviderCredentialsInput, SafeProviderCredentials,
} from '@/types'

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

  // ── Registry methods (used by ApiIntegrations page) ────────────────────────

  listRegistry: (): Promise<ProviderRegistryRow[]> =>
    apiClient
      .get<{ success: boolean; data: ProviderRegistryRow[] }>('/admin/providers')
      .then((r) => (Array.isArray(r.data.data) ? r.data.data : [])),

  getRegistry: (code: string): Promise<ProviderRegistryDetail> =>
    apiClient
      .get<{ success: boolean; data: ProviderRegistryDetail }>(`/admin/providers/${code}`)
      .then((r) => r.data.data),

  createRegistry: (body: CreateProviderInput): Promise<ProviderRegistryRow> =>
    apiClient
      .post<{ success: boolean; data: ProviderRegistryRow }>('/admin/providers', body)
      .then((r) => r.data.data),

  updateRegistry: (code: string, body: UpdateProviderRegistryInput): Promise<ProviderRegistryRow> =>
    apiClient
      .patch<{ success: boolean; data: ProviderRegistryRow }>(`/admin/providers/${code}`, body)
      .then((r) => r.data.data),

  upsertCredentials: (code: string, body: UpsertProviderCredentialsInput): Promise<SafeProviderCredentials> =>
    apiClient
      .patch<{ success: boolean; data: SafeProviderCredentials }>(`/admin/providers/${code}/credentials`, body)
      .then((r) => r.data.data),

  triggerHealthCheck: (code: string): Promise<{ provider_code: string; healthy: boolean; latency_ms: number; message: string }> =>
    apiClient
      .post<{ success: boolean; data: { provider_code: string; healthy: boolean; latency_ms: number; message: string } }>(`/admin/providers/${code}/health-check`)
      .then((r) => r.data.data),

  getVtpassVariations: (serviceID: string): Promise<{
    content?: {
      ServiceName?: string
      serviceID?:   string
      variations?:  Array<{ variation_code: string; name: string; variation_amount: string; fixedPrice?: string }>
    }
    response_description?: string
  }> =>
    apiClient
      .get<{ success: boolean; data: unknown }>(`/admin/providers/vtpass/service-variations`, { params: { serviceID } })
      .then((r) => r.data.data as { content?: { ServiceName?: string; serviceID?: string; variations?: Array<{ variation_code: string; name: string; variation_amount: string; fixedPrice?: string }> }; response_description?: string }),

  updateServiceMode: (code: string, mode: 'api' | 'automation'): Promise<{ provider_code: string; service_mode: string }> =>
    apiClient
      .patch<{ success: boolean; data: { provider_code: string; service_mode: string } }>(`/admin/providers/${code}/service-mode`, { mode })
      .then((r) => r.data.data),

  getServiceMode: (code: string): Promise<string> =>
    apiClient
      .get<{ success: boolean; data: { credentials: { metadata: Record<string, unknown> } | null } }>(`/admin/providers/${code}`)
      .then((r) => (r.data.data?.credentials?.metadata?.['service_mode'] as string | undefined) ?? 'api'),

  credentialDiagnostic: (code: string): Promise<{
    valid:    boolean
    message:  string
    details:  {
      userId_length?: number
      apiKey_length?: number
      baseUrl?:       string
      balance?:       number
      raw_status?:    string
      http_status?:   number
    }
  }> =>
    apiClient
      .post<{ success: boolean; data: { valid: boolean; message: string; details: Record<string, unknown> } }>(
        `/admin/providers/${code}/credential-diagnostic`
      )
      .then((r) => r.data.data as { valid: boolean; message: string; details: { userId_length?: number; apiKey_length?: number; baseUrl?: string; balance?: number; raw_status?: string; http_status?: number } }),
}
