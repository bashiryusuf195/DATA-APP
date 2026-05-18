import { apiClient } from './client'
import type { DashboardMetrics } from '@/types'

export const dashboardApi = {
  metrics: (): Promise<DashboardMetrics> =>
    apiClient
      .get<{ success: boolean; data: DashboardMetrics }>('/admin/dashboard/metrics')
      .then((r) => r.data.data),
}
