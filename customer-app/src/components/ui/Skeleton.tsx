import { cn } from '@/utils/cn'
import type { HTMLAttributes } from 'react'

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded-xl bg-surface-2', className)}
      {...props}
    />
  )
}
