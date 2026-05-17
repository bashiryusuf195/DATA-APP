import { apiClient } from './client'
import type { User, AuthTokens, BackendAuthResponse } from '@/types'

export interface LoginInput {
  email: string
  password: string
}

/** Normalised shape the frontend works with after extracting the nested backend envelope. */
export interface LoginResponse {
  access_token: string
  refresh_token: string
  session_id: string
  user: User
}

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
  login: async (body: LoginInput): Promise<LoginResponse> => {
    const r = await apiClient.post<BackendAuthResponse>('/auth/login', body)
    const { user, tokens, session_id } = r.data.data

    return {
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
      .post<BackendAuthResponse['data']>('/auth/refresh', { refresh_token })
      .then((r) => r.data.tokens as AuthTokens),
}
