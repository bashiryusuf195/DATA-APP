import { apiClient } from './client'
import { pageOffset, normalizePaged } from './helpers'
import type { ProviderAttempt, PaginatedResponse } from '@/types'

export interface AttemptsFilters {
  page?: number
  limit?: number
  provider_code?: string
  transaction_reference?: string
  success?: boolean
}

export const attemptsApi = {
  list: (params: AttemptsFilters = {}): Promise<PaginatedResponse<ProviderAttempt>> => {
    const { page = 1, limit = 20, ...rest } = params
    return apiClient
      .get<{ success: boolean; data: ProviderAttempt[] }>(
        '/admin/provider-attempts',
        { params: { limit, offset: pageOffset(page, limit), ...rest } },
      )
      .then((r) => {
        const items = Array.isArray(r.data.data) ? r.data.data : []
        return normalizePaged(items, page, limit)
      })
  },
}
