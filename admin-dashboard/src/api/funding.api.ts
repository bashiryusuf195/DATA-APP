import { apiClient } from './client'
import { pageOffset, normalizePaged } from './helpers'
import type { FundingTransaction, PaginatedResponse } from '@/types'

export interface FundingFilters {
  page?: number
  limit?: number
  status?: string
  payment_gateway?: string
  user_id?: string
  verified?: boolean
}

export const fundingApi = {
  list: (params: FundingFilters = {}): Promise<PaginatedResponse<FundingTransaction>> => {
    const { page = 1, limit = 20, ...rest } = params
    return apiClient
      .get<{ success: boolean; data: FundingTransaction[] }>(
        '/admin/funding-transactions',
        { params: { limit, offset: pageOffset(page, limit), ...rest } },
      )
      .then((r) => {
        const items = Array.isArray(r.data.data) ? r.data.data : []
        return normalizePaged(items, page, limit)
      })
  },
}
