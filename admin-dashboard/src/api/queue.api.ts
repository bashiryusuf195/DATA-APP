import { apiClient } from './client'
import { pageOffset, normalizePaged } from './helpers'
import type { FailedJob, PaginatedResponse, QueueStats, QueueJobItem, JobState } from '@/types'

export const queueApi = {
  // ── Legacy DB-backed failed jobs ───────────────────────────────────────────
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

  // ── Live BullMQ queue monitor ─────────────────────────────────────────────
  queueStats: (): Promise<QueueStats[]> =>
    apiClient
      .get<{ success: boolean; data: QueueStats[] }>('/admin/queue-monitor')
      .then((r) => r.data.data),

  queueJobs: (queueName: string, state: JobState, page = 1, limit = 25): Promise<{ items: QueueJobItem[]; total: number; page: number; limit: number }> =>
    apiClient
      .get<{ success: boolean; data: QueueJobItem[]; meta: { page: number; limit: number; total: number } }>(
        `/admin/queue-monitor/${encodeURIComponent(queueName)}/jobs`,
        { params: { state, page, limit } },
      )
      .then((r) => ({ items: r.data.data, total: r.data.meta.total, page: r.data.meta.page, limit: r.data.meta.limit })),

  retryQueueJob: (queueName: string, jobId: string): Promise<void> =>
    apiClient
      .post(`/admin/queue-monitor/${encodeURIComponent(queueName)}/jobs/${encodeURIComponent(jobId)}/retry`)
      .then(() => undefined),

  removeQueueJob: (queueName: string, jobId: string): Promise<void> =>
    apiClient
      .delete(`/admin/queue-monitor/${encodeURIComponent(queueName)}/jobs/${encodeURIComponent(jobId)}`)
      .then(() => undefined),

  clearCompleted: (queueName: string): Promise<{ removed: number }> =>
    apiClient
      .post<{ success: boolean; data: { removed: number } }>(
        `/admin/queue-monitor/${encodeURIComponent(queueName)}/clear-completed`,
      )
      .then((r) => r.data.data),
}
