import { useState, useCallback } from 'react'
import {
  ArrowLeftRight, Search, SlidersHorizontal, X,
  ChevronLeft, ChevronRight, RotateCcw,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useTransactions } from '@/hooks/useTransactions'
import { useDebounce } from '@/hooks/useDebounce'
import { TransactionCard, TYPE_ICON, TYPE_LABEL, TYPE_BG, TYPE_COLOR } from '@/components/shared/TransactionCard'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { ErrorMessage } from '@/components/shared/ErrorMessage'
import { EmptyTransactions } from '@/components/shared/empty-states'
import { Button } from '@/components/ui'
import { TransactionsSkeleton } from '@/components/skeletons'
import { fmtCurrency, fmtDateTime } from '@/utils/format'
import { cn } from '@/utils/cn'
import type { Transaction } from '@/types'

// ── Filter config ─────────────────────────────────────────────────────────────

const TYPE_CHIPS = [
  { value: '',                      label: 'All'       },
  { value: 'airtime',               label: 'Airtime'   },
  { value: 'data',                  label: 'Data'      },
  { value: 'electricity',           label: 'Electricity'},
  { value: 'cable_tv',              label: 'Cable TV'  },
  { value: 'wallet_funding',        label: 'Funding'   },
  { value: 'exam_pin',              label: 'Exam PIN'  },
  { value: 'identity_verification', label: 'Identity'  },
]

const STATUS_OPTIONS = [
  { value: '',           label: 'Any status'  },
  { value: 'successful', label: 'Successful'  },
  { value: 'pending',    label: 'Pending'     },
  { value: 'processing', label: 'Processing'  },
  { value: 'failed',     label: 'Failed'      },
  { value: 'reversed',   label: 'Reversed'    },
]

const PAGE_SIZE = 20

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Desktop table row ─────────────────────────────────────────────────────────

function DesktopRow({ tx }: { tx: Transaction }) {
  const navigate = useNavigate()
  const Icon     = TYPE_ICON[tx.type]  ?? ArrowLeftRight
  const iconBg   = TYPE_BG[tx.type]   ?? 'bg-surface-2'
  const iconClr  = TYPE_COLOR[tx.type] ?? 'text-ink-muted'
  const isCredit = tx.type === 'wallet_funding'

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
      <td className="px-5 py-3.5 max-w-[200px]">
        <p className="text-sm text-ink-muted truncate">{tx.description}</p>
      </td>
      <td className="px-5 py-3.5 whitespace-nowrap">
        <p className="text-xs font-mono text-ink-faint">{tx.reference}</p>
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

// ── Active filter pill (for "showing results for…" row) ───────────────────────

function FilterPill({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 bg-brand-600/10 text-brand-700 dark:text-brand-400 text-[11px] font-semibold rounded-full px-2.5 py-1 border border-brand-200 dark:border-brand-800">
      {label}
      <button type="button" onClick={onRemove} className="ml-0.5 hover:text-brand-900 dark:hover:text-white">
        <X className="h-3 w-3" />
      </button>
    </span>
  )
}

// ── Pagination bar ────────────────────────────────────────────────────────────

interface PaginationProps {
  page: number; totalPages: number; total: number; limit: number;
  onPrev: () => void; onNext: () => void
}
function Pagination({ page, totalPages, total, limit, onPrev, onNext }: PaginationProps) {
  if (totalPages <= 1) return null
  const from = (page - 1) * limit + 1
  const to   = Math.min(page * limit, total)
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-border">
      <button
        onClick={onPrev} disabled={page === 1}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-ink-muted hover:bg-surface-2 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        <ChevronLeft className="h-3.5 w-3.5" /> Prev
      </button>
      <div className="text-center">
        <p className="text-xs font-semibold text-ink">{page} / {totalPages}</p>
        <p className="text-[10px] text-ink-faint">{from}–{to} of {total}</p>
      </div>
      <button
        onClick={onNext} disabled={page === totalPages}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-ink-muted hover:bg-surface-2 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        Next <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function TransactionsPage() {
  // Filter state
  const [search,    setSearch]    = useState('')
  const [type,      setType]      = useState('')
  const [status,    setStatus]    = useState('')
  const [dateFrom,  setDateFrom]  = useState('')
  const [dateTo,    setDateTo]    = useState('')
  const [reference, setReference] = useState('')
  const [page,      setPage]      = useState(1)
  const [showAdv,   setShowAdv]   = useState(false)

  const debouncedSearch    = useDebounce(search,    450)
  const debouncedReference = useDebounce(reference, 450)

  const resetPage = useCallback(() => setPage(1), [])

  const { data, isLoading, isFetching, error, refetch } = useTransactions({
    page,
    limit:     PAGE_SIZE,
    type:      type      || undefined,
    status:    status    || undefined,
    date_from: dateFrom  || undefined,
    date_to:   dateTo    || undefined,
    reference: debouncedReference || undefined,
    search:    debouncedSearch    || undefined,
  })

  const txList     = data?.data ?? []
  const total      = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const groups     = groupByDate(txList)

  // Count active advanced filters
  const advCount = [status, dateFrom, dateTo, reference].filter(Boolean).length

  const clearAll = () => {
    setSearch(''); setType(''); setStatus('')
    setDateFrom(''); setDateTo(''); setReference('')
    setPage(1)
  }

  const hasAnyFilter = !!(search || type || status || dateFrom || dateTo || reference)

  function handleType(v: string) { setType(v); resetPage() }
  function handleStatus(v: string) { setStatus(v); resetPage() }

  return (
    <div className="space-y-3 pt-1">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-ink">Transactions</h1>
        {hasAnyFilter && (
          <button
            onClick={clearAll}
            className="flex items-center gap-1 text-xs text-ink-muted hover:text-ink transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Clear all
          </button>
        )}
      </div>

      {/* ── Search bar ────────────────────────────────────────────────── */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-faint pointer-events-none" />
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); resetPage() }}
          placeholder="Search by phone, meter, smartcard or reference…"
          className="w-full pl-10 pr-10 py-2.5 rounded-2xl bg-surface-1 border border-border text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-brand-400/50 transition"
        />
        {search && (
          <button
            onClick={() => { setSearch(''); resetPage() }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* ── Type chips + advanced toggle ──────────────────────────────── */}
      <div className="flex items-center gap-2">
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none flex-1 min-w-0">
          {TYPE_CHIPS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => handleType(value)}
              className={cn(
                'shrink-0 px-3.5 py-1.5 rounded-2xl text-xs font-semibold border-2 transition-all duration-150 whitespace-nowrap',
                type === value
                  ? 'bg-brand-600 text-white border-brand-600 shadow-brand'
                  : 'border-border text-ink-muted bg-surface-1 hover:border-brand-400 hover:text-brand-600'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Advanced filters toggle */}
        <button
          onClick={() => setShowAdv((v) => !v)}
          className={cn(
            'shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-2xl text-xs font-semibold border-2 transition-all duration-150',
            showAdv || advCount > 0
              ? 'bg-surface-2 border-ink-muted text-ink'
              : 'border-border text-ink-muted bg-surface-1 hover:border-ink-muted hover:text-ink'
          )}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filters
          {advCount > 0 && (
            <span className="h-4 w-4 rounded-full bg-brand-600 text-white text-[9px] font-black flex items-center justify-center">
              {advCount}
            </span>
          )}
        </button>
      </div>

      {/* ── Advanced filter panel ─────────────────────────────────────── */}
      {showAdv && (
        <div className="bg-surface-1 border border-border rounded-2xl p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Status */}
            <div>
              <label className="text-[10px] font-semibold text-ink-faint uppercase tracking-wider block mb-1.5">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => { handleStatus(e.target.value) }}
                className="w-full rounded-xl bg-surface-0 border border-border text-sm text-ink px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400/50"
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* Date from */}
            <div>
              <label className="text-[10px] font-semibold text-ink-faint uppercase tracking-wider block mb-1.5">
                From date
              </label>
              <input
                type="date"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(e) => { setDateFrom(e.target.value); resetPage() }}
                className="w-full rounded-xl bg-surface-0 border border-border text-sm text-ink px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400/50"
              />
            </div>

            {/* Date to */}
            <div>
              <label className="text-[10px] font-semibold text-ink-faint uppercase tracking-wider block mb-1.5">
                To date
              </label>
              <input
                type="date"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(e) => { setDateTo(e.target.value); resetPage() }}
                className="w-full rounded-xl bg-surface-0 border border-border text-sm text-ink px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400/50"
              />
            </div>

            {/* Reference */}
            <div>
              <label className="text-[10px] font-semibold text-ink-faint uppercase tracking-wider block mb-1.5">
                Reference
              </label>
              <div className="relative">
                <input
                  value={reference}
                  onChange={(e) => { setReference(e.target.value); resetPage() }}
                  placeholder="e.g. TXN-ABC123"
                  className="w-full rounded-xl bg-surface-0 border border-border text-sm text-ink px-3 py-2 pr-8 focus:outline-none focus:ring-2 focus:ring-brand-400/50 placeholder:text-ink-faint"
                />
                {reference && (
                  <button
                    onClick={() => { setReference(''); resetPage() }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Active filter pills */}
          {advCount > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1 border-t border-border">
              {status    && <FilterPill label={`Status: ${status}`}    onRemove={() => { setStatus('');    resetPage() }} />}
              {dateFrom  && <FilterPill label={`From: ${dateFrom}`}    onRemove={() => { setDateFrom('');  resetPage() }} />}
              {dateTo    && <FilterPill label={`To: ${dateTo}`}        onRemove={() => { setDateTo('');    resetPage() }} />}
              {reference && <FilterPill label={`Ref: ${reference}`}   onRemove={() => { setReference(''); resetPage() }} />}
            </div>
          )}
        </div>
      )}

      {/* ── Results header ────────────────────────────────────────────── */}
      {!isLoading && total > 0 && (
        <div className="flex items-center justify-between px-0.5">
          <p className="text-xs text-ink-faint">
            {isFetching ? 'Updating…' : `${total.toLocaleString()} transaction${total === 1 ? '' : 's'}`}
          </p>
          {hasAnyFilter && (
            <button onClick={clearAll} className="text-xs text-brand-600 hover:underline font-medium">
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* ── Content ───────────────────────────────────────────────────── */}
      {error ? (
        <ErrorMessage error={error} onRetry={refetch} />
      ) : isLoading ? (
        <TransactionsSkeleton />
      ) : txList.length === 0 ? (
        <div className="bg-surface-1 rounded-3xl shadow-card border border-border overflow-hidden">
          {hasAnyFilter
            ? <EmptyTransactions filtered onClear={clearAll} />
            : <EmptyTransactions />
          }
        </div>
      ) : (
        <>
          {/* ── Desktop table ─────────────────────────────────────────── */}
          <div className="hidden lg:block bg-surface-1 rounded-3xl overflow-hidden shadow-card border border-border">
            <table className="w-full">
              <thead className="border-b border-border bg-surface-2/50">
                <tr>
                  {[
                    { h: 'Type',        align: 'text-left'   },
                    { h: 'Description', align: 'text-left'   },
                    { h: 'Reference',   align: 'text-left'   },
                    { h: 'Date',        align: 'text-left'   },
                    { h: 'Amount',      align: 'text-right'  },
                    { h: 'Status',      align: 'text-center' },
                  ].map(({ h, align }) => (
                    <th key={h} className={cn('px-5 py-3 text-xs font-semibold text-ink-faint uppercase tracking-wide', align)}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {txList.map((tx) => <DesktopRow key={tx.id} tx={tx} />)}
              </tbody>
            </table>
            <Pagination
              page={page} totalPages={totalPages} total={total} limit={PAGE_SIZE}
              onPrev={() => setPage((p) => p - 1)} onNext={() => setPage((p) => p + 1)}
            />
          </div>

          {/* ── Mobile grouped list ───────────────────────────────────── */}
          <div className="lg:hidden space-y-4">
            {groups.map(({ label, items }) => (
              <div key={label}>
                <p className="text-xs font-semibold text-ink-faint uppercase tracking-wide mb-2 px-1">{label}</p>
                <div className="bg-surface-1 rounded-3xl overflow-hidden shadow-card border border-border divide-y divide-border">
                  {items.map((tx) => <TransactionCard key={tx.id} tx={tx} compact />)}
                </div>
              </div>
            ))}

            <div className="bg-surface-1 rounded-3xl shadow-card border border-border overflow-hidden">
              <Pagination
                page={page} totalPages={totalPages} total={total} limit={PAGE_SIZE}
                onPrev={() => setPage((p) => p - 1)} onNext={() => setPage((p) => p + 1)}
              />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
