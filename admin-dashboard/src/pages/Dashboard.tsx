import { useQuery } from '@tanstack/react-query'
import { providersApi }    from '@/api/providers.api'
import { transactionsApi } from '@/api/transactions.api'
import { metricsApi }      from '@/api/metrics.api'
import { dashboardApi }    from '@/api/dashboard.api'
import { StatCard }        from '@/components/shared/StatCard'
import { PageHeader }      from '@/components/shared/PageHeader'
import { ErrorMessage }    from '@/components/shared/ErrorMessage'
import { Card, CardHeader } from '@/components/ui/Card'
import { TransactionVolumeChart } from '@/components/charts/TransactionVolumeChart'
import { ProviderSuccessChart }   from '@/components/charts/ProviderSuccessChart'
import { TransactionStatusBadge } from '@/components/shared/StatusBadge'
import { CircuitBadge, ProviderHealthBadge } from '@/components/shared/StatusBadge'
import { SkeletonCard } from '@/components/ui/Skeleton'
import {
  fmtCurrency, fmtDate, fmtPercent, truncate, formatStatus, formatProvider,
} from '@/utils/format'
import {
  Activity, CreditCard, Zap, AlertTriangle,
  Users, TrendingUp, MessageSquare, RefreshCw,
} from 'lucide-react'
import { Button } from '@/components/ui'
import { ENDPOINTS } from '@/config/endpoints'
import type { Transaction } from '@/types'

export function DashboardPage() {
  // ── Authoritative platform metrics ─────────────────────────────────────────
  const {
    data:    dashMetrics,
    isLoading: metricsLoading,
    error:   metricsError,
    refetch: refetchMetrics,
  } = useQuery({
    queryKey: ['dashboard-metrics'],
    queryFn:  dashboardApi.metrics,
    refetchInterval: 60_000,
  })

  // ── Provider list + circuit health (for sidebar + charts) ──────────────────
  const { data: providers = [] } = useQuery({
    queryKey: ['providers'],
    queryFn:  providersApi.list,
  })

  const { data: circuitMetrics = [] } = useQuery({
    queryKey: ['health-metrics'],
    queryFn:  metricsApi.list,
  })

  // ── Recent transactions display panel (8 rows — not used for stat computation) ─
  const { data: txData } = useQuery({
    queryKey: ['transactions', { page: 1, limit: 50 }],
    queryFn:  () => transactionsApi.list({ limit: 50 }),
  })

  const transactions: Transaction[] = txData && 'data' in txData ? txData.data : []
  const recentTx = transactions.slice(0, 8)

  // ── Derived display values ──────────────────────────────────────────────────
  const activeProviders = providers.filter((p) => p.is_active).length
  const openCircuits    = circuitMetrics.filter((m) => m.circuit_open).length

  const successRate = dashMetrics
    ? fmtPercent(dashMetrics.transactions.successful, dashMetrics.transactions.total)
    : '—'

  const openTickets = (dashMetrics?.support.open_tickets ?? 0) +
                      (dashMetrics?.support.pending_tickets ?? 0)

  // ── Error state ─────────────────────────────────────────────────────────────
  if (metricsError) {
    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader title="Dashboard" subtitle="Platform overview and real-time stats" />
        <ErrorMessage
          error={metricsError}
          onRetry={() => void refetchMetrics()}
          endpoint={ENDPOINTS.dashboardMetrics.path}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Dashboard"
        subtitle="Platform overview and real-time stats"
        actions={
          <Button
            variant="secondary"
            size="sm"
            icon={<RefreshCw className="h-3.5 w-3.5" />}
            onClick={() => void refetchMetrics()}
          >
            Refresh
          </Button>
        }
      />

      {/* ── Row 1: Key KPIs ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {metricsLoading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <StatCard
              title="Total Transactions"
              value={dashMetrics?.transactions.total ?? 0}
              subtitle={`${dashMetrics?.transactions.today_count ?? 0} today`}
              icon={<Activity className="h-4 w-4" />}
              variant="accent"
            />
            <StatCard
              title="Success Rate"
              value={successRate}
              subtitle={`${dashMetrics?.transactions.successful ?? 0} of ${dashMetrics?.transactions.total ?? 0}`}
              icon={<Activity className="h-4 w-4" />}
              variant={
                (dashMetrics?.transactions.successful ?? 0) /
                Math.max(dashMetrics?.transactions.total ?? 1, 1) >= 0.9
                  ? 'success'
                  : 'warning'
              }
            />
            <StatCard
              title="Total Users"
              value={dashMetrics?.users.total ?? 0}
              subtitle={`${dashMetrics?.users.active ?? 0} active · ${dashMetrics?.users.new_today ?? 0} new today`}
              icon={<Users className="h-4 w-4" />}
              variant="default"
            />
            <StatCard
              title="Total Funded"
              value={fmtCurrency(dashMetrics?.funding.total_volume ?? 0)}
              subtitle={`${dashMetrics?.funding.successful_count ?? 0} deposits`}
              icon={<CreditCard className="h-4 w-4" />}
              variant="accent"
            />
          </>
        )}
      </div>

      {/* ── Row 2: Financial + operational KPIs ────────────────────────────── */}
      {!metricsLoading && dashMetrics && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard
            title="Transaction Volume"
            value={fmtCurrency(dashMetrics.transactions.total_volume)}
            subtitle="all-time successful"
            icon={<TrendingUp className="h-4 w-4" />}
            variant="default"
          />
          <StatCard
            title="Purchase Volume"
            value={fmtCurrency(dashMetrics.transactions.purchase_volume)}
            subtitle="VTU services (excl. top-ups)"
            icon={<Zap className="h-4 w-4" />}
            variant="default"
          />
          <StatCard
            title="Failed (24 h)"
            value={dashMetrics.transactions.recent_failed_24h}
            subtitle={`${dashMetrics.transactions.pending} pending now`}
            icon={<AlertTriangle className="h-4 w-4" />}
            variant={dashMetrics.transactions.recent_failed_24h > 0 ? 'danger' : 'success'}
          />
          <StatCard
            title="Open Tickets"
            value={openTickets}
            subtitle={`${dashMetrics.support.open_tickets} open · ${dashMetrics.support.pending_tickets} pending`}
            icon={<MessageSquare className="h-4 w-4" />}
            variant={openTickets > 0 ? 'warning' : 'success'}
          />
        </div>
      )}

      {/* ── Charts ──────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card>
          <CardHeader title="Transaction Volume" subtitle="Successful vs Failed (last 7 days)" />
          <TransactionVolumeChart transactions={transactions} />
        </Card>

        <Card>
          <CardHeader title="Provider Success Rate" subtitle="Based on circuit state counters" />
          {circuitMetrics.length > 0 ? (
            <ProviderSuccessChart metrics={circuitMetrics} />
          ) : (
            <div className="h-[220px] flex items-center justify-center text-sm text-ink-faint">
              No metrics recorded yet
            </div>
          )}
        </Card>
      </div>

      {/* ── Bottom row ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Recent transactions */}
        <div className="xl:col-span-2">
          <Card padding="none">
            <div className="px-5 py-4 border-b border-border">
              <h3 className="text-sm font-semibold text-ink">Recent Transactions</h3>
            </div>
            <div className="divide-y divide-border/50">
              {recentTx.length === 0 ? (
                <p className="px-5 py-8 text-sm text-ink-faint text-center">No transactions yet</p>
              ) : (
                recentTx.map((tx) => (
                  <div key={tx.id ?? tx.reference} className="flex items-center justify-between px-5 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink truncate">
                        {formatStatus(tx.service_type)} · {truncate(tx.reference, 20)}
                      </p>
                      <p className="text-xs text-ink-faint mt-0.5">{fmtDate(tx.created_at)}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-4">
                      <span className="text-sm font-semibold text-ink">
                        {fmtCurrency(tx.amount)}
                      </span>
                      <TransactionStatusBadge status={tx.status ?? 'pending'} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>

        {/* Provider health */}
        <div>
          <Card padding="none">
            <div className="px-5 py-4 border-b border-border">
              <h3 className="text-sm font-semibold text-ink">Provider Health</h3>
              {!metricsLoading && dashMetrics && (
                <p className="text-xs text-ink-faint mt-0.5">
                  {activeProviders}/{providers.length} active
                  {openCircuits > 0 && (
                    <span className="text-rose-400 ml-2">· {openCircuits} circuit open</span>
                  )}
                  {' · '}
                  {dashMetrics.providers.overall_success_rate.toFixed(1)}% success (7d)
                </p>
              )}
            </div>
            <div className="divide-y divide-border/50">
              {providers.length === 0 ? (
                <p className="px-5 py-8 text-sm text-ink-faint text-center">No providers configured</p>
              ) : (
                providers.map((p) => {
                  const cm = circuitMetrics.find((m) => m.provider_code === p.provider_code)
                  return (
                    <div key={p.id ?? p.provider_code} className="flex items-center justify-between px-5 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink truncate">
                          {p.name ?? formatProvider(p.provider_code)}
                        </p>
                        {cm?.circuit_open && (
                          <p className="text-xs text-rose-400 mt-0.5 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            Circuit open
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0 ml-3">
                        <ProviderHealthBadge status={p.health_status ?? 'unhealthy'} />
                        {cm && <CircuitBadge open={cm.circuit_open} />}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
