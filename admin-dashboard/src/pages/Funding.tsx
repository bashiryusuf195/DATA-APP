import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fundingApi } from '@/api/funding.api'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataTable } from '@/components/shared/DataTable'
import { FundingStatusBadge, BoolBadge } from '@/components/shared/StatusBadge'
import { Pagination } from '@/components/shared/Pagination'
import { StatCard } from '@/components/shared/StatCard'
import { ErrorMessage } from '@/components/shared/ErrorMessage'
import { Drawer } from '@/components/shared/Drawer'
import { Button, Select, Badge, Card } from '@/components/ui'
import { SkeletonTable, SkeletonCard } from '@/components/ui/Skeleton'
import { fmtCurrency, fmtDate, truncate } from '@/utils/format'
import type { FundingTransaction } from '@/types'
import { RefreshCw, CreditCard, CheckCircle, XCircle } from 'lucide-react'
import { ENDPOINTS } from '@/config/endpoints'

const STATUS_OPTIONS = [
  { value: 'pending',    label: 'Pending' },
  { value: 'successful', label: 'Successful' },
  { value: 'failed',     label: 'Failed' },
  { value: 'abandoned',  label: 'Abandoned' },
]

export function FundingPage() {
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const [selected, setSelected] = useState<FundingTransaction | null>(null)
  const limit = 20

  const { data: raw, isLoading, error, refetch } = useQuery({
    queryKey: ['funding', { page, limit, status }],
    queryFn: () => fundingApi.list({ page, limit, ...(status ? { status } : {}) }),
  })

  const rows: FundingTransaction[] = raw?.data ?? []
  const total = raw?.total ?? rows.length

  const successful = rows.filter((f) => f.status === 'successful')
  const totalFunded = successful.reduce((s, f) => s + Number(f.amount), 0)

  if (error) return <ErrorMessage error={error} onRetry={() => void refetch()} endpoint={ENDPOINTS.fundingTxns.path} />

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Funding Transactions"
        subtitle="Paystack and gateway funding history"
        actions={
          <Button variant="secondary" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />}
            onClick={() => void refetch()}>Refresh</Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <StatCard
              title="Shown Successful"
              value={fmtCurrency(totalFunded)}
              subtitle={`${successful.length} transactions`}
              icon={<CreditCard className="h-4 w-4" />}
              variant="success"
            />
            <StatCard
              title="Verified"
              value={rows.filter((f) => f.verified).length}
              subtitle={`of ${rows.length} shown`}
              icon={<CheckCircle className="h-4 w-4" />}
              variant="accent"
            />
            <StatCard
              title="Failed / Abandoned"
              value={rows.filter((f) => f.status === 'failed' || f.status === 'abandoned').length}
              icon={<XCircle className="h-4 w-4" />}
              variant="danger"
            />
          </>
        )}
      </div>

      {/* Filters */}
      <div className="w-40">
        <Select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1) }}
          options={STATUS_OPTIONS}
          placeholder="All statuses"
        />
      </div>

      <Card padding="none">
        {isLoading ? (
          <div className="p-5"><SkeletonTable rows={8} /></div>
        ) : (
          <>
            <DataTable
              data={rows}
              rowKey={(f) => f.id}
              onRowClick={setSelected}
              emptyMessage="No funding transactions found."
              columns={[
                {
                  key: 'reference',
                  header: 'Reference',
                  render: (f) => (
                    <span className="font-mono text-xs text-ink">{truncate(f.reference, 26)}</span>
                  ),
                },
                {
                  key: 'gateway',
                  header: 'Gateway',
                  render: (f) => <Badge variant="info">{f.payment_gateway}</Badge>,
                },
                {
                  key: 'channel',
                  header: 'Channel',
                  render: (f) => (
                    <span className="text-xs text-ink-muted">{f.payment_channel ?? '—'}</span>
                  ),
                },
                {
                  key: 'amount',
                  header: 'Amount',
                  align: 'right',
                  render: (f) => (
                    <span className="font-semibold text-ink">{fmtCurrency(f.amount)}</span>
                  ),
                },
                {
                  key: 'status',
                  header: 'Status',
                  render: (f) => <FundingStatusBadge status={f.status} />,
                },
                {
                  key: 'verified',
                  header: 'Verified',
                  render: (f) => <BoolBadge value={f.verified} />,
                },
                {
                  key: 'paid_at',
                  header: 'Paid At',
                  render: (f) => (
                    <span className="text-xs text-ink-faint">
                      {f.paid_at ? fmtDate(f.paid_at) : '—'}
                    </span>
                  ),
                },
                {
                  key: 'created',
                  header: 'Created',
                  render: (f) => <span className="text-xs text-ink-faint">{fmtDate(f.created_at)}</span>,
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
        title="Funding Transaction"
        subtitle={selected?.reference ?? ''}
      >
        {selected && (
          <div className="space-y-4 text-sm">
            <Row label="Reference"     value={<span className="font-mono text-xs break-all">{selected.reference}</span>} />
            <Row label="Status"        value={<FundingStatusBadge status={selected.status} />} />
            <Row label="Gateway"       value={<Badge variant="info">{selected.payment_gateway}</Badge>} />
            <Row label="Channel"       value={selected.payment_channel ?? '—'} />
            <Row label="Amount"        value={<span className="font-semibold">{fmtCurrency(selected.amount, selected.currency)}</span>} />
            <Row label="Verified"      value={<BoolBadge value={selected.verified} />} />
            <Row label="Paid At"       value={selected.paid_at ? fmtDate(selected.paid_at) : '—'} />
            <Row label="Created"       value={fmtDate(selected.created_at)} />
            <Row label="Updated"       value={fmtDate(selected.updated_at)} />
            {selected.provider_reference && (
              <Row label="Provider Ref" value={<span className="font-mono text-xs">{selected.provider_reference}</span>} />
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
