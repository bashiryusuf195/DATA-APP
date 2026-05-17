import { apiClient } from './client'
import type { WalletBalance, LedgerEntry, PaginatedResponse } from '@/types'

export const walletApi = {
  balance: async (): Promise<WalletBalance> => {
    const r = await apiClient.get<{ success: boolean; data: Record<string, unknown> }>('/wallet/balance')
    const d = r.data.data
    // Backend may nest amounts under a `balance` sub-object; flatten defensively.
    const inner = (d.balance as Record<string, unknown> | undefined) ?? {}
    return {
      wallet_id:         String(d.wallet_id ?? ''),
      user_id:           String(d.user_id ?? ''),
      currency:          String(d.currency ?? 'NGN'),
      ledger_balance:    Number((d.ledger_balance ?? inner.ledger_balance) ?? 0),
      available_balance: Number((d.available_balance ?? inner.available_balance) ?? 0),
    }
  },

  ledger: (params: { page?: number; limit?: number } = {}) =>
    apiClient
      .get<{ success: boolean; data: PaginatedResponse<LedgerEntry> }>('/wallet/ledger', { params })
      .then((r) => r.data.data),
}
