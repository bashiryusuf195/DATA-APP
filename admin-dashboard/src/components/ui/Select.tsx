import { cn } from '@/utils/cn'
import type { SelectHTMLAttributes } from 'react'

interface SelectOption {
  value: string
  label: string
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  options: SelectOption[]
  placeholder?: string
}

export function Select({
  label,
  error,
  options,
  placeholder,
  className,
  id,
  ...props
}: SelectProps) {
  const selectId = id ?? label?.toLowerCase().replace(/\s+/g, '-')

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={selectId}
          className="block text-xs font-medium text-ink-muted mb-1.5"
        >
          {label}
        </label>
      )}
      <select
        id={selectId}
        {...props}
        className={cn(
          'w-full rounded-lg border bg-surface-2 text-ink text-sm',
          'px-3 py-2',
          'focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent',
          'transition-colors duration-150',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          error ? 'border-rose-500' : 'border-border',
          className
        )}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error && <p className="mt-1 text-xs text-rose-400">{error}</p>}
    </div>
  )
}
