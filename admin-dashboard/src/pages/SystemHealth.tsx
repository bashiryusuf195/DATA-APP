import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { healthApi } from '@/api/health.api'
import type { ComponentStatus, QueueEntry, ProviderEntry } from '@/api/health.api'
import { PageHeader }   from '@/components/shared/PageHeader'
import { MetricCard }   from '@/components/shared/MetricCard'
import { ErrorMessage } from '@/components/shared/ErrorMessage'
import { Badge }        from '@/components/ui'
import { SkeletonCard, SkeletonTable } from '@/components/ui/Skeleton'
import { Card }         from '@/components/ui'
import { Button }       from '@/components/ui'
import { fmtRelative }  from '@/utils/format'
import {
  RefreshCw, Database, Server, Cpu, Zap,
  CheckCircle2, AlertTriangle, XCircle,
  Clock, Activity, List,
} from 'lucide-react'

// ── Status helpers ─────────────────────────────────────────────────────────────

function statusVariant(s: ComponentStatus | 'healthy' | 'down'): 'success' | 'warning' | 'danger' | 'neutral' {
  if (s === 'ok' || s === 'healthy') return 'success'
  if (s === 'degraded')              return 'warning'
  if (s === 'down' || s === 'error') return 'danger'
  return 'neutral'
}

function StatusDot({ status }: { status: ComponentStatus | 'healthy' | 'down' }) {
  const colour =
    status === 'ok' || status === 'healthy'
      ? 'bg-green-400'
      : status === 'degraded'
      ? 'bg-yellow-400'
      : 'bg-red-400'
  return <span className={`inline-block h-2 w-2 rounded-full ${colour} shrink-0`} />
}

function StatusIcon({ status }: { status: ComponentStatus | 'healthy' | 'down' }) {
  if (status === 'ok' || status === 'healthy')
    return <CheckCircle2 className="h-4 w-4 text-green-400" />
  if (status === 'degraded')
    return <AlertTriangle className="h-4 w-4 text-yellow-400" />
  return <XCircle className="h-4 w-4 text-red-400" />
}

function fmtUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m ${seconds % 60}s`
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ComponentCard({
  label, status, icon, detail,
}: {
  label:  string
  status: ComponentStatus | 'healthy' | 'down'
  icon:   React.ReactNode
  detail?: string
}) {
  return (
    <div className="rounded-xl bg-surface-1 border border-border p-4 flex items-center gap-4">
      <div className="h-9 w-9 rounded-lg bg-surface-2 flex items-center justify-center text-ink-muted shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-ink-faint uppercase tracking-wide mb-0.5">{label}</p>
        <div className="flex items-center gap-2">
          <StatusDot status={status} />
          <span className="text-sm font-medium text-ink capitalize">{status}</span>
          {detail && <span className="text-xs text-ink-faint">· {detail}</span>}
        </div>
      </div>
      <StatusIcon status={status} />
    </div>
  )
}

function QueueTable({ queues }: { queues: QueueEntry[] }) {
  const sorted = [...queues].sort((a, b) => (b.waiting + b.failed) - (a.waiting + a.failed))
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-[11px] text-ink-faint uppercase tracking-wide">
            <th className="py-2 px-3 text-left font-medium">Queue</th>
            <th className="py-2 px-3 text-right font-medium">Waiting</th>
            <th className="py-2 px-3 text-right font-medium">Active</th>
            <th className="py-2 px-3 text-right font-medium">Failed</th>
            <th className="py-2 px-3 text-right font-medium">Delayed</th>
            <th className="py-2 px-3 text-right font-medium">Oldest</th>
            <th className="py-2 px-3 text-center font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((q) => {
            const hasIssue = q.failed > 0 || q.waiting > 100 || q.paused
            return (
              <tr key={q.name} className="border-b border-border/50 hover:bg-surface-2/40 transition-colors">
                <td className="py-2.5 px-3">
                  <span className="font-mono text-xs text-ink">{q.name}</span>
                  {q.paused && <Badge variant="neutral" className="ml-2 text-[10px] py-0">paused</Badge>}
                </td>
                <td className={`py-2.5 px-3 text-right tabular-nums ${q.waiting > 100 ? 'text-yellow-400 font-medium' : 'text-ink-muted'}`}>
                  {q.waiting.toLocaleString()}
                </td>
                <td className={`py-2.5 px-3 text-right tabular-nums ${q.active > 0 ? 'text-blue-400' : 'text-ink-muted'}`}>
                  {q.active.toLocaleString()}
                </td>
                <td className={`py-2.5 px-3 text-right tabular-nums ${q.failed > 0 ? 'text-red-400 font-medium' : 'text-ink-muted'}`}>
                  {q.failed.toLocaleString()}
                </td>
                <td className="py-2.5 px-3 text-right tabular-nums text-ink-muted">{q.delayed.toLocaleString()}</td>
                <td className="py-2.5 px-3 text-right text-xs text-ink-faint">
                  {q.oldest_waiting_age_ms != null
                    ? `${Math.round(q.oldest_waiting_age_ms / 1000)}s`
                    : '—'}
                </td>
                <td className="py-2.5 px-3 text-center">
                  <StatusDot status={hasIssue ? (q.failed > 20 || q.paused ? 'degraded' : 'degraded') : 'ok'} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function ProviderGrid({ providers }: { providers: ProviderEntry[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
      {providers.map((p) => (
        <div key={p.code} className="rounded-lg bg-surface-2 border border-border p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <StatusDot status={p.computed_health} />
              <span className="text-sm font-medium text-ink">{p.name}</span>
            </div>
            <Badge variant={statusVariant(p.computed_health)} className="text-[10px]">
              {p.computed_health}
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-ink-faint">
            <span>Success rate</span>
            <span className="text-right text-ink tabular-nums">
              {p.success_rate != null ? `${p.success_rate.toFixed(1)}%` : '—'}
            </span>
            <span>Consecutive fails</span>
            <span className={`text-right tabular-nums ${p.consecutive_failures > 0 ? 'text-red-400' : 'text-ink'}`}>
              {p.consecutive_failures}
            </span>
            <span>Circuit</span>
            <span className={`text-right ${p.circuit_open ? 'text-red-400 font-medium' : 'text-green-400'}`}>
              {p.circuit_open ? 'OPEN' : 'closed'}
            </span>
            {p.last_failure_at && (
              <>
                <span>Last failure</span>
                <span className="text-right">{fmtRelative(p.last_failure_at)}</span>
              </>
            )}
          </div>
          {p.recent_failure_reason && (
            <p className="mt-2 text-[11px] text-red-400/80 truncate" title={p.recent_failure_reason}>
              {p.recent_failure_reason}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function SystemHealthPage() {
  const [autoRefresh, setAutoRefresh] = useState(true)

  const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery({
    queryKey:  ['system-health'],
    queryFn:   () => healthApi.getSystemHealth(),
    refetchInterval: autoRefresh ? 30_000 : false,
    staleTime: 20_000,
  })

  if (error) return (
    <ErrorMessage error={error} onRetry={() => void refetch()} endpoint="/admin/system-health" />
  )

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="System Health"
        subtitle="Real-time infrastructure and service status"
        actions={
          <div className="flex items-center gap-2">
            {dataUpdatedAt > 0 && (
              <span className="text-xs text-ink-faint">
                Updated {fmtRelative(new Date(dataUpdatedAt).toISOString())}
              </span>
            )}
            <Button
              variant={autoRefresh ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setAutoRefresh((v) => !v)}
            >
              {autoRefresh ? 'Auto-refresh on' : 'Auto-refresh off'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<RefreshCw className="h-3.5 w-3.5" />}
              onClick={() => void refetch()}
            >
              Refresh
            </Button>
          </div>
        }
      />

      {/* ── Top metric cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : data ? (
          <>
            <MetricCard
              label="Server Uptime"
              value={fmtUptime(data.uptime_seconds)}
              icon={<Server className="h-4 w-4" />}
              variant={data.status === 'ok' ? 'success' : 'warning'}
            />
            <MetricCard
              label="Queue Backlog"
              value={data.queues.total_waiting.toLocaleString()}
              icon={<List className="h-4 w-4" />}
              variant={data.queues.total_waiting > 500 ? 'warning' : 'neutral'}
            />
            <MetricCard
              label="Failed Jobs"
              value={data.queues.total_failed.toLocaleString()}
              icon={<AlertTriangle className="h-4 w-4" />}
              variant={data.queues.total_failed > 0 ? 'danger' : 'success'}
            />
            <MetricCard
              label="Provider Outages"
              value={data.providers.down}
              icon={<Zap className="h-4 w-4" />}
              variant={data.providers.down > 0 ? 'danger' : 'success'}
            />
          </>
        ) : null}
      </div>

      {/* ── Infrastructure status ─────────────────────────────────────────────── */}
      <div>
        <h3 className="text-xs font-semibold text-ink-faint uppercase tracking-wide mb-3">
          Infrastructure
        </h3>
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : data ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            <ComponentCard
              label="Overall"
              status={data.status}
              icon={<Activity className="h-4 w-4" />}
              detail={`v${data.version}`}
            />
            <ComponentCard
              label="Database"
              status={data.database.status}
              icon={<Database className="h-4 w-4" />}
              detail={data.database.latency_ms != null ? `${data.database.latency_ms}ms` : undefined}
            />
            <ComponentCard
              label="Redis"
              status={data.redis.status}
              icon={<Cpu className="h-4 w-4" />}
            />
            <ComponentCard
              label="Queues"
              status={data.queues.status}
              icon={<Clock className="h-4 w-4" />}
              detail={`${data.queues.total_active} active`}
            />
          </div>
        ) : null}
      </div>

      {/* ── Queue detail ─────────────────────────────────────────────────────── */}
      <Card>
        <div className="px-4 pt-4 pb-2 border-b border-border">
          <h3 className="text-sm font-semibold text-ink">Queue Monitor</h3>
          <p className="text-xs text-ink-faint mt-0.5">
            {data ? `${data.queues.queue_count} queues` : '—'}
          </p>
        </div>
        {isLoading
          ? <SkeletonTable rows={8} />
          : data?.queues.queues.length
          ? <QueueTable queues={data.queues.queues} />
          : (
            <p className="text-sm text-ink-faint text-center py-8">No queue data available.</p>
          )
        }
      </Card>

      {/* ── Provider health ───────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-ink-faint uppercase tracking-wide">
            Provider Health
          </h3>
          {data && (
            <div className="flex gap-3 text-xs text-ink-faint">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-green-400 inline-block" />
                {data.providers.healthy} healthy
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-yellow-400 inline-block" />
                {data.providers.degraded} degraded
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-red-400 inline-block" />
                {data.providers.down} down
              </span>
            </div>
          )}
        </div>
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : data?.providers.providers.length ? (
          <ProviderGrid providers={data.providers.providers} />
        ) : (
          <p className="text-sm text-ink-faint text-center py-8">No provider data available.</p>
        )}
      </div>
    </div>
  )
}
