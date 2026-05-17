import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { attemptsApi } from '@/api/attempts.api'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataTable } from '@/components/shared/DataTable'
import { BoolBadge } from '@/components/shared/StatusBadge'
import { Pagination } from '@/components/shared/Pagination'
import { StatCard } from '@/components/shared/StatCard'
import { ErrorMessage } from '@/components/shared/ErrorMessage'
import { Drawer } from '@/components/shared/Drawer'
import { Button, Input, Select, Badge, Card } from '@/components/ui'
import { SkeletonTable, SkeletonCard } from '@/components/ui/Skeleton'
import { fmtDate, fmtLatency, truncate, fmtPercent } from '@/utils/format'
import type { ProviderAttempt } from '@/types'
import { Search, RefreshCw } from 'lucide-react'
import { useDebounce } from '@/hooks/useDebounce'
import { ENDPOINTS } from '@/config/endpoints'

const ERROR_CLASS_VARIANTS: Record<string, 'danger' | 'warning' | 'info' | 'neutral'> = {
  NETWORK_ERROR:      'warning',
  TIMEOUT:            'warning',
  AUTH_ERROR:         'danger',
  PROVIDER_ERROR:     'danger',
  VALIDATION_ERROR:   'info',
  CIRCUIT_OPEN:       'danger',
  UNSUPPORTED_SERVICE: 'neutral',
}

export function AttemptsPage() {
  const [page, setPage] = useState(1)
  const [refSearch, setRefSearch] = useState('')
  const [providerFilter, setProviderFilter] = useState('')
  const [successFilter, setSuccessFilter] = useState<'' | 'true' | 'false'>('')
  const [selected, setSelected] = useState<ProviderAttempt | null>(null)
  const limit = 20

  const debouncedRef = useDebounce(refSearch)

  const { data: raw, isLoading, error, refetch } = useQuery({
    queryKey: ['attempts', { page, limit, refSearch: debouncedRef, provider: providerFilter, success: successFilter }],
    queryFn: () =>
      attemptsApi.list({
        page,
        limit,
        ...(debouncedRef ? { transaction_reference: debouncedRef } : {}),
        ...(providerFilter ? { provider_code: providerFilter } : {}),
        ...(successFilter !== '' ? { success: successFilter === 'true' } : {}),
      }),
  })

  const rows: ProviderAttempt[] = raw?.data ?? []
  const total = raw?.total ?? rows.length

  const successful = rows.filter((a) => a.success).length
  const avgLatency = rows.length
    ? Math.round(rows.filter((a) => a.latency_ms != null).reduce((s, a) => s + (a.latency_ms ?? 0), 0) / rows.length)
    : 0

  if (error) return <ErrorMessage error={error} onRetry={() => void refetch()} endpoint={ENDPOINTS.attempts.path} />

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Provider Attempts"
        subtitle="Full failover and attempt history per transaction"
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
            <StatCard title="Shown" value={rows.length} subtitle="attempts in view"
              variant="accent" />
            <StatCard title="Success Rate" value={fmtPercent(successful, rows.length)}
              subtitle={`${successful} of ${rows.length}`} variant="success" />
            <StatCard title="Avg Latency" value={fmtLatency(avgLatency)}
              subtitle="across shown attempts" variant="default" />
          </>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="w-64">
          <Input
            placeholder="Search by reference…"
            value={refSearch}
            onChange={(e) => { setRefSearch(e.target.value); setPage(1) }}
            prefix={<Search className="h-3.5 w-3.5" />}
          />
        </div>
        <div className="w-40">
          <Input
            placeholder="Provider code…"
            value={providerFilter}
            onChange={(e) => { setProviderFilter(e.target.value); setPage(1) }}
          />
        </div>
        <div className="w-36">
          <Select
            value={successFilter}
            onChange={(e) => { setSuccessFilter(e.target.value as '' | 'true' | 'false'); setPage(1) }}
            options={[{ value: 'true', label: 'Successful' }, { value: 'false', label: 'Failed' }]}
            placeholder="All"
          />
        </div>
      </div>

      <Card padding="none">
        {isLoading ? (
          <div className="p-5"><SkeletonTable rows={10} /></div>
        ) : (
          <>
            <DataTable
              data={rows}
              rowKey={(a) => a.id}
              onRowClick={setSelected}
              emptyMessage="No provider attempts found."
              columns={[
                {
                  key: 'ref',
                  header: 'Reference',
                  render: (a) => (
                    <span className="font-mono text-xs text-ink">{truncate(a.transaction_reference, 22)}</span>
                  ),
                },
                {
                  key: 'provider',
                  header: 'Provider',
                  render: (a) => (
                    <span className="font-mono text-sm text-accent">{a.provider_code}</span>
                  ),
                },
                {
                  key: 'attempt',
                  header: '#',
                  align: 'center',
                  render: (a) => (
                    <span className="text-xs font-bold text-ink">{a.attempt_number}</span>
                  ),
                },
                {
                  key: 'success',
                  header: 'Result',
                  render: (a) => <BoolBadge value={a.success} trueLabel="Success" falseLabel="Failed" />,
                },
                {
                  key: 'classification',
                  header: 'Error Class',
                  render: (a) =>
                    a.error_classification ? (
                      <Badge variant={ERROR_CLASS_VARIANTS[a.error_classification] ?? 'neutral'} size="sm">
                        {a.error_classification}
                      </Badge>
                    ) : (
                      <span className="text-ink-faint text-xs">—</span>
                    ),
                },
                {
                  key: 'latency',
                  header: 'Latency',
                  align: 'right',
                  render: (a) => (
                    <span className="font-mono text-xs text-ink-muted">{fmtLatency(a.latency_ms)}</span>
                  ),
                },
                {
                  key: 'error',
                  header: 'Error',
                  render: (a) => (
                    <span className="text-xs text-rose-400 truncate max-w-[180px] block">
                      {a.error_message ?? '—'}
                    </span>
                  ),
                },
                {
                  key: 'date',
                  header: 'Date',
                  render: (a) => <span className="text-xs text-ink-faint">{fmtDate(a.created_at)}</span>,
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
        title="Provider Attempt Detail"
        subtitle={selected ? `${selected.provider_code} · attempt #${selected.attempt_number}` : ''}
        width="lg"
      >
        {selected && (
          <div className="space-y-4 text-sm">
            <Row label="Reference"    value={<span className="font-mono text-xs break-all">{selected.transaction_reference}</span>} />
            <Row label="Provider"     value={<span className="font-mono text-accent">{selected.provider_code}</span>} />
            <Row label="Attempt #"    value={<span className="font-bold">{selected.attempt_number}</span>} />
            <Row label="Result"       value={<BoolBadge value={selected.success} trueLabel="Success" falseLabel="Failed" />} />
            <Row label="Latency"      value={<span className="font-mono">{fmtLatency(selected.latency_ms)}</span>} />
            <Row label="Date"         value={fmtDate(selected.created_at)} />
            {selected.error_classification && (
              <Row label="Error Class" value={
                <Badge variant={ERROR_CLASS_VARIANTS[selected.error_classification] ?? 'neutral'} size="sm">
                  {selected.error_classification}
                </Badge>
              } />
            )}
            {selected.error_message && (
              <div>
                <p className="text-xs text-ink-faint font-medium mb-1.5">Error Message</p>
                <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-3">
                  <p className="text-xs text-rose-300">{selected.error_message}</p>
                </div>
              </div>
            )}
            {selected.request_payload && Object.keys(selected.request_payload).length > 0 && (
              <div>
                <p className="text-xs text-ink-faint font-medium mb-1.5">Request Payload</p>
                <pre className="text-xs bg-surface-2 rounded-lg p-3 overflow-auto max-h-48 text-ink-muted">
                  {JSON.stringify(selected.request_payload, null, 2)}
                </pre>
              </div>
            )}
            {selected.response_payload && Object.keys(selected.response_payload).length > 0 && (
              <div>
                <p className="text-xs text-ink-faint font-medium mb-1.5">Response Payload</p>
                <pre className="text-xs bg-surface-2 rounded-lg p-3 overflow-auto max-h-48 text-ink-muted">
                  {JSON.stringify(selected.response_payload, null, 2)}
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
