import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { auditApi } from '@/api/audit.api'
import { EndpointGuard } from '@/components/shared/EndpointGuard'
import { PageHeader } from '@/components/shared/PageHeader'
import { FilterBar } from '@/components/shared/FilterBar'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { Pagination } from '@/components/shared/Pagination'
import { Drawer } from '@/components/shared/Drawer'
import { ErrorMessage } from '@/components/shared/ErrorMessage'
import { Button, Input, Select, Badge, Card } from '@/components/ui'
import { SkeletonTable } from '@/components/ui/Skeleton'
import { fmtDate, truncate } from '@/utils/format'
import type { AdminAuditLog, AdminAuditLogDetail, AuditOutcome } from '@/types'
import {
  RefreshCw,
  ClipboardList,
  Search,
  CheckCircle,
  XCircle,
  AlertCircle,
} from 'lucide-react'
import { useDebounce } from '@/hooks/useDebounce'
import { ENDPOINTS } from '@/config/endpoints'
import type { ReactNode } from 'react'

const OUTCOME_OPTIONS = [
  { value: 'success', label: 'Success' },
  { value: 'failure', label: 'Failure' },
  { value: 'partial', label: 'Partial' },
]

const ACTION_OPTIONS = [
  { value: 'provider_create',        label: 'Provider Create' },
  { value: 'provider_update',        label: 'Provider Update' },
  { value: 'provider_delete',        label: 'Provider Delete' },
  { value: 'routing_rule_create',    label: 'Routing Rule Create' },
  { value: 'routing_rule_update',    label: 'Routing Rule Update' },
  { value: 'routing_rule_delete',    label: 'Routing Rule Delete' },
  { value: 'funding_verify',         label: 'Funding Verify' },
  { value: 'refund_process',         label: 'Refund Process' },
  { value: 'role_assign',            label: 'Role Assign' },
  { value: 'role_revoke',            label: 'Role Revoke' },
  { value: 'user_update',            label: 'User Update' },
  { value: 'broadcast_notification', label: 'Broadcast Notification' },
  { value: 'journal_reverse',        label: 'Journal Reverse' },
  { value: 'catalog_create',         label: 'Catalog Create' },
  { value: 'catalog_update',         label: 'Catalog Update' },
  { value: 'catalog_delete',         label: 'Catalog Delete' },
  { value: 'admin_create',           label: 'Admin Create' },
  { value: 'admin_update',           label: 'Admin Update' },
  { value: 'admin_delete',           label: 'Admin Delete' },
]

const RESOURCE_OPTIONS = [
  { value: 'provider',             label: 'Provider' },
  { value: 'routing_rule',         label: 'Routing Rule' },
  { value: 'funding_transaction',  label: 'Funding Transaction' },
  { value: 'refund',               label: 'Refund' },
  { value: 'user',                 label: 'User' },
  { value: 'notification',         label: 'Notification' },
  { value: 'journal_batch',        label: 'Journal Batch' },
  { value: 'wallet',               label: 'Wallet' },
  { value: 'service',              label: 'Service' },
]

function outcomeVariant(o: AuditOutcome): 'success' | 'danger' | 'warning' {
  if (o === 'success') return 'success'
  if (o === 'failure') return 'danger'
  return 'warning'
}

function actionVariant(action: string): 'danger' | 'warning' | 'success' | 'accent' | 'neutral' {
  if (action.includes('delete') || action.includes('revoke') || action.includes('reverse')) return 'danger'
  if (action.includes('create') || action.includes('assign'))  return 'success'
  if (action.includes('update') || action.includes('verify'))  return 'warning'
  if (action.includes('broadcast'))                            return 'accent'
  return 'neutral'
}

function statusCodeVariant(code: number | null): 'success' | 'warning' | 'danger' | 'neutral' {
  if (!code)       return 'neutral'
  if (code < 300)  return 'success'
  if (code < 400)  return 'warning'
  return 'danger'
}

export function AuditLogsPage() {
  return (
    <EndpointGuard
      endpointKey="auditLogs"
      pageTitle="Audit Logs"
      pageSubtitle="Immutable log of all admin actions and data changes"
      features={[
        'Full action audit trail',
        'Filter by actor, action type and resource',
        'Request context: IP, user agent, trace ID',
        'Before/after change values',
        'Tamper-evident append-only storage',
      ]}
    >
      <AuditLogsContent />
    </EndpointGuard>
  )
}

function AuditLogsContent() {
  const [page, setPage]         = useState(1)
  const [email, setEmail]       = useState('')
  const [action, setAction]     = useState('')
  const [resource, setResource] = useState('')
  const [outcome, setOutcome]   = useState('')
  const [selected, setSelected] = useState<AdminAuditLog | null>(null)
  const limit = 20

  const debouncedEmail = useDebounce(email)

  const { data: raw, isLoading, error, refetch } = useQuery({
    queryKey: ['audit-logs', { page, limit, email: debouncedEmail, action, resource, outcome }],
    queryFn: () =>
      auditApi.list({
        page,
        limit,
        ...(debouncedEmail ? { email: debouncedEmail }            : {}),
        ...(action         ? { action }                           : {}),
        ...(resource       ? { resource }                         : {}),
        ...(outcome        ? { outcome: outcome as AuditOutcome } : {}),
      }),
  })

  const rows: AdminAuditLog[] = raw?.data ?? []
  const total = raw?.total ?? 0

  const handleEmail = useCallback((v: string) => { setEmail(v); setPage(1) }, [])

  if (error) return (
    <ErrorMessage error={error} onRetry={() => void refetch()} endpoint={ENDPOINTS.auditLogs.path} />
  )

  const columns: Column<AdminAuditLog>[] = [
    {
      key: 'actor',
      header: 'Admin',
      render: (l) => (
        <div>
          <p className="text-sm font-medium text-ink">{l.admin_email ?? 'Unknown'}</p>
          <p className="text-xs font-mono text-ink-faint">{l.admin_id.slice(0, 8)}…</p>
        </div>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      render: (l) => (
        <Badge variant={actionVariant(l.action)} size="sm">
          {l.action.replace(/_/g, ' ')}
        </Badge>
      ),
    },
    {
      key: 'description',
      header: 'Description',
      render: (l) => (
        <span className="text-sm text-ink-muted">{truncate(l.description, 40)}</span>
      ),
    },
    {
      key: 'resource',
      header: 'Resource',
      render: (l) =>
        l.resource_type ? (
          <Badge variant="neutral" size="sm">{l.resource_type}</Badge>
        ) : (
          <span className="text-xs text-ink-faint">—</span>
        ),
    },
    {
      key: 'outcome',
      header: 'Outcome',
      render: (l) => (
        <div className="flex items-center gap-1.5">
          {l.outcome === 'success' ? (
            <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
          ) : l.outcome === 'failure' ? (
            <XCircle className="h-3.5 w-3.5 text-rose-400" />
          ) : (
            <AlertCircle className="h-3.5 w-3.5 text-amber-400" />
          )}
          <Badge variant={outcomeVariant(l.outcome)} size="sm">{l.outcome}</Badge>
        </div>
      ),
    },
    {
      key: 'method',
      header: 'Method',
      render: (l) => (
        <span className="font-mono text-xs text-ink-faint">{l.request_method ?? '—'}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      render: (l) =>
        l.response_status != null ? (
          <Badge variant={statusCodeVariant(l.response_status)} size="sm">
            {l.response_status}
          </Badge>
        ) : (
          <span className="text-xs text-ink-faint">—</span>
        ),
    },
    {
      key: 'date',
      header: 'Date',
      render: (l) => (
        <span className="text-xs text-ink-faint">{fmtDate(l.created_at)}</span>
      ),
    },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Audit Logs"
        subtitle="Immutable log of all admin actions and data changes"
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

      <FilterBar>
        <div className="w-60">
          <Input
            placeholder="Search by admin email…"
            value={email}
            onChange={(e) => handleEmail(e.target.value)}
            prefix={<Search className="h-3.5 w-3.5" />}
          />
        </div>
        <div className="w-48">
          <Select
            value={action}
            onChange={(e) => { setAction(e.target.value); setPage(1) }}
            options={ACTION_OPTIONS}
            placeholder="All actions"
          />
        </div>
        <div className="w-44">
          <Select
            value={resource}
            onChange={(e) => { setResource(e.target.value); setPage(1) }}
            options={RESOURCE_OPTIONS}
            placeholder="All resources"
          />
        </div>
        <div className="w-36">
          <Select
            value={outcome}
            onChange={(e) => { setOutcome(e.target.value); setPage(1) }}
            options={OUTCOME_OPTIONS}
            placeholder="All outcomes"
          />
        </div>
      </FilterBar>

      <Card padding="none">
        {isLoading ? (
          <div className="p-5"><SkeletonTable rows={10} /></div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <ClipboardList className="h-10 w-10 text-ink-faint opacity-30 mb-3" />
            <p className="text-sm text-ink-faint">No audit log entries found</p>
          </div>
        ) : (
          <>
            <DataTable
              data={rows}
              rowKey={(l) => l.id}
              onRowClick={setSelected}
              columns={columns}
            />
            <div className="px-4 pb-4">
              <Pagination page={page} limit={limit} total={total} onPage={setPage} />
            </div>
          </>
        )}
      </Card>

      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title="Audit Log Detail"
        subtitle={selected ? truncate(selected.description, 48) : ''}
        width="lg"
      >
        {selected && <AuditDetailPanel logId={selected.id} summary={selected} />}
      </Drawer>
    </div>
  )
}

function AuditDetailPanel({
  logId,
  summary,
}: {
  logId:   string
  summary: AdminAuditLog
}) {
  const { data: detail, isLoading, error } = useQuery({
    queryKey: ['audit-log', logId],
    queryFn:  () => auditApi.get(logId),
  })

  return (
    <div className="space-y-5">
      {/* Outcome header */}
      <div className={`rounded-xl p-4 border flex items-center gap-3 ${
        summary.outcome === 'success'
          ? 'bg-emerald-500/10 border-emerald-500/20'
          : summary.outcome === 'failure'
          ? 'bg-rose-500/10 border-rose-500/20'
          : 'bg-amber-500/10 border-amber-500/20'
      }`}>
        {summary.outcome === 'success' ? (
          <CheckCircle className="h-5 w-5 text-emerald-400 shrink-0" />
        ) : summary.outcome === 'failure' ? (
          <XCircle className="h-5 w-5 text-rose-400 shrink-0" />
        ) : (
          <AlertCircle className="h-5 w-5 text-amber-400 shrink-0" />
        )}
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">{summary.description}</p>
          <p className="text-xs text-ink-faint mt-0.5">
            by {summary.admin_email ?? summary.admin_id}
          </p>
        </div>
        <div className="ml-auto shrink-0">
          <Badge variant={actionVariant(summary.action)}>
            {summary.action.replace(/_/g, ' ')}
          </Badge>
        </div>
      </div>

      {isLoading && <SkeletonTable rows={5} />}
      {error    && <p className="text-xs text-danger px-1">Failed to load audit detail.</p>}
      {detail   && <AuditDetailContent detail={detail} />}
    </div>
  )
}

function AuditDetailContent({ detail }: { detail: AdminAuditLogDetail }) {
  const hasOldValues = Object.keys(detail.old_values ?? {}).length > 0
  const hasNewValues = Object.keys(detail.new_values ?? {}).length > 0
  const hasBody      = Object.keys(detail.request_body ?? {}).length > 0

  return (
    <div className="space-y-5">
      {/* Core */}
      <Section title="Admin Action">
        <Row label="Log ID"         value={<span className="font-mono text-xs break-all">{detail.id}</span>} />
        <Row label="Admin ID"       value={<span className="font-mono text-xs break-all">{detail.admin_id}</span>} />
        <Row label="Admin Email"    value={detail.admin_email ?? '—'} />
        <Row label="Action"         value={<Badge variant={actionVariant(detail.action)}>{detail.action.replace(/_/g, ' ')}</Badge>} />
        <Row label="Outcome"        value={
          <Badge variant={outcomeVariant(detail.outcome)}>
            {detail.outcome}
          </Badge>
        } />
        {detail.error_message && (
          <Row label="Error"        value={<span className="text-xs text-danger">{detail.error_message}</span>} />
        )}
        <Row label="Date"           value={fmtDate(detail.created_at)} />
      </Section>

      {/* Resource */}
      {(detail.resource_type || detail.resource_id) && (
        <Section title="Resource">
          {detail.resource_type && (
            <Row label="Type" value={<Badge variant="neutral">{detail.resource_type}</Badge>} />
          )}
          {detail.resource_id && (
            <Row label="Resource ID" value={<span className="font-mono text-xs break-all">{detail.resource_id}</span>} />
          )}
        </Section>
      )}

      {/* Request */}
      <Section title="Request Context">
        <Row label="Method"         value={<span className="font-mono font-semibold text-sm">{detail.request_method ?? '—'}</span>} />
        <Row label="Endpoint"       value={<span className="font-mono text-xs break-all">{detail.endpoint_path ?? '—'}</span>} />
        <Row label="Response"       value={
          detail.response_status != null
            ? <Badge variant={statusCodeVariant(detail.response_status)}>{detail.response_status}</Badge>
            : '—'
        } />
        <Row label="IP Address"     value={<span className="font-mono text-xs">{detail.ip_address ?? '—'}</span>} />
        <Row label="Request ID"     value={<span className="font-mono text-xs break-all">{detail.request_id ?? '—'}</span>} />
        {detail.user_agent && (
          <Row label="User Agent"   value={<span className="text-xs text-ink-faint break-all">{truncate(detail.user_agent, 80)}</span>} />
        )}
      </Section>

      {/* Request body */}
      {hasBody && (
        <Section title="Request Body">
          <JsonBlock data={detail.request_body!} />
        </Section>
      )}

      {/* Change tracking */}
      {(hasOldValues || hasNewValues) && (
        <Section title="Changes">
          {hasOldValues && (
            <div className="py-2">
              <p className="text-xs text-ink-faint mb-1.5">Before</p>
              <JsonBlock data={detail.old_values} />
            </div>
          )}
          {hasNewValues && (
            <div className="py-2 border-t border-border/50">
              <p className="text-xs text-ink-faint mb-1.5">After</p>
              <JsonBlock data={detail.new_values} />
            </div>
          )}
        </Section>
      )}
    </div>
  )
}

function JsonBlock({ data }: { data: Record<string, unknown> }) {
  return (
    <pre className="text-xs bg-surface-2 rounded-lg p-3 overflow-auto max-h-56 text-ink-muted">
      {JSON.stringify(data, null, 2)}
    </pre>
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
      <span className="text-sm text-ink text-right break-all">{value}</span>
    </div>
  )
}
