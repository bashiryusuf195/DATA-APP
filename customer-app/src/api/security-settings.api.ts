import { apiClient } from './client'

export interface SecuritySettings {
  biometric_purchase_enabled: boolean
}

export const securitySettingsApi = {
  get: (): Promise<SecuritySettings> =>
    apiClient
      .get<{ success: boolean; data: SecuritySettings }>('/security/settings')
      .then((r) => r.data.data),

  update: (settings: Partial<SecuritySettings>): Promise<SecuritySettings> =>
    apiClient
      .put<{ success: boolean; data: SecuritySettings }>('/security/settings', settings)
      .then((r) => r.data.data),
}
