import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { financeApi } from '@/api/finance.api'
import { PageHeader } from '@/components/shared/PageHeader'
import { ErrorMessage } from '@/components/shared/ErrorMessage'
import { Button, Card, Badge } from '@/components/ui'
import { SkeletonCard } from '@/components/ui/Skeleton'
import { fmtCurrency } from '@/utils/format'
import type {
  ProfitAnalyticsData, ProfitDailyRow, ProfitServiceRow,
  ProfitProviderRow, ProfitMonthRow,
} from '@/types'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts'
import {
  RefreshCw, TrendingUp, DollarSign, ShoppingCart,
  BarChart2, AlertTriangle, Download,
} from 'lucide-react'

// ── Colour palette ────────────────────────────────────────────────────────────

const COLORS = ['#6366f1', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#3b82f6', '#ec4899']

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) { return fmtCurrency(n) }

function currentMonth() { return new Date().toISOString().slice(0, 7) }

function labelMonth(ym: string) {
  const [y, m] = ym.split('-')
  return new Date(Number(y), Number(m) - 1).toLocaleString('en-NG', { month: 'short', year: 'numeric' })
}

function margin(revenue: number, cost: number) {
  if (!revenue) return 0
  return ((revenue - cost) / revenue) * 100
}

function exportCsv(rows: Record<string, unknown>[], name: string) {
  if (!rows.length) return
  const keys = Object.keys(rows[0])
  const lines = [
    keys.join(','),
    ...rows.map((r) => keys.map((k) => String(r[k] ?? '')).join(',')),
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a'); a.href = url; a.download = `${name}.csv`; a.click()
  URL.revokeObjectURL(url)
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, icon, variant = 'default', warn,
}: {
  label: string; value: string; sub?: string; icon?: React.ReactNode
  variant?: 'default' | 'profit' | 'cost' | 'revenue'; warn?: boolean
}) {
  const border = variant === 'profit'  ? 'border-emerald-500/30 dark:border-emerald-500/20' :
                 variant === 'cost'    ? 'border-rose-500/30   dark:border-rose-500/20'    :
                 variant === 'revenue' ? 'border-indigo-500/30 dark:border-indigo-500/20'   :
                                        'border-border'
  const iconBg = variant === 'profit'  ? 'bg-emerald-500/10 text-emerald-500' :
                 variant === 'cost'    ? 'bg-rose-500/10    text-rose-400'    :
                 variant === 'revenue' ? 'bg-indigo-500/10  text-indigo-400'  :
                                        'bg-surface-3 text-ink-muted'
  return (
    <Card className={`p-4 border ${border}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-ink-faint mb-1">{label}</p>
          <p className="text-xl font-semibold text-ink tabular-nums truncate">{value}</p>
          {sub && <p className="text-[11px] text-ink-faint mt-0.5 truncate">{sub}</p>}
          {warn && (
            <p className="text-[11px] text-amber-400 mt-1 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 shrink-0" /> cost data partial
            </p>
          )}
        </div>
        {icon && (
          <div className={`shrink-0 rounded-lg p-2 ${iconBg}`}>{icon}</div>
        )}
      </div>
    </Card>
  )
}

function SectionHeader({ title, sub, onExport }: { title: string; sub?: string; onExport?: () => void }) {
  return (
    <div className="flex items-center justify-between p-4 border-b border-border">
      <div>
        <p className="text-sm font-medium text-ink">{title}</p>
        {sub && <p className="text-xs text-ink-faint mt-0.5">{sub}</p>}
      </div>
      {onExport && (
        <Button variant="ghost" size="sm" onClick={onExport}>
          <Download className="w-3.5 h-3.5 mr-1" />CSV
        </Button>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function ProfitAnalysisPage() {
  const [month, setMonth] = useState(currentMonth)

  const { data, isLoading, error, refetch, isFetching } = useQuery<ProfitAnalyticsData>({
    queryKey: ['profit-analytics', month],
    queryFn:  () => financeApi.getProfitAnalytics(month),
  })

  if (error) {
    return <ErrorMessage error={error} onRetry={() => void refetch()} endpoint="/admin/analytics/profit" />
  }

  const today    = data?.today
  const mon      = data?.month
  const allTime  = data?.all_time
  const daily    = data?.daily_breakdown   ?? []
  const services = data?.service_breakdown ?? []
  const providers = data?.provider_breakdown ?? []
  const history  = data?.monthly_history  ?? []

  const missingCost = allTime?.missing_cost_price_count ?? 0

  // ── Charts data ─────────────────────────────────────────────────────────────

  const dailyChartData = daily.map((d: ProfitDailyRow) => ({
    date:    d.date.slice(5),    // "MM-DD"
    profit:  Number(d.profit),
    revenue: Number(d.revenue),
    cost:    Number(d.cost),
  }))

  const historyChartData = history.map((h: ProfitMonthRow) => ({
    month:  labelMonth(h.month),
    profit: Number(h.profit),
    revenue: Number(h.revenue),
  }))

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Profit Analytics"
        subtitle="Snapshot-based profit from successful VTU transactions — prices frozen at purchase time"
        actions={
          <Button
            variant="secondary" size="sm"
            icon={<RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />}
            onClick={() => void refetch()}
          >
            Refresh
          </Button>
        }
      />

      {/* Month selector */}
      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-xs text-ink-faint shrink-0">Viewing month</label>
        <input
          type="month"
          value={month}
          max={currentMonth()}
          onChange={(e) => setMonth(e.target.value)}
          className="text-sm bg-surface-2 border border-border rounded-lg px-3 py-1.5 text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
        />
        {month !== currentMonth() && (
          <button
            onClick={() => setMonth(currentMonth())}
            className="text-xs text-accent hover:underline"
          >
            Back to current month
          </button>
        )}
        {missingCost > 0 && (
          <Badge variant="warning">
            <AlertTriangle className="w-3 h-3 mr-1" />
            {missingCost.toLocaleString()} tx missing cost data
          </Badge>
        )}
      </div>

      {/* ── Summary cards ─────────────────────────────────────────────────── */}
      <div>
        <p className="text-[11px] font-semibold text-ink-faint uppercase tracking-widest mb-3">Today</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {isLoading ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />) : (
            <>
              <StatCard label="Profit"       value={fmt(Number(today?.profit  ?? 0))} variant="profit"  icon={<TrendingUp   className="w-4 h-4" />} />
              <StatCard label="Revenue"      value={fmt(Number(today?.revenue ?? 0))} variant="revenue" icon={<DollarSign   className="w-4 h-4" />} />
              <StatCard label="Cost"         value={fmt(Number(today?.cost    ?? 0))} variant="cost"    icon={<BarChart2    className="w-4 h-4" />} />
              <StatCard label="Transactions" value={Number(today?.count ?? 0).toLocaleString()} icon={<ShoppingCart className="w-4 h-4" />} />
            </>
          )}
        </div>
      </div>

      <div>
        <p className="text-[11px] font-semibold text-ink-faint uppercase tracking-widest mb-3">
          {labelMonth(month)} {month === currentMonth() ? '(current)' : ''}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {isLoading ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />) : (
            <>
              <StatCard label="Profit"       value={fmt(Number(mon?.profit  ?? 0))} sub={`${margin(Number(mon?.revenue), Number(mon?.cost)).toFixed(1)}% margin`} variant="profit"  icon={<TrendingUp   className="w-4 h-4" />} />
              <StatCard label="Revenue"      value={fmt(Number(mon?.revenue ?? 0))} variant="revenue" icon={<DollarSign   className="w-4 h-4" />} />
              <StatCard label="Cost"         value={fmt(Number(mon?.cost    ?? 0))} variant="cost"    icon={<BarChart2    className="w-4 h-4" />} />
              <StatCard label="Transactions" value={Number(mon?.count ?? 0).toLocaleString()} icon={<ShoppingCart className="w-4 h-4" />} />
            </>
          )}
        </div>
      </div>

      <div>
        <p className="text-[11px] font-semibold text-ink-faint uppercase tracking-widest mb-3">All Time</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {isLoading ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />) : (
            <>
              <StatCard label="Total Profit"       value={fmt(Number(allTime?.profit  ?? 0))} warn={missingCost > 0} variant="profit"  icon={<TrendingUp   className="w-4 h-4" />} />
              <StatCard label="Total Revenue"      value={fmt(Number(allTime?.revenue ?? 0))} variant="revenue" icon={<DollarSign   className="w-4 h-4" />} />
              <StatCard label="Total Cost"         value={fmt(Number(allTime?.cost    ?? 0))} warn={missingCost > 0} variant="cost" icon={<BarChart2 className="w-4 h-4" />} />
              <StatCard label="Total Transactions" value={Number(allTime?.count ?? 0).toLocaleString()} icon={<ShoppingCart className="w-4 h-4" />} />
            </>
          )}
        </div>
      </div>

      {/* ── Charts row ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Daily profit bar chart */}
        <Card>
          <SectionHeader
            title="Daily Profit"
            sub={`Profit per day — ${labelMonth(month)}`}
            onExport={() => exportCsv(daily as unknown as Record<string, unknown>[], `profit-daily-${month}`)}
          />
          <div className="p-4">
            {!isLoading && dailyChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={dailyChartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--ink-faint)' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--ink-faint)' }} axisLine={false} tickLine={false}
                    tickFormatter={(v: number) => `₦${v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}`} width={48} />
                  <Tooltip
                    contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number, name: string) => [fmt(v), name]}
                  />
                  <Bar dataKey="profit" fill="#10b981" radius={[3, 3, 0, 0]} name="Profit" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-sm text-ink-faint">
                {isLoading ? 'Loading…' : 'No transactions this month'}
              </div>
            )}
          </div>
        </Card>

        {/* Monthly history line chart */}
        <Card>
          <SectionHeader title="Monthly History" sub="Profit trend over the last 13 months" />
          <div className="p-4">
            {!isLoading && historyChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={historyChartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'var(--ink-faint)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--ink-faint)' }} axisLine={false} tickLine={false}
                    tickFormatter={(v: number) => `₦${v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}`} width={48} />
                  <Tooltip
                    contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number, name: string) => [fmt(v), name]}
                  />
                  <Line type="monotone" dataKey="profit" stroke="#10b981" strokeWidth={2} dot={{ r: 3, fill: '#10b981' }} name="Profit" />
                  <Line type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={1.5} strokeDasharray="4 2" dot={false} name="Revenue" />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-sm text-ink-faint">
                {isLoading ? 'Loading…' : 'No history available'}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* ── Service breakdown ─────────────────────────────────────────────── */}
      <Card>
        <SectionHeader
          title="Service Breakdown"
          sub={`Revenue, cost, and profit by service type — ${labelMonth(month)}`}
          onExport={() => exportCsv(services as unknown as Record<string, unknown>[], `profit-services-${month}`)}
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {['Service', 'Transactions', 'Revenue', 'Cost', 'Profit', 'Margin'].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold text-ink-faint uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-ink-faint">Loading…</td></tr>
              ) : services.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-ink-faint">No data for this month</td></tr>
              ) : services.map((row: ProfitServiceRow, i: number) => {
                const m = margin(Number(row.revenue), Number(row.cost))
                return (
                  <tr key={row.service_type} className="hover:bg-surface-2/50">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                        <span className="font-medium text-ink capitalize">{row.service_type.replace(/_/g, ' ')}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-ink tabular-nums">{Number(row.count).toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-indigo-400 tabular-nums">{fmt(Number(row.revenue))}</td>
                    <td className="px-4 py-2.5 text-rose-400   tabular-nums">{row.cost ? fmt(Number(row.cost)) : <span className="text-ink-faint">—</span>}</td>
                    <td className="px-4 py-2.5 text-emerald-400 font-medium tabular-nums">{row.profit ? fmt(Number(row.profit)) : <span className="text-ink-faint">—</span>}</td>
                    <td className="px-4 py-2.5">
                      {row.cost ? (
                        <span className={`text-xs font-medium ${m >= 5 ? 'text-emerald-400' : m >= 1 ? 'text-amber-400' : 'text-rose-400'}`}>
                          {m.toFixed(2)}%
                        </span>
                      ) : <span className="text-ink-faint text-xs">—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── Provider breakdown ────────────────────────────────────────────── */}
      <Card>
        <SectionHeader
          title="Provider Breakdown"
          sub={`Revenue, cost, and profit by provider — ${labelMonth(month)}`}
          onExport={() => exportCsv(providers as unknown as Record<string, unknown>[], `profit-providers-${month}`)}
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {['Provider', 'Transactions', 'Revenue', 'Cost', 'Profit', 'Margin'].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold text-ink-faint uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-ink-faint">Loading…</td></tr>
              ) : providers.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-ink-faint">No data for this month</td></tr>
              ) : providers.map((row: ProfitProviderRow, i: number) => {
                const m = margin(Number(row.revenue), Number(row.cost))
                return (
                  <tr key={row.provider_code} className="hover:bg-surface-2/50">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                        <span className="font-mono text-xs font-medium text-ink">{row.provider_code}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-ink tabular-nums">{Number(row.count).toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-indigo-400 tabular-nums">{fmt(Number(row.revenue))}</td>
                    <td className="px-4 py-2.5 text-rose-400   tabular-nums">{row.cost ? fmt(Number(row.cost)) : <span className="text-ink-faint">—</span>}</td>
                    <td className="px-4 py-2.5 text-emerald-400 font-medium tabular-nums">{row.profit ? fmt(Number(row.profit)) : <span className="text-ink-faint">—</span>}</td>
                    <td className="px-4 py-2.5">
                      {row.cost ? (
                        <span className={`text-xs font-medium ${m >= 5 ? 'text-emerald-400' : m >= 1 ? 'text-amber-400' : 'text-rose-400'}`}>
                          {m.toFixed(2)}%
                        </span>
                      ) : <span className="text-ink-faint text-xs">—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── Monthly history table ─────────────────────────────────────────── */}
      <Card>
        <SectionHeader
          title="Monthly History"
          sub="Last 13 months — historical values are frozen at purchase time"
          onExport={() => exportCsv(history as unknown as Record<string, unknown>[], 'profit-monthly-history')}
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {['Month', 'Transactions', 'Revenue', 'Cost', 'Profit', 'Margin'].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold text-ink-faint uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-ink-faint">Loading…</td></tr>
              ) : history.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-ink-faint">No history available</td></tr>
              ) : [...history].reverse().map((row: ProfitMonthRow) => {
                const m = margin(Number(row.revenue), Number(row.cost))
                const isCurrent = row.month === currentMonth()
                return (
                  <tr
                    key={row.month}
                    className={`hover:bg-surface-2/50 cursor-pointer ${isCurrent ? 'bg-accent/5' : ''}`}
                    onClick={() => setMonth(row.month)}
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-ink">{labelMonth(row.month)}</span>
                        {isCurrent && <Badge variant="accent">current</Badge>}
                        {row.month === month && !isCurrent && <Badge variant="neutral">viewing</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-ink tabular-nums">{Number(row.count).toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-indigo-400 tabular-nums">{fmt(Number(row.revenue))}</td>
                    <td className="px-4 py-2.5 text-rose-400   tabular-nums">{row.cost ? fmt(Number(row.cost)) : <span className="text-ink-faint">—</span>}</td>
                    <td className="px-4 py-2.5 text-emerald-400 font-medium tabular-nums">{row.profit ? fmt(Number(row.profit)) : <span className="text-ink-faint">—</span>}</td>
                    <td className="px-4 py-2.5">
                      {row.cost ? (
                        <span className={`text-xs font-medium ${m >= 5 ? 'text-emerald-400' : m >= 1 ? 'text-amber-400' : 'text-rose-400'}`}>
                          {m.toFixed(2)}%
                        </span>
                      ) : <span className="text-ink-faint text-xs">—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
