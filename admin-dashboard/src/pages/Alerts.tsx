import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { alertsApi } from '@/api/alerts.api'
import type { AdminAlert, AlertSeverity, AlertCategory } from '@/api/alerts.api'
import { PageHeader }   from '@/components/shared/PageHeader'
import { ErrorMessage } from '@/components/shared/ErrorMessage'
import { Pagination }   from '@/components/shared/Pagination'
import { Button, Badge, Card } from '@/components/ui'
import { SkeletonTable } from '@/components/ui/Skeleton'
import { fmtDate } from '@/utils/format'
import toast from 'react-hot-toast'
import {
  BellOff, CheckCheck, CheckCircle2, Plug, Wallet, CreditCard, TrendingUp,
  RotateCcw, RefreshCw, Trash2, X,
} from 'lucide-react'

// ── Helpers ───────────────────────────────────────────────────────────────────

function severityBadge(s: AlertSeverity) {
  if (s === 'critical') return <Badge variant="danger"  dot>Critical</Badge>
  if (s === 'warning')  return <Badge variant="warning" dot>Warning</Badge>
  return                       <Badge variant="info"    dot>Info</Badge>
}

function alertIcon(type: AdminAlert['type']) {
  const cls = 'h-4 w-4 shrink-0'
  if (type === 'provider_down')      return <Plug         className={cls} />
  if (type === 'wallet_low')         return <Wallet       className={cls} />
  if (type === 'gateway_down')       return <CreditCard   className={cls} />
  if (type === 'large_transaction')  return <TrendingUp   className={cls} />
  if (type === 'repeated_failures')  return <RotateCcw    className={cls} />
  return                                    <BellOff      className={cls} />
}

function iconBg(s: AlertSeverity) {
  if (s === 'critical') return 'bg-rose-500/10 text-rose-400'
  if (s === 'warning')  return 'bg-amber-500/10 text-amber-400'
  return                       'bg-cyan-500/10 text-cyan-400'
}

const ALL_SEVERITIES: { label: string; value: AlertSeverity | '' }[] = [
  { label: 'All severities', value: '' },
  { label: 'Critical',       value: 'critical' },
  { label: 'Warning',        value: 'warning' },
  { label: 'Info',           value: 'info' },
]

const ALL_CATEGORIES: { label: string; value: AlertCategory | '' }[] = [
  { label: 'All categories', value: '' },
  { label: 'Provider',       value: 'provider' },
  { label: 'Payment',        value: 'payment' },
  { label: 'Transaction',    value: 'transaction' },
]

// ── Alert row ─────────────────────────────────────────────────────────────────

interface AlertRowProps {
  alert:     AdminAlert
  onRead:    (id: string) => void
  onResolve: (id: string) => void
  onDelete:  (id: string) => void
  busy:      boolean
}

function AlertRow({ alert, onRead, onResolve, onDelete, busy }: AlertRowProps) {
  return (
    <div
      className={`flex gap-3 p-4 rounded-xl border transition-colors ${
        alert.is_read
          ? 'border-border bg-surface-1'
          : 'border-border bg-surface-2 ring-1 ring-accent/10'
      }`}
    >
      {/* Icon */}
      <div className={`mt-0.5 h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${iconBg(alert.severity)}`}>
        {alertIcon(alert.type)}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-start gap-2 mb-1">
          <span className={`text-sm font-semibold ${alert.is_read ? 'text-ink-muted' : 'text-ink'}`}>
            {alert.title}
          </span>
          {severityBadge(alert.severity)}
          {!alert.is_read && (
            <span className="inline-block h-2 w-2 rounded-full bg-accent mt-1.5 shrink-0" title="Unread" />
          )}
          {alert.is_resolved && (
            <Badge variant="success" dot>Resolved</Badge>
          )}
        </div>

        <p className="text-xs text-ink-muted leading-relaxed mb-2">{alert.message}</p>

        <div className="flex flex-wrap items-center gap-3 text-[11px] text-ink-faint">
          <span>{fmtDate(alert.created_at)}</span>
          {alert.is_resolved && alert.resolved_by && (
            <span>Resolved by {alert.resolved_by}</span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-1 shrink-0">
        {!alert.is_read && (
          <button
            onClick={() => onRead(alert.id)}
            disabled={busy}
            title="Mark as read"
            className="p-1.5 rounded-lg text-ink-faint hover:text-accent hover:bg-accent-subtle transition-colors disabled:opacity-40"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
          </button>
        )}
        {!alert.is_resolved && (
          <button
            onClick={() => onResolve(alert.id)}
            disabled={busy}
            title="Mark as resolved"
            className="p-1.5 rounded-lg text-ink-faint hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors disabled:opacity-40"
          >
            <CheckCheck className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          onClick={() => onDelete(alert.id)}
          disabled={busy}
          title="Delete alert"
          className="p-1.5 rounded-lg text-ink-faint hover:text-rose-400 hover:bg-rose-500/10 transition-colors disabled:opacity-40"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function AlertsPage() {
  const qc     = useQueryClient()
  const [page, setPage]             = useState(1)
  const [severity, setSeverity]     = useState<AlertSeverity | ''>('')
  const [category, setCategory]     = useState<AlertCategory | ''>('')
  const [unreadOnly, setUnreadOnly] = useState(false)
  const limit = 25

  const queryKey = ['admin-alerts', { page, limit, severity, category, unreadOnly }]

  const { data, isLoading, error, refetch } = useQuery({
    queryKey,
    queryFn: () => alertsApi.list({
      page,
      limit,
      ...(severity   && { severity }),
      ...(category   && { category }),
      ...(unreadOnly && { unread: true }),
    }),
    refetchInterval: 60_000,
  })

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['admin-alerts'] })
    void qc.invalidateQueries({ queryKey: ['admin-alerts-count'] })
  }

  const readMutation    = useMutation({ mutationFn: alertsApi.markRead,    onSuccess: invalidate })
  const readAllMutation = useMutation({ mutationFn: alertsApi.markAllRead, onSuccess: invalidate })
  const resolveMutation = useMutation({ mutationFn: alertsApi.resolve,     onSuccess: invalidate })
  const deleteMutation  = useMutation({ mutationFn: alertsApi.delete,      onSuccess: invalidate })

  const busy = readMutation.isPending || resolveMutation.isPending || deleteMutation.isPending

  function handleMarkAllRead() {
    readAllMutation.mutate(undefined, {
      onSuccess: () => toast.success('All alerts marked as read'),
      onError:   () => toast.error('Failed to mark all as read'),
    })
  }

  const alerts: AdminAlert[] = data?.data ?? []
  const total                = data?.total ?? 0
  const unreadCount          = alerts.filter((a) => !a.is_read).length

  if (error) return <ErrorMessage error={error} onRetry={() => void refetch()} />

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Alerts"
        subtitle="System alerts for provider outages, payment issues, and unusual activity"
        actions={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={<RefreshCw className="h-3.5 w-3.5" />}
              onClick={() => void refetch()}
            >
              Refresh
            </Button>
            {unreadCount > 0 && (
              <Button
                variant="secondary"
                size="sm"
                icon={<CheckCheck className="h-3.5 w-3.5" />}
                onClick={handleMarkAllRead}
                disabled={readAllMutation.isPending}
              >
                Mark all read
              </Button>
            )}
          </div>
        }
      />

      {/* Filters */}
      <Card>
        <div className="flex flex-wrap gap-3 items-center">
          <select
            value={severity}
            onChange={(e) => { setSeverity(e.target.value as AlertSeverity | ''); setPage(1) }}
            className="text-sm rounded-lg border border-border bg-surface-2 text-ink px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent/30"
          >
            {ALL_SEVERITIES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>

          <select
            value={category}
            onChange={(e) => { setCategory(e.target.value as AlertCategory | ''); setPage(1) }}
            className="text-sm rounded-lg border border-border bg-surface-2 text-ink px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent/30"
          >
            {ALL_CATEGORIES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>

          <label className="flex items-center gap-2 text-sm text-ink-muted cursor-pointer select-none">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(e) => { setUnreadOnly(e.target.checked); setPage(1) }}
              className="rounded border-border accent-accent"
            />
            Unread only
          </label>

          {(severity || category || unreadOnly) && (
            <button
              onClick={() => { setSeverity(''); setCategory(''); setUnreadOnly(false); setPage(1) }}
              className="flex items-center gap-1 text-xs text-ink-faint hover:text-ink transition-colors"
            >
              <X className="h-3 w-3" /> Clear filters
            </button>
          )}

          <span className="ml-auto text-xs text-ink-faint">{total} alert{total !== 1 ? 's' : ''}</span>
        </div>
      </Card>

      {/* Alert list */}
      <div className="space-y-2">
        {isLoading ? (
          <Card><div className="p-2"><SkeletonTable rows={5} /></div></Card>
        ) : alerts.length === 0 ? (
          <Card>
            <div className="py-16 text-center">
              <BellOff className="h-10 w-10 text-ink-faint mx-auto mb-3" />
              <p className="text-sm font-medium text-ink-muted">No alerts</p>
              <p className="text-xs text-ink-faint mt-1">
                {unreadOnly || severity || category
                  ? 'Try removing filters to see all alerts.'
                  : 'All systems nominal — alerts will appear here when something needs attention.'}
              </p>
            </div>
          </Card>
        ) : (
          alerts.map((alert) => (
            <AlertRow
              key={alert.id}
              alert={alert}
              busy={busy}
              onRead={(id) => readMutation.mutate(id, {
                onError: () => toast.error('Failed to mark as read'),
              })}
              onResolve={(id) => resolveMutation.mutate(id, {
                onSuccess: () => toast.success('Alert resolved'),
                onError:   () => toast.error('Failed to resolve alert'),
              })}
              onDelete={(id) => deleteMutation.mutate(id, {
                onSuccess: () => toast.success('Alert deleted'),
                onError:   () => toast.error('Failed to delete alert'),
              })}
            />
          ))
        )}
      </div>

      {total > limit && (
        <Pagination page={page} total={total} limit={limit} onPageChange={setPage} />
      )}
    </div>
  )
}
