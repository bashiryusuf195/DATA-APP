import { apiClient } from './client'
import type { Announcement, ApiResponse } from '@/types'

export const announcementsApi = {
  getActive: (): Promise<Announcement[]> =>
    apiClient
      .get<ApiResponse<Announcement[]>>('/announcements/active')
      .then((r) => r.data.data ?? []),
}
