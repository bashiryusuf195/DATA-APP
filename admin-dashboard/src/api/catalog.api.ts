import { apiClient } from './client'
import type {
  CatalogService, ServicePlan,
  CreateServiceInput, UpdateServiceInput,
  CreateServicePlanInput, UpdateServicePlanInput,
} from '@/types'

export const catalogApi = {
  listServices: (params?: { service_type?: string; is_active?: boolean }): Promise<CatalogService[]> =>
    apiClient
      .get<{ success: boolean; data: CatalogService[] }>('/admin/services', { params })
      .then((r) => (Array.isArray(r.data.data) ? r.data.data : [])),

  createService: (body: CreateServiceInput): Promise<CatalogService> =>
    apiClient
      .post<{ success: boolean; data: CatalogService }>('/admin/services', body)
      .then((r) => r.data.data),

  updateService: (id: string, body: UpdateServiceInput): Promise<CatalogService> =>
    apiClient
      .patch<{ success: boolean; data: CatalogService }>(`/admin/services/${id}`, body)
      .then((r) => r.data.data),

  listServicePlans: (params?: {
    service_id?: string
    provider_code?: string
    search?: string
    is_active?: boolean
  }): Promise<ServicePlan[]> =>
    apiClient
      .get<{ success: boolean; data: ServicePlan[] }>('/admin/service-plans', { params })
      .then((r) => (Array.isArray(r.data.data) ? r.data.data : [])),

  createServicePlan: (body: CreateServicePlanInput): Promise<ServicePlan> =>
    apiClient
      .post<{ success: boolean; data: ServicePlan }>('/admin/service-plans', body)
      .then((r) => r.data.data),

  updateServicePlan: (id: string, body: UpdateServicePlanInput): Promise<ServicePlan> =>
    apiClient
      .patch<{ success: boolean; data: ServicePlan }>(`/admin/service-plans/${id}`, body)
      .then((r) => r.data.data),
}
