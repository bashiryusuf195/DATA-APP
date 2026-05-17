import { cn } from '@/utils/cn'
import { X } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { Button } from './Button'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

const sizeClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
}

export function Modal({ open, onClose, title, subtitle, children, footer, size = 'md' }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    if (open) document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Panel — flex column so header/footer stick and body scrolls */}
      <div
        className={cn(
          'relative w-full flex flex-col max-h-[90vh] rounded-2xl bg-surface-1 border border-border shadow-2xl animate-slide-in',
          sizeClasses[size]
        )}
      >
        {/* Header — never shrinks */}
        <div className="flex-shrink-0 flex items-start justify-between p-5 border-b border-border">
          <div>
            <h2 className="text-base font-semibold text-ink">{title}</h2>
            {subtitle && <p className="text-xs text-ink-muted mt-0.5">{subtitle}</p>}
          </div>
          <Button variant="ghost" size="xs" onClick={onClose} className="ml-4">
            <X className="h-4 w-4" />
          </Button>
        </div>
        {/* Body — takes remaining space and scrolls when content overflows */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5">{children}</div>
        {/* Footer — never shrinks, always visible */}
        {footer && (
          <div className="flex-shrink-0 flex items-center justify-end gap-2 p-5 border-t border-border bg-surface-1 rounded-b-2xl">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
