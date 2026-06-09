import { apiClient } from './client'

export interface SupportConfig {
  enabled:      boolean
  whatsapp_url: string
  ticket_url:   string
}

export const supportApi = {
  getConfig: (): Promise<SupportConfig> =>
    apiClient
      .get<SupportConfig>('/public/support-config')
      .then((r) => r.data),
}
