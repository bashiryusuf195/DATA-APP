import { cn } from '@/utils/cn'
import type { HTMLAttributes } from 'react'

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'muted'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
}

export function Badge({ variant = 'default', className, children, ...props }: BadgeProps) {
  const variants: Record<BadgeVariant, string> = {
    default: 'bg-brand-50 text-brand-700 border border-brand-200',
    success: 'bg-success-light text-success border border-success/25',
    warning: 'bg-warning-light text-warning border border-warning/25',
    danger:  'bg-danger-light text-danger border border-danger/25',
    info:    'bg-blue-50 text-blue-700 border border-blue-200',
    muted:   'bg-surface-2 text-ink-muted border border-border',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium',
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  )
}
