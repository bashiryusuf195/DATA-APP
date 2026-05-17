import { apiClient } from './client'
import { pageOffset } from './helpers'
import type { PaginatedResponse, AdminAuditLog, AdminAuditLogDetail, AuditOutcome } from '@/types'

export interface AuditFilters {
  page?:     number
  limit?:    number
  email?:    string
  action?:   string
  resource?: string
  outcome?:  AuditOutcome
  from?:     string
  to?:       string
}

export const auditApi = {
  list: (params: AuditFilters = {}): Promise<PaginatedResponse<AdminAuditLog>> => {
    const { page = 1, limit = 20, ...rest } = params
    return apiClient
      .get<{
        success: boolean
        data: AdminAuditLog[]
        meta: { limit: number; offset: number; total: number }
      }>('/admin/audit-logs', {
        params: { limit, offset: pageOffset(page, limit), ...rest },
      })
      .then((r) => ({
        data:  Array.isArray(r.data.data) ? r.data.data : [],
        total: r.data.meta?.total ?? 0,
        page,
        limit,
      }))
  },

  get: (id: string): Promise<AdminAuditLogDetail> =>
    apiClient
      .get<{ success: boolean; data: AdminAuditLogDetail }>(`/admin/audit-logs/${id}`)
      .then((r) => r.data.data),
}
