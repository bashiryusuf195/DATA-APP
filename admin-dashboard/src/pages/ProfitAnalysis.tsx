import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { financeApi } from '@/api/finance.api'
import { PageHeader } from '@/components/shared/PageHeader'
import { FilterBar } from '@/components/shared/FilterBar'
import { DataTable } from '@/components/shared/DataTable'
import { ErrorMessage } from '@/components/shared/ErrorMessage'
import { Button, Card } from '@/components/ui'
import { SkeletonCard, SkeletonTable } from '@/components/ui/Skeleton'
import { MetricCard } from '@/components/shared/MetricCard'
import { fmtCurrency } from '@/utils/format'
import type { ProfitTotals, ServiceProfitRow, WeeklyTrend } from '@/types'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Cell,
} from 'recharts'
import { RefreshCw, TrendingUp, DollarSign, Percent, Activity } from 'lucide-react'

const SERVICE_COLORS = [
  '#6366f1', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#3b82f6',
]

interface AnalysisData {
  totals: ProfitTotals
  byService: ServiceProfitRow[]
  weeklyTrend: WeeklyTrend[]
  period: { from: string; to: string }
}

export function ProfitAnalysisPage() {
  const [from, setFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10)
  })
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10))

  const { data: raw, isLoading, error, refetch } = useQuery({
    queryKey: ['profit-analysis', from, to],
    queryFn: () => financeApi.getProfitAnalysis({ from, to }),
  })

  const data = raw as AnalysisData | undefined

  const totals      = data?.totals
  const byService   = (data?.byService   ?? []) as ServiceProfitRow[]
  const weeklyTrend = (data?.weeklyTrend ?? []) as WeeklyTrend[]

  const trendData = weeklyTrend.map((w) => ({
    week:    new Date(w.week).toLocaleDateString('en-NG', { month: 'short', day: 'numeric' }),
    revenue: Number(w.revenue),
    volume:  Number(w.volume),
    count:   Number(w.count),
  }))

  if (error) {
    return <ErrorMessage error={error} onRetry={() => void refetch()} endpoint="/admin/finance/profit-analysis" />
  }

  const serviceColumns = [
    {
      key: 'service',
      header: 'Service',
      render: (r: ServiceProfitRow) => (
        <span className="text-sm font-medium text-ink capitalize">{String(r.service).replace(/_/g, ' ')}</span>
      ),
    },
    {
      key: 'count',
      header: 'Transactions',
      render: (r: ServiceProfitRow) => (
        <span className="text-sm text-ink">{Number(r.count).toLocaleString()}</span>
      ),
    },
    {
      key: 'volume',
      header: 'Volume',
      align: 'right' as const,
      render: (r: ServiceProfitRow) => (
        <span className="text-sm text-ink tabular-nums">{fmtCurrency(Number(r.volume))}</span>
      ),
    },
    {
      key: 'revenue',
      header: 'Revenue (Fees)',
      align: 'right' as const,
      render: (r: ServiceProfitRow) => (
        <span className="text-sm text-emerald-400 font-medium tabular-nums">{fmtCurrency(Number(r.revenue))}</span>
      ),
    },
    {
      key: 'margin',
      header: 'Margin %',
      align: 'right' as const,
      render: (r: ServiceProfitRow) => {
        const pct = Number(r.margin_pct)
        return (
          <span className={`text-sm font-medium tabular-nums ${pct >= 5 ? 'text-emerald-400' : pct >= 2 ? 'text-amber-400' : 'text-rose-400'}`}>
            {pct.toFixed(2)}%
          </span>
        )
      },
    },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Profit Analysis"
        subtitle="Fee revenue, transaction margins, and weekly growth trends"
        actions={
          <Button variant="secondary" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />}
            onClick={() => void refetch()}>Refresh</Button>
        }
      />

      {/* Date range */}
      <FilterBar>
        <div className="flex items-center gap-2">
          <label className="text-xs text-ink-faint shrink-0">From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="text-sm bg-surface-2 border border-border rounded-lg px-2 py-1.5 text-ink focus:outline-none focus:ring-2 focus:ring-accent/40" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-ink-faint shrink-0">To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="text-sm bg-surface-2 border border-border rounded-lg px-2 py-1.5 text-ink focus:outline-none focus:ring-2 focus:ring-accent/40" />
        </div>
      </FilterBar>

      {/* Metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <MetricCard label="Gross Revenue" value={fmtCurrency(Number(totals?.gross_revenue ?? 0))}
              sub="total fees collected" icon={<DollarSign className="h-4 w-4" />} variant="accent" />
            <MetricCard label="Total GMV" value={fmtCurrency(Number(totals?.total_gmv ?? 0))}
              sub="gross merchandise value" icon={<TrendingUp className="h-4 w-4" />} variant="success" />
            <MetricCard label="Avg Fee per Txn" value={fmtCurrency(Number(totals?.avg_fee ?? 0))}
              sub="fee per successful transaction" icon={<Percent className="h-4 w-4" />} variant="default" />
            <MetricCard label="Transactions" value={Number(totals?.transaction_count ?? 0).toLocaleString()}
              sub="successful in period" icon={<Activity className="h-4 w-4" />} variant="default" />
          </>
        )}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Weekly revenue trend */}
        <Card>
          <div className="p-4 border-b border-border">
            <p className="text-sm font-medium text-ink">Weekly Revenue Trend</p>
            <p className="text-xs text-ink-faint mt-0.5">Fee revenue collected per week</p>
          </div>
          <div className="p-4">
            {!isLoading && trendData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={trendData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="week" tick={{ fontSize: 11, fill: 'var(--ink-faint)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--ink-faint)' }} axisLine={false} tickLine={false}
                    tickFormatter={(v: number) => `₦${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number) => [fmtCurrency(v), 'Revenue']}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="#6366f1" fill="url(#revenueGrad)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-sm text-ink-faint">
                {isLoading ? 'Loading…' : 'No trend data available'}
              </div>
            )}
          </div>
        </Card>

        {/* Revenue by service */}
        <Card>
          <div className="p-4 border-b border-border">
            <p className="text-sm font-medium text-ink">Revenue by Service</p>
            <p className="text-xs text-ink-faint mt-0.5">Fee revenue per service type</p>
          </div>
          <div className="p-4">
            {!isLoading && byService.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={byService.slice(0, 6).map((s) => ({
                  name: String(s.service).replace(/_/g, ' '),
                  revenue: Number(s.revenue),
                }))} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--ink-faint)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--ink-faint)' }} axisLine={false} tickLine={false}
                    tickFormatter={(v: number) => `₦${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number) => [fmtCurrency(v), 'Revenue']}
                  />
                  <Bar dataKey="revenue" radius={[4, 4, 0, 0]}>
                    {byService.slice(0, 6).map((_, i) => (
                      <Cell key={i} fill={SERVICE_COLORS[i % SERVICE_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-sm text-ink-faint">
                {isLoading ? 'Loading…' : 'No service data available'}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Service breakdown table */}
      <Card>
        <div className="p-4 border-b border-border">
          <p className="text-sm font-medium text-ink">Service Breakdown</p>
          <p className="text-xs text-ink-faint mt-0.5">Revenue and margin by service type</p>
        </div>
        {isLoading ? (
          <SkeletonTable rows={5} />
        ) : (
          <DataTable
            columns={serviceColumns}
            data={byService}
            rowKey={(r) => String(r.service)}
            emptyMessage="No profit data yet."
          />
        )}
      </Card>
    </div>
  )
}
