import { apiClient } from './client'
import { pageOffset, normalizePaged } from './helpers'
import type { WebhookEvent, WebhookDiagnostics, PaginatedResponse } from '@/types'

export interface WebhookFilters {
  page?: number
  limit?: number
  // "source" is the UI label; the backend column is provider_code
  source?: string
  event_type?: string
  // status is derived server-side — filter applied client-side after fetch
  status?: string
}

export const webhooksApi = {
  diagnostics: (): Promise<WebhookDiagnostics> =>
    apiClient
      .get<{ success: boolean; data: WebhookDiagnostics }>('/admin/webhook-events/diagnostics')
      .then((r) => r.data.data),

  list: (params: WebhookFilters = {}): Promise<PaginatedResponse<WebhookEvent>> => {
    const { page = 1, limit = 20, source, event_type } = params
    return apiClient
      .get<{ success: boolean; data: WebhookEvent[] }>(
        '/admin/webhook-events',
        {
          params: {
            limit,
            offset: pageOffset(page, limit),
            ...(source     ? { provider_code: source } : {}),
            ...(event_type ? { event_type }             : {}),
          },
        },
      )
      .then((r) => {
        const items = Array.isArray(r.data.data) ? r.data.data : []
        return normalizePaged(items, page, limit)
      })
  },
}
