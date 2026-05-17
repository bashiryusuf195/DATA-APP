import { apiClient } from './client'
import { pageOffset } from './helpers'
import type {
  PaginatedResponse,
  AdminLedgerEntry,
  AdminJournalBatch,
  AdminJournalBatchDetail,
} from '@/types'

export interface LedgerFilters {
  page?:           number
  limit?:          number
  wallet_id?:      string
  user_id?:        string
  entry_type?:     'debit' | 'credit'
  reference_id?:   string
  reference_type?: string
  from?:           string
  to?:             string
}

export interface JournalBatchFilters {
  page?:   number
  limit?:  number
  status?: 'pending' | 'posted' | 'reversed' | 'failed'
  from?:   string
  to?:     string
}

export const ledgerApi = {
  list: (params: LedgerFilters = {}): Promise<PaginatedResponse<AdminLedgerEntry>> => {
    const { page = 1, limit = 20, ...rest } = params
    return apiClient
      .get<{
        success: boolean
        data: AdminLedgerEntry[]
        meta: { limit: number; offset: number; total: number }
      }>('/admin/wallet-ledger', {
        params: { limit, offset: pageOffset(page, limit), ...rest },
      })
      .then((r) => ({
        data:  Array.isArray(r.data.data) ? r.data.data : [],
        total: r.data.meta?.total ?? 0,
        page,
        limit,
      }))
  },

  batches: (params: JournalBatchFilters = {}): Promise<PaginatedResponse<AdminJournalBatch>> => {
    const { page = 1, limit = 20, ...rest } = params
    return apiClient
      .get<{
        success: boolean
        data: AdminJournalBatch[]
        meta: { limit: number; offset: number; total: number }
      }>('/admin/journal-batches', {
        params: { limit, offset: pageOffset(page, limit), ...rest },
      })
      .then((r) => ({
        data:  Array.isArray(r.data.data) ? r.data.data : [],
        total: r.data.meta?.total ?? 0,
        page,
        limit,
      }))
  },

  getBatch: (id: string): Promise<AdminJournalBatchDetail> =>
    apiClient
      .get<{ success: boolean; data: AdminJournalBatchDetail }>(
        `/admin/journal-batches/${id}`,
      )
      .then((r) => r.data.data),
}
