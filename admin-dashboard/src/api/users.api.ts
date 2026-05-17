import { apiClient } from './client'
import type { PaginatedResponse } from '@/types'

export interface AdminUser {
  id: string
  email: string
  first_name?: string
  last_name?: string
  phone?: string
  role?: string
  roles?: string[]
  status?: string
  kyc_level?: number
  is_email_verified?: boolean
  created_at: string
  updated_at?: string
}

export interface UserFilters {
  page?: number
  limit?: number
  email?: string
  status?: string
  role?: string
}

export const usersApi = {
  list: (params: UserFilters = {}) =>
    apiClient
      .get<{ success: boolean; data: PaginatedResponse<AdminUser> }>('/admin/users', { params })
      .then((r) => r.data.data),

  get: (id: string) =>
    apiClient
      .get<{ success: boolean; data: AdminUser }>(`/admin/users/${id}`)
      .then((r) => r.data.data),

  update: (id: string, body: { status?: string; kyc_level?: number }) =>
    apiClient
      .patch<{ success: boolean; data: AdminUser }>(`/admin/users/${id}`, body)
      .then((r) => r.data.data),

  getWallet: (id: string) =>
    apiClient
      .get<{ success: boolean; data: Record<string, unknown> }>(`/admin/users/${id}/wallet`)
      .then((r) => r.data.data),
}
