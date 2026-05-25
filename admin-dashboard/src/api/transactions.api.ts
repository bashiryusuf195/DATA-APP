import { apiClient } from './client'

import type { Transaction, PaginatedResponse } from '@/types'

export interface TransactionFilters {
  page?: number
  limit?: number
  status?: string
  service_type?: string
  reference?: string
  user_id?: string
}

interface AdminTransactionsResponse {
  success: boolean
  data: Transaction[]
  meta: { page: number; limit: number; total: number; pages: number }
}

export const transactionsApi = {
  list: (params: TransactionFilters = {}): Promise<PaginatedResponse<Transaction>> => {
    const { page = 1, limit = 20, ...rest } = params
    return apiClient
      .get<AdminTransactionsResponse>('/admin/transactions', {
        params: { page, limit, ...rest },
      })
      .then((r) => {
        const items = Array.isArray(r.data.data) ? r.data.data : []
        const total = r.data.meta?.total ?? items.length
        return { data: items, total, page, limit }
      })
  },

  get: (reference: string) =>
    apiClient
      .get<{ success: boolean; data: Transaction }>(`/transactions/${reference}`)
      .then((r) => r.data.data),

  retry: (reference: string) =>
    apiClient
      .post<{ success: boolean; message: string; data: { reference: string; previous_status: string } }>(
        `/admin/transactions/${reference}/retry`,
      )
      .then((r) => r.data),
}
