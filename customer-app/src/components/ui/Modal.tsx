import { cn } from '@/utils/cn'
import { X } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'

interface ModalProps {
  open: boolean
  onClose?: () => void
  title?: string
  children: ReactNode
  size?: 'sm' | 'md' | 'lg'
  /** If true, clicking backdrop does not close */
  locked?: boolean
}

export function Modal({ open, onClose, title, children, size = 'md', locked = false }: ModalProps) {
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  const widths = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg' }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => !locked && onClose?.()}
      />

      {/* Panel */}
      <div
        className={cn(
          'relative w-full bg-surface-1 shadow-modal z-10',
          'rounded-t-3xl sm:rounded-2xl',
          widths[size]
        )}
      >
        {(title || onClose) && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            {title && <p className="text-base font-semibold text-ink">{title}</p>}
            {onClose && !locked && (
              <button
                onClick={onClose}
                className="ml-auto p-1 rounded-lg text-ink-faint hover:text-ink hover:bg-surface-2 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}
