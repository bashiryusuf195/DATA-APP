import { apiClient } from './client'
import type { AdminRole, PermissionGroup, UserRole } from '@/types'

export const rolesApi = {
  list: (): Promise<AdminRole[]> =>
    apiClient
      .get<{ success: boolean; data: AdminRole[] }>('/admin/roles')
      .then((r) => (Array.isArray(r.data.data) ? r.data.data : [])),

  permissions: (): Promise<PermissionGroup[]> =>
    apiClient
      .get<{ success: boolean; data: PermissionGroup[] }>('/admin/permissions')
      .then((r) => (Array.isArray(r.data.data) ? r.data.data : [])),

  getUserRoles: (userId: string): Promise<UserRole[]> =>
    apiClient
      .get<{ success: boolean; data: UserRole[] }>(`/admin/users/${userId}/roles`)
      .then((r) => (Array.isArray(r.data.data) ? r.data.data : [])),

  assignRole: (userId: string, roleId: string): Promise<void> =>
    apiClient
      .post(`/admin/users/${userId}/roles`, { role_id: roleId })
      .then(() => undefined),

  revokeRole: (userId: string, roleId: string): Promise<void> =>
    apiClient
      .delete(`/admin/users/${userId}/roles/${roleId}`)
      .then(() => undefined),
}
