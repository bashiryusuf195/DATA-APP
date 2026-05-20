import { Link } from 'react-router-dom'
import { cn } from '@/utils/cn'
import type { LucideIcon } from 'lucide-react'

interface ServiceCardProps {
  to: string
  label: string
  icon: LucideIcon
  color?: string
  bgColor?: string
  disabled?: boolean
}

export function ServiceCard({ to, label, icon: Icon, color = 'text-brand-600', bgColor = 'bg-brand-50', disabled = false }: ServiceCardProps) {
  return (
    <Link
      to={disabled ? '#' : to}
      className={cn(
        'flex flex-col items-center gap-2 p-3 rounded-2xl border border-border',
        'bg-surface-1 transition-all duration-150',
        disabled
          ? 'opacity-50 cursor-not-allowed'
          : 'hover:border-brand-200 hover:shadow-card active:scale-95'
      )}
      onClick={(e) => disabled && e.preventDefault()}
    >
      <div className={cn('h-11 w-11 rounded-xl flex items-center justify-center', bgColor)}>
        <Icon className={cn('h-5 w-5', color)} />
      </div>
      <span className="text-[11px] font-medium text-ink-muted text-center leading-tight">{label}</span>
    </Link>
  )
}
