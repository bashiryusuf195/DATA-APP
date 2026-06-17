import { useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { walletApi } from '@/api/wallet.api'
import { apiClient } from '@/api/client'
import { useAuthStore } from '@/store/auth.store'
import type { DedicatedAccount } from '@/types'
import type { SquadAccountResult } from '@/api/wallet.api'

function readLocalCache<T>(key: string): { d: T; t: number } | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as { d: T; t: number }) : null
  } catch {
    return null
  }
}

function writeLocalCache<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify({ d: data, t: Date.now() }))
  } catch {}
}

function cleanupOldSharedWalletCache(): void {
  try {
    localStorage.removeItem('wallet:dva')
    localStorage.removeItem('wallet:squad')
  } catch {}
}

export type FundingCardType = 'quick_transfer' | 'dedicated_account'
export interface FundingCardConfig { type: FundingCardType; enabled: boolean }
export interface FundingConfig { cards: FundingCardConfig[] }

const DEFAULT_FUNDING_CONFIG: FundingConfig = {
  cards: [
    { type: 'quick_transfer', enabled: true },
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
    queryKey: WALLET_BALANCE_KEY,
    queryFn: walletApi.getBalance,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  })
}

export function useWalletLedger(params?: { page?: number; limit?: number }) {
  return useQuery({
    queryKey: ['wallet-ledger', params],
    queryFn: () => walletApi.getLedger(params),
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
  const user = useAuthStore((s) => s.user)
  const cacheKey = user?.id ? `wallet:dva:${user.id}` : 'wallet:dva:anonymous'

  const cached = useMemo(() => {
    cleanupOldSharedWalletCache()
    return readLocalCache<DedicatedAccount | null>(cacheKey)
  }, [cacheKey])

  return useQuery({
    queryKey: ['wallet-dedicated-account', user?.id],
    queryFn: async () => {
      const data = await walletApi.getDedicatedAccount()
      writeLocalCache(cacheKey, data)
      return data
    },
    staleTime: 24 * 60 * 60 * 1000,
    enabled: !!user?.id,
    ...(cached != null ? { initialData: cached.d, initialDataUpdatedAt: cached.t } : {}),
    retry: false,
  })
}

export function useSquadAccount() {
  const user = useAuthStore((s) => s.user)
  const cacheKey = user?.id ? `wallet:squad:${user.id}` : 'wallet:squad:anonymous'

  const cached = useMemo(() => {
    cleanupOldSharedWalletCache()
    return readLocalCache<SquadAccountResult>(cacheKey)
  }, [cacheKey])

  return useQuery({
    queryKey: ['wallet-squad-account', user?.id],
    queryFn: async () => {
      const data = await walletApi.getSquadAccount()
      writeLocalCache(cacheKey, data)
      return data
    },
    staleTime: 24 * 60 * 60 * 1000,
    enabled: !!user?.id,
    ...(cached != null ? { initialData: cached.d, initialDataUpdatedAt: cached.t } : {}),
    retry: false,
  })
}