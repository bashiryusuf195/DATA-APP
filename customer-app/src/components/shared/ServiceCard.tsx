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

export function ServiceCard({ to, label, icon: Icon, color = 'text-teal-500', bgColor, disabled = false }: ServiceCardProps) {
  return (
    <Link
      to={disabled ? '#' : to}
      className={cn(
        'flex flex-col items-center gap-2.5 py-3',
        disabled ? 'opacity-50 cursor-not-allowed' : 'active:scale-95 transition-transform duration-100'
      )}
      onClick={(e) => disabled && e.preventDefault()}
    >
      {/* Circular icon */}
      <div className={cn(
        'h-14 w-14 rounded-full flex items-center justify-center border-2',
        bgColor ?? 'bg-teal-50 border-teal-400/50'
      )}>
        <Icon className={cn('h-6 w-6', color)} />
      </div>
      <span className="text-[11px] font-semibold text-ink-muted text-center leading-tight">{label}</span>
    </Link>
  )
}
