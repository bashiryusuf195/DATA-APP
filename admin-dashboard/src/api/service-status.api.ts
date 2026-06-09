import { apiClient } from './client'

export type ServiceStatusValue = 'available' | 'delayed' | 'maintenance' | 'unavailable'

export interface ServiceStatusRow {
  service_key:       string
  service_name:      string
  category:          string
  status:            ServiceStatusValue
  message:           string | null
  maintenance_start: string | null
  maintenance_end:   string | null
  updated_by:        string | null
  updated_at:        string
}

export interface UpdateServiceStatusInput {
  status?:            ServiceStatusValue
  message?:           string | null
  maintenance_start?: string | null
  maintenance_end?:   string | null
}

export const serviceStatusApi = {
  list: (): Promise<ServiceStatusRow[]> =>
    apiClient
      .get<{ success: boolean; data: ServiceStatusRow[] }>('/admin/service-status')
      .then((r) => r.data.data),

  update: (key: string, body: UpdateServiceStatusInput): Promise<ServiceStatusRow> =>
    apiClient
      .patch<{ success: boolean; data: ServiceStatusRow }>(`/admin/service-status/${key}`, body)
      .then((r) => r.data.data),
}
