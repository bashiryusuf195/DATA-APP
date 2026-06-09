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
}

export const serviceStatusApi = {
  getAll: (): Promise<ServiceStatusRow[]> =>
    apiClient
      .get<{ success: boolean; data: ServiceStatusRow[] }>('/service-status')
      .then((r) => r.data.data),
}
