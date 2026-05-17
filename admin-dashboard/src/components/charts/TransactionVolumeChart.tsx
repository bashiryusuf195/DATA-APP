import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { Transaction } from '@/types'
import { format, parseISO, subDays, startOfDay } from 'date-fns'
import { useMemo } from 'react'

interface Props {
  transactions: Transaction[]
  days?: number
}

export function TransactionVolumeChart({ transactions, days = 7 }: Props) {
  const data = useMemo(() => {
    const buckets: Record<string, { date: string; total: number; success: number; failed: number }> = {}

    for (let i = days - 1; i >= 0; i--) {
      const d = format(startOfDay(subDays(new Date(), i)), 'MMM d')
      buckets[d] = { date: d, total: 0, success: 0, failed: 0 }
    }

    for (const tx of transactions) {
      try {
        if (!tx.created_at) continue
        const d = format(startOfDay(parseISO(tx.created_at)), 'MMM d')
        if (buckets[d]) {
          buckets[d].total++
          if (tx.status === 'successful') buckets[d].success++
          if (tx.status === 'failed') buckets[d].failed++
        }
      } catch {
        // skip transactions with unparseable dates
      }
    }

    return Object.values(buckets)
  }, [transactions, days])

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="successGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22c55e" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#22c55e" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="failedGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ef4444" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#ef4444" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: 'var(--ink-faint)' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: 'var(--ink-faint)' }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={{
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            fontSize: 12,
            color: 'var(--ink)',
          }}
          cursor={{ stroke: 'var(--border-strong)' }}
        />
        <Area
          type="monotone"
          dataKey="success"
          name="Successful"
          stroke="#22c55e"
          strokeWidth={2}
          fill="url(#successGrad)"
        />
        <Area
          type="monotone"
          dataKey="failed"
          name="Failed"
          stroke="#ef4444"
          strokeWidth={2}
          fill="url(#failedGrad)"
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
