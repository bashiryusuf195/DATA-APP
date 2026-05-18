import { apiClient } from './client'
import type { PaginatedResponse } from '@/types'
import type {
  KycUser, KycVerification, KycStats,
  RiskFlag, RiskFlagStats,
  ComplianceReport,
  BlacklistEntry,
  FrozenAccount,
} from '@/types'

type KycListResult = PaginatedResponse<KycUser> & { stats: KycStats }
type RiskFlagListResult = PaginatedResponse<RiskFlag> & { stats: RiskFlagStats }

export const complianceApi = {
  // ── KYC ──────────────────────────────────────────────────────────────────────

  listKycUsers(params: {
    kyc_level?: string; status?: string; search?: string
    bvn_verified?: boolean; nin_verified?: boolean
    page?: number; limit?: number
  } = {}): Promise<KycListResult> {
    return apiClient
      .get<{ success: boolean } & KycListResult>('/admin/kyc/users', { params })
      .then((r) => ({
        data:  Array.isArray(r.data.data) ? r.data.data : [],
        total: r.data.total ?? 0,
        page:  r.data.page  ?? 1,
        limit: r.data.limit ?? 25,
        stats: r.data.stats ?? { total_users: 0, verified_tier1: 0, verified_tier2: 0, verified_tier3: 0, pending: 0, bvn_verified: 0, nin_verified: 0 },
      }))
  },

  listKycVerifications(params: {
    user_id?: string; verification_type?: string; status?: string
    from?: string; to?: string; page?: number; limit?: number
  } = {}): Promise<PaginatedResponse<KycVerification>> {
    return apiClient
      .get<{ success: boolean } & PaginatedResponse<KycVerification>>('/admin/kyc/verifications', { params })
      .then((r) => ({
        data:  Array.isArray(r.data.data) ? r.data.data : [],
        total: r.data.total ?? 0,
        page:  r.data.page  ?? 1,
        limit: r.data.limit ?? 25,
      }))
  },

  updateKycStatus(userId: string, body: { kyc_level: string; notes?: string }): Promise<KycUser> {
    return apiClient
      .patch<{ success: boolean; data: KycUser }>(`/admin/kyc/users/${userId}/status`, body)
      .then((r) => r.data.data)
  },

  // ── Risk Flags ────────────────────────────────────────────────────────────────

  listRiskFlags(params: {
    user_id?: string; flag_type?: string; severity?: string; status?: string
    search?: string; from?: string; to?: string; page?: number; limit?: number
  } = {}): Promise<RiskFlagListResult> {
    return apiClient
      .get<{ success: boolean } & RiskFlagListResult>('/admin/risk/flags', { params })
      .then((r) => ({
        data:  Array.isArray(r.data.data) ? r.data.data : [],
        total: r.data.total ?? 0,
        page:  r.data.page  ?? 1,
        limit: r.data.limit ?? 25,
        stats: r.data.stats ?? { open: 0, investigating: 0, resolved: 0, dismissed: 0, critical: 0, high: 0 },
      }))
  },

  createRiskFlag(body: {
    user_id: string; flag_type: string; severity: string; title: string
    description?: string; evidence?: Record<string, unknown>; transaction_ref?: string
  }): Promise<RiskFlag> {
    return apiClient
      .post<{ success: boolean; data: RiskFlag }>('/admin/risk/flags', body)
      .then((r) => r.data.data)
  },

  updateRiskFlag(id: string, body: {
    status?: string; severity?: string; assigned_to?: string | null; resolution_notes?: string
  }): Promise<RiskFlag> {
    return apiClient
      .patch<{ success: boolean; data: RiskFlag }>(`/admin/risk/flags/${id}`, body)
      .then((r) => r.data.data)
  },

  // ── Compliance Reports ────────────────────────────────────────────────────────

  listComplianceReports(params: {
    report_type?: string; status?: string; from?: string; to?: string
    page?: number; limit?: number
  } = {}): Promise<PaginatedResponse<ComplianceReport>> {
    return apiClient
      .get<{ success: boolean } & PaginatedResponse<ComplianceReport>>('/admin/compliance/reports', { params })
      .then((r) => ({
        data:  Array.isArray(r.data.data) ? r.data.data : [],
        total: r.data.total ?? 0,
        page:  r.data.page  ?? 1,
        limit: r.data.limit ?? 25,
      }))
  },

  // ── Blacklist ─────────────────────────────────────────────────────────────────

  listBlacklist(params: {
    entity_type?: string; search?: string; include_removed?: boolean
    page?: number; limit?: number
  } = {}): Promise<PaginatedResponse<BlacklistEntry>> {
    return apiClient
      .get<{ success: boolean } & PaginatedResponse<BlacklistEntry>>('/admin/blacklist', { params })
      .then((r) => ({
        data:  Array.isArray(r.data.data) ? r.data.data : [],
        total: r.data.total ?? 0,
        page:  r.data.page  ?? 1,
        limit: r.data.limit ?? 25,
      }))
  },

  addToBlacklist(body: {
    entity_type: string; entity_value: string; reason: string
    notes?: string; metadata?: Record<string, unknown>
  }): Promise<BlacklistEntry> {
    return apiClient
      .post<{ success: boolean; data: BlacklistEntry }>('/admin/blacklist', body)
      .then((r) => r.data.data)
  },

  removeFromBlacklist(id: string, body: { reason?: string } = {}): Promise<BlacklistEntry> {
    return apiClient
      .delete<{ success: boolean; data: BlacklistEntry }>(`/admin/blacklist/${id}`, { data: body })
      .then((r) => r.data.data)
  },

  // ── Freeze ────────────────────────────────────────────────────────────────────

  freezeAccount(userId: string, body: { reason: string }): Promise<FrozenAccount> {
    return apiClient
      .post<{ success: boolean; data: FrozenAccount }>(`/admin/users/${userId}/freeze`, body)
      .then((r) => r.data.data)
  },

  unfreezeAccount(userId: string, body: { notes?: string } = {}): Promise<FrozenAccount> {
    return apiClient
      .post<{ success: boolean; data: FrozenAccount }>(`/admin/users/${userId}/unfreeze`, body)
      .then((r) => r.data.data)
  },

  listFrozenAccounts(params: {
    search?: string; from?: string; to?: string; page?: number; limit?: number
  } = {}): Promise<PaginatedResponse<FrozenAccount>> {
    return apiClient
      .get<{ success: boolean } & PaginatedResponse<FrozenAccount>>('/admin/frozen-accounts', { params })
      .then((r) => ({
        data:  Array.isArray(r.data.data) ? r.data.data : [],
        total: r.data.total ?? 0,
        page:  r.data.page  ?? 1,
        limit: r.data.limit ?? 25,
      }))
  },
}
