import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { walletApi } from '@/api/wallet.api'
import { EndpointGuard } from '@/components/shared/EndpointGuard'
import { PageHeader } from '@/components/shared/PageHeader'
import { FilterBar } from '@/components/shared/FilterBar'
import { DataTable } from '@/components/shared/DataTable'
import { Pagination } from '@/components/shared/Pagination'
import { ErrorMessage } from '@/components/shared/ErrorMessage'
import { Button, Select, Badge, Card } from '@/components/ui'
import { SkeletonTable } from '@/components/ui/Skeleton'
import { fmtCurrency, fmtDate } from '@/utils/format'
import type { LedgerEntry } from '@/types'
import { RefreshCw, ArrowDownLeft, ArrowUpRight, BookOpen } from 'lucide-react'
import { ENDPOINTS } from '@/config/endpoints'

const DIRECTION_OPTIONS = [
  { value: 'credit', label: 'Credits only' },
  { value: 'debit',  label: 'Debits only' },
]

export function LedgerExplorerPage() {
  return (
    <EndpointGuard
      endpointKey="walletLedger"
      pageTitle="Ledger Explorer"
      pageSubtitle="Browse and filter platform wallet ledger entries"
      features={[
        'Cross-user ledger entry search',
        'Filter by direction (credit / debit)',
        'Filter by reference type and date range',
        'Export ledger entries to CSV',
        'Balance reconciliation view',
      ]}
    >
      <LedgerExplorerContent />
    </EndpointGuard>
  )
}

function LedgerExplorerContent() {
  const [page, setPage]           = useState(1)
  const [direction, setDirection] = useState('')
  const limit = 25

  const enabled = ENDPOINTS.walletLedger.status === 'available'

  const { data: raw, isLoading, error, refetch } = useQuery({
    queryKey: ['ledger-explorer', { page, limit }],
    queryFn: () => walletApi.ledger({ page, limit }),
    enabled,
  })

  const allRows: LedgerEntry[] = raw?.data ?? []
  const rows = direction ? allRows.filter((e) => e.direction === direction) : allRows
  const total = raw?.total ?? allRows.length

  const totalCredit = allRows
    .filter((e) => e.direction === 'credit')
    .reduce((s, e) => s + Number(e.amount ?? 0), 0)
  const totalDebit = allRows
    .filter((e) => e.direction === 'debit')
    .reduce((s, e) => s + Number(e.amount ?? 0), 0)

  if (error) {
    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader title="Ledger Explorer" subtitle="Browse and filter platform wallet ledger entries" />
        <ErrorMessage error={error} onRetry={() => void refetch()} endpoint={ENDPOINTS.walletLedger.path} inline />
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Ledger Explorer"
        subtitle="Browse and filter platform wallet ledger entries"
        actions={
          <Button variant="secondary" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />}
            onClick={() => void refetch()}>Refresh</Button>
        }
      />

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-surface-1 border border-emerald-500/20 rounded-xl p-4 flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-emerald-500/15 text-emerald-400 shrink-0">
            <ArrowDownLeft className="h-4 w-4" />
          </div>
          <div>
            <p className="text-xs text-ink-faint uppercase tracking-wide mb-0.5">Credits (this page)</p>
            <p className="text-xl font-bold text-emerald-400">{fmtCurrency(totalCredit)}</p>
          </div>
        </div>
        <div className="bg-surface-1 border border-rose-500/20 rounded-xl p-4 flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-rose-500/15 text-rose-400 shrink-0">
            <ArrowUpRight className="h-4 w-4" />
          </div>
          <div>
            <p className="text-xs text-ink-faint uppercase tracking-wide mb-0.5">Debits (this page)</p>
            <p className="text-xl font-bold text-rose-400">{fmtCurrency(totalDebit)}</p>
          </div>
        </div>
      </div>

      <FilterBar>
        <div className="w-44">
          <Select
            value={direction}
            onChange={(e) => { setDirection(e.target.value); setPage(1) }}
            options={DIRECTION_OPTIONS}
            placeholder="All directions"
          />
        </div>
      </FilterBar>

      <Card padding="none">
        {isLoading ? (
          <div className="p-5"><SkeletonTable rows={10} /></div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <BookOpen className="h-10 w-10 text-ink-faint opacity-30 mb-3" />
            <p className="text-sm text-ink-faint">No ledger entries found</p>
          </div>
        ) : (
          <>
            <DataTable
              data={rows}
              rowKey={(e) => e.id}
              columns={[
                {
                  key: 'direction',
                  header: 'Type',
                  render: (e) =>
                    e.direction === 'credit' ? (
                      <Badge variant="success">
                        <ArrowDownLeft className="h-3 w-3 mr-1" />Credit
                      </Badge>
                    ) : (
                      <Badge variant="danger">
                        <ArrowUpRight className="h-3 w-3 mr-1" />Debit
                      </Badge>
                    ),
                },
                {
                  key: 'amount',
                  header: 'Amount',
                  align: 'right',
                  render: (e) => (
                    <span className={`font-semibold ${e.direction === 'credit' ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {e.direction === 'credit' ? '+' : '−'}{fmtCurrency(e.amount)}
                    </span>
                  ),
                },
                {
                  key: 'description',
                  header: 'Description',
                  render: (e) => (
                    <span className="text-sm text-ink-muted">{e.description ?? '—'}</span>
                  ),
                },
                {
                  key: 'ref_type',
                  header: 'Ref Type',
                  render: (e) => (
                    <Badge variant="neutral" size="sm">{e.reference_type ?? '—'}</Badge>
                  ),
                },
                {
                  key: 'wallet',
                  header: 'Wallet',
                  render: (e) => (
                    <span className="font-mono text-xs text-ink-faint">
                      {e.wallet_id ? e.wallet_id.slice(0, 10) + '…' : '—'}
                    </span>
                  ),
                },
                {
                  key: 'date',
                  header: 'Date',
                  render: (e) => (
                    <span className="text-xs text-ink-faint">{fmtDate(e.created_at)}</span>
                  ),
                },
              ]}
            />
            <div className="px-4 pb-4">
              <Pagination page={page} limit={limit} total={total} onPage={setPage} />
            </div>
          </>
        )}
      </Card>
    </div>
  )
}
