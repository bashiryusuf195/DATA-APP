import { useQuery } from '@tanstack/react-query'
import { transactionsApi } from '@/api/transactions.api'

export interface TransactionFilters {
  page?:      number
  limit?:     number
  type?:      string
  status?:    string
  date_from?: string
  date_to?:   string
  reference?: string
  search?:    string
}

export function useTransactions(params?: TransactionFilters) {
  return useQuery({
    queryKey: ['transactions', params],
    queryFn:  () => transactionsApi.list(params),
    staleTime: 15_000,
    placeholderData: (prev) => prev,
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
