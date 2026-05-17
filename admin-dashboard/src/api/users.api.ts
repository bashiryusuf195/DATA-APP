import { apiClient } from './client'
import { pageOffset } from './helpers'
import type { PaginatedResponse } from '@/types'

export interface AdminUser {
  id: string
  email: string
  full_name: string | null
  status: string
  kyc_level: string
  is_email_verified: boolean
  last_login_at: string | null
  created_at: string
  wallet: {
    wallet_id: string
    currency: string
    balance: number
  } | null
  roles: string[]
}

export interface AdminUserDetail {
  id: string
  email: string
  phone: string | null
  username: string | null
  status: string
  kyc_level: string
  is_email_verified: boolean
  is_phone_verified: boolean
  last_login_at: string | null
  login_count: number
  created_at: string
  updated_at: string
  profile: {
    first_name: string | null
    last_name: string | null
    display_name: string | null
    avatar_url: string | null
    date_of_birth: string | null
    gender: string | null
    city: string | null
    state: string | null
    country: string | null
    bvn_verified: boolean
    nin_verified: boolean
  }
  wallets: Array<{
    wallet_id: string
    wallet_type: string
    currency: string
    status: string
    is_default: boolean
    label: string | null
    balance: number
    created_at: string
  }>
  recent_transactions: Array<{
    id: string
    reference: string
    type: string
    status: string
    amount: number
    currency: string
    provider: string | null
    created_at: string
  }>
  roles: Array<{
    role: string
    name: string
    assigned_at: string
    expires_at: string | null
  }>
  sessions: Array<{
    id: string
    ip_address: string | null
    user_agent: string | null
    is_revoked: boolean
    expires_at: string
    created_at: string
  }>
  notifications_count: {
    total: number
    unread: number
  }
}

export interface UserFilters {
  page?: number
  limit?: number
  email?: string
  status?: string
  role?: string
}

export const usersApi = {
  list: (params: UserFilters = {}): Promise<PaginatedResponse<AdminUser>> => {
    const { page = 1, limit = 20, ...rest } = params
    return apiClient
      .get<{
        success: boolean
        data: AdminUser[]
        meta: { limit: number; offset: number; total: number }
      }>('/admin/users', { params: { limit, offset: pageOffset(page, limit), ...rest } })
      .then((r) => ({
        data:  Array.isArray(r.data.data) ? r.data.data : [],
        total: r.data.meta?.total ?? 0,
        page,
        limit,
      }))
  },

  get: (id: string): Promise<AdminUserDetail> =>
    apiClient
      .get<{ success: boolean; data: AdminUserDetail }>(`/admin/users/${id}`)
      .then((r) => r.data.data),
}
