import { cn } from '@/utils/cn'
import type { InputHTMLAttributes, ReactNode } from 'react'

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  label?: string
  error?: string
  hint?: string
  prefix?: ReactNode
  suffix?: ReactNode
}

export function Input({
  label,
  error,
  hint,
  prefix,
  suffix,
  className,
  id,
  ...props
}: InputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={inputId}
          className="block text-sm font-medium text-ink mb-1.5"
        >
          {label}
        </label>
      )}

      <div className="relative flex items-center">
        {prefix && (
          <div className="absolute left-3 flex items-center pointer-events-none text-ink-faint">
            {prefix}
          </div>
        )}

        <input
          id={inputId}
          className={cn(
            'w-full rounded-xl border bg-surface-1 text-ink placeholder:text-ink-faint',
            'h-11 px-3.5 text-sm transition-colors',
            'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent',
            'disabled:opacity-50 disabled:bg-surface-2 disabled:cursor-not-allowed',
            error ? 'border-danger' : 'border-border',
            prefix && 'pl-9',
            suffix && 'pr-9',
            className
          )}
          {...props}
        />

        {suffix && (
          <div className="absolute right-3 flex items-center text-ink-faint">
            {suffix}
          </div>
        )}
      </div>

      {error && (
        <p className="mt-1.5 text-xs text-danger">{error}</p>
      )}
      {hint && !error && (
        <p className="mt-1.5 text-xs text-ink-muted">{hint}</p>
      )}
    </div>
  )
}
