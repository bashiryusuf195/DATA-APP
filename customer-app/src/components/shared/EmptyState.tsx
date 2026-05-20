import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui'

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {Icon && (
        <div className="h-14 w-14 rounded-2xl bg-surface-2 flex items-center justify-center mb-4">
          <Icon className="h-7 w-7 text-ink-faint" />
        </div>
      )}
      <p className="text-base font-semibold text-ink mb-1">{title}</p>
      {description && <p className="text-sm text-ink-muted max-w-xs">{description}</p>}
      {action && (
        <Button variant="primary" size="sm" className="mt-4" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  )
}
