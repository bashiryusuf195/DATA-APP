import { apiClient } from './client'
import type { Notification, NotificationPreferences, ApiResponse } from '@/types'

// Backend notification row shape (uses status enum, not is_read boolean)
type RawNotification = Omit<Notification, 'is_read'> & { status: string }

export const notificationsApi = {
  // Backend returns { success, data: RawNotification[], meta } — flat array, no
  // unread_count.  Normalize: map status === 'read' to is_read and count unread.
  list: async (params?: { page?: number; limit?: number }): Promise<{ data: Notification[]; unread_count: number }> => {
    const r = await apiClient.get<{ success: boolean; data: RawNotification[] }>(
      '/notifications',
      { params }
    )
    const raw = r.data.data ?? []
    const data: Notification[] = raw.map((n) => ({ ...n, is_read: n.status === 'read' }))
    return { data, unread_count: data.filter((n) => !n.is_read).length }
  },

  markRead: (id: string): Promise<void> =>
    apiClient.patch(`/notifications/${id}/read`).then(() => undefined),

  getPreferences: (): Promise<NotificationPreferences> =>
    apiClient
      .get<ApiResponse<NotificationPreferences>>('/notifications/preferences')
      .then((r) => r.data.data),

  updatePreferences: (prefs: Partial<NotificationPreferences>): Promise<NotificationPreferences> =>
    apiClient
      .patch<ApiResponse<NotificationPreferences>>('/notifications/preferences', prefs)
      .then((r) => r.data.data),
}
