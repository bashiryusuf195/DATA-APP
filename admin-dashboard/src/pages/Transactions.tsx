import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { transactionsApi } from '@/api/transactions.api'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataTable } from '@/components/shared/DataTable'
import { TransactionStatusBadge } from '@/components/shared/StatusBadge'
import { Pagination } from '@/components/shared/Pagination'
import { Drawer } from '@/components/shared/Drawer'
import { ErrorMessage } from '@/components/shared/ErrorMessage'
import { Button, Input, Select, Badge, Card } from '@/components/ui'
import { SkeletonTable } from '@/components/ui/Skeleton'
import { fmtCurrency, fmtDate, truncate } from '@/utils/format'
import type { Transaction } from '@/types'
import { Search, RefreshCw, X } from 'lucide-react'
import { useDebounce } from '@/hooks/useDebounce'
import { ENDPOINTS } from '@/config/endpoints'

const STATUS_OPTIONS = [
  { value: 'pending',    label: 'Pending' },
  { value: 'processing', label: 'Processing' },
  { value: 'successful', label: 'Successful' },
  { value: 'failed',     label: 'Failed' },
  { value: 'refunded',   label: 'Refunded' },
]

const SERVICE_OPTIONS = [
  { value: 'airtime',     label: 'Airtime' },
  { value: 'data',        label: 'Data' },
  { value: 'electricity', label: 'Electricity' },
  { value: 'cable_tv',    label: 'Cable TV' },
]

export function TransactionsPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [serviceType, setServiceType] = useState('')
  const [selected, setSelected] = useState<Transaction | null>(null)

  const debouncedSearch = useDebounce(search)
  const limit = 20

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['transactions', { page, limit, status, service_type: serviceType, reference: debouncedSearch }],
    queryFn: () =>
      transactionsApi.list({
        page,
        limit,
        ...(status ? { status } : {}),
        ...(serviceType ? { service_type: serviceType } : {}),
        ...(debouncedSearch ? { reference: debouncedSearch } : {}),
      }),
  })

  const rows: Transaction[] = data && 'data' in data ? data.data : []
  const total = data && 'total' in data ? (data.total ?? rows.length) : rows.length

  const clearFilters = () => { setSearch(''); setStatus(''); setServiceType(''); setPage(1) }
  const hasFilters = search || status || serviceType

  if (error) return <ErrorMessage error={error} onRetry={() => void refetch()} endpoint={ENDPOINTS.transactions.path} />

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Transactions"
        subtitle="All platform transactions with filtering"
        actions={
          <Button variant="secondary" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />}
            onClick={() => void refetch()}>Refresh</Button>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-64">
          <Input
            placeholder="Search by reference…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            prefix={<Search className="h-3.5 w-3.5" />}
          />
        </div>
        <div className="w-40">
          <Select
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1) }}
            options={STATUS_OPTIONS}
            placeholder="All statuses"
          />
        </div>
        <div className="w-40">
          <Select
            value={serviceType}
            onChange={(e) => { setServiceType(e.target.value); setPage(1) }}
            options={SERVICE_OPTIONS}
            placeholder="All services"
          />
        </div>
        {hasFilters && (
          <Button variant="ghost" size="sm" icon={<X className="h-3.5 w-3.5" />} onClick={clearFilters}>
            Clear
          </Button>
        )}
      </div>

      <Card padding="none">
        {isLoading ? (
          <div className="p-5"><SkeletonTable rows={10} /></div>
        ) : (
          <>
            <DataTable
              data={rows}
              rowKey={(t) => t.id}
              onRowClick={setSelected}
              columns={[
                {
                  key: 'reference',
                  header: 'Reference',
                  render: (t) => (
                    <span className="font-mono text-xs text-ink">{truncate(t.reference, 26)}</span>
                  ),
                },
                {
                  key: 'service',
                  header: 'Service',
                  render: (t) => <Badge variant="neutral">{t.service_type}</Badge>,
                },
                {
                  key: 'amount',
                  header: 'Amount',
                  align: 'right',
                  render: (t) => (
                    <span className="font-semibold text-ink">{fmtCurrency(t.amount)}</span>
                  ),
                },
                {
                  key: 'status',
                  header: 'Status',
                  render: (t) => <TransactionStatusBadge status={t.status} />,
                },
                {
                  key: 'provider',
                  header: 'Provider',
                  render: (t) => (
                    <span className="text-xs text-ink-muted font-mono">{t.provider ?? '—'}</span>
                  ),
                },
                {
                  key: 'date',
                  header: 'Date',
                  render: (t) => <span className="text-xs text-ink-faint">{fmtDate(t.created_at)}</span>,
                },
              ]}
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
        title="Transaction Detail"
        subtitle={selected?.reference ?? ''}
      >
        {selected && (
          <div className="space-y-4 text-sm">
            <Row label="Reference"      value={<span className="font-mono text-xs">{selected.reference}</span>} />
            <Row label="Status"         value={<TransactionStatusBadge status={selected.status} />} />
            <Row label="Service"        value={<Badge variant="neutral">{selected.service_type}</Badge>} />
            <Row label="Amount"         value={<span className="font-semibold">{fmtCurrency(selected.amount)}</span>} />
            <Row label="Provider"       value={selected.provider ?? '—'} />
            <Row label="Provider Ref"   value={<span className="font-mono text-xs">{selected.provider_reference ?? '—'}</span>} />
            <Row label="Created"        value={fmtDate(selected.created_at)} />
            <Row label="Updated"        value={fmtDate(selected.updated_at)} />
            {selected.failure_reason && (
              <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-3">
                <p className="text-xs text-rose-400 font-medium mb-1">Failure Reason</p>
                <p className="text-xs text-rose-300">{selected.failure_reason}</p>
              </div>
            )}
            {selected.metadata && (
              <div>
                <p className="text-xs text-ink-faint font-medium mb-2">Metadata</p>
                <pre className="text-xs bg-surface-2 rounded-lg p-3 overflow-auto max-h-64 text-ink-muted">
                  {JSON.stringify(selected.metadata, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-xs text-ink-faint w-28 shrink-0">{label}</span>
      <span className="text-sm text-ink text-right">{value}</span>
    </div>
  )
}
