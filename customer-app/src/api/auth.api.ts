import { apiClient } from './client'
import type {
  User,
  LoginInput,
  RegisterInput,
  LoginResult,
  LoginResponse,
  AuthTokens,
  ApiResponse,
} from '@/types'

/**
 * Convert a phone number to E.164 format, or return undefined if blank/unparseable.
 * Handles Nigerian local format (08012345678 → +2348012345678).
 */
function normalizePhone(raw?: string): string | undefined {
  if (!raw || !raw.trim()) return undefined
  const trimmed = raw.trim()
  if (/^\+[1-9]\d{6,14}$/.test(trimmed)) return trimmed   // already E.164
  const digits = trimmed.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('0')) return '+234' + digits.slice(1)
  if (digits.length === 13 && digits.startsWith('234')) return '+' + digits
  return undefined
}

function primaryRole(roles: string[] = []): User['role'] {
  if (roles.includes('super_admin')) return 'super_admin'
  if (roles.includes('admin')) return 'admin'
  return 'user'
}

function mapUser(raw: Record<string, unknown>): User {
  // The /auth/me endpoint nests name fields under a `profile` object.
  // The /auth/profile (update) and register endpoints return them flat.
  // Read both locations so all callers work correctly.
  const profile = (raw.profile && typeof raw.profile === 'object')
    ? raw.profile as Record<string, unknown>
    : {}
  return {
    id:                  raw.id as string,
    email:               raw.email as string,
    phone:               (raw.phone ?? profile.phone) as string | null,
    first_name:          (raw.first_name ?? profile.first_name) as string | null,
    last_name:           (raw.last_name  ?? profile.last_name)  as string | null,
    username:            raw.username as string | null,
    role:                primaryRole(raw.roles as string[]),
    status:              raw.status as User['status'],
    kyc_level:           (raw.kyc_level as number) ?? 0,
    is_email_verified:   (raw.is_email_verified as boolean) ?? false,
    has_transaction_pin: (raw.has_transaction_pin as boolean) ?? false,
    referral_code:       raw.referral_code as string | null,
    created_at:          raw.created_at as string,
  }
}

type BackendAuthData = {
  user: Record<string, unknown>
  tokens: AuthTokens
  session_id: string
}

export const authApi = {
  register: async (body: RegisterInput): Promise<LoginResponse> => {
    const payload = { ...body, phone: normalizePhone(body.phone) }
    const r = await apiClient.post<ApiResponse<BackendAuthData>>('/auth/register', payload)
    const { user, tokens, session_id } = r.data.data
    return {
      requires_2fa: false,
      access_token:  tokens.access_token,
      refresh_token: tokens.refresh_token,
      session_id,
      user: mapUser(user),
    }
  },

  login: async (body: LoginInput): Promise<LoginResult> => {
    type LoginRaw =
      | ApiResponse<{ requires_2fa: true; challenge_id: string }>
      | ApiResponse<BackendAuthData>
    const r = await apiClient.post<LoginRaw>('/auth/login', body)
    const d = r.data.data as Record<string, unknown>
    if (d['requires_2fa'] === true) {
      return { requires_2fa: true, challenge_id: d['challenge_id'] as string }
    }
    const { user, tokens, session_id } = r.data.data as BackendAuthData
    return {
      requires_2fa: false,
      access_token:  tokens.access_token,
      refresh_token: tokens.refresh_token,
      session_id,
      user: mapUser(user),
    }
  },

  verifyLoginTotp: async (challenge_id: string, totp_code: string): Promise<LoginResponse> => {
    const r = await apiClient.post<ApiResponse<BackendAuthData>>('/auth/2fa/verify-login', {
      challenge_id,
      totp_code,
    })
    const { user, tokens, session_id } = r.data.data
    return {
      requires_2fa: false,
      access_token:  tokens.access_token,
      refresh_token: tokens.refresh_token,
      session_id,
      user: mapUser(user),
    }
  },

  logout: () => apiClient.post('/auth/logout').then((r) => r.data),

  me: async (): Promise<User> => {
    const r = await apiClient.get<ApiResponse<Record<string, unknown>>>('/auth/me')
    return mapUser(r.data.data)
  },

  refresh: async (refresh_token: string): Promise<AuthTokens> => {
    const r = await apiClient.post<ApiResponse<{ tokens: AuthTokens }>>('/auth/refresh', { refresh_token })
    return r.data.data.tokens
  },

  changePassword: (body: {
    current_password: string
    new_password: string
    confirm_password: string
  }) =>
    apiClient
      .post<ApiResponse<{ message: string }>>('/auth/change-password', body)
      .then((r) => r.data.data),

  forgotPassword: (email: string) =>
    apiClient
      .post<ApiResponse<{ message: string }>>('/auth/forgot-password', { email })
      .then((r) => r.data.data),

  updateProfile: async (body: {
    first_name?: string
    last_name?:  string
    phone?:      string
    username?:   string
  }): Promise<User> => {
    // Normalise phone to E.164 before sending — the backend stores it in the
    // users table which has a CHECK constraint: phone ~ '^[+][1-9][0-9]{6,14}$'.
    // Normalise username to lowercase — the users_username_fmt constraint
    // requires ^[a-z0-9_]{3,30}$, so uppercase values like "BASH016" fail.
    const payload = {
      ...body,
      phone:    body.phone    !== undefined ? normalizePhone(body.phone) : undefined,
      username: body.username !== undefined ? body.username.trim().toLowerCase() || undefined : undefined,
    }
    const r = await apiClient.patch<ApiResponse<Record<string, unknown>>>('/auth/profile', payload)
    return mapUser(r.data.data)
  },
}
