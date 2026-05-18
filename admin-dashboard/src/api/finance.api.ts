import { apiClient } from './client'
import type {
  ReconciliationReport, ReconciliationIssue,
  ProviderBalance, Refund, Reversal,
  PaginatedResponse,
} from '@/types'

interface DateRange { from?: string; to?: string }
interface ListParams extends DateRange { page?: number; limit?: number; status?: string; search?: string }

export const financeApi = {
  // ── Reconciliation ──────────────────────────────────────────────────────────
  listReports: (params?: { limit?: number; offset?: number }) =>
    apiClient
      .get<{ success: boolean; data: ReconciliationReport[] }>('/admin/reconciliation/reports', { params })
      .then((r) => r.data),

  listIssues: (params?: {
    limit?: number; offset?: number;
    report_id?: string; severity?: string; issue_type?: string; resolved?: boolean
  }) =>
    apiClient
      .get<{ success: boolean; data: ReconciliationIssue[] }>('/admin/reconciliation/issues', { params })
      .then((r) => r.data),

  runReconciliation: () =>
    apiClient
      .post<{ success: boolean; message: string; job_id: string | number }>('/admin/reconciliation/run')
      .then((r) => r.data),

  // ── Finance analytics ───────────────────────────────────────────────────────
  getRevenueSummary: (params?: DateRange) =>
    apiClient.get<{ success: boolean; data: unknown }>('/admin/finance/revenue-summary', { params }).then((r) => r.data.data),

  getProviderBalances: (params?: DateRange) =>
    apiClient.get<{ success: boolean; data: ProviderBalance[] }>('/admin/finance/provider-balances', { params }).then((r) => r.data.data),

  getProfitAnalysis: (params?: DateRange) =>
    apiClient.get<{ success: boolean; data: unknown }>('/admin/finance/profit-analysis', { params }).then((r) => r.data.data),

  // ── Lists ───────────────────────────────────────────────────────────────────
  listRefunds: (params?: ListParams) =>
    apiClient
      .get<PaginatedResponse<Refund> & { success: boolean }>('/admin/finance/refunds', { params })
      .then((r) => r.data),

  listReversals: (params?: ListParams) =>
    apiClient
      .get<PaginatedResponse<Reversal> & { success: boolean }>('/admin/finance/reversals', { params })
      .then((r) => r.data),

  // ── Actions ─────────────────────────────────────────────────────────────────
  reverseTransaction: (id: string, body: { reason: string }) =>
    apiClient.post<{ success: boolean; data: Reversal }>(`/admin/transactions/${id}/reverse`, body).then((r) => r.data.data),

  refundTransaction: (id: string, body: { reason: string }) =>
    apiClient.post<{ success: boolean; data: Refund }>(`/admin/transactions/${id}/refund`, body).then((r) => r.data.data),
}
