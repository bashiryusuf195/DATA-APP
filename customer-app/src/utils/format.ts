const NGN = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function fmtCurrency(
  // Accept unknown so call sites passing raw API values don't silently produce NaN
  amount: number | string | null | undefined,
  currency = 'NGN'
): string {
  if (amount == null) return '₦0.00'
  const n = typeof amount === 'number' ? amount : Number(amount)
  if (isNaN(n)) return '₦0.00'
  if (currency === 'NGN') return NGN.format(n)
  return new Intl.NumberFormat('en', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(n)
}

export function fmtDate(iso: string): string {
  return new Intl.DateTimeFormat('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso))
}

export function fmtDateTime(iso: string): string {
  return new Intl.DateTimeFormat('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

export function fmtRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins  = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days  = Math.floor(diff / 86_400_000)
  if (mins  < 1)  return 'just now'
  if (mins  < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days  < 7)  return `${days}d ago`
  return fmtDate(iso)
}

export function fmtPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('0')) {
    return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`
  }
  return phone
}

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length >= 7) {
    return `${digits.slice(0, 4)}****${digits.slice(-4)}`
  }
  return phone
}

export function truncate(str: string, max: number): string {
  return str.length > max ? `${str.slice(0, max)}…` : str
}

// Maps backend DB status values (and any legacy/provider aliases) to the three
// UI states used by ResultModal and toast notifications.
// DB canonical: 'successful' | 'failed' | 'pending' | 'processing' | 'refunded'
// Legacy/provider aliases: 'success', 'completed', 'fail'
export function normalizeTransactionStatus(
  status: string | null | undefined
): 'success' | 'failed' | 'pending' | 'review' {
  switch (status) {
    case 'successful':
    case 'success':
    case 'completed':
      return 'success'
    case 'failed':
    case 'fail':
      return 'failed'
    case 'requires_review':
      return 'review'
    default:
      return 'pending' // covers: pending, processing, refunded, undefined
  }
}
