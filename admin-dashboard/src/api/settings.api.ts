import { apiClient } from './client'
import type { SettingEntry, SettingsByCategory, EnvironmentInfo } from '@/types'

export const settingsApi = {
  list: (): Promise<SettingsByCategory> =>
    apiClient
      .get<{ success: boolean; data: SettingsByCategory }>('/admin/settings')
      .then((r) => r.data.data ?? {}),

  update: (key: string, value: string): Promise<SettingEntry> =>
    apiClient
      .patch<{ success: boolean; data: SettingEntry }>(`/admin/settings/${key}`, { value })
      .then((r) => r.data.data),

  getEnvironment: (): Promise<EnvironmentInfo> =>
    apiClient
      .get<{ success: boolean; data: EnvironmentInfo }>('/admin/settings/environment')
      .then((r) => r.data.data),
}
