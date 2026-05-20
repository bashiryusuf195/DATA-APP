import { apiClient } from './client'
import type {
  ProviderWallet,
  UpdateProviderWalletInput,
  ManualBalanceUpdateInput,
  BalanceCheckResult,
} from '@/types'

export const providerWalletsApi = {
  list: (): Promise<ProviderWallet[]> =>
    apiClient
      .get<{ success: boolean; data: ProviderWallet[] }>('/admin/provider-wallets')
      .then((r) => r.data.data),

  get: (providerCode: string): Promise<ProviderWallet> =>
    apiClient
      .get<{ success: boolean; data: ProviderWallet }>(`/admin/provider-wallets/${providerCode}`)
      .then((r) => r.data.data),

  update: (providerCode: string, body: UpdateProviderWalletInput): Promise<ProviderWallet> =>
    apiClient
      .patch<{ success: boolean; data: ProviderWallet }>(`/admin/provider-wallets/${providerCode}`, body)
      .then((r) => r.data.data),

  checkBalance: (providerCode: string): Promise<BalanceCheckResult> =>
    apiClient
      .post<{ success: boolean; data: BalanceCheckResult }>(`/admin/provider-wallets/${providerCode}/check-balance`)
      .then((r) => r.data.data),

  manualUpdate: (providerCode: string, body: ManualBalanceUpdateInput): Promise<ProviderWallet> =>
    apiClient
      .post<{ success: boolean; data: ProviderWallet }>(`/admin/provider-wallets/${providerCode}/manual-balance-update`, body)
      .then((r) => r.data.data),
}
