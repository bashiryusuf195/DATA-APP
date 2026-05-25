import { apiClient } from './client'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface IntegrityCheckResult {
  issue_count: number
  issues: Array<{ id?: string; reference?: string; detail?: string; [key: string]: unknown }>
}

export interface IntegrityReport {
  id: string
  run_at: string
  run_by: string
  status: 'passed' | 'warning' | 'critical'
  checks_run: number
  total_issues: number
  critical_issues: number
  duration_ms: number
  orphan_transactions: IntegrityCheckResult
  negative_balances: IntegrityCheckResult
  duplicate_provider_refs: IntegrityCheckResult
  duplicate_purchases: IntegrityCheckResult
  ghost_batches: IntegrityCheckResult
}

export interface RepairResult {
  success: boolean
  message?: string
  [key: string]: unknown
}

// ── Export helpers ────────────────────────────────────────────────────────────

function buildQuery(params: Record<string, string | undefined>): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') q.set(k, v)
  }
  const s = q.toString()
  return s ? `?${s}` : ''
}

function downloadCsv(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a   = document.createElement('a')
  a.href     = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// ── Export API ────────────────────────────────────────────────────────────────

export const backupApi = {
  async downloadTransactions(params: { from?: string; to?: string; status?: string; type?: string } = {}) {
    const res = await apiClient.get<Blob>(
      `/admin/export/transactions${buildQuery(params)}`,
      { responseType: 'blob' },
    )
    const date = new Date().toISOString().slice(0, 10)
    downloadCsv(res.data, `transactions_${date}.csv`)
  },

  async downloadWalletLedger(params: { from?: string; to?: string; wallet_id?: string } = {}) {
    const res = await apiClient.get<Blob>(
      `/admin/export/wallet-ledger${buildQuery(params)}`,
      { responseType: 'blob' },
    )
    const date = new Date().toISOString().slice(0, 10)
    downloadCsv(res.data, `wallet_ledger_${date}.csv`)
  },

  async downloadUsers(params: { from?: string; to?: string; status?: string } = {}) {
    const res = await apiClient.get<Blob>(
      `/admin/export/users${buildQuery(params)}`,
      { responseType: 'blob' },
    )
    const date = new Date().toISOString().slice(0, 10)
    downloadCsv(res.data, `users_${date}.csv`)
  },

  async downloadProviderAttempts(params: { from?: string; to?: string; provider_code?: string; success?: string } = {}) {
    const res = await apiClient.get<Blob>(
      `/admin/export/provider-attempts${buildQuery(params)}`,
      { responseType: 'blob' },
    )
    const date = new Date().toISOString().slice(0, 10)
    downloadCsv(res.data, `provider_attempts_${date}.csv`)
  },

  async downloadReconciliationReports(params: { from?: string; to?: string } = {}) {
    const res = await apiClient.get<Blob>(
      `/admin/export/reconciliation-reports${buildQuery(params)}`,
      { responseType: 'blob' },
    )
    const date = new Date().toISOString().slice(0, 10)
    downloadCsv(res.data, `reconciliation_reports_${date}.csv`)
  },

  // ── Integrity ───────────────────────────────────────────────────────────────

  async runIntegrityCheck(): Promise<IntegrityReport> {
    const res = await apiClient.post<{ success: boolean; data: IntegrityReport }>('/admin/integrity/run')
    return res.data.data
  },

  async listIntegrityReports(): Promise<IntegrityReport[]> {
    const res = await apiClient.get<{ success: boolean; data: IntegrityReport[] }>('/admin/integrity/reports')
    return res.data.data
  },

  async getIntegrityReport(id: string): Promise<IntegrityReport> {
    const res = await apiClient.get<{ success: boolean; data: IntegrityReport }>(`/admin/integrity/reports/${id}`)
    return res.data.data
  },

  // ── Repair tools ────────────────────────────────────────────────────────────

  async markTransactionFailed(reference: string, reason: string): Promise<RepairResult> {
    const res = await apiClient.post<{ success: boolean; data: RepairResult }>(
      `/admin/repair/transactions/${reference}/mark-failed`,
      { reason },
    )
    return res.data.data
  },

  async triggerReconciliation(reference: string): Promise<RepairResult> {
    const res = await apiClient.post<{ success: boolean; data: RepairResult }>(
      `/admin/repair/transactions/${reference}/reconcile`,
    )
    return res.data.data
  },

  async flagOrphan(reference: string, notes: string): Promise<RepairResult> {
    const res = await apiClient.post<{ success: boolean; data: RepairResult }>(
      `/admin/repair/transactions/${reference}/flag-orphan`,
      { notes },
    )
    return res.data.data
  },

  async issueManualRefund(payload: {
    user_id: string
    amount: number
    reason: string
    original_reference: string
    settlement_wallet_id: string
  }): Promise<RepairResult> {
    const res = await apiClient.post<{ success: boolean; data: RepairResult }>(
      '/admin/repair/manual-refund',
      payload,
    )
    return res.data.data
  },

  async verifyWallet(walletId: string): Promise<RepairResult> {
    const res = await apiClient.get<{ success: boolean; data: RepairResult }>(
      `/admin/repair/wallets/${walletId}/verify`,
    )
    return res.data.data
  },
}
