import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { metricsApi } from '@/api/metrics.api'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatCard } from '@/components/shared/StatCard'
import { ProviderSuccessChart } from '@/components/charts/ProviderSuccessChart'
import { CircuitBadge } from '@/components/shared/StatusBadge'
import { ErrorMessage } from '@/components/shared/ErrorMessage'
import { Button, Card, CardHeader } from '@/components/ui'
import { SkeletonCard } from '@/components/ui/Skeleton'
import { fmtDate, fmtRelative, fmtPercent } from '@/utils/format'
import type { ProviderCircuitState } from '@/types'
import { RefreshCw, RotateCcw, Activity, AlertTriangle, CheckCircle } from 'lucide-react'
import { ENDPOINTS } from '@/config/endpoints'
import toast from 'react-hot-toast'

export function HealthMetricsPage() {
  const qc = useQueryClient()

  const { data: metrics = [], isLoading, error, refetch } = useQuery({
    queryKey: ['health-metrics'],
    queryFn: metricsApi.list,
    refetchInterval: 30_000,
  })

  const resetMutation = useMutation({
    mutationFn: (code: string) => metricsApi.resetCircuit(code),
    onSuccess: (_, code) => {
      qc.invalidateQueries({ queryKey: ['health-metrics'] })
      toast.success(`Circuit reset for ${code}`)
    },
    onError: () => toast.error('Reset failed'),
  })

  const openCircuits = metrics.filter((m) => m.circuit_open).length
  const totalSuccess = metrics.reduce((s, m) => s + m.success_count, 0)
  const totalFailure = metrics.reduce((s, m) => s + m.failure_count, 0)
  const overallRate = fmtPercent(totalSuccess, totalSuccess + totalFailure)

  if (error) return <ErrorMessage error={error} onRetry={() => void refetch()} endpoint={ENDPOINTS.healthMetrics.path} />

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Provider Health Metrics"
        subtitle="Circuit breaker state and success/failure counters"
        actions={
          <Button variant="secondary" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />}
            onClick={() => void refetch()}>Refresh</Button>
        }
      />

      {/* Summary stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <StatCard title="Tracked Providers" value={metrics.length}
              icon={<Activity className="h-4 w-4" />} variant="accent" />
            <StatCard title="Open Circuits" value={openCircuits}
              icon={<AlertTriangle className="h-4 w-4" />}
              variant={openCircuits > 0 ? 'danger' : 'success'} />
            <StatCard title="Overall Success Rate" value={overallRate}
              subtitle={`${totalSuccess} success / ${totalFailure} failure`}
              icon={<CheckCircle className="h-4 w-4" />}
              variant={parseFloat(overallRate) >= 90 ? 'success' : 'warning'} />
          </>
        )}
      </div>

      {/* Chart */}
      {metrics.length > 0 && (
        <Card>
          <CardHeader title="Success Rate by Provider" subtitle="Based on cumulative counters" />
          <ProviderSuccessChart metrics={metrics} />
        </Card>
      )}

      {/* Provider cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)
        ) : metrics.length === 0 ? (
          <div className="col-span-full">
            <Card>
              <p className="text-sm text-ink-faint text-center py-8">
                No circuit state recorded yet — metrics populate after the first provider attempt.
              </p>
            </Card>
          </div>
        ) : (
          metrics.map((m) => <MetricCard key={m.id} metric={m} onReset={() => resetMutation.mutate(m.provider_code)} resetting={resetMutation.isPending} />)
        )}
      </div>
    </div>
  )
}

function MetricCard({
  metric: m,
  onReset,
  resetting,
}: {
  metric: ProviderCircuitState
  onReset: () => void
  resetting: boolean
}) {
  const total = m.success_count + m.failure_count
  const rate = fmtPercent(m.success_count, total)

  return (
    <Card className={m.circuit_open ? 'border-rose-500/40' : undefined}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <p className="font-semibold text-ink">{m.provider_code}</p>
          <p className="text-xs text-ink-faint mt-0.5">
            Last updated {fmtRelative(m.updated_at)}
          </p>
        </div>
        <CircuitBadge open={m.circuit_open} />
      </div>

      {/* Progress bar */}
      <div className="mb-3">
        <div className="flex justify-between text-xs text-ink-faint mb-1">
          <span>Success rate</span>
          <span className="font-semibold text-ink">{rate}</span>
        </div>
        <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              parseFloat(rate) >= 95 ? 'bg-emerald-500' : parseFloat(rate) >= 80 ? 'bg-amber-500' : 'bg-rose-500'
            }`}
            style={{ width: rate }}
          />
        </div>
      </div>

      {/* Counters */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <MetricTile label="Successes"   value={m.success_count} color="text-emerald-400" />
        <MetricTile label="Failures"    value={m.failure_count} color="text-rose-400" />
        <MetricTile label="Consecutive" value={m.consecutive_failures} color="text-amber-400" />
      </div>

      {/* Timestamps */}
      {(m.last_success_at || m.last_failure_at) && (
        <div className="space-y-1 mb-4 text-xs text-ink-faint">
          {m.last_success_at && (
            <p>Last success: <span className="text-ink-muted">{fmtRelative(m.last_success_at)}</span></p>
          )}
          {m.last_failure_at && (
            <p>Last failure: <span className="text-ink-muted">{fmtRelative(m.last_failure_at)}</span></p>
          )}
          {m.circuit_open && m.circuit_opened_at && (
            <p className="text-rose-400">
              Circuit opened: {fmtDate(m.circuit_opened_at)}
            </p>
          )}
        </div>
      )}

      {m.circuit_open && (
        <Button
          variant="danger"
          size="sm"
          className="w-full"
          icon={<RotateCcw className="h-3.5 w-3.5" />}
          loading={resetting}
          onClick={onReset}
        >
          Reset Circuit
        </Button>
      )}
    </Card>
  )
}

function MetricTile({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-surface-2 rounded-lg p-2 text-center">
      <p className={`text-lg font-bold ${color}`}>{value}</p>
      <p className="text-[10px] text-ink-faint mt-0.5">{label}</p>
    </div>
  )
}
