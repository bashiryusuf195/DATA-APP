import { cn } from '@/utils/cn'
import type { ReactNode } from 'react'
import { Skeleton } from '@/components/ui'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface StatCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon?: ReactNode
  trend?: { value: number; label?: string }
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'accent'
  loading?: boolean
  className?: string
}

const variantBorder: Record<string, string> = {
  default:  'border-border',
  success:  'border-emerald-500/30',
  warning:  'border-amber-500/30',
  danger:   'border-rose-500/30',
  accent:   'border-accent/30',
}

const variantIcon: Record<string, string> = {
  default:  'bg-surface-3 text-ink-muted',
  success:  'bg-emerald-500/15 text-emerald-400',
  warning:  'bg-amber-500/15 text-amber-400',
  danger:   'bg-rose-500/15 text-rose-400',
  accent:   'bg-accent-subtle text-accent',
}

export function StatCard({
  title,
  value,
  subtitle,
  icon,
  trend,
  variant = 'default',
  loading = false,
  className,
}: StatCardProps) {
  if (loading) return <Skeleton className={cn('h-28 rounded-xl', className)} />

  const TrendIcon =
    trend && trend.value > 0
      ? TrendingUp
      : trend && trend.value < 0
      ? TrendingDown
      : Minus

  const trendColor =
    trend && trend.value > 0
      ? 'text-emerald-400'
      : trend && trend.value < 0
      ? 'text-rose-400'
      : 'text-ink-faint'

  return (
    <div
      className={cn(
        'bg-surface-1 border rounded-xl p-5 flex items-start gap-4',
        variantBorder[variant],
        className
      )}
    >
      {icon && (
        <div className={cn('p-2.5 rounded-lg shrink-0', variantIcon[variant])}>
          {icon}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-xs text-ink-faint font-medium uppercase tracking-wider mb-1">
          {title}
        </p>
        <p className="text-2xl font-bold text-ink leading-none">{value}</p>
        <div className="flex items-center gap-2 mt-1.5">
          {trend && (
            <span className={cn('flex items-center gap-0.5 text-xs font-medium', trendColor)}>
              <TrendIcon className="h-3 w-3" />
              {Math.abs(trend.value)}%
            </span>
          )}
          {subtitle && <span className="text-xs text-ink-faint">{subtitle}</span>}
        </div>
      </div>
    </div>
  )
}
