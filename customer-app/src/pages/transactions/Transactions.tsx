import { useState } from 'react'
import { ArrowLeftRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useTransactions } from '@/hooks/useTransactions'
import { TransactionCard, TYPE_ICON, TYPE_LABEL, TYPE_BG, TYPE_COLOR } from '@/components/shared/TransactionCard'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorMessage } from '@/components/shared/ErrorMessage'
import { Skeleton, Button } from '@/components/ui'
import { fmtCurrency, fmtDateTime } from '@/utils/format'
import { cn } from '@/utils/cn'
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

function DesktopRow({ tx }: { tx: Transaction }) {
  const navigate  = useNavigate()
  const Icon      = TYPE_ICON[tx.type]   ?? ArrowLeftRight
  const iconBg    = TYPE_BG[tx.type]     ?? 'bg-surface-2'
  const iconClr   = TYPE_COLOR[tx.type]  ?? 'text-ink-muted'
  const isCredit  = tx.type === 'wallet_funding'

  return (
    <tr
      onClick={() => navigate(`/transactions/${tx.reference}`)}
      className="hover:bg-surface-2/60 cursor-pointer transition-colors"
    >
      <td className="px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className={cn('h-8 w-8 rounded-full flex items-center justify-center shrink-0', iconBg)}>
            <Icon className={cn('h-4 w-4', iconClr)} />
          </div>
          <span className="text-sm font-semibold text-ink whitespace-nowrap">
            {TYPE_LABEL[tx.type] ?? tx.type}
          </span>
        </div>
      </td>
      <td className="px-5 py-3.5 max-w-[220px]">
        <p className="text-sm text-ink-muted truncate">{tx.description}</p>
      </td>
      <td className="px-5 py-3.5 whitespace-nowrap">
        <p className="text-sm text-ink-muted">{fmtDateTime(tx.created_at)}</p>
      </td>
      <td className="px-5 py-3.5 text-right whitespace-nowrap">
        <p className={cn('text-sm font-bold', isCredit ? 'text-success' : 'text-danger')}>
          {isCredit ? '+' : '-'}{fmtCurrency(tx.amount)}
        </p>
      </td>
      <td className="px-5 py-3.5 text-center">
        <StatusBadge status={tx.status} />
      </td>
    </tr>
  )
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

  const pagination = totalPages > 1 && (
    <div className="flex items-center justify-between px-4 py-3 border-t border-border">
      <Button variant="ghost" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
        ← Prev
      </Button>
      <span className="text-xs text-ink-muted font-medium">{page} / {totalPages}</span>
      <Button variant="ghost" size="sm" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>
        Next →
      </Button>
    </div>
  )

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
        <div className="bg-surface-1 rounded-3xl p-4 shadow-card border border-border space-y-4">
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
        <div className="bg-surface-1 rounded-3xl shadow-card border border-border overflow-hidden">
          <EmptyState icon={ArrowLeftRight} title="No transactions" description="Your transaction history will appear here." />
        </div>
      ) : (
        <>
          {/* ── Desktop table — lg+ ────────────────────────────────────── */}
          <div className="hidden lg:block bg-surface-1 rounded-3xl overflow-hidden shadow-card border border-border">
            <table className="w-full">
              <thead className="border-b border-border bg-surface-2/50">
                <tr>
                  {['Type', 'Description', 'Date', 'Amount', 'Status'].map((h, i) => (
                    <th
                      key={h}
                      className={cn(
                        'px-5 py-3 text-xs font-semibold text-ink-faint uppercase tracking-wide',
                        i === 0 ? 'text-left' : i === 3 ? 'text-right' : i === 4 ? 'text-center' : 'text-left'
                      )}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {txList.map((tx) => <DesktopRow key={tx.id} tx={tx} />)}
              </tbody>
            </table>
            {pagination}
          </div>

          {/* ── Mobile groups — <lg ────────────────────────────────────── */}
          <div className="lg:hidden space-y-4">
            {groups.map(({ label, items }) => (
              <div key={label}>
                <p className="text-xs font-semibold text-ink-faint uppercase tracking-wide mb-2 px-1">{label}</p>
                <div className="bg-surface-1 rounded-3xl overflow-hidden shadow-card border border-border divide-y divide-border">
                  {items.map((tx) => (
                    <TransactionCard key={tx.id} tx={tx} compact />
                  ))}
                </div>
              </div>
            ))}

            {totalPages > 1 && (
              <div className="bg-surface-1 rounded-3xl shadow-card border border-border">
                {pagination}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
