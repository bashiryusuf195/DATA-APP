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

  getPreferences: async (): Promise<NotificationPreferences> => {
    const r = await apiClient.get<ApiResponse<Record<string, unknown>>>('/notifications/preferences')
    const d = r.data.data
    return {
      email:  Boolean(d.email_enabled ?? true),
      push:   Boolean(d.push_enabled  ?? false),
      sms:    Boolean(d.sms_enabled   ?? false),
      in_app: true,
    }
  },

  updatePreferences: async (prefs: Partial<NotificationPreferences>): Promise<NotificationPreferences> => {
    // Map frontend field names → backend field names
    const body: Record<string, boolean> = {}
    if (prefs.email  !== undefined) body.email_enabled = prefs.email
    if (prefs.push   !== undefined) body.push_enabled  = prefs.push
    if (prefs.sms    !== undefined) body.sms_enabled   = prefs.sms
    const r = await apiClient.patch<ApiResponse<Record<string, unknown>>>('/notifications/preferences', body)
    const d = r.data.data
    return {
      email:  Boolean(d.email_enabled ?? true),
      push:   Boolean(d.push_enabled  ?? false),
      sms:    Boolean(d.sms_enabled   ?? false),
      in_app: true,
    }
  },
}
