import { apiClient } from './client'
import { pageOffset, normalizePaged } from './helpers'
import type {
  Notification,
  NotificationTemplate,
  NotificationJob,
  NotificationJobStats,
  PaginatedResponse,
} from '@/types'

// ── Notification log ──────────────────────────────────────────────────────────

interface NotifLogResult extends PaginatedResponse<Notification & { user_email?: string; user_name?: string }> {
  stats: { sent: number; failed: number; pending: number; read: number }
}

export const notificationsApi = {
  adminList: (
    params: { channel?: string; type?: string; status?: string; user_id?: string; from?: string; to?: string; page?: number; limit?: number } = {}
  ): Promise<NotifLogResult> => {
    const { page = 1, limit = 25, ...rest } = params
    return apiClient
      .get<{ success: boolean; data: Notification[]; total: number; stats: NotifLogResult['stats'] }>(
        '/admin/notifications',
        { params: { page, limit, ...rest } },
      )
      .then((r) => ({
        data:  Array.isArray(r.data.data) ? r.data.data : [],
        total: r.data.total ?? 0,
        page,
        limit,
        stats: r.data.stats ?? { sent: 0, failed: 0, pending: 0, read: 0 },
      }))
  },

  myList: (params: { page?: number; limit?: number; read?: boolean } = {}): Promise<PaginatedResponse<Notification>> => {
    const { page = 1, limit = 20, ...rest } = params
    return apiClient
      .get<{ success: boolean; data: Notification[] }>(
        '/notifications',
        { params: { limit, offset: pageOffset(page, limit), ...rest } },
      )
      .then((r) => normalizePaged(Array.isArray(r.data.data) ? r.data.data : [], page, limit))
  },

  // ── Send notification ───────────────────────────────────────────────────────
  sendNotification: (body: {
    type:              string
    notification_type: string
    recipient_type?:   string
    recipient_id?:     string
    recipient_email?:  string
    recipient_phone?:  string
    subject?:          string
    body:              string
    template_id?:      string
    variables?:        Record<string, string>
    scheduled_at?:     string
    metadata?:         Record<string, unknown>
    idempotency_key?:  string
  }): Promise<NotificationJob> =>
    apiClient.post<{ success: boolean; data: NotificationJob }>('/admin/notifications/send', body)
      .then((r) => r.data.data),

  // ── Jobs ─────────────────────────────────────────────────────────────────────
  listJobs: (
    params: { status?: string; type?: string; notification_type?: string; recipient_type?: string; search?: string; from?: string; to?: string; page?: number; limit?: number } = {}
  ): Promise<PaginatedResponse<NotificationJob> & { stats: NotificationJobStats }> =>
    apiClient
      .get<{ success: boolean; data: NotificationJob[]; total: number; page: number; limit: number; stats: NotificationJobStats }>(
        '/admin/notification-jobs',
        { params },
      )
      .then((r) => ({
        data:  r.data.data ?? [],
        total: r.data.total ?? 0,
        page:  r.data.page  ?? 1,
        limit: r.data.limit ?? 25,
        stats: r.data.stats ?? { pending: 0, processing: 0, sent: 0, failed: 0, cancelled: 0 },
      })),

  retryJob: (jobId: string): Promise<NotificationJob> =>
    apiClient.post<{ success: boolean; data: NotificationJob }>(`/admin/notifications/retry/${jobId}`)
      .then((r) => r.data.data),

  deleteJob: (jobId: string): Promise<void> =>
    apiClient.delete(`/admin/notifications/jobs/${jobId}`).then(() => undefined),

  // Soft-delete a customer inbox notification (removes from customer view)
  deleteNotification: (id: string): Promise<void> =>
    apiClient.delete(`/admin/notifications/${id}`).then(() => undefined),

  // ── Templates ─────────────────────────────────────────────────────────────────
  listTemplates: (
    params: { type?: string; notification_type?: string; is_active?: boolean; search?: string; page?: number; limit?: number } = {}
  ): Promise<PaginatedResponse<NotificationTemplate>> =>
    apiClient
      .get<{ success: boolean; data: NotificationTemplate[]; total: number; page: number; limit: number }>(
        '/admin/notification-templates',
        { params },
      )
      .then((r) => ({
        data:  r.data.data ?? [],
        total: r.data.total ?? 0,
        page:  r.data.page  ?? 1,
        limit: r.data.limit ?? 25,
      })),

  createTemplate: (body: {
    name:              string
    type:              string
    notification_type: string
    subject?:          string | null
    body:              string
    variables?:        string[]
    is_active?:        boolean
  }): Promise<NotificationTemplate> =>
    apiClient.post<{ success: boolean; data: NotificationTemplate }>('/admin/notification-templates', body)
      .then((r) => r.data.data),

  updateTemplate: (id: string, body: Partial<{
    name:              string
    type:              string
    notification_type: string
    subject:           string | null
    body:              string
    variables:         string[]
    is_active:         boolean
  }>): Promise<NotificationTemplate> =>
    apiClient.patch<{ success: boolean; data: NotificationTemplate }>(`/admin/notification-templates/${id}`, body)
      .then((r) => r.data.data),
}

// ── Admin push notifications ──────────────────────────────────────────────────

export interface AdminPushPreferences {
  push_enabled:               boolean
  admin_transaction_failures: boolean
  admin_provider_alerts:      boolean
  admin_support_messages:     boolean
  admin_payment_alerts:       boolean
  admin_security_events:      boolean
  admin_system_alerts:        boolean
  fcm_configured:             boolean
}

export const adminPushApi = {
  getPreferences: (): Promise<AdminPushPreferences> =>
    apiClient
      .get<{ success: boolean; data: AdminPushPreferences }>('/admin/push-preferences')
      .then((r) => r.data.data),

  updatePreferences: (prefs: Partial<AdminPushPreferences>): Promise<AdminPushPreferences> =>
    apiClient
      .put<{ success: boolean; data: AdminPushPreferences }>('/admin/push-preferences', prefs)
      .then((r) => r.data.data),

  getStatus: (): Promise<{ has_active_token: boolean; configured: boolean }> =>
    apiClient
      .get<{ success: boolean; data: { has_active_token: boolean; configured: boolean } }>('/admin/push-status')
      .then((r) => r.data.data),

  registerToken: (token: string): Promise<void> =>
    apiClient
      .post('/admin/push-token', { token, platform: 'web', browser: navigator.userAgent.slice(0, 100) })
      .then(() => undefined),

  deregisterToken: (token: string): Promise<void> =>
    apiClient.delete('/admin/push-token', { data: { token } }).then(() => undefined),

  sendTest: (): Promise<{ sent: number; failed: number }> =>
    apiClient
      .post<{ success: boolean; data: { sent: number; failed: number } }>('/admin/push/test')
      .then((r) => r.data.data),
}
