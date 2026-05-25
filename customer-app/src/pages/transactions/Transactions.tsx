import { useState } from 'react'
import { ArrowLeftRight } from 'lucide-react'
import { useTransactions } from '@/hooks/useTransactions'
import { TransactionCard } from '@/components/shared/TransactionCard'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorMessage } from '@/components/shared/ErrorMessage'
import { Skeleton, Button } from '@/components/ui'
import type { Transaction } from '@/types'

const FILTERS = [
  { value: '',                label: 'All'         },
  { value: 'airtime',         label: 'Airtime'     },
  { value: 'data',            label: 'Data'        },
  { value: 'electricity',     label: 'Electricity' },
  { value: 'cable_tv',        label: 'Cable TV'    },
  { value: 'wallet_funding',  label: 'Funding'     },
]

const PAGE_SIZE = 20

function groupByDate(txs: Transaction[]): { label: string; items: Transaction[] }[] {
  const groups = new Map<string, Transaction[]>()
  const now    = new Date()

  for (const tx of txs) {
    const d    = new Date(tx.created_at)
    const diff = Math.floor((now.getTime() - d.getTime()) / 86_400_000)
    const key  = diff === 0 ? 'Today'
               : diff === 1 ? 'Yesterday'
               : d.toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(tx)
  }

  return Array.from(groups.entries()).map(([label, items]) => ({ label, items }))
}

export function TransactionsPage() {
  const [type, setType] = useState('')
  const [page, setPage] = useState(1)

  const { data, isLoading, error, refetch } = useTransactions({
    type:  type || undefined,
    page,
    limit: PAGE_SIZE,
  })

  const txList     = data?.data ?? []
  const totalPages = data?.total ? Math.ceil(data.total / PAGE_SIZE) : 1
  const groups     = groupByDate(txList)

  return (
    <div className="space-y-4 pt-1">
      <h1 className="text-xl font-bold text-ink">Transactions</h1>

      {/* Filter chips */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {FILTERS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => { setType(value); setPage(1) }}
            className={`shrink-0 px-4 py-2 rounded-2xl text-xs font-semibold border-2 transition-all duration-150 ${
              type === value
                ? 'bg-brand-600 text-white border-brand-600 shadow-brand'
                : 'border-border text-ink-muted bg-surface-1 hover:border-brand-400 hover:text-brand-600'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? (
        <ErrorMessage error={error} onRetry={refetch} />
      ) : isLoading ? (
        <div className="bg-surface-1 rounded-3xl p-4 shadow-card space-y-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-36" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      ) : txList.length === 0 ? (
        <div className="bg-surface-1 rounded-3xl shadow-card overflow-hidden">
          <EmptyState icon={ArrowLeftRight} title="No transactions" description="Your transaction history will appear here." />
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map(({ label, items }) => (
            <div key={label}>
              <p className="text-xs font-semibold text-ink-faint uppercase tracking-wide mb-2 px-1">{label}</p>
              <div className="bg-surface-1 rounded-3xl overflow-hidden shadow-card divide-y divide-border">
                {items.map((tx) => (
                  <TransactionCard key={tx.id} tx={tx} compact />
                ))}
              </div>
            </div>
          ))}

          {totalPages > 1 && (
            <div className="flex items-center justify-between bg-surface-1 rounded-3xl px-4 py-3 shadow-card">
              <Button variant="ghost" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                ← Prev
              </Button>
              <span className="text-xs text-ink-muted font-medium">{page} / {totalPages}</span>
              <Button variant="ghost" size="sm" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>
                Next →
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
