import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { webhooksApi } from '@/api/webhooks.api'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataTable } from '@/components/shared/DataTable'
import { Pagination } from '@/components/shared/Pagination'
import { Drawer } from '@/components/shared/Drawer'
import { ErrorMessage } from '@/components/shared/ErrorMessage'
import { Button, Badge, Input, Select, Card } from '@/components/ui'
import { SkeletonTable } from '@/components/ui/Skeleton'
import { fmtDate, truncate } from '@/utils/format'
import type { WebhookEvent, WebhookEventStatus } from '@/types'
import { RefreshCw, Search } from 'lucide-react'
import { useDebounce } from '@/hooks/useDebounce'
import { ENDPOINTS } from '@/config/endpoints'

const STATUS_VARIANTS: Record<WebhookEventStatus, 'success' | 'danger' | 'warning' | 'neutral' | 'info'> = {
  processed:  'success',
  failed:     'danger',
  duplicate:  'warning',
  unhandled:  'neutral',
  pending:    'info',
}

const STATUS_OPTIONS = [
  { value: 'processed',  label: 'Processed' },
  { value: 'failed',     label: 'Failed' },
  { value: 'duplicate',  label: 'Duplicate' },
  { value: 'unhandled',  label: 'Unhandled' },
  { value: 'pending',    label: 'Pending' },
]

export function WebhookEventsPage() {
  const [page, setPage] = useState(1)
  const [source, setSource] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [eventTypeSearch, setEventTypeSearch] = useState('')
  const [selected, setSelected] = useState<WebhookEvent | null>(null)
  const limit = 20

  const debouncedEventType = useDebounce(eventTypeSearch)

  const { data: raw, isLoading, error, refetch } = useQuery({
    queryKey: ['webhook-events', { page, limit, source, status: statusFilter, event_type: debouncedEventType }],
    queryFn: () =>
      webhooksApi.list({
        page,
        limit,
        ...(source ? { source } : {}),
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(debouncedEventType ? { event_type: debouncedEventType } : {}),
      }),
  })

  const rows: WebhookEvent[] = raw?.data ?? []
  const total = raw?.total ?? rows.length

  if (error) return <ErrorMessage error={error} onRetry={() => void refetch()} endpoint={ENDPOINTS.webhookEvents.path} />

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Webhook Events"
        subtitle="Incoming webhook payloads from payment providers"
        actions={
          <Button variant="secondary" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />}
            onClick={() => void refetch()}>Refresh</Button>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="w-64">
          <Input
            placeholder="Search by event type…"
            value={eventTypeSearch}
            onChange={(e) => { setEventTypeSearch(e.target.value); setPage(1) }}
            prefix={<Search className="h-3.5 w-3.5" />}
          />
        </div>
        <div className="w-36">
          <Input
            placeholder="Source…"
            value={source}
            onChange={(e) => { setSource(e.target.value); setPage(1) }}
          />
        </div>
        <div className="w-40">
          <Select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
            options={STATUS_OPTIONS}
            placeholder="All statuses"
          />
        </div>
      </div>

      <Card padding="none">
        {isLoading ? (
          <div className="p-5"><SkeletonTable rows={8} /></div>
        ) : (
          <>
            <DataTable
              data={rows}
              rowKey={(w) => w.id}
              onRowClick={setSelected}
              emptyMessage="No webhook events recorded yet."
              columns={[
                {
                  key: 'source',
                  header: 'Source',
                  render: (w) => <Badge variant="info">{w.source}</Badge>,
                },
                {
                  key: 'event_type',
                  header: 'Event Type',
                  render: (w) => (
                    <span className="font-mono text-xs text-ink">{w.event_type}</span>
                  ),
                },
                {
                  key: 'reference',
                  header: 'Reference',
                  render: (w) => (
                    <span className="font-mono text-xs text-ink-muted">
                      {w.reference ? truncate(w.reference, 22) : '—'}
                    </span>
                  ),
                },
                {
                  key: 'status',
                  header: 'Status',
                  render: (w) => (
                    <Badge variant={STATUS_VARIANTS[w.status] ?? 'neutral'} size="sm">
                      {w.status}
                    </Badge>
                  ),
                },
                {
                  key: 'error',
                  header: 'Error',
                  render: (w) => (
                    <span className="text-xs text-rose-400 truncate max-w-[180px] block">
                      {w.error_message ?? '—'}
                    </span>
                  ),
                },
                {
                  key: 'date',
                  header: 'Received At',
                  render: (w) => <span className="text-xs text-ink-faint">{fmtDate(w.created_at)}</span>,
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
        title="Webhook Event"
        subtitle={selected ? `${selected.source} · ${selected.event_type}` : ''}
        width="lg"
      >
        {selected && (
          <div className="space-y-4 text-sm">
            <Row label="Source"      value={<Badge variant="info">{selected.source}</Badge>} />
            <Row label="Event Type"  value={<span className="font-mono text-xs">{selected.event_type}</span>} />
            <Row label="Status"      value={
              <Badge variant={STATUS_VARIANTS[selected.status] ?? 'neutral'}>
                {selected.status}
              </Badge>
            } />
            <Row label="Reference"   value={
              selected.reference
                ? <span className="font-mono text-xs break-all">{selected.reference}</span>
                : <span className="text-ink-faint">—</span>
            } />
            <Row label="Received At" value={fmtDate(selected.created_at)} />

            {selected.error_message && (
              <div>
                <p className="text-xs text-ink-faint font-medium mb-1.5">Error</p>
                <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-3">
                  <p className="text-xs text-rose-300">{selected.error_message}</p>
                </div>
              </div>
            )}

            <div>
              <p className="text-xs text-ink-faint font-medium mb-1.5">Payload</p>
              <pre className="text-xs bg-surface-2 rounded-lg p-3 overflow-auto max-h-96 text-ink-muted">
                {JSON.stringify(selected.payload, null, 2)}
              </pre>
            </div>
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
