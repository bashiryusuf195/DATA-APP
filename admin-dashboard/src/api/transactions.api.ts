import { apiClient } from './client'
import { pageOffset, normalizePaged } from './helpers'
import type { Transaction, PaginatedResponse } from '@/types'

export interface TransactionFilters {
  page?: number
  limit?: number
  status?: string
  /** Frontend uses service_type; mapped to backend query param 'type'. */
  service_type?: string
  reference?: string
}

export const transactionsApi = {
  list: (params: TransactionFilters = {}): Promise<PaginatedResponse<Transaction>> => {
    const { page = 1, limit = 20, service_type, ...rest } = params
    return apiClient
      .get<{ success: boolean; data: Transaction[] }>('/transactions', {
        params: {
          limit,
          offset: pageOffset(page, limit),
          ...(service_type ? { type: service_type } : {}),
          ...rest,
        },
      })
      .then((r) => {
        const items = Array.isArray(r.data.data) ? r.data.data : []
        return normalizePaged(items, page, limit)
      })
  },

  get: (reference: string) =>
    apiClient
      .get<{ success: boolean; data: Transaction }>(`/transactions/${reference}`)
      .then((r) => r.data.data),
}
