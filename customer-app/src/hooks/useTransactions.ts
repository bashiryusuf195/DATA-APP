import { useQuery } from '@tanstack/react-query'
import { transactionsApi } from '@/api/transactions.api'

export function useTransactions(params?: {
  page?: number
  limit?: number
  type?: string
  status?: string
}) {
  return useQuery({
    queryKey: ['transactions', params],
    queryFn:  () => transactionsApi.list(params),
    staleTime: 15_000,
  })
}

export function useTransaction(reference: string) {
  return useQuery({
    queryKey: ['transaction', reference],
    queryFn:  () => transactionsApi.get(reference),
    staleTime: 60_000,
    enabled: !!reference,
  })
}
