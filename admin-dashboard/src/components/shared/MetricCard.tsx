import { cn } from '@/utils/cn'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import type { ReactNode } from 'react'

interface MetricCardProps {
  label: string
  value: string | number
  sub?: string
  trend?: { value: number; label?: string }
  icon?: ReactNode
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'accent'
}

const borderMap: Record<string, string> = {
  default: 'border-border',
  success: 'border-emerald-500/30',
  warning: 'border-amber-500/30',
  danger:  'border-rose-500/30',
  accent:  'border-accent/30',
}

const iconMap: Record<string, string> = {
  default: 'bg-surface-2 text-ink-muted',
  success: 'bg-emerald-500/15 text-emerald-400',
  warning: 'bg-amber-500/15 text-amber-400',
  danger:  'bg-rose-500/15 text-rose-400',
  accent:  'bg-accent-subtle text-accent',
}

export function MetricCard({ label, value, sub, trend, icon, variant = 'default' }: MetricCardProps) {
  const TrendIcon = !trend
    ? null
    : trend.value > 0 ? TrendingUp : trend.value < 0 ? TrendingDown : Minus
  const trendColor = !trend
    ? ''
    : trend.value > 0 ? 'text-emerald-400' : trend.value < 0 ? 'text-rose-400' : 'text-ink-faint'

  return (
    <div className={cn('bg-surface-1 border rounded-xl p-5 flex items-start gap-4', borderMap[variant])}>
      {icon && (
        <div className={cn('p-2.5 rounded-lg shrink-0', iconMap[variant])}>
          {icon}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-xs text-ink-faint font-medium uppercase tracking-wider mb-1">{label}</p>
        <p className="text-2xl font-bold text-ink leading-none">{value}</p>
        <div className="flex items-center gap-2 mt-1.5">
          {TrendIcon && trend && (
            <span className={cn('flex items-center gap-0.5 text-xs font-medium', trendColor)}>
              <TrendIcon className="h-3 w-3" />
              {Math.abs(trend.value)}%{trend.label ? ` ${trend.label}` : ''}
            </span>
          )}
          {sub && <span className="text-xs text-ink-faint">{sub}</span>}
        </div>
      </div>
    </div>
  )
}
