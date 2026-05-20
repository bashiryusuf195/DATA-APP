import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { walletApi } from '@/api/wallet.api'

export const WALLET_BALANCE_KEY = ['wallet-balance'] as const

export function useWalletBalance() {
  return useQuery({
    queryKey: WALLET_BALANCE_KEY,
    queryFn:  walletApi.getBalance,
    staleTime: 30_000,
    refetchInterval: 60_000,
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
    mutationFn: ({ amount, key }: { amount: number; key: string }) =>
      walletApi.initializeFunding(amount, key),
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
