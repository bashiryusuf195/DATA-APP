import { apiClient } from './client'
import type { GroupSummaryRow, SetGroupControlInput } from '@/types'

export const availabilityApi = {
  listGroups: (params?: { service_type?: string }): Promise<GroupSummaryRow[]> =>
    apiClient
      .get<{ success: boolean; data: GroupSummaryRow[] }>('/admin/service-availability/groups', { params })
      .then((r) => (Array.isArray(r.data.data) ? r.data.data : [])),

  toggleGroup: (body: SetGroupControlInput): Promise<unknown> =>
    apiClient
      .post('/admin/service-availability/groups/toggle', body)
      .then((r) => r.data),
}
