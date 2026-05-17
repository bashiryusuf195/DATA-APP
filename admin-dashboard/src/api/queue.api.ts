import { apiClient } from './client'
import { pageOffset, normalizePaged } from './helpers'
import type { FailedJob, PaginatedResponse } from '@/types'

export const queueApi = {
  failedJobs: (params: { page?: number; limit?: number } = {}): Promise<PaginatedResponse<FailedJob>> => {
    const { page = 1, limit = 20 } = params
    return apiClient
      .get<{ success: boolean; data: FailedJob[] }>(
        '/admin/failed-jobs',
        { params: { limit, offset: pageOffset(page, limit) } },
      )
      .then((r) => {
        const items = Array.isArray(r.data.data) ? r.data.data : []
        return normalizePaged(items, page, limit)
      })
  },
}
