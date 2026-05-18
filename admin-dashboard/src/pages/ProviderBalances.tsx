import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { financeApi } from '@/api/finance.api'
import { PageHeader } from '@/components/shared/PageHeader'
import { FilterBar } from '@/components/shared/FilterBar'
import { DataTable } from '@/components/shared/DataTable'
import { ErrorMessage } from '@/components/shared/ErrorMessage'
import { Button, Badge, Card, Input } from '@/components/ui'
import { SkeletonTable, SkeletonCard } from '@/components/ui/Skeleton'
import { MetricCard } from '@/components/shared/MetricCard'
import { fmtCurrency } from '@/utils/format'
import type { ProviderBalance } from '@/types'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { RefreshCw, Zap, TrendingUp, Activity, CheckCircle2 } from 'lucide-react'

const PROVIDER_COLORS = [
  '#6366f1', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#3b82f6', '#ec4899',
]

function successRateBadge(rate: number) {
  if (rate >= 95) return <Badge variant="success">{rate}%</Badge>
  if (rate >= 85) return <Badge variant="warning">{rate}%</Badge>
  return <Badge variant="danger">{rate}%</Badge>
}

export function ProviderBalancesPage() {
  const [from, setFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10)
  })
  const [to, setTo]     = useState(() => new Date().toISOString().slice(0, 10))
  const [search, setSearch] = useState('')

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['provider-balances', from, to],
    queryFn: () => financeApi.getProviderBalances({ from, to }),
  })

  const providers = (data ?? []) as ProviderBalance[]
  const filtered  = providers.filter((p) =>
    !search ||
    p.provider_code.toLowerCase().includes(search.toLowerCase()) ||
    p.display_name.toLowerCase().includes(search.toLowerCase()),
  )

  const totalVolume   = providers.reduce((s, p) => s + Number(p.volume_processed), 0)
  const totalFees     = providers.reduce((s, p) => s + Number(p.fees_generated), 0)
  const totalTxns     = providers.reduce((s, p) => s + Number(p.total_transactions), 0)
  const avgSuccessRate = providers.length
    ? providers.reduce((s, p) => s + Number(p.success_rate), 0) / providers.length
    : 0

  if (error) {
    return <ErrorMessage error={error} onRetry={() => void refetch()} endpoint="/admin/finance/provider-balances" />
  }

  const chartData = [...providers]
    .sort((a, b) => Number(b.volume_processed) - Number(a.volume_processed))
    .slice(0, 8)
    .map((p) => ({ name: p.provider_code, volume: Number(p.volume_processed), fees: Number(p.fees_generated) }))

  const columns = [
    {
      key: 'provider',
      header: 'Provider',
      render: (p: ProviderBalance) => (
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
            <Zap className="h-3.5 w-3.5 text-accent" />
          </div>
          <div>
            <p className="text-sm font-medium text-ink">{p.display_name}</p>
            <p className="text-xs text-ink-faint font-mono">{p.provider_code}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Active',
      render: (p: ProviderBalance) => (
        p.is_active
          ? <Badge variant="success"><CheckCircle2 className="h-3 w-3 mr-1 inline" />Active</Badge>
          : <Badge variant="neutral">Inactive</Badge>
      ),
    },
    {
      key: 'transactions',
      header: 'Transactions',
      render: (p: ProviderBalance) => (
        <div>
          <span className="text-sm font-medium text-ink">{Number(p.total_transactions).toLocaleString()}</span>
          <div className="text-xs text-ink-faint mt-0.5">
            {Number(p.successful_count).toLocaleString()} ok · {Number(p.failed_count).toLocaleString()} failed
          </div>
        </div>
      ),
    },
    {
      key: 'success_rate',
      header: 'Success Rate',
      render: (p: ProviderBalance) => successRateBadge(Number(p.success_rate)),
    },
    {
      key: 'volume',
      header: 'Volume Processed',
      align: 'right' as const,
      render: (p: ProviderBalance) => (
        <span className="text-sm font-medium text-ink tabular-nums">{fmtCurrency(Number(p.volume_processed))}</span>
      ),
    },
    {
      key: 'fees',
      header: 'Fees Generated',
      align: 'right' as const,
      render: (p: ProviderBalance) => (
        <span className="text-sm text-emerald-400 tabular-nums">{fmtCurrency(Number(p.fees_generated))}</span>
      ),
    },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Provider Balances"
        subtitle="Transaction volume, success rates, and fee generation per provider"
        actions={
          <Button variant="secondary" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />}
            onClick={() => void refetch()}>Refresh</Button>
        }
      />

      {/* Date range picker */}
      <FilterBar>
        <div className="flex items-center gap-2">
          <label className="text-xs text-ink-faint shrink-0">From</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="text-sm bg-surface-2 border border-border rounded-lg px-2 py-1.5 text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-ink-faint shrink-0">To</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="text-sm bg-surface-2 border border-border rounded-lg px-2 py-1.5 text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
        </div>
        <div className="flex-1 min-w-[180px] max-w-xs">
          <Input placeholder="Search provider…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </FilterBar>

      {/* Metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <MetricCard label="Total GMV" value={fmtCurrency(totalVolume)} sub="across all providers"
              icon={<TrendingUp className="h-4 w-4" />} variant="accent" />
            <MetricCard label="Total Fees" value={fmtCurrency(totalFees)} sub="revenue from fees"
              icon={<Zap className="h-4 w-4" />} variant="success" />
            <MetricCard label="Total Transactions" value={totalTxns.toLocaleString()} sub="all providers"
              icon={<Activity className="h-4 w-4" />} variant="default" />
            <MetricCard
              label="Avg Success Rate"
              value={`${avgSuccessRate.toFixed(1)}%`}
              sub={`${providers.length} active providers`}
              icon={<CheckCircle2 className="h-4 w-4" />}
              variant={avgSuccessRate >= 90 ? 'success' : 'warning'}
            />
          </>
        )}
      </div>

      {/* Chart */}
      {!isLoading && chartData.length > 0 && (
        <Card>
          <div className="p-4 border-b border-border">
            <p className="text-sm font-medium text-ink">Volume by Provider</p>
            <p className="text-xs text-ink-faint mt-0.5">Top providers by processed volume</p>
          </div>
          <div className="p-4">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--ink-faint)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--ink-faint)' }} axisLine={false} tickLine={false}
                  tickFormatter={(v: number) => `₦${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number) => [fmtCurrency(v), 'Volume']}
                />
                <Bar dataKey="volume" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, i) => (
                    <Cell key={entry.name} fill={PROVIDER_COLORS[i % PROVIDER_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Table */}
      <Card>
        {isLoading ? (
          <SkeletonTable rows={6} />
        ) : (
          <DataTable
            columns={columns}
            data={filtered}
            rowKey={(p) => p.provider_code}
            emptyMessage="No provider balance data yet."
          />
        )}
      </Card>
    </div>
  )
}
