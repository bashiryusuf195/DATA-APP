import { apiClient } from './client'
import type { User, AuthTokens, BackendAuthResponse } from '@/types'

// ── Security / 2FA types ──────────────────────────────────────────────────────

export interface SecurityStatus {
  totp_enabled:       boolean
  totp_setup_pending: boolean
}

export interface TotpSetupData {
  secret:       string
  uri:          string
  backup_codes: string[]
  instructions: string
}

export interface LoginInput {
  email: string
  password: string
}

/** Full session issued after login (or after 2FA verification). */
export interface LoginResponse {
  requires_2fa: false
  access_token: string
  refresh_token: string
  session_id: string
  user: User
}

/** Returned instead of a session when the user must complete 2FA. */
export interface TwoFactorChallengeResponse {
  requires_2fa: true
  challenge_id: string
}

export type LoginResult = LoginResponse | TwoFactorChallengeResponse

/** Derive the single `role` field from the backend roles array. */
function primaryRole(roles: string[] = []): User['role'] {
  if (roles.includes('super_admin')) return 'super_admin'
  if (roles.includes('admin')) return 'admin'
  return 'user'
}

export const authApi = {
  /**
   * POST /auth/login
   *
   * Backend envelope:
   *   { success, data: { user, tokens: { access_token, refresh_token, … }, session_id } }
   *
   * We unwrap it here so callers always receive a flat LoginResponse.
   */
  login: async (body: LoginInput): Promise<LoginResult> => {
    const r = await apiClient.post<
      | { success: boolean; data: { requires_2fa: true; challenge_id: string } }
      | BackendAuthResponse
    >('/auth/login', body)

    const d = r.data.data as Record<string, unknown>
    if (d['requires_2fa'] === true) {
      return { requires_2fa: true, challenge_id: d['challenge_id'] as string }
    }

    const { user, tokens, session_id } = r.data.data as BackendAuthResponse['data']
    return {
      requires_2fa: false,
      access_token:  tokens.access_token,
      refresh_token: tokens.refresh_token,
      session_id,
      user: {
        id:                user.id,
        email:             user.email,
        role:              primaryRole(user.roles),
        roles:             user.roles,
        permissions:       user.permissions,
        status:            user.status,
        kyc_level:         user.kyc_level,
        is_email_verified: user.is_email_verified,
      },
    }
  },

  verifyLoginTotp: async (challenge_id: string, totp_code: string): Promise<LoginResponse> => {
    const r = await apiClient.post<BackendAuthResponse>('/auth/2fa/verify-login', { challenge_id, totp_code })
    const { user, tokens, session_id } = r.data.data
    return {
      requires_2fa: false,
      access_token:  tokens.access_token,
      refresh_token: tokens.refresh_token,
      session_id,
      user: {
        id:                user.id,
        email:             user.email,
        role:              primaryRole(user.roles),
        roles:             user.roles,
        permissions:       user.permissions,
        status:            user.status,
        kyc_level:         user.kyc_level,
        is_email_verified: user.is_email_verified,
      },
    }
  },

  me: () =>
    apiClient
      .get<{ success: boolean; data: Record<string, unknown> }>('/auth/me')
      .then((r) => {
        const d = r.data.data
        return {
          id:                d.id,
          email:             d.email,
          role:              primaryRole(d.roles as string[] | undefined),
          roles:             d.roles,
          permissions:       d.permissions,
          status:            d.status,
          kyc_level:         d.kyc_level,
          is_email_verified: d.is_email_verified,
          created_at:        d.created_at,
        } as User
      }),

  logout: () =>
    apiClient.post('/auth/logout').then((r) => r.data),

  refresh: (refresh_token: string) =>
    apiClient
      .post<{ success: boolean; data: { tokens: AuthTokens; session_id: string } }>(
        '/auth/refresh',
        { refresh_token },
      )
      .then((r) => r.data.data.tokens),

  // ── Account security ─────────────────────────────────────────────────────

  changePassword: (body: {
    current_password: string
    new_password:     string
    confirm_password: string
  }) =>
    apiClient
      .post<{ success: boolean; data: { message: string } }>('/auth/change-password', body)
      .then((r) => r.data.data),

  getSecurityStatus: (): Promise<SecurityStatus> =>
    apiClient
      .get<{ success: boolean; data: SecurityStatus }>('/auth/security/status')
      .then((r) => r.data.data),

  setupTotp: (): Promise<TotpSetupData> =>
    apiClient
      .post<{ success: boolean; data: TotpSetupData }>('/auth/security/totp/setup')
      .then((r) => r.data.data),

  verifyTotp: (totp_code: string): Promise<{ message: string }> =>
    apiClient
      .post<{ success: boolean; data: { message: string } }>('/auth/security/totp/verify', { totp_code })
      .then((r) => r.data.data),

  disableTotp: (body: { current_password: string; totp_code: string }): Promise<{ message: string }> =>
    apiClient
      .delete<{ success: boolean; data: { message: string } }>('/auth/security/totp', { data: body })
      .then((r) => r.data.data),
}
