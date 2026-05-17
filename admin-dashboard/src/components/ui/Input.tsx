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
          className="block text-xs font-medium text-ink-muted mb-1.5"
        >
          {label}
        </label>
      )}
      <div className="relative flex items-center">
        {prefix && (
          <span className="absolute left-3 text-ink-faint pointer-events-none">
            {prefix}
          </span>
        )}
        <input
          id={inputId}
          {...props}
          className={cn(
            'w-full rounded-lg border bg-surface-2 text-ink text-sm',
            'px-3 py-2 placeholder:text-ink-faint',
            'focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent',
            'transition-colors duration-150',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            error ? 'border-rose-500' : 'border-border',
            prefix && 'pl-9',
            suffix && 'pr-9',
            className
          )}
        />
        {suffix && (
          <span className="absolute right-3 text-ink-faint pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-rose-400">{error}</p>}
      {hint && !error && <p className="mt-1 text-xs text-ink-faint">{hint}</p>}
    </div>
  )
}
