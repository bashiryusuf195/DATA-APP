import { cn } from '@/utils/cn'
import type { ReactNode } from 'react'
import { Inbox } from 'lucide-react'

interface EmptyStateProps {
  icon?: ReactNode
  title?: string
  description?: string
  action?: ReactNode
  className?: string
}

export function EmptyState({
  icon = <Inbox className="h-10 w-10 text-ink-faint" />,
  title = 'No results',
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 text-center', className)}>
      <div className="mb-4 opacity-60">{icon}</div>
      <p className="text-sm font-medium text-ink-muted">{title}</p>
      {description && (
        <p className="mt-1 text-xs text-ink-faint max-w-xs">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
