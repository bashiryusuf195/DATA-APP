import { NumPadInput } from '@/components/shared/NumPadInput'
import { cn } from '@/utils/cn'

const QUICK_AMOUNTS = [100, 200, 500, 1000, 2000, 5000]

interface AmountInputProps {
  value:          string
  onChange:       (value: string) => void
  error?:         string
  label?:         string
  min?:           number
  max?:           number
  quickAmounts?:  number[]
}

export function AmountInput({
  value,
  onChange,
  error,
  label = 'Amount (₦)',
  quickAmounts = QUICK_AMOUNTS,
}: AmountInputProps) {
  return (
    <div className="space-y-2">
      <NumPadInput
        label={label}
        value={value}
        onChange={onChange}
        placeholder="0.00"
        hasDecimal
        error={error}
        prefix={<span className="text-sm font-medium text-ink-muted">₦</span>}
      />

      {/* Quick amount chips */}
      <div className="flex flex-wrap gap-2">
        {quickAmounts.map((amt) => (
          <button
            key={amt}
            type="button"
            onClick={() => onChange(String(amt))}
            className={cn(
              'px-3 py-1 rounded-lg text-xs font-medium border transition-colors',
              value === String(amt)
                ? 'bg-brand-600 text-white border-brand-600'
                : 'border-border text-ink-muted hover:border-brand-400 hover:text-brand-600 dark:hover:border-brand-500'
            )}
          >
            ₦{amt >= 1000 ? `${amt / 1000}k` : amt}
          </button>
        ))}
      </div>
    </div>
  )
}
