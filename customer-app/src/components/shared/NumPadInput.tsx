import { useId } from 'react'
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
 * Native numeric input — replaces the old custom on-screen NumPad.
 * Uses a real <input> so the device keyboard, paste, and autofill all work normally.
 */
export function NumPadInput({
  value, onChange, label, placeholder, maxLength,
  masked = false, hasDecimal = false,
  error, hint, prefix, disabled = false, className,
}: NumPadInputProps) {
  const fieldId = useId()

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    let v = e.target.value
    // Strip anything that isn't a digit (and a single decimal point, if allowed)
    v = hasDecimal ? v.replace(/[^\d.]/g, '') : v.replace(/\D/g, '')
    if (hasDecimal) {
      const firstDot = v.indexOf('.')
      if (firstDot !== -1) {
        v = v.slice(0, firstDot + 1) + v.slice(firstDot + 1).replace(/\./g, '')
      }
    }
    if (maxLength) v = v.slice(0, maxLength)
    onChange(v)
  }

  return (
    <div className={cn('w-full', className)}>
      {label && (
        <label htmlFor={fieldId} className="block text-sm font-medium text-ink mb-1.5">
          {label}
        </label>
      )}

      <div className="relative w-full">
        {prefix && (
          <span className="absolute left-3 inset-y-0 flex items-center pointer-events-none text-ink-faint">
            {prefix}
          </span>
        )}
        <input
          id={fieldId}
          type={masked ? 'password' : hasDecimal ? 'text' : 'tel'}
          inputMode={hasDecimal ? 'decimal' : 'numeric'}
          pattern={hasDecimal ? undefined : '[0-9]*'}
          value={value}
          onChange={handleChange}
          placeholder={placeholder}
          maxLength={maxLength}
          disabled={disabled}
          className={cn(
            'w-full h-11 px-3.5 rounded-xl border text-sm bg-surface-1 transition-all',
            'text-ink placeholder:text-ink-faint',
            'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent',
            error && 'border-danger',
            disabled && 'opacity-50 bg-surface-2 cursor-not-allowed',
            prefix && 'pl-9',
          )}
        />
      </div>

      {error  && <p className="mt-1.5 text-xs text-danger">{error}</p>}
      {!error && hint && <p className="mt-1.5 text-xs text-ink-faint">{hint}</p>}
    </div>
  )
}