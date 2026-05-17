import { cn } from '@/utils/cn'
import type { ReactNode } from 'react'

interface FilterBarProps {
  children: ReactNode
  className?: string
}

export function FilterBar({ children, className }: FilterBarProps) {
  return (
    <div className={cn('flex flex-wrap items-end gap-3', className)}>
      {children}
    </div>
  )
}
