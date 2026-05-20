import { apiClient } from './client'
import type { RoutingRule, CreateRoutingRuleInput } from '@/types'

// Convert empty-string fallback to null so the backend's z.string().min(1).nullable()
// check passes. An empty Select value means "no fallback", which the backend expects as null.
function sanitize(body: CreateRoutingRuleInput | Partial<CreateRoutingRuleInput>) {
  return {
    ...body,
    fallback_provider_code: body.fallback_provider_code || null,
  }
}

export const routingApi = {
  list: () =>
    apiClient.get<{ data: RoutingRule[] }>('/admin/provider-routing-rules').then((r) => r.data.data),

  create: (body: CreateRoutingRuleInput) =>
    apiClient
      .post<{ data: RoutingRule }>('/admin/provider-routing-rules', sanitize(body))
      .then((r) => r.data.data),

  update: (id: string, body: Partial<CreateRoutingRuleInput>) =>
    apiClient
      .patch<{ data: RoutingRule }>(`/admin/provider-routing-rules/${id}`, sanitize(body))
      .then((r) => r.data.data),
}
