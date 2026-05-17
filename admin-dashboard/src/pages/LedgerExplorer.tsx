import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ledgerApi } from '@/api/ledger.api'
import { EndpointGuard } from '@/components/shared/EndpointGuard'
import { PageHeader } from '@/components/shared/PageHeader'
import { FilterBar } from '@/components/shared/FilterBar'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { Pagination } from '@/components/shared/Pagination'
import { Drawer } from '@/components/shared/Drawer'
import { ErrorMessage } from '@/components/shared/ErrorMessage'
import { Button, Input, Select, Badge, Card } from '@/components/ui'
import { SkeletonTable } from '@/components/ui/Skeleton'
import { fmtCurrency, fmtDate, truncate } from '@/utils/format'
import type { AdminLedgerEntry } from '@/types'
import {
  RefreshCw,
  ArrowDownLeft,
  ArrowUpRight,
  BookOpen,
  Search,
} from 'lucide-react'
import { useDebounce } from '@/hooks/useDebounce'
import { ENDPOINTS } from '@/config/endpoints'
import type { ReactNode } from 'react'

const ENTRY_TYPE_OPTIONS = [
  { value: 'credit', label: 'Credits only' },
  { value: 'debit',  label: 'Debits only' },
]

const REF_TYPE_OPTIONS = [
  { value: 'transaction', label: 'Transaction' },
  { value: 'topup',       label: 'Top-up' },
  { value: 'withdrawal',  label: 'Withdrawal' },
  { value: 'reversal',    label: 'Reversal' },
  { value: 'fee',         label: 'Fee' },
]

export function LedgerExplorerPage() {
  return (
    <EndpointGuard
      endpointKey="walletLedger"
      pageTitle="Ledger Explorer"
      pageSubtitle="Browse and filter platform wallet ledger entries"
      features={[
        'Cross-user ledger entry search',
        'Filter by direction, reference type and date range',
        'Filter by wallet ID or user ID',
        'Balance reconciliation view',
      ]}
    >
      <LedgerExplorerContent />
    </EndpointGuard>
  )
}

function LedgerExplorerContent() {
  const [page, setPage]           = useState(1)
  const [entryType, setEntryType] = useState('')
  const [refType, setRefType]     = useState('')
  const [walletId, setWalletId]   = useState('')
  const [userId, setUserId]       = useState('')
  const [selected, setSelected]   = useState<AdminLedgerEntry | null>(null)
  const limit = 25

  const debouncedWalletId = useDebounce(walletId)
  const debouncedUserId   = useDebounce(userId)

  const { data: raw, isLoading, error, refetch } = useQuery({
    queryKey: ['ledger-explorer', { page, limit, entryType, refType, debouncedWalletId, debouncedUserId }],
    queryFn: () =>
      ledgerApi.list({
        page,
        limit,
        ...(entryType             ? { entry_type: entryType as 'debit' | 'credit' } : {}),
        ...(refType               ? { reference_type: refType }          : {}),
        ...(debouncedWalletId     ? { wallet_id: debouncedWalletId }     : {}),
        ...(debouncedUserId       ? { user_id: debouncedUserId }         : {}),
      }),
  })

  const rows: AdminLedgerEntry[] = raw?.data ?? []
  const total = raw?.total ?? 0

  const totalCredit = rows
    .filter((e) => e.entry_type === 'credit')
    .reduce((s, e) => s + e.amount, 0)
  const totalDebit = rows
    .filter((e) => e.entry_type === 'debit')
    .reduce((s, e) => s + e.amount, 0)

  const handleWalletId = useCallback((v: string) => { setWalletId(v); setPage(1) }, [])
  const handleUserId   = useCallback((v: string) => { setUserId(v);   setPage(1) }, [])

  if (error) {
    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader title="Ledger Explorer" subtitle="Browse and filter platform wallet ledger entries" />
        <ErrorMessage error={error} onRetry={() => void refetch()} endpoint={ENDPOINTS.walletLedger.path} inline />
      </div>
    )
  }

  const columns: Column<AdminLedgerEntry>[] = [
    {
      key: 'type',
      header: 'Type',
      render: (e) =>
        e.entry_type === 'credit' ? (
          <Badge variant="success">
            <ArrowDownLeft className="h-3 w-3 mr-1 inline" />Credit
          </Badge>
        ) : (
          <Badge variant="danger">
            <ArrowUpRight className="h-3 w-3 mr-1 inline" />Debit
          </Badge>
        ),
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      render: (e) => (
        <span className={`font-semibold font-mono text-sm ${
          e.entry_type === 'credit' ? 'text-emerald-400' : 'text-rose-400'
        }`}>
          {e.entry_type === 'credit' ? '+' : '−'}{fmtCurrency(e.amount, e.currency)}
        </span>
      ),
    },
    {
      key: 'balance',
      header: 'Running Balance',
      align: 'right',
      render: (e) => (
        <span className="font-mono text-xs text-ink-faint">
          {e.running_balance != null ? fmtCurrency(e.running_balance, e.currency) : '—'}
        </span>
      ),
    },
    {
      key: 'description',
      header: 'Description',
      render: (e) => (
        <span className="text-sm text-ink-muted">{truncate(e.description, 32)}</span>
      ),
    },
    {
      key: 'ref',
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
          {e.wallet_id.slice(0, 8)}…
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
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Ledger Explorer"
        subtitle="Browse and filter platform wallet ledger entries"
        actions={
          <Button
            variant="secondary"
            size="sm"
            icon={<RefreshCw className="h-3.5 w-3.5" />}
            onClick={() => void refetch()}
          >
            Refresh
          </Button>
        }
      />

      {/* Totals for this page */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-surface-1 border border-emerald-500/20 rounded-xl p-4 flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-emerald-500/15 text-emerald-400 shrink-0">
            <ArrowDownLeft className="h-4 w-4" />
          </div>
          <div>
            <p className="text-xs text-ink-faint uppercase tracking-wide mb-0.5">
              Credits (this page)
            </p>
            <p className="text-xl font-bold text-emerald-400">{fmtCurrency(totalCredit)}</p>
          </div>
        </div>
        <div className="bg-surface-1 border border-rose-500/20 rounded-xl p-4 flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-rose-500/15 text-rose-400 shrink-0">
            <ArrowUpRight className="h-4 w-4" />
          </div>
          <div>
            <p className="text-xs text-ink-faint uppercase tracking-wide mb-0.5">
              Debits (this page)
            </p>
            <p className="text-xl font-bold text-rose-400">{fmtCurrency(totalDebit)}</p>
          </div>
        </div>
        <div className="bg-surface-1 border border-border/50 rounded-xl p-4 flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-accent-subtle text-accent shrink-0">
            <BookOpen className="h-4 w-4" />
          </div>
          <div>
            <p className="text-xs text-ink-faint uppercase tracking-wide mb-0.5">
              Net (this page)
            </p>
            <p className={`text-xl font-bold ${
              totalCredit - totalDebit >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}>
              {fmtCurrency(Math.abs(totalCredit - totalDebit))}
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <FilterBar>
        <div className="w-44">
          <Select
            value={entryType}
            onChange={(e) => { setEntryType(e.target.value); setPage(1) }}
            options={ENTRY_TYPE_OPTIONS}
            placeholder="All types"
          />
        </div>
        <div className="w-40">
          <Select
            value={refType}
            onChange={(e) => { setRefType(e.target.value); setPage(1) }}
            options={REF_TYPE_OPTIONS}
            placeholder="All ref types"
          />
        </div>
        <div className="w-52">
          <Input
            placeholder="Wallet ID (UUID)…"
            value={walletId}
            onChange={(e) => handleWalletId(e.target.value)}
            prefix={<Search className="h-3.5 w-3.5" />}
          />
        </div>
        <div className="w-52">
          <Input
            placeholder="User ID (UUID)…"
            value={userId}
            onChange={(e) => handleUserId(e.target.value)}
            prefix={<Search className="h-3.5 w-3.5" />}
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
              onRowClick={setSelected}
              columns={columns}
            />
            <div className="px-4 pb-4">
              <Pagination page={page} limit={limit} total={total} onPage={setPage} />
            </div>
          </>
        )}
      </Card>

      {/* Entry detail drawer */}
      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title="Ledger Entry"
        subtitle={selected?.id ?? ''}
        width="md"
      >
        {selected && <LedgerEntryDetail entry={selected} />}
      </Drawer>
    </div>
  )
}

function LedgerEntryDetail({ entry }: { entry: AdminLedgerEntry }) {
  return (
    <div className="space-y-5">
      <div className={`rounded-xl p-4 flex items-center gap-3 ${
        entry.entry_type === 'credit'
          ? 'bg-emerald-500/10 border border-emerald-500/20'
          : 'bg-rose-500/10 border border-rose-500/20'
      }`}>
        <div className={`p-2.5 rounded-lg shrink-0 ${
          entry.entry_type === 'credit'
            ? 'bg-emerald-500/20 text-emerald-400'
            : 'bg-rose-500/20 text-rose-400'
        }`}>
          {entry.entry_type === 'credit'
            ? <ArrowDownLeft className="h-5 w-5" />
            : <ArrowUpRight  className="h-5 w-5" />}
        </div>
        <div>
          <p className={`text-2xl font-bold ${
            entry.entry_type === 'credit' ? 'text-emerald-400' : 'text-rose-400'
          }`}>
            {entry.entry_type === 'credit' ? '+' : '−'}
            {fmtCurrency(entry.amount, entry.currency)}
          </p>
          <p className="text-xs text-ink-faint capitalize">{entry.entry_type}</p>
        </div>
      </div>

      <div className="rounded-lg border border-border/50 px-3">
        <Row label="Entry ID"       value={<span className="font-mono text-xs break-all">{entry.id}</span>} />
        <Row label="Wallet ID"      value={<span className="font-mono text-xs break-all">{entry.wallet_id}</span>} />
        {entry.user_id && (
          <Row label="User ID"      value={<span className="font-mono text-xs break-all">{entry.user_id}</span>} />
        )}
        <Row label="Batch ID"       value={<span className="font-mono text-xs break-all">{entry.journal_batch_id}</span>} />
        <Row label="Currency"       value={entry.currency} />
        <Row label="Signed Amount"  value={
          <span className={`font-mono font-semibold ${entry.signed_amount >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {entry.signed_amount >= 0 ? '+' : ''}{fmtCurrency(entry.signed_amount, entry.currency)}
          </span>
        } />
        {entry.running_balance != null && (
          <Row label="Running Bal." value={
            <span className="font-mono text-sm">{fmtCurrency(entry.running_balance, entry.currency)}</span>
          } />
        )}
        <Row label="Description"    value={entry.description} />
        <Row label="Ref Type"       value={entry.reference_type ? <Badge variant="neutral">{entry.reference_type}</Badge> : '—'} />
        {entry.reference_id && (
          <Row label="Ref ID"       value={<span className="font-mono text-xs break-all">{entry.reference_id}</span>} />
        )}
        <Row label="Date"           value={fmtDate(entry.created_at)} />
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-border/50 last:border-0">
      <span className="text-xs text-ink-faint w-28 shrink-0">{label}</span>
      <span className="text-sm text-ink text-right">{value}</span>
    </div>
  )
}
