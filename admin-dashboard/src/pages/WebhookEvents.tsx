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
import {
  RefreshCw, Search, CheckCircle2, XCircle, Clock,
  Webhook, AlertTriangle, Link as LinkIcon,
} from 'lucide-react'
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
  { value: 'unhandled',  label: 'Unhandled' },
  { value: 'pending',    label: 'Pending' },
]

// ── Diagnostics panel ─────────────────────────────────────────────────────────

function DiagnosticsPanel({ latest }: { latest: WebhookEvent | null }) {
  const webhookPath = '/webhooks/paystack'

  return (
    <Card>
      <div className="flex items-center gap-2 mb-4">
        <Webhook className="h-4 w-4 text-accent" />
        <h3 className="text-sm font-semibold text-ink">Webhook Diagnostics</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Endpoint */}
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-faint">Endpoint</p>
          <div className="flex items-center gap-2 bg-surface-2 rounded-lg px-3 py-2">
            <Badge variant="info" size="sm">POST</Badge>
            <code className="text-xs text-ink font-mono">{webhookPath}</code>
          </div>
          <p className="text-[11px] text-ink-faint">
            Set your Paystack webhook URL to:
            {' '}<code className="text-accent font-mono text-[11px]">https://&lt;your-ngrok-url&gt;{webhookPath}</code>
          </p>
        </div>

        {/* Latest Paystack webhook */}
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-faint">Last Paystack Webhook</p>
          {latest ? (
            <div className="space-y-1.5 text-xs">
              <DiagRow
                label="Received"
                value={<span className="text-ink">{fmtDate(latest.created_at)}</span>}
              />
              <DiagRow
                label="Event"
                value={
                  <span className="font-mono text-ink">{latest.event_type ?? '—'}</span>
                }
              />
              <DiagRow
                label="Signature"
                value={
                  latest.signature_valid ? (
                    <span className="flex items-center gap-1 text-emerald-400">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Valid
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-rose-400">
                      <XCircle className="h-3.5 w-3.5" /> Invalid
                    </span>
                  )
                }
              />
              <DiagRow
                label="Status"
                value={
                  <Badge variant={STATUS_VARIANTS[latest.status] ?? 'neutral'} size="sm">
                    {latest.status}
                  </Badge>
                }
              />
              {latest.reference && (
                <DiagRow
                  label="Reference"
                  value={
                    <span className="font-mono text-ink-muted">{truncate(latest.reference, 24)}</span>
                  }
                />
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-ink-faint text-xs py-2">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              No Paystack webhooks received yet.
            </div>
          )}
        </div>
      </div>

      {/* ngrok hint */}
      <div className="mt-4 flex items-start gap-2 rounded-lg bg-accent/5 border border-accent/20 px-3 py-2.5">
        <LinkIcon className="h-3.5 w-3.5 text-accent shrink-0 mt-0.5" />
        <p className="text-[11px] text-ink-faint leading-relaxed">
          <span className="text-accent font-medium">Local testing:</span>{' '}
          Run <code className="bg-surface-2 px-1 rounded text-ink">ngrok http 3000</code> and paste the
          Forwarding URL into your{' '}
          <a
            href="https://dashboard.paystack.com/#/settings/developer"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline"
          >
            Paystack webhook settings
          </a>
          {' '}— see <code className="bg-surface-2 px-1 rounded text-ink">docs/webhook-testing.md</code> for a full guide.
        </p>
      </div>
    </Card>
  )
}

function DiagRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-ink-faint w-20 shrink-0">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function WebhookEventsPage() {
  const [page, setPage] = useState(1)
  const [source, setSource] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [eventTypeSearch, setEventTypeSearch] = useState('')
  const [selected, setSelected] = useState<WebhookEvent | null>(null)
  const limit = 20

  const debouncedEventType = useDebounce(eventTypeSearch)

  // Latest Paystack webhook for the diagnostics panel
  const { data: latestRaw } = useQuery({
    queryKey: ['webhook-events-latest'],
    queryFn:  () => webhooksApi.list({ page: 1, limit: 1, source: 'paystack' }),
    refetchInterval: 30_000,
  })
  const latestWebhook: WebhookEvent | null = latestRaw?.data?.[0] ?? null

  const { data: raw, isLoading, error, refetch } = useQuery({
    queryKey: ['webhook-events', { page, limit, source, event_type: debouncedEventType }],
    queryFn: () =>
      webhooksApi.list({
        page,
        limit,
        ...(source            ? { source }                            : {}),
        ...(debouncedEventType ? { event_type: debouncedEventType }   : {}),
      }),
  })

  const allRows: WebhookEvent[] = raw?.data ?? []
  const total = raw?.total ?? allRows.length

  // Status filter is client-side (status is derived, not stored in DB)
  const rows = statusFilter
    ? allRows.filter((w) => w.status === statusFilter)
    : allRows

  if (error) return <ErrorMessage error={error} onRetry={() => void refetch()} endpoint={ENDPOINTS.webhookEvents.path} />

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Webhook Logs"
        subtitle="Incoming webhook payloads from payment providers"
        actions={
          <Button variant="secondary" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />}
            onClick={() => void refetch()}>Refresh</Button>
        }
      />

      {/* Diagnostics */}
      <DiagnosticsPanel latest={latestWebhook} />

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="w-56">
          <Input
            placeholder="Search by event type…"
            value={eventTypeSearch}
            onChange={(e) => { setEventTypeSearch(e.target.value); setPage(1) }}
            prefix={<Search className="h-3.5 w-3.5" />}
          />
        </div>
        <div className="w-36">
          <Input
            placeholder="Provider…"
            value={source}
            onChange={(e) => { setSource(e.target.value); setPage(1) }}
          />
        </div>
        <div className="w-40">
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={STATUS_OPTIONS}
            placeholder="All statuses"
          />
        </div>
      </div>

      {/* No results after client-side status filter */}
      {!isLoading && statusFilter && rows.length === 0 && allRows.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg bg-surface-2 border border-border px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-ink-faint shrink-0" />
          <p className="text-sm text-ink-faint">
            No webhooks with status <span className="font-semibold text-ink">{statusFilter}</span> on this page.
            Status filter is applied per-page — try browsing other pages or clearing the filter.
          </p>
        </div>
      )}

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
                  header: 'Provider',
                  render: (w) => <Badge variant="info">{w.source}</Badge>,
                },
                {
                  key: 'event_type',
                  header: 'Event Type',
                  render: (w) => (
                    <span className="font-mono text-xs text-ink">{w.event_type ?? '—'}</span>
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
                  key: 'sig',
                  header: 'Signature',
                  render: (w) =>
                    w.signature_valid ? (
                      <span className="flex items-center gap-1 text-xs text-emerald-400">
                        <CheckCircle2 className="h-3 w-3" /> Valid
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-rose-400">
                        <XCircle className="h-3 w-3" /> Invalid
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
        subtitle={selected ? `${selected.source} · ${selected.event_type ?? 'unknown'}` : ''}
        width="lg"
      >
        {selected && (
          <div className="space-y-4 text-sm">
            <Row label="Provider"    value={<Badge variant="info">{selected.source}</Badge>} />
            <Row label="Event Type"  value={<span className="font-mono text-xs">{selected.event_type ?? '—'}</span>} />
            <Row label="Status"      value={
              <Badge variant={STATUS_VARIANTS[selected.status] ?? 'neutral'}>
                {selected.status}
              </Badge>
            } />
            <Row label="Signature"   value={
              selected.signature_valid ? (
                <span className="flex items-center gap-1 text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Valid
                </span>
              ) : (
                <span className="flex items-center gap-1 text-rose-400">
                  <XCircle className="h-3.5 w-3.5" /> Invalid
                </span>
              )
            } />
            <Row label="Reference"   value={
              selected.reference
                ? <span className="font-mono text-xs break-all">{selected.reference}</span>
                : <span className="text-ink-faint">—</span>
            } />
            <Row label="Received At" value={fmtDate(selected.created_at)} />
            {selected.processed_at && (
              <Row label="Processed At" value={fmtDate(selected.processed_at)} />
            )}

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
