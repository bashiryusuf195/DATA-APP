import { apiClient } from './client'

export interface WalletAdjustInput {
  identifier: string
  amount: number
  reason: string
}

export interface WalletAdjustResult {
  user: {
    id: string
    email: string
    full_name: string | null
  }
  wallet_id: string
  operation: 'credit' | 'debit'
  amount: number
  balance_before: number
  balance_after: number
  reference: string
  journal_batch_id: string
  transaction_id: string
}

export const walletOpsApi = {
  credit: (input: WalletAdjustInput): Promise<WalletAdjustResult> =>
    apiClient
      .post<{ success: boolean; data: WalletAdjustResult }>('/admin/wallet/credit', input)
      .then((r) => r.data.data),

  debit: (input: WalletAdjustInput): Promise<WalletAdjustResult> =>
    apiClient
      .post<{ success: boolean; data: WalletAdjustResult }>('/admin/wallet/debit', input)
      .then((r) => r.data.data),
}
