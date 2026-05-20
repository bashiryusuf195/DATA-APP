import { cn } from '@/utils/cn'
import type { HTMLAttributes } from 'react'

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'muted'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
}

export function Badge({ variant = 'default', className, children, ...props }: BadgeProps) {
  const variants: Record<BadgeVariant, string> = {
    default: 'bg-brand-50 text-brand-700',
    success: 'bg-success-light text-success',
    warning: 'bg-warning-light text-warning',
    danger:  'bg-danger-light text-danger',
    info:    'bg-blue-50 text-blue-700',
    muted:   'bg-surface-2 text-ink-muted',
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
