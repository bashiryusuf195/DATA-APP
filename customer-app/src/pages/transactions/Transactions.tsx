import { useState } from 'react'
import { ArrowLeftRight } from 'lucide-react'
import { useTransactions } from '@/hooks/useTransactions'
import { TransactionCard } from '@/components/shared/TransactionCard'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorMessage } from '@/components/shared/ErrorMessage'
import { Skeleton, Button } from '@/components/ui'

const TYPES = [
  { value: '',                      label: 'All' },
  { value: 'airtime',               label: 'Airtime' },
  { value: 'data',                  label: 'Data' },
  { value: 'electricity',           label: 'Electricity' },
  { value: 'cable_tv',              label: 'Cable TV' },
  { value: 'wallet_funding',        label: 'Funding' },
]

const PAGE_SIZE = 20

export function TransactionsPage() {
  const [type, setType] = useState('')
  const [page, setPage] = useState(1)

  const { data, isLoading, error, refetch } = useTransactions({
    type:  type || undefined,
    page,
    limit: PAGE_SIZE,
  })

  const txList     = data?.data  ?? []
  const totalPages = data?.total ? Math.ceil(data.total / PAGE_SIZE) : 1

  return (
    <div className="space-y-4 pt-2">
      <h1 className="text-xl font-bold text-ink">Transactions</h1>

      {/* Type filter */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {TYPES.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => { setType(value); setPage(1) }}
            className={`shrink-0 px-3.5 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
              type === value
                ? 'bg-brand-600 text-white border-brand-600'
                : 'border-border text-ink-muted hover:border-brand-400'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Results */}
      {error ? (
        <ErrorMessage error={error} onRetry={refetch} />
      ) : (
        <div className="bg-surface-1 rounded-2xl border border-border overflow-hidden">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-xl" />
                  <div className="flex-1 space-y-1.5"><Skeleton className="h-3.5 w-36" /><Skeleton className="h-3 w-24" /></div>
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          ) : txList.length > 0 ? (
            <>
              <div className="divide-y divide-border">
                {txList.map((tx) => <TransactionCard key={tx.id} tx={tx} compact />)}
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                  <Button variant="ghost" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>← Prev</Button>
                  <span className="text-xs text-ink-muted">{page} / {totalPages}</span>
                  <Button variant="ghost" size="sm" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>Next →</Button>
                </div>
              )}
            </>
          ) : (
            <EmptyState icon={ArrowLeftRight} title="No transactions" description="Your transaction history will appear here." />
          )}
        </div>
      )}
    </div>
  )
}
