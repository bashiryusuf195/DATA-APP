import { apiClient } from './client'
import { pageOffset, normalizePaged } from './helpers'
import type { FailedJob, PaginatedResponse } from '@/types'

export const queueApi = {
  failedJobs: (params: { page?: number; limit?: number; queue_name?: string } = {}): Promise<PaginatedResponse<FailedJob>> => {
    const { page = 1, limit = 20, queue_name } = params
    return apiClient
      .get<{ success: boolean; data: FailedJob[] }>(
        '/admin/failed-jobs',
        { params: { limit, offset: pageOffset(page, limit), ...(queue_name ? { queue_name } : {}) } },
      )
      .then((r) => {
        const items = Array.isArray(r.data.data) ? r.data.data : []
        return normalizePaged(items, page, limit)
      })
  },

  retryFailedJob: (id: string): Promise<{ queued_job_id: string | undefined }> =>
    apiClient
      .post<{ success: boolean; data: { queued_job_id: string | undefined } }>(
        `/admin/failed-jobs/${id}/retry`,
      )
      .then((r) => r.data.data),
}
