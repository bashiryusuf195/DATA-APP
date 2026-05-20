import { apiClient } from './client'
import type {
  CatalogService, ServicePlan,
  CreateServiceInput, UpdateServiceInput,
  CreateServicePlanInput, UpdateServicePlanInput,
  BulkTogglePlansInput,
  CategoryProviderRow,
  BulkAssignProviderInput,
} from '@/types'

export interface ServicePlansMeta {
  total: number
  limit: number
  offset: number
}

export interface ServicePlansResponse {
  plans: ServicePlan[]
  meta: ServicePlansMeta
}

export interface ListServicePlansParams {
  service_id?: string
  service_type?: string
  provider_code?: string
  network_operator?: string
  plan_category?: string
  search?: string
  is_active?: boolean
  limit?: number
  offset?: number
}

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

  listServicePlans: (params?: ListServicePlansParams): Promise<ServicePlansResponse> =>
    apiClient
      .get<{ success: boolean; data: ServicePlan[]; meta: ServicePlansMeta }>('/admin/service-plans', { params })
      .then((r) => ({
        plans: Array.isArray(r.data.data) ? r.data.data : [],
        meta: r.data.meta ?? { total: 0, limit: params?.limit ?? 50, offset: params?.offset ?? 0 },
      })),

  createServicePlan: (body: CreateServicePlanInput): Promise<ServicePlan> =>
    apiClient
      .post<{ success: boolean; data: ServicePlan }>('/admin/service-plans', body)
      .then((r) => r.data.data),

  updateServicePlan: (id: string, body: UpdateServicePlanInput): Promise<ServicePlan> =>
    apiClient
      .patch<{ success: boolean; data: ServicePlan }>(`/admin/service-plans/${id}`, body)
      .then((r) => r.data.data),

  bulkTogglePlans: (body: BulkTogglePlansInput): Promise<{ updated: number }> =>
    apiClient
      .post<{ success: boolean; data: { updated: number } }>('/admin/service-plans/bulk-toggle', body)
      .then((r) => r.data.data),

  getCategoryProviders: (): Promise<CategoryProviderRow[]> =>
    apiClient
      .get<{ success: boolean; data: CategoryProviderRow[] }>('/admin/service-plans/category-providers')
      .then((r) => (Array.isArray(r.data.data) ? r.data.data : [])),

  bulkAssignProvider: (body: BulkAssignProviderInput): Promise<{ updated: number }> =>
    apiClient
      .post<{ success: boolean; data: { updated: number } }>('/admin/service-plans/bulk-assign-provider', body)
      .then((r) => r.data.data),
}
