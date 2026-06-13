import { useRef, useId, useEffect } from 'react'
import { useNumPadStore } from '@/store/numpad.store'
import { cn } from '@/utils/cn'

interface NumPadInputProps {
  value:        string
  onChange:     (v: string) => void
  label?:       string
  placeholder?: string
  maxLength?:   number
  masked?:      boolean
  hasDecimal?:  boolean
  error?:       string
  hint?:        string
  prefix?:      React.ReactNode
  disabled?:    boolean
  className?:   string
}

/**
 * A styled field that opens the global NumPad instead of the system keyboard.
 * Uses a `div` (not `<input>`) so native keyboards never appear on mobile.
 */
export function NumPadInput({
  value, onChange, label, placeholder, maxLength,
  masked = false, hasDecimal = false,
  error, hint, prefix, disabled = false, className,
}: NumPadInputProps) {
  const fieldId   = useId()
  const divRef    = useRef<HTMLDivElement>(null)
  const openPad   = useNumPadStore((s) => s.open)
  const syncValue = useNumPadStore((s) => s.syncValue)
  const isOpen    = useNumPadStore((s) => s.isOpen)
  const activeId  = useNumPadStore((s) => s.fieldId)
  const isActive  = isOpen && activeId === fieldId

  // Sync chip/external changes while this field is open
  useEffect(() => {
    if (isActive) syncValue(value)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  // Scroll field into view when NumPad opens — prevents the fixed 260px NumPad from covering the active input
  useEffect(() => {
    if (!isActive || !divRef.current) return
    const el = divRef.current
    const t = setTimeout(() => {
      const rect = el.getBoundingClientRect()
      const numPadHeight = 264 // 40px label bar + 4 rows × 54px keys + buffer
      const margin = 24
      const visibleBottom = window.innerHeight - numPadHeight - margin
      if (rect.bottom > visibleBottom) {
        window.scrollBy({ top: rect.bottom - visibleBottom, behavior: 'smooth' })
      }
    }, 60)
    return () => clearTimeout(t)
  }, [isActive])

  // Close numpad if this field unmounts while active (page navigation)
  useEffect(() => {
    return () => {
      if (useNumPadStore.getState().fieldId === fieldId) {
        useNumPadStore.getState().close()
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleOpen = () => {
    if (disabled) return
    openPad({ fieldId, value, onChange, maxLength, masked, hasDecimal, label, placeholder })
  }

  const display = value
    ? (masked ? '●'.repeat(value.length) : value)
    : ''

  return (
    <div ref={divRef} className={cn('w-full', className)}>
      {label && (
        <label className="block text-sm font-medium text-ink mb-1.5">
          {label}
        </label>
      )}

      <div
        role="textbox"
        aria-label={label}
        aria-readonly="false"
        aria-disabled={disabled}
        tabIndex={disabled ? -1 : 0}
        className={cn(
          'relative w-full h-11 flex items-center px-3.5 rounded-xl border text-sm cursor-pointer',
          'bg-surface-1 transition-all select-none',
          isActive
            ? 'ring-2 ring-brand-500 border-transparent'
            : 'border-border',
          error && !isActive && 'border-danger',
          disabled && 'opacity-50 bg-surface-2 cursor-not-allowed',
          prefix && 'pl-9',
        )}
        onClick={handleOpen}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleOpen() }}
      >
        {prefix && (
          <span className="absolute left-3 flex items-center pointer-events-none text-ink-faint">
            {prefix}
          </span>
        )}
        <span className={display ? 'text-ink' : 'text-ink-faint'}>
          {display || placeholder || ''}
        </span>
      </div>

      {error  && <p className="mt-1.5 text-xs text-danger">{error}</p>}
      {!error && hint && <p className="mt-1.5 text-xs text-ink-faint">{hint}</p>}
    </div>
  )
}
