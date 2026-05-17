import { apiClient } from './client'
import { pageOffset, normalizePaged } from './helpers'
import type { WebhookEvent, PaginatedResponse } from '@/types'

export interface WebhookFilters {
  page?: number
  limit?: number
  source?: string
  event_type?: string
  status?: string
}

export const webhooksApi = {
  list: (params: WebhookFilters = {}): Promise<PaginatedResponse<WebhookEvent>> => {
    const { page = 1, limit = 20, ...rest } = params
    return apiClient
      .get<{ success: boolean; data: WebhookEvent[] }>(
        '/admin/webhook-events',
        { params: { limit, offset: pageOffset(page, limit), ...rest } },
      )
      .then((r) => {
        const items = Array.isArray(r.data.data) ? r.data.data : []
        return normalizePaged(items, page, limit)
      })
  },
}
