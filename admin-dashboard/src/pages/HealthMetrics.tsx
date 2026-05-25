import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { metricsApi } from '@/api/metrics.api'
import { PageHeader } from '@/components/shared/PageHeader'
import { ErrorMessage } from '@/components/shared/ErrorMessage'
import { Button, Badge, Card, Select } from '@/components/ui'
import { SkeletonCard } from '@/components/ui/Skeleton'
import { fmtRelative } from '@/utils/format'
import type { ProviderHealthDashboard, HealthWindow, ComputedHealthStatus } from '@/types'
import {
  RefreshCw, RotateCcw, Activity, AlertTriangle, CheckCircle2,
  XCircle, Zap, Clock, Wifi, ShieldAlert, Info,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { cn } from '@/utils/cn'

// ── Constants ─────────────────────────────────────────────────────────────────

const WINDOWS: Array<{ value: HealthWindow; label: string }> = [
  { value: '1h',  label: 'Last 1 hour' },
  { value: '24h', label: 'Last 24 hours' },
  { value: '7d',  label: 'Last 7 days' },
]

const SERVICE_TYPES = [
  { value: '', label: 'All services' },
  { value: 'airtime',     label: 'Airtime' },
  { value: 'data',        label: 'Data' },
  { value: 'electricity', label: 'Electricity' },
  { value: 'cable_tv',    label: 'Cable TV' },
  { value: 'exam_pin',    label: 'Exam PIN' },
]

// ── Health badge helpers ───────────────────────────────────────────────────────

function healthColor(status: ComputedHealthStatus) {
  if (status === 'healthy')  return 'text-emerald-400'
  if (status === 'degraded') return 'text-amber-400'
  return 'text-rose-400'
}

function healthBg(status: ComputedHealthStatus) {
  if (status === 'healthy')  return 'border-emerald-500/30 bg-emerald-500/5'
  if (status === 'degraded') return 'border-amber-500/30 bg-amber-500/5'
  return 'border-rose-500/30 bg-rose-500/5'
}

function HealthBadge({ status }: { status: ComputedHealthStatus }) {
  const icon =
    status === 'healthy'  ? <CheckCircle2 className="h-3 w-3" /> :
    status === 'degraded' ? <AlertTriangle className="h-3 w-3" /> :
                            <XCircle className="h-3 w-3" />
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border', healthColor(status),
      status === 'healthy'  ? 'border-emerald-500/40 bg-emerald-500/10' :
      status === 'degraded' ? 'border-amber-500/40 bg-amber-500/10' :
                              'border-rose-500/40 bg-rose-500/10'
    )}>
      {icon}
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}

function SuccessBar({ rate }: { rate: number | null }) {
  const pct = rate ?? 0
  const color = pct >= 95 ? 'bg-emerald-500' : pct >= 70 ? 'bg-amber-500' : 'bg-rose-500'
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-ink-faint">Success rate</span>
        <span className={cn('font-semibold', pct >= 95 ? 'text-emerald-400' : pct >= 70 ? 'text-amber-400' : 'text-rose-400')}>
          {rate != null ? `${rate}%` : '—'}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

// ── Provider card ─────────────────────────────────────────────────────────────

function ProviderCard({
  p,
  onReset,
  resetting,
}: {
  p: ProviderHealthDashboard
  onReset: () => void
  resetting: boolean
}) {
  const [showReason, setShowReason] = useState(false)

  return (
    <Card className={cn('flex flex-col gap-4', healthBg(p.computed_health))}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-ink truncate">{p.name || p.provider_code}</span>
            {!p.is_active && (
              <Badge variant="neutral" className="text-[10px]">Inactive</Badge>
            )}
            {p.protection_applied && (
              <span title="Auto-downgraded from healthy to degraded">
                <ShieldAlert className="h-3.5 w-3.5 text-amber-400" />
              </span>
            )}
          </div>
          <p className="text-[11px] text-ink-faint font-mono mt-0.5">{p.provider_code}</p>
        </div>
        <HealthBadge status={p.computed_health} />
      </div>

      {/* Success rate bar */}
      <SuccessBar rate={p.success_rate} />

      {/* Attempt counts */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Total',    value: p.total_attempts,      color: 'text-ink' },
          { label: 'Success',  value: p.successful_attempts, color: 'text-emerald-400' },
          { label: 'Failed',   value: p.failed_attempts,     color: 'text-rose-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-surface-2 rounded-lg p-2 text-center">
            <p className={cn('text-base font-bold', color)}>{value}</p>
            <p className="text-[10px] text-ink-faint mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Latency */}
      <div className="flex items-center gap-3 text-xs">
        <span className="text-ink-faint flex items-center gap-1">
          <Zap className="h-3 w-3" />
          avg
        </span>
        <span className="font-medium text-ink">
          {p.avg_latency_ms != null ? `${p.avg_latency_ms} ms` : '—'}
        </span>
        <span className="text-ink-faint">p95</span>
        <span className="font-medium text-ink">
          {p.p95_latency_ms != null ? `${p.p95_latency_ms} ms` : '—'}
        </span>
        {p.p95_latency_ms != null && p.p95_latency_ms > 5000 && (
          <span className="text-amber-400 text-[10px] font-medium">HIGH</span>
        )}
      </div>

      {/* Timestamps */}
      <div className="space-y-1 text-xs text-ink-faint">
        {p.last_success_at && (
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />
            <span>Last success: <span className="text-ink-muted">{fmtRelative(p.last_success_at)}</span></span>
          </div>
        )}
        {p.last_failure_at && (
          <div className="flex items-center gap-1.5">
            <XCircle className="h-3 w-3 text-rose-400 shrink-0" />
            <span>Last failure: <span className="text-ink-muted">{fmtRelative(p.last_failure_at)}</span></span>
          </div>
        )}
        {p.circuit_open && p.circuit_opened_at && (
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="h-3 w-3 text-amber-400 shrink-0" />
            <span className="text-amber-400">
              Circuit open since {fmtRelative(p.circuit_opened_at)}
              {p.consecutive_failures > 0 && ` (${p.consecutive_failures} consecutive failures)`}
            </span>
          </div>
        )}
      </div>

      {/* Recent failure reason */}
      {p.recent_failure_reason && (
        <div>
          <button
            onClick={() => setShowReason((v) => !v)}
            className="flex items-center gap-1 text-[11px] text-ink-faint hover:text-ink transition-colors"
          >
            <Info className="h-3 w-3" />
            {showReason ? 'Hide' : 'Show'} recent failure reason
          </button>
          {showReason && (
            <div className="mt-1.5 rounded-md bg-surface-2 px-2.5 py-2 text-[11px] text-ink-muted font-mono break-all">
              <span className="text-rose-400 font-semibold mr-1">
                [{p.recent_failure_classification ?? 'UNKNOWN'}]
              </span>
              {p.recent_failure_reason}
            </div>
          )}
        </div>
      )}

      {/* Services */}
      {p.supported_services.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {p.supported_services.map((s) => (
            <span key={s} className="text-[10px] px-1.5 py-0.5 rounded bg-surface-2 text-ink-faint font-mono">{s}</span>
          ))}
        </div>
      )}

      {/* Actions */}
      {p.circuit_open && (
        <Button
          variant="danger"
          size="sm"
          className="w-full"
          icon={<RotateCcw className="h-3.5 w-3.5" />}
          loading={resetting}
          onClick={onReset}
        >
          Reset Circuit Breaker
        </Button>
      )}
    </Card>
  )
}

// ── Summary stat tile ─────────────────────────────────────────────────────────

function SummaryTile({ label, value, sub, icon, color = 'text-ink' }: {
  label: string; value: string | number; sub?: string
  icon: React.ReactNode; color?: string
}) {
  return (
    <div className="bg-surface-1 border border-border rounded-xl p-4 flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-ink-faint uppercase tracking-wide">{label}</span>
        <span className="text-ink-faint opacity-50">{icon}</span>
      </div>
      <span className={cn('text-2xl font-semibold', color)}>{value}</span>
      {sub && <span className="text-[10px] text-ink-faint">{sub}</span>}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function HealthMetricsPage() {
  const qc = useQueryClient()

  const [window, setWindow]      = useState<HealthWindow>('1h')
  const [serviceType, setServiceType] = useState('')
  const [providerFilter, setProviderFilter] = useState('')

  const { data: providers = [], isLoading, error, refetch } = useQuery({
    queryKey: ['health-dashboard', window, serviceType],
    queryFn: () => metricsApi.dashboard({
      window,
      service_type: serviceType || undefined,
    }),
    refetchInterval: 30_000,
  })

  const resetMutation = useMutation({
    mutationFn: (code: string) => metricsApi.resetCircuit(code),
    onSuccess: (_, code) => {
      void qc.invalidateQueries({ queryKey: ['health-dashboard'] })
      toast.success(`Circuit reset for ${code}`)
    },
    onError: () => toast.error('Reset failed'),
  })

  // Apply client-side provider filter
  const filtered = providerFilter
    ? providers.filter((p) => p.provider_code === providerFilter || p.name.toLowerCase().includes(providerFilter.toLowerCase()))
    : providers

  const healthy  = providers.filter((p) => p.computed_health === 'healthy').length
  const degraded = providers.filter((p) => p.computed_health === 'degraded').length
  const down     = providers.filter((p) => p.computed_health === 'down').length
  const openCircuits = providers.filter((p) => p.circuit_open).length

  const totalAttempts  = providers.reduce((s, p) => s + p.total_attempts, 0)
  const totalSuccesses = providers.reduce((s, p) => s + p.successful_attempts, 0)
  const overallRate    = totalAttempts > 0 ? Math.round(100 * totalSuccesses / totalAttempts) : null

  if (error) return (
    <ErrorMessage error={error} onRetry={() => void refetch()} endpoint="/admin/provider-health-dashboard" />
  )

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Provider Health"
        subtitle="Live routing health by time window — success rate, latency, circuit state"
        actions={
          <Button variant="secondary" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />}
            onClick={() => void refetch()}>Refresh</Button>
        }
      />

      {/* ── Filters ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="w-40">
          <Select
            value={window}
            onChange={(e) => setWindow(e.target.value as HealthWindow)}
            options={WINDOWS.map((w) => ({ value: w.value, label: w.label }))}
          />
        </div>
        <div className="w-44">
          <Select
            value={serviceType}
            onChange={(e) => setServiceType(e.target.value)}
            options={SERVICE_TYPES.map((s) => ({ value: s.value, label: s.label }))}
          />
        </div>
        <div className="w-44">
          <Select
            value={providerFilter}
            onChange={(e) => setProviderFilter(e.target.value)}
            placeholder="All providers"
            options={providers.map((p) => ({ value: p.provider_code, label: p.name || p.provider_code }))}
          />
        </div>
        {(serviceType || providerFilter) && (
          <Button variant="ghost" size="sm" onClick={() => { setServiceType(''); setProviderFilter('') }}>
            Clear filters
          </Button>
        )}
      </div>

      {/* ── Summary tiles ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-24 rounded-xl bg-surface-2 animate-pulse" />)
        ) : (
          <>
            <SummaryTile label="Healthy"        value={healthy}  icon={<CheckCircle2 className="h-4 w-4" />} color={healthy  > 0 ? 'text-emerald-400' : 'text-ink'} />
            <SummaryTile label="Degraded"       value={degraded} icon={<AlertTriangle className="h-4 w-4" />} color={degraded > 0 ? 'text-amber-400'  : 'text-ink'} />
            <SummaryTile label="Down"           value={down}     icon={<XCircle className="h-4 w-4" />}      color={down     > 0 ? 'text-rose-400'   : 'text-ink'} />
            <SummaryTile label="Open Circuits"  value={openCircuits} icon={<Wifi className="h-4 w-4" />}    color={openCircuits > 0 ? 'text-rose-400' : 'text-ink'} />
            <SummaryTile label="Attempts" value={totalAttempts.toLocaleString()} icon={<Activity className="h-4 w-4" />}
              sub={`in last ${window}`} />
            <SummaryTile label="Overall Rate"
              value={overallRate != null ? `${overallRate}%` : '—'}
              icon={<CheckCircle2 className="h-4 w-4" />}
              color={overallRate == null ? 'text-ink' : overallRate >= 95 ? 'text-emerald-400' : overallRate >= 70 ? 'text-amber-400' : 'text-rose-400'}
              sub={`${totalSuccesses} / ${totalAttempts}`}
            />
          </>
        )}
      </div>

      {/* ── Provider cards ───────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-ink-faint">
            <Clock className="h-8 w-8 opacity-30" />
            <p className="text-sm">No provider data for this window.</p>
            <p className="text-xs">Metrics appear after the first purchase attempt.</p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((p) => (
            <ProviderCard
              key={p.provider_code}
              p={p}
              onReset={() => resetMutation.mutate(p.provider_code)}
              resetting={resetMutation.isPending && resetMutation.variables === p.provider_code}
            />
          ))}
        </div>
      )}
    </div>
  )
}
