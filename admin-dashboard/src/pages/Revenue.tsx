import { useQuery } from '@tanstack/react-query'
import { transactionsApi } from '@/api/transactions.api'
import { fundingApi } from '@/api/funding.api'
import { PageHeader } from '@/components/shared/PageHeader'
import { MetricCard } from '@/components/shared/MetricCard'
import { Card, CardHeader } from '@/components/ui/Card'
import { TransactionVolumeChart } from '@/components/charts/TransactionVolumeChart'
import { SkeletonCard } from '@/components/ui/Skeleton'
import { fmtCurrency, fmtPercent } from '@/utils/format'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { TrendingUp, CreditCard, Activity, Percent } from 'lucide-react'
import type { Transaction } from '@/types'

const SERVICE_COLORS: Record<string, string> = {
  airtime:     '#6366f1',
  data:        '#8b5cf6',
  electricity: '#f59e0b',
  cable_tv:    '#10b981',
}
const FALLBACK_COLOR = '#64748b'

export function RevenuePage() {
  const { data: txRaw, isLoading: txLoading } = useQuery({
    queryKey: ['revenue-transactions'],
    queryFn: () => transactionsApi.list({ limit: 200 }),
  })

  const { data: fundRaw, isLoading: fundLoading } = useQuery({
    queryKey: ['revenue-funding'],
    queryFn: () => fundingApi.list({ limit: 200 }),
  })

  const isLoading = txLoading || fundLoading

  const transactions: Transaction[] = txRaw?.data ?? []
  const funding = fundRaw?.data ?? []

  const successful = transactions.filter((t) => t.status === 'successful')
  const totalVolume = successful.reduce((s, t) => s + Number(t.amount ?? 0), 0)
  const totalFunded = funding
    .filter((f) => f.status === 'successful')
    .reduce((s, f) => s + Number(f.amount ?? 0), 0)
  const successRate = fmtPercent(successful.length, Math.max(transactions.length, 1))

  const serviceMap = successful.reduce<Record<string, number>>((acc, t) => {
    const svc = String(t.service_type ?? 'other')
    acc[svc] = (acc[svc] ?? 0) + Number(t.amount ?? 0)
    return acc
  }, {})
  const serviceData = Object.entries(serviceMap)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Revenue Analytics"
        subtitle="Transaction volume, service breakdown and funding overview"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <MetricCard
              label="Total Volume"
              value={fmtCurrency(totalVolume)}
              sub={`${successful.length} successful txns`}
              icon={<TrendingUp className="h-4 w-4" />}
              variant="accent"
            />
            <MetricCard
              label="Total Funded"
              value={fmtCurrency(totalFunded)}
              sub="successful wallet top-ups"
              icon={<CreditCard className="h-4 w-4" />}
              variant="success"
            />
            <MetricCard
              label="Transactions Loaded"
              value={transactions.length}
              sub="most recent 200"
              icon={<Activity className="h-4 w-4" />}
              variant="default"
            />
            <MetricCard
              label="Success Rate"
              value={successRate}
              sub={`${successful.length} of ${transactions.length}`}
              icon={<Percent className="h-4 w-4" />}
              variant={successful.length / Math.max(transactions.length, 1) >= 0.9 ? 'success' : 'warning'}
            />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card>
          <CardHeader title="Transaction Volume" subtitle="Successful vs Failed (last 7 days)" />
          <TransactionVolumeChart transactions={transactions} />
        </Card>

        <Card>
          <CardHeader title="Revenue by Service" subtitle="Volume for successful transactions" />
          {serviceData.length === 0 ? (
            <div className="h-[220px] flex items-center justify-center text-sm text-ink-faint">
              No revenue data available
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={serviceData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: 'var(--ink-faint)' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'var(--ink-faint)' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => `₦${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(v: number) => [fmtCurrency(v), 'Volume']}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {serviceData.map((entry) => (
                    <Cell
                      key={entry.name}
                      fill={SERVICE_COLORS[entry.name] ?? FALLBACK_COLOR}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>
    </div>
  )
}
