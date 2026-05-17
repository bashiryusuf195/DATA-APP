import { apiClient } from './client'
import type { RoutingRule, CreateRoutingRuleInput } from '@/types'

export const routingApi = {
  list: () =>
    apiClient.get<{ data: RoutingRule[] }>('/admin/provider-routing-rules').then((r) => r.data.data),

  create: (body: CreateRoutingRuleInput) =>
    apiClient
      .post<{ data: RoutingRule }>('/admin/provider-routing-rules', body)
      .then((r) => r.data.data),

  update: (id: string, body: Partial<CreateRoutingRuleInput>) =>
    apiClient
      .patch<{ data: RoutingRule }>(`/admin/provider-routing-rules/${id}`, body)
      .then((r) => r.data.data),
}
