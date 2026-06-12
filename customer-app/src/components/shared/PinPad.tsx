import { cn } from '@/utils/cn'

interface PinPadProps {
  value:      string
  onChange:   (v: string) => void
  maxLength?: 4 | 6
  disabled?:  boolean
}

/**
 * Inline PIN entry pad — renders dots + key grid directly inside a Modal.
 * Not the global fixed NumPad; safe to use at any z-index level.
 */
export function PinPad({ value, onChange, maxLength = 6, disabled = false }: PinPadProps) {
  const press = (key: string) => {
    if (disabled) return
    if (key === 'del') {
      onChange(value.slice(0, -1))
      return
    }
    if (value.length >= maxLength) return
    onChange(value + key)
  }

  // Always shows `maxLength` dots (filled = entered, empty = pending)
  const dots = Array.from({ length: maxLength }, (_, i) => i < value.length)

  const KEYS = ['1','2','3','4','5','6','7','8','9','_','0','del']

  return (
    <div className="space-y-5 select-none">
      {/* Dot indicators */}
      <div className="flex items-center justify-center gap-4">
        {dots.map((filled, i) => (
          <div
            key={i}
            className={cn(
              'h-3 w-3 rounded-full transition-all duration-150',
              filled
                ? 'bg-brand-600 scale-110 shadow-sm shadow-brand-600/40'
                : 'bg-border',
            )}
          />
        ))}
      </div>

      {/* Key grid */}
      <div className="grid grid-cols-3 gap-3">
        {KEYS.map((key, i) => {
          if (key === '_') return <div key={i} />

          return (
            <button
              key={key}
              type="button"
              onPointerDown={(e) => { e.preventDefault(); press(key) }}
              disabled={disabled}
              className={cn(
                'flex items-center justify-center h-14 rounded-2xl text-xl font-medium transition-all',
                'active:scale-95 focus:outline-none',
                key === 'del'
                  ? 'bg-surface-0 dark:bg-surface-1 text-ink-muted active:bg-surface-2'
                  : 'bg-surface-2 dark:bg-surface-1 text-ink hover:bg-surface-elevated active:bg-surface-0',
                disabled && 'opacity-40',
              )}
            >
              {key === 'del'
                ? <span className="text-xl leading-none">⌫</span>
                : key}
            </button>
          )
        })}
      </div>
    </div>
  )
}
