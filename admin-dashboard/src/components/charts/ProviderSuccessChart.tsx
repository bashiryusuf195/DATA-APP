import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import type { ProviderCircuitState } from '@/types'
import { useMemo } from 'react'

interface Props {
  metrics: ProviderCircuitState[]
}

export function ProviderSuccessChart({ metrics }: Props) {
  const data = useMemo(
    () =>
      metrics.map((m) => {
        const total = m.success_count + m.failure_count
        const rate = total === 0 ? 0 : Math.round((m.success_count / total) * 100)
        return { name: m.provider_code, rate, circuit_open: m.circuit_open }
      }),
    [metrics]
  )

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
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
          domain={[0, 100]}
          tickFormatter={(v) => `${v}%`}
        />
        <Tooltip
          formatter={(value: number) => [`${value}%`, 'Success Rate']}
          contentStyle={{
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            fontSize: 12,
            color: 'var(--ink)',
          }}
          cursor={{ fill: 'var(--accent-subtle)' }}
        />
        <Bar dataKey="rate" radius={[4, 4, 0, 0]}>
          {data.map((entry, index) => (
            <Cell
              key={`cell-${index}`}
              fill={
                entry.circuit_open
                  ? '#ef4444'
                  : entry.rate >= 95
                  ? '#22c55e'
                  : entry.rate >= 80
                  ? '#f59e0b'
                  : '#ef4444'
              }
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
