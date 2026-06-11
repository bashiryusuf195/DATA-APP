import { apiClient } from './client'
import type { ApiResponse, User, AuthTokens } from '@/types'

export interface BiometricDeviceRow {
  id:           string
  device_id:    string
  device_name:  string
  platform:     string
  last_used_at: string | null
  created_at:   string
}

export const biometricDeviceApi = {
  register: (params: {
    device_id:     string
    device_name:   string
    platform:      'android' | 'ios' | 'web'
    device_secret: string
  }): Promise<{ id: string }> =>
    apiClient
      .post<ApiResponse<{ id: string }>>('/auth/biometric/register', params)
      .then((r) => r.data.data),

  login: (params: {
    device_id:     string
    device_secret: string
  }): Promise<{ user: User; tokens: AuthTokens; session_id: string }> =>
    apiClient
      .post<ApiResponse<{ user: User; tokens: AuthTokens; session_id: string }>>(
        '/auth/biometric/login',
        params,
      )
      .then((r) => r.data.data),

  list: (): Promise<BiometricDeviceRow[]> =>
    apiClient
      .get<ApiResponse<BiometricDeviceRow[]>>('/auth/biometric/devices')
      .then((r) => r.data.data),

  revoke: (id: string): Promise<void> =>
    apiClient.delete(`/auth/biometric/devices/${id}`).then(() => undefined),
}
