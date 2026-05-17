import { format, formatDistanceToNow, parseISO } from 'date-fns'

export function fmtCurrency(amount: number | string | null | undefined, currency = 'NGN'): string {
  if (amount === null || amount === undefined) return '₦0.00'
  const n = typeof amount === 'string' ? parseFloat(amount) : amount
  if (isNaN(n)) return '₦0.00'
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(n)
}

/** Uppercase a service type / status string safely. */
export function formatStatus(value: string | null | undefined): string {
  return String(value ?? 'unknown').toUpperCase()
}

/** Title-case a provider code or name safely. */
export function formatProvider(value: string | null | undefined): string {
  const s = String(value ?? 'unknown')
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}

/** Currency alias that accepts nullable amounts (same as fmtCurrency). */
export const formatCurrency = fmtCurrency

export function fmtNumber(n: number | string): string {
  return new Intl.NumberFormat('en-NG').format(Number(n))
}

export function fmtDate(date: string | Date | null | undefined): string {
  if (!date) return '—'
  try {
    const d = typeof date === 'string' ? parseISO(date) : date
    return format(d, 'dd MMM yyyy, HH:mm')
  } catch {
    return '—'
  }
}

export function fmtDateShort(date: string | Date | null | undefined): string {
  if (!date) return '—'
  try {
    const d = typeof date === 'string' ? parseISO(date) : date
    return format(d, 'dd MMM yyyy')
  } catch {
    return '—'
  }
}

export function fmtRelative(date: string | Date | null | undefined): string {
  if (!date) return '—'
  try {
    const d = typeof date === 'string' ? parseISO(date) : date
    return formatDistanceToNow(d, { addSuffix: true })
  } catch {
    return '—'
  }
}

export function fmtLatency(ms: number | null): string {
  if (ms === null) return '—'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

export function fmtPercent(value: number, total: number): string {
  if (total === 0) return '0%'
  return `${((value / total) * 100).toFixed(1)}%`
}

export function truncate(str: string | null | undefined, max = 24): string {
  const s = str ?? ''
  if (s.length <= max) return s
  return s.slice(0, max) + '…'
}
