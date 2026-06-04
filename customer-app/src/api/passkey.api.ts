import { apiClient } from './client'
import type { ApiResponse, User, AuthTokens } from '@/types'

// ── Registration ──────────────────────────────────────────────────────────────

export const passkeyApi = {
  registerBegin: (): Promise<object> =>
    apiClient
      .post<ApiResponse<object>>('/auth/passkey/register/begin')
      .then((r) => r.data.data),

  registerComplete: (credential: object, friendlyName?: string): Promise<void> =>
    apiClient
      .post('/auth/passkey/register/complete', { credential, friendlyName })
      .then(() => undefined),

  // ── Authentication ──────────────────────────────────────────────────────────

  authBegin: (): Promise<{ options: object; passkeySessionToken: string }> =>
    apiClient
      .post<ApiResponse<{ options: object; passkeySessionToken: string }>>('/auth/passkey/auth/begin')
      .then((r) => r.data.data),

  authComplete: (passkeySessionToken: string, assertion: object): Promise<{
    user:       User
    tokens:     AuthTokens
    session_id: string
  }> =>
    apiClient
      .post<ApiResponse<{
        user:       Record<string, unknown>
        tokens:     AuthTokens
        session_id: string
      }>>('/auth/passkey/auth/complete', { passkeySessionToken, assertion })
      .then((r) => r.data.data as { user: User; tokens: AuthTokens; session_id: string }),

  // ── Device management ───────────────────────────────────────────────────────

  list: (): Promise<PasskeyDevice[]> =>
    apiClient
      .get<ApiResponse<PasskeyDevice[]>>('/auth/passkey')
      .then((r) => r.data.data),

  revoke: (id: string): Promise<void> =>
    apiClient.delete(`/auth/passkey/${id}`).then(() => undefined),
}

export interface PasskeyDevice {
  id:            string
  friendly_name: string | null
  device_type:   string | null
  backed_up:     boolean
  transports:    string[] | null
  last_used_at:  string | null
  created_at:    string
}
