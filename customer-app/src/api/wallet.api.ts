import { apiClient } from './client'
import type {
  WalletBalance,
  DedicatedAccount,
  SquadAccount,
  FundingInitResponse,
  FundingVerifyResponse,
  LedgerEntry,
  ApiResponse,
} from '@/types'

export interface SquadAccountResult {
  account:           SquadAccount | null
  profileIncomplete: boolean
  incompleteMessage: string | null
}

// Raw shape the backend may return (balance could be a nested object on older
// builds, a string decimal from the pg driver, or a proper number after the fix).
type RawBalanceData = {
  wallet_id?:   string
  balance:      unknown   // may be number | string | nested WalletBalance object
  currency?:    string
  wallet_type?: string
  is_default?:  boolean
}

// Safely extract a numeric balance from whatever the backend sends.
function extractBalance(raw: RawBalanceData): number {
  let v: unknown = raw.balance
  // Nested WalletBalance object: { balance: 5000, ... }
  if (typeof v === 'object' && v !== null && 'balance' in v) {
    v = (v as Record<string, unknown>).balance
  }
  const n = Number(v)
  return isNaN(n) ? 0 : n
}

// Normalize a raw ledger row to the LedgerEntry the UI expects.
// Handles both the old shape (entry_type / running_balance) and the fixed shape
// (type / balance_after) so the frontend is resilient to backend deploys.
function normalizeLedgerEntry(r: Record<string, unknown>): LedgerEntry {
  const amount = parseFloat(String(r.amount ?? 0))
  const balanceAfter = parseFloat(
    String(r.balance_after ?? r.running_balance ?? 0)
  )
  return {
    id:           String(r.id ?? ''),
    type:         ((r.type ?? r.entry_type ?? 'debit') as 'credit' | 'debit'),
    amount:       isNaN(amount) ? 0 : amount,
    balance_after: isNaN(balanceAfter) ? 0 : balanceAfter,
    description:  String(r.description ?? ''),
    reference:    (r.reference ?? r.reference_id) as string | undefined,
    created_at:   String(r.created_at ?? ''),
  }
}

export const walletApi = {
  getBalance: async (): Promise<WalletBalance> => {
    const r = await apiClient.get<ApiResponse<RawBalanceData>>('/wallet/balance')
    const raw = r.data.data
    return {
      wallet_id:   raw.wallet_id   ?? '',
      balance:     extractBalance(raw),
      currency:    raw.currency    ?? 'NGN',
      wallet_type: raw.wallet_type ?? 'user',
      is_default:  raw.is_default  ?? true,
    }
  },

  getLedger: async (params?: { page?: number; limit?: number }): Promise<{ data: LedgerEntry[]; total: number }> => {
    type RawLedger = { data?: unknown[]; entries?: unknown[]; total?: number }
    const r = await apiClient.get<ApiResponse<RawLedger>>('/wallet/ledger', { params })
    const raw = r.data.data
    // Handle both { data: [...] } (fixed backend) and { entries: [...] } (old shape)
    const rawRows = (raw.data ?? raw.entries ?? []) as Record<string, unknown>[]
    const data = rawRows.map(normalizeLedgerEntry)
    return { data, total: raw.total ?? data.length }
  },

  initializeFunding: (
    amount: number,
    idempotencyKey: string,
    method?: 'bank_transfer' | 'card'
  ): Promise<FundingInitResponse> =>
    apiClient
      .post<ApiResponse<FundingInitResponse>>(
        '/wallet/fund/initialize',
        { amount, method },
        { headers: { 'Idempotency-Key': idempotencyKey } }
      )
      .then((r) => r.data.data),

  verifyFunding: (reference: string): Promise<FundingVerifyResponse> =>
    apiClient
      .post<ApiResponse<FundingVerifyResponse>>(`/wallet/fund/verify/${reference}`)
      .then((r) => r.data.data),

  getDedicatedAccount: (): Promise<DedicatedAccount | null> =>
    apiClient
      .get<ApiResponse<DedicatedAccount | null>>('/wallet/account')
      .then((r) => r.data.data ?? null),

  getSquadAccount: async (): Promise<SquadAccountResult> => {
    try {
      const r = await apiClient.get<
        ApiResponse<SquadAccount | null> & { code?: string; message?: string }
      >('/wallet/squad-account')
      const incomplete = r.data.code === 'PROFILE_INCOMPLETE'
      return {
        account:           r.data.data ?? null,
        profileIncomplete: incomplete,
        incompleteMessage: incomplete ? (r.data.message ?? null) : null,
      }
    } catch {
      // 503 = Squad not configured; any other error — silently return null
      return { account: null, profileIncomplete: false, incompleteMessage: null }
    }
  },
}
