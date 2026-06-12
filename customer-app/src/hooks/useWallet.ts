import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { walletApi } from '@/api/wallet.api'
import { apiClient } from '@/api/client'

export type FundingCardType = 'quick_transfer' | 'dedicated_account'
export interface FundingCardConfig { type: FundingCardType; enabled: boolean }
export interface FundingConfig { cards: FundingCardConfig[] }

const DEFAULT_FUNDING_CONFIG: FundingConfig = {
  cards: [
    { type: 'quick_transfer',    enabled: true },
    { type: 'dedicated_account', enabled: true },
  ],
}

export function useFundingConfig() {
  return useQuery<FundingConfig>({
    queryKey: ['funding-config'],
    queryFn: async () => {
      try {
        const r = await apiClient.get<FundingConfig>('/public/funding-config')
        return r.data
      } catch {
        return DEFAULT_FUNDING_CONFIG
      }
    },
    staleTime: 5 * 60 * 1000,
  })
}

export const WALLET_BALANCE_KEY = ['wallet-balance'] as const

export function useWalletBalance() {
  return useQuery({
    queryKey:        WALLET_BALANCE_KEY,
    queryFn:         walletApi.getBalance,
    staleTime:       30_000,
    // Show the last cached balance instantly while a background refresh runs.
    // Balance is invalidated explicitly after transactions and on pull-to-refresh,
    // so continuous polling adds server load with no user benefit.
    placeholderData: (prev) => prev,
  })
}

export function useWalletLedger(params?: { page?: number; limit?: number }) {
  return useQuery({
    queryKey: ['wallet-ledger', params],
    queryFn:  () => walletApi.getLedger(params),
    staleTime: 30_000,
  })
}

export function useInitializeFunding() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ amount, key, method }: { amount: number; key: string; method?: 'bank_transfer' | 'card' }) =>
      walletApi.initializeFunding(amount, key, method),
    onSuccess: () => qc.invalidateQueries({ queryKey: WALLET_BALANCE_KEY }),
  })
}

export function useVerifyFunding() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (reference: string) => walletApi.verifyFunding(reference),
    onSuccess: () => qc.invalidateQueries({ queryKey: WALLET_BALANCE_KEY }),
  })
}

export function useDedicatedAccount() {
  return useQuery({
    queryKey: ['wallet-dedicated-account'],
    queryFn:  walletApi.getDedicatedAccount,
    staleTime: 24 * 60 * 60 * 1000, // accounts don't change — refetch once per day
    retry: false, // don't retry 503 when Paystack isn't configured
  })
}

export function useSquadAccount() {
  return useQuery({
    queryKey: ['wallet-squad-account'],
    queryFn:  walletApi.getSquadAccount,
    staleTime: 24 * 60 * 60 * 1000,
    retry: false,
  })
}
