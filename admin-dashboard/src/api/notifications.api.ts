import { apiClient } from './client'
import { pageOffset, normalizePaged } from './helpers'
import type { Notification, PaginatedResponse } from '@/types'

export const notificationsApi = {
  adminList: (params: { page?: number; limit?: number } = {}): Promise<PaginatedResponse<Notification>> => {
    const { page = 1, limit = 20 } = params
    return apiClient
      .get<{ success: boolean; data: Notification[] }>(
        '/admin/notifications',
        { params: { limit, offset: pageOffset(page, limit) } },
      )
      .then((r) => {
        const items = Array.isArray(r.data.data) ? r.data.data : []
        return normalizePaged(items, page, limit)
      })
  },

  myList: (params: { page?: number; limit?: number; read?: boolean } = {}): Promise<PaginatedResponse<Notification>> => {
    const { page = 1, limit = 20, ...rest } = params
    return apiClient
      .get<{ success: boolean; data: Notification[] }>(
        '/notifications',
        { params: { limit, offset: pageOffset(page, limit), ...rest } },
      )
      .then((r) => {
        const items = Array.isArray(r.data.data) ? r.data.data : []
        return normalizePaged(items, page, limit)
      })
  },
}
