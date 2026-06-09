import { apiClient } from './client'

export type AnnouncementSeverity = 'info' | 'success' | 'warning' | 'critical'

export interface Announcement {
  id:           string
  title:        string
  message:      string
  severity:     AnnouncementSeverity
  display_type: 'popup' | 'ticker'
  priority:     number
  status:       'active' | 'inactive'
  start_at:     string | null
  end_at:       string | null
  created_by:   string | null
  created_at:   string
  updated_at:   string
}

export interface AnnouncementInput {
  title:        string
  message:      string
  severity?:    AnnouncementSeverity
  display_type: 'popup' | 'ticker'
  priority?:    number
  status?:      'active' | 'inactive'
  start_at?:    string | null
  end_at?:      string | null
}

interface ListResult {
  data:  Announcement[]
  total: number
  page:  number
  limit: number
}

export const announcementsApi = {
  list: (params?: { status?: string; display_type?: string; page?: number; limit?: number }): Promise<ListResult> =>
    apiClient
      .get<{ success: boolean } & ListResult>('/admin/announcements', { params })
      .then((r) => ({ data: r.data.data, total: r.data.total, page: r.data.page, limit: r.data.limit })),

  create: (body: AnnouncementInput): Promise<Announcement> =>
    apiClient
      .post<{ success: boolean; data: Announcement }>('/admin/announcements', body)
      .then((r) => r.data.data),

  update: (id: string, body: Partial<AnnouncementInput>): Promise<Announcement> =>
    apiClient
      .patch<{ success: boolean; data: Announcement }>(`/admin/announcements/${id}`, body)
      .then((r) => r.data.data),

  delete: (id: string): Promise<void> =>
    apiClient.delete(`/admin/announcements/${id}`).then(() => undefined),
}
