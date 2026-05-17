import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ledgerApi } from '@/api/ledger.api'
import { EndpointGuard } from '@/components/shared/EndpointGuard'
import { PageHeader } from '@/components/shared/PageHeader'
import { FilterBar } from '@/components/shared/FilterBar'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { Pagination } from '@/components/shared/Pagination'
import { Drawer } from '@/components/shared/Drawer'
import { StatCard } from '@/components/shared/StatCard'
import { ErrorMessage } from '@/components/shared/ErrorMessage'
import { Button, Select, Badge, Card } from '@/components/ui'
import { SkeletonTable, SkeletonCard } from '@/components/ui/Skeleton'
import { fmtCurrency, fmtDate, truncate } from '@/utils/format'
import type { AdminJournalBatch, AdminJournalBatchDetail, AdminLedgerEntry } from '@/types'
import {
  RefreshCw,
  FileText,
  CheckCircle,
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
} from 'lucide-react'
import { ENDPOINTS } from '@/config/endpoints'
import type { ReactNode } from 'react'

const STATUS_OPTIONS = [
  { value: 'pending',  label: 'Pending' },
  { value: 'posted',   label: 'Posted' },
  { value: 'reversed', label: 'Reversed' },
  { value: 'failed',   label: 'Failed' },
]

function statusVariant(s: string): 'success' | 'warning' | 'danger' | 'neutral' {
  if (s === 'posted')   return 'success'
  if (s === 'pending')  return 'warning'
  if (s === 'reversed') return 'neutral'
  if (s === 'failed')   return 'danger'
  return 'neutral'
}

function txStatusVariant(s: string): 'success' | 'warning' | 'danger' | 'neutral' {
  if (s === 'successful' || s === 'completed') return 'success'
  if (s === 'pending')                         return 'warning'
  if (s === 'failed' || s === 'refunded')      return 'danger'
  return 'neutral'
}

export function JournalBatchesPage() {
  return (
    <EndpointGuard
      endpointKey="journalBatches"
      pageTitle="Journal Batches"
      pageSubtitle="Double-entry accounting journal batch management"
      features={[
        'View all journal batches with debit/credit totals',
        'Highlight unbalanced batches',
        'Drill into individual ledger entries per batch',
        'Filter by status and date range',
        'Linked transaction detail',
      ]}
    >
      <JournalBatchesContent />
    </EndpointGuard>
  )
}

function JournalBatchesContent() {
  const [page, setPage]         = useState(1)
  const [status, setStatus]     = useState('')
  const [selected, setSelected] = useState<AdminJournalBatch | null>(null)
  const limit = 20

  const { data: raw, isLoading, error, refetch } = useQuery({
    queryKey: ['journal-batches', { page, limit, status }],
    queryFn: () =>
      ledgerApi.batches({
        page,
        limit,
        ...(status ? { status: status as AdminJournalBatch['status'] & ('pending' | 'posted' | 'reversed' | 'failed') } : {}),
      }),
  })

  const rows: AdminJournalBatch[] = raw?.data ?? []
  const total = raw?.total ?? 0

  const unbalancedCount = rows.filter((b) => !b.balanced).length
  const balancedCount   = rows.filter((b) => b.balanced).length

  if (error) return (
    <ErrorMessage error={error} onRetry={() => void refetch()} endpoint={ENDPOINTS.journalBatches.path} />
  )

  const columns: Column<AdminJournalBatch>[] = [
    {
      key: 'description',
      header: 'Description',
      render: (b) => (
        <div>
          <p className="text-sm font-medium text-ink">{truncate(b.description, 36)}</p>
          {b.idempotency_key && (
            <p className="text-xs font-mono text-ink-faint">{truncate(b.idempotency_key, 24)}</p>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (b) => (
        <Badge variant={statusVariant(b.status)}>{b.status}</Badge>
      ),
    },
    {
      key: 'balanced',
      header: 'Balanced',
      render: (b) =>
        b.balanced ? (
          <Badge variant="success">
            <CheckCircle className="h-3 w-3 mr-1 inline" />Balanced
          </Badge>
        ) : (
          <Badge variant="danger">
            <AlertTriangle className="h-3 w-3 mr-1 inline" />Unbalanced
          </Badge>
        ),
    },
    {
      key: 'credit',
      header: 'Credits',
      align: 'right',
      render: (b) => (
        <span className="font-mono text-sm text-emerald-400 font-semibold">
          +{fmtCurrency(b.total_credit)}
        </span>
      ),
    },
    {
      key: 'debit',
      header: 'Debits',
      align: 'right',
      render: (b) => (
        <span className="font-mono text-sm text-rose-400 font-semibold">
          −{fmtCurrency(b.total_debit)}
        </span>
      ),
    },
    {
      key: 'entries',
      header: 'Entries',
      align: 'center',
      render: (b) => (
        <span className="text-sm font-semibold text-ink">{b.entry_count}</span>
      ),
    },
    {
      key: 'ref',
      header: 'Ref Type',
      render: (b) => (
        <Badge variant="neutral" size="sm">{b.reference_type ?? '—'}</Badge>
      ),
    },
    {
      key: 'date',
      header: 'Created',
      render: (b) => (
        <span className="text-xs text-ink-faint">{fmtDate(b.created_at)}</span>
      ),
    },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Journal Batches"
        subtitle="Double-entry accounting batch management"
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

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <StatCard
              title="Total (this page)"
              value={rows.length}
              subtitle={`of ${total} total`}
              icon={<FileText className="h-4 w-4" />}
              variant="accent"
            />
            <StatCard
              title="Balanced"
              value={balancedCount}
              subtitle={`of ${rows.length} shown`}
              icon={<CheckCircle className="h-4 w-4" />}
              variant="success"
            />
            <StatCard
              title="Unbalanced"
              value={unbalancedCount}
              subtitle="require investigation"
              icon={<AlertTriangle className="h-4 w-4" />}
              variant={unbalancedCount > 0 ? 'danger' : 'default'}
            />
          </>
        )}
      </div>

      {/* Filters */}
      <FilterBar>
        <div className="w-40">
          <Select
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1) }}
            options={STATUS_OPTIONS}
            placeholder="All statuses"
          />
        </div>
      </FilterBar>

      <Card padding="none">
        {isLoading ? (
          <div className="p-5"><SkeletonTable rows={10} /></div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <FileText className="h-10 w-10 text-ink-faint opacity-30 mb-3" />
            <p className="text-sm text-ink-faint">No journal batches found</p>
          </div>
        ) : (
          <>
            <DataTable
              data={rows}
              rowKey={(b) => b.id}
              onRowClick={setSelected}
              columns={columns}
            />
            <div className="px-4 pb-4">
              <Pagination page={page} limit={limit} total={total} onPage={setPage} />
            </div>
          </>
        )}
      </Card>

      {/* Detail drawer */}
      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title="Journal Batch"
        subtitle={selected ? truncate(selected.description, 40) : ''}
        width="lg"
      >
        {selected && (
          <BatchDetailPanel batchId={selected.id} summary={selected} />
        )}
      </Drawer>
    </div>
  )
}

function BatchDetailPanel({
  batchId,
  summary,
}: {
  batchId: string
  summary: AdminJournalBatch
}) {
  const { data: detail, isLoading, error } = useQuery({
    queryKey: ['journal-batch', batchId],
    queryFn:  () => ledgerApi.getBatch(batchId),
  })

  return (
    <div className="space-y-5">
      {/* Balance summary header */}
      <div className={`rounded-xl p-4 border ${
        summary.balanced
          ? 'bg-emerald-500/10 border-emerald-500/20'
          : 'bg-rose-500/10 border-rose-500/20'
      }`}>
        <div className="flex items-center gap-2 mb-3">
          {summary.balanced ? (
            <CheckCircle className="h-4 w-4 text-emerald-400" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-rose-400" />
          )}
          <span className={`text-sm font-semibold ${
            summary.balanced ? 'text-emerald-400' : 'text-rose-400'
          }`}>
            {summary.balanced ? 'Balanced — debits equal credits' : 'UNBALANCED — investigate immediately'}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-ink-faint mb-0.5">Total Credits</p>
            <p className="text-lg font-bold text-emerald-400">+{fmtCurrency(summary.total_credit)}</p>
          </div>
          <div>
            <p className="text-xs text-ink-faint mb-0.5">Total Debits</p>
            <p className="text-lg font-bold text-rose-400">−{fmtCurrency(summary.total_debit)}</p>
          </div>
        </div>
      </div>

      {isLoading && <SkeletonTable rows={5} />}
      {error    && <p className="text-xs text-danger px-1">Failed to load batch details.</p>}
      {detail   && <BatchDetailContent detail={detail} />}
    </div>
  )
}

function BatchDetailContent({ detail }: { detail: AdminJournalBatchDetail }) {
  return (
    <div className="space-y-5">
      {/* Batch info */}
      <Section title="Batch Info">
        <Row label="Batch ID"       value={<span className="font-mono text-xs break-all">{detail.id}</span>} />
        <Row label="Status"         value={<Badge variant={statusVariant(detail.status)}>{detail.status}</Badge>} />
        <Row label="Description"    value={detail.description} />
        {detail.idempotency_key && (
          <Row label="Idempotency"  value={<span className="font-mono text-xs break-all">{detail.idempotency_key}</span>} />
        )}
        {detail.reference_type && (
          <Row label="Ref Type"     value={<Badge variant="neutral">{detail.reference_type}</Badge>} />
        )}
        {detail.reference_id && (
          <Row label="Ref ID"       value={<span className="font-mono text-xs break-all">{detail.reference_id}</span>} />
        )}
        {detail.posted_at    && <Row label="Posted At"   value={fmtDate(detail.posted_at)} />}
        {detail.reversed_at  && <Row label="Reversed At" value={fmtDate(detail.reversed_at)} />}
        <Row label="Created"        value={fmtDate(detail.created_at)} />
      </Section>

      {/* Accounting summary */}
      <Section title="Accounting Summary">
        <Row label="Total Credits"  value={
          <span className="font-mono font-semibold text-emerald-400">
            +{fmtCurrency(detail.summary.total_credit)}
          </span>
        } />
        <Row label="Total Debits"   value={
          <span className="font-mono font-semibold text-rose-400">
            −{fmtCurrency(detail.summary.total_debit)}
          </span>
        } />
        <Row label="Net"            value={
          <span className={`font-mono font-semibold ${
            Math.abs(detail.summary.net) < 0.01 ? 'text-ink-faint' : 'text-warning'
          }`}>
            {detail.summary.net >= 0 ? '+' : ''}{fmtCurrency(detail.summary.net)}
          </span>
        } />
        <Row label="Entry Count"    value={String(detail.summary.entry_count)} />
        <Row label="Balanced"       value={
          detail.summary.balanced
            ? <Badge variant="success"><CheckCircle className="h-3 w-3 mr-1 inline" />Yes</Badge>
            : <Badge variant="danger"><AlertTriangle className="h-3 w-3 mr-1 inline" />No</Badge>
        } />
      </Section>

      {/* Linked transaction */}
      {detail.linked_transaction && (
        <Section title="Linked Transaction">
          <Row label="Transaction ID" value={
            <span className="font-mono text-xs break-all">{detail.linked_transaction.id}</span>
          } />
          <Row label="Reference"      value={
            <span className="font-mono text-xs">{detail.linked_transaction.reference}</span>
          } />
          <Row label="Type"           value={detail.linked_transaction.type.replace(/_/g, ' ')} />
          <Row label="Status"         value={
            <Badge variant={txStatusVariant(detail.linked_transaction.status)}>
              {detail.linked_transaction.status}
            </Badge>
          } />
          <Row label="Amount"         value={
            <span className="font-mono font-semibold">
              {fmtCurrency(detail.linked_transaction.amount, detail.linked_transaction.currency)}
            </span>
          } />
        </Section>
      )}

      {/* Ledger entries */}
      {detail.entries.length > 0 && (
        <Section title={`Ledger Entries (${detail.entries.length})`}>
          {detail.entries.map((e) => (
            <EntryRow key={e.id} entry={e} />
          ))}
        </Section>
      )}
    </div>
  )
}

function EntryRow({ entry }: { entry: AdminLedgerEntry }) {
  return (
    <div className="py-3 border-b border-border/50 last:border-0">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {entry.entry_type === 'credit' ? (
              <Badge variant="success" size="sm">
                <ArrowDownLeft className="h-3 w-3 mr-0.5 inline" />Credit
              </Badge>
            ) : (
              <Badge variant="danger" size="sm">
                <ArrowUpRight className="h-3 w-3 mr-0.5 inline" />Debit
              </Badge>
            )}
            <span className="font-mono text-xs text-ink-faint">
              {entry.wallet_id.slice(0, 8)}…
            </span>
          </div>
          <p className="text-xs text-ink-muted truncate">{entry.description}</p>
          {entry.user_id && (
            <p className="text-xs text-ink-faint font-mono mt-0.5">
              user: {entry.user_id.slice(0, 8)}…
            </p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className={`font-mono text-sm font-semibold ${
            entry.entry_type === 'credit' ? 'text-emerald-400' : 'text-rose-400'
          }`}>
            {entry.entry_type === 'credit' ? '+' : '−'}
            {fmtCurrency(entry.amount, entry.currency)}
          </p>
          {entry.running_balance != null && (
            <p className="text-xs text-ink-faint font-mono">
              bal: {fmtCurrency(entry.running_balance, entry.currency)}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-ink-faint uppercase tracking-wide mb-2">{title}</p>
      <div className="rounded-lg border border-border/50 px-3">{children}</div>
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
