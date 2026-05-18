import { apiClient } from './client'
import type {
  SupportTicket, SupportTicketDetail, SupportMessage,
  CreateTicketInput, UpdateTicketInput, AddMessageInput,
  Dispute, CreateDisputeInput, UpdateDisputeInput,
  PaginatedResponse,
} from '@/types'

export const supportApi = {
  // ── Tickets ──────────────────────────────────────────────────────────────

  listTickets: (params?: {
    status?: string
    priority?: string
    category?: string
    assigned_to?: string
    user_id?: string
    search?: string
    page?: number
    limit?: number
  }): Promise<PaginatedResponse<SupportTicket>> =>
    apiClient
      .get<{ success: boolean; data: SupportTicket[]; total: number; page: number; limit: number }>(
        '/admin/support/tickets',
        { params },
      )
      .then((r) => ({
        data:  Array.isArray(r.data.data) ? r.data.data : [],
        total: r.data.total ?? 0,
        page:  r.data.page  ?? 1,
        limit: r.data.limit ?? 25,
      })),

  getTicket: (id: string): Promise<SupportTicketDetail> =>
    apiClient
      .get<{ success: boolean; data: SupportTicketDetail }>(`/admin/support/tickets/${id}`)
      .then((r) => r.data.data),

  createTicket: (body: CreateTicketInput): Promise<SupportTicket> =>
    apiClient
      .post<{ success: boolean; data: SupportTicket }>('/admin/support/tickets', body)
      .then((r) => r.data.data),

  updateTicket: (id: string, body: UpdateTicketInput): Promise<SupportTicket> =>
    apiClient
      .patch<{ success: boolean; data: SupportTicket }>(`/admin/support/tickets/${id}`, body)
      .then((r) => r.data.data),

  addMessage: (ticketId: string, body: AddMessageInput): Promise<SupportMessage> =>
    apiClient
      .post<{ success: boolean; data: SupportMessage }>(
        `/admin/support/tickets/${ticketId}/messages`,
        body,
      )
      .then((r) => r.data.data),

  // ── Disputes ─────────────────────────────────────────────────────────────

  listDisputes: (params?: {
    status?: string
    dispute_type?: string
    user_id?: string
    search?: string
    page?: number
    limit?: number
  }): Promise<PaginatedResponse<Dispute>> =>
    apiClient
      .get<{ success: boolean; data: Dispute[]; total: number; page: number; limit: number }>(
        '/admin/disputes',
        { params },
      )
      .then((r) => ({
        data:  Array.isArray(r.data.data) ? r.data.data : [],
        total: r.data.total ?? 0,
        page:  r.data.page  ?? 1,
        limit: r.data.limit ?? 25,
      })),

  createDispute: (body: CreateDisputeInput): Promise<Dispute> =>
    apiClient
      .post<{ success: boolean; data: Dispute }>('/admin/disputes', body)
      .then((r) => r.data.data),

  updateDispute: (id: string, body: UpdateDisputeInput): Promise<Dispute> =>
    apiClient
      .patch<{ success: boolean; data: Dispute }>(`/admin/disputes/${id}`, body)
      .then((r) => r.data.data),
}
