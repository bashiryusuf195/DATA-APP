import { useQuery } from '@tanstack/react-query'
import { providersApi } from '@/api/providers.api'
import { transactionsApi } from '@/api/transactions.api'
import { metricsApi } from '@/api/metrics.api'
import { fundingApi } from '@/api/funding.api'
import { StatCard } from '@/components/shared/StatCard'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { TransactionVolumeChart } from '@/components/charts/TransactionVolumeChart'
import { ProviderSuccessChart } from '@/components/charts/ProviderSuccessChart'
import { TransactionStatusBadge } from '@/components/shared/StatusBadge'
import { CircuitBadge, ProviderHealthBadge } from '@/components/shared/StatusBadge'
import { SkeletonCard } from '@/components/ui/Skeleton'
import { fmtCurrency, fmtDate, fmtPercent, truncate, formatStatus, formatProvider } from '@/utils/format'
import { Activity, CreditCard, Zap, AlertTriangle } from 'lucide-react'
import type { Transaction, FundingTransaction } from '@/types'

export function DashboardPage() {
  const { data: providers = [] } = useQuery({
    queryKey: ['providers'],
    queryFn: providersApi.list,
  })

  const { data: txData, isLoading: txLoading } = useQuery({
    queryKey: ['transactions', { page: 1, limit: 50 }],
    queryFn: () => transactionsApi.list({ limit: 50 }),
  })

  const { data: metrics = [] } = useQuery({
    queryKey: ['health-metrics'],
    queryFn: metricsApi.list,
  })

  const { data: fundingData } = useQuery({
    queryKey: ['funding', { page: 1, limit: 100 }],
    queryFn: () => fundingApi.list({ limit: 100 }),
  })

  const transactions: Transaction[] = txData && 'data' in txData ? txData.data : []
  const funding: FundingTransaction[] = fundingData && 'data' in fundingData ? fundingData.data : []

  const activeProviders = providers.filter((p) => p.is_active).length
  const openCircuits = metrics.filter((m) => m.circuit_open).length

  const successfulTx = transactions.filter((t) => t.status === 'successful').length
  const totalTx = transactions.length
  const successRate = fmtPercent(successfulTx, totalTx)

  const totalFunded = funding
    .filter((f) => f.status === 'successful')
    .reduce((sum, f) => sum + Number(f.amount), 0)

  const recentTx = [...transactions].slice(0, 8)

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Dashboard"
        subtitle="Platform overview and real-time stats"
      />

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {txLoading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <StatCard
              title="Transactions (recent)"
              value={totalTx}
              subtitle="last 50 loaded"
              icon={<Activity className="h-4 w-4" />}
              variant="accent"
            />
            <StatCard
              title="Success Rate"
              value={successRate}
              subtitle={`${successfulTx} of ${totalTx}`}
              icon={<Activity className="h-4 w-4" />}
              variant={successfulTx / Math.max(totalTx, 1) >= 0.9 ? 'success' : 'warning'}
            />
            <StatCard
              title="Active Providers"
              value={`${activeProviders} / ${providers.length}`}
              subtitle={`${openCircuits} circuit(s) open`}
              icon={<Zap className="h-4 w-4" />}
              variant={openCircuits > 0 ? 'danger' : 'success'}
            />
            <StatCard
              title="Total Funded"
              value={fmtCurrency(totalFunded)}
              subtitle="successful funding"
              icon={<CreditCard className="h-4 w-4" />}
              variant="accent"
            />
          </>
        )}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card>
          <CardHeader title="Transaction Volume" subtitle="Successful vs Failed (last 7 days)" />
          <TransactionVolumeChart transactions={transactions} />
        </Card>

        <Card>
          <CardHeader title="Provider Success Rate" subtitle="Based on circuit state counters" />
          {metrics.length > 0 ? (
            <ProviderSuccessChart metrics={metrics} />
          ) : (
            <div className="h-[220px] flex items-center justify-center text-sm text-ink-faint">
              No metrics recorded yet
            </div>
          )}
        </Card>
      </div>

      {/* Bottom row */}
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
            </div>
            <div className="divide-y divide-border/50">
              {providers.length === 0 ? (
                <p className="px-5 py-8 text-sm text-ink-faint text-center">No providers configured</p>
              ) : (
                providers.map((p) => {
                  const cm = metrics.find((m) => m.provider_code === p.provider_code)
                  return (
                    <div key={p.id ?? p.provider_code} className="flex items-center justify-between px-5 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink truncate">
                          {p.display_name ?? formatProvider(p.provider_code)}
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
