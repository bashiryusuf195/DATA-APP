import { apiClient } from './client'
import type { Service, ServicePlan, ApiResponse } from '@/types'

export const servicesApi = {
  list: (): Promise<Service[]> =>
    apiClient
      .get<ApiResponse<Service[]>>('/services')
      .then((r) => r.data.data),

  getPlans: (serviceType: string): Promise<ServicePlan[]> =>
    apiClient
      .get<ApiResponse<ServicePlan[]>>(`/services/${serviceType}/plans`)
      .then((r) => r.data.data),
}
