import { apiClient } from './client'
import type {
  CatalogService, ServicePlan,
  CreateServiceInput, UpdateServiceInput,
  CreateServicePlanInput, UpdateServicePlanInput,
  BulkTogglePlansInput,
  CategoryProviderRow,
  BulkAssignProviderInput,
  ProviderPlanMapping,
  CreatePlanMappingInput,
  UpdatePlanMappingInput,
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
  has_provider_override?: boolean
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

  bulkClearOverride: (ids: string[]): Promise<{ updated: number }> =>
    apiClient
      .post<{ success: boolean; data: { updated: number } }>('/admin/service-plans/bulk-clear-override', { ids })
      .then((r) => r.data.data),

  bulkSetProviderByIds: (ids: string[], primary_provider_code: string): Promise<{ updated: number }> =>
    apiClient
      .post<{ success: boolean; data: { updated: number } }>('/admin/service-plans/bulk-set-provider', { ids, primary_provider_code })
      .then((r) => r.data.data),

  deleteServicePlan: (id: string): Promise<void> =>
    apiClient.delete(`/admin/service-plans/${id}`).then(() => undefined),

  fetchProviderPlans: (providerCode: string, service: 'data' | 'cable_tv' | 'electricity', network?: string): Promise<{ service: string; network: string | null; plans: Record<string, unknown>[] }> =>
    apiClient
      .get<{ success: boolean; data: { service: string; network: string | null; plans: Record<string, unknown>[] } }>(`/admin/providers/${providerCode}/plans`, { params: { service, network } })
      .then((r) => r.data.data),

  bulkImportPlans: (body: {
    service_id: string
    provider_code: string
    primary_provider_code: string
    plans: Array<{
      name: string
      variation_code: string
      amount: number
      cost_price?: number | null
      selling_price?: number | null
      network_operator?: string | null
      plan_category?: string | null
      duration_days?: number | null
      provider_variation_code?: string | null
    }>
  }): Promise<{ created: number; skipped: number }> =>
    apiClient
      .post<{ success: boolean; data: { created: number; skipped: number } }>('/admin/service-plans/bulk-import', body)
      .then((r) => r.data.data),

  listPlanMappings: (planId: string): Promise<ProviderPlanMapping[]> =>
    apiClient
      .get<{ success: boolean; data: ProviderPlanMapping[] }>('/admin/plan-mappings', { params: { plan_id: planId } })
      .then((r) => (Array.isArray(r.data.data) ? r.data.data : [])),

  createPlanMapping: (body: CreatePlanMappingInput): Promise<ProviderPlanMapping> =>
    apiClient
      .post<{ success: boolean; data: ProviderPlanMapping }>('/admin/plan-mappings', body)
      .then((r) => r.data.data),

  updatePlanMapping: (id: string, body: UpdatePlanMappingInput): Promise<ProviderPlanMapping> =>
    apiClient
      .patch<{ success: boolean; data: ProviderPlanMapping }>(`/admin/plan-mappings/${id}`, body)
      .then((r) => r.data.data),

  deletePlanMapping: (id: string): Promise<void> =>
    apiClient.delete(`/admin/plan-mappings/${id}`).then(() => undefined),
}
