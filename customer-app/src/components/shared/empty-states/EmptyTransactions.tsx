import { Link } from 'react-router-dom'
import { Wifi } from 'lucide-react'

function ReceiptIllustration() {
  return (
    <svg viewBox="0 0 48 48" className="w-11 h-11" fill="none" aria-hidden="true">
      {/* Receipt body */}
      <rect
        x="9" y="5" width="24" height="34" rx="3"
        className="fill-brand-100 dark:fill-brand-900/50"
        strokeWidth="1.5"
        stroke="currentColor"
        style={{ color: 'var(--stroke-color)' }}
      />
      {/* Top coloured band */}
      <rect x="9" y="5" width="24" height="8" rx="3"
        className="fill-brand-600 dark:fill-brand-500" />
      <rect x="9" y="9" width="24" height="4"
        className="fill-brand-600 dark:fill-brand-500" />
      {/* White logo dot on band */}
      <circle cx="21" cy="9" r="2.5" className="fill-white/30" />
      {/* Content lines — decreasing width to look "empty" */}
      <rect x="14" y="19" width="14" height="2.5" rx="1.25"
        className="fill-brand-200 dark:fill-brand-700/60" />
      <rect x="14" y="24" width="10" height="2.5" rx="1.25"
        className="fill-brand-200/70 dark:fill-brand-700/40" />
      <rect x="14" y="29" width="7" height="2.5" rx="1.25"
        className="fill-brand-200/50 dark:fill-brand-700/30" />
      {/* Dashed separator */}
      <line x1="13" y1="34.5" x2="29" y2="34.5"
        className="stroke-brand-200 dark:stroke-brand-700"
        strokeWidth="1" strokeDasharray="2.5 2" />
      {/* Bottom wave (receipt tear) */}
      <path d="M9 38 L11 36 L13 38 L15 36 L17 38 L19 36 L21 38 L23 36 L25 38 L27 36 L29 38 L31 36 L33 38"
        className="stroke-brand-300 dark:stroke-brand-700"
        strokeWidth="1.2" strokeLinecap="round" fill="none" />

      {/* Coin badge — offset top-right for visual interest */}
      <circle cx="36" cy="13" r="8"
        className="fill-surface-1 dark:fill-surface-1 stroke-brand-200 dark:stroke-brand-800"
        strokeWidth="1.5" />
      <circle cx="36" cy="13" r="5.5"
        className="fill-brand-600 dark:fill-brand-500" />
      {/* ₦ represented as two vertical bars + two horizontals */}
      <line x1="34.2" y1="10.5" x2="34.2" y2="15.5"
        stroke="white" strokeWidth="1.3" strokeLinecap="round" />
      <line x1="37.8" y1="10.5" x2="37.8" y2="15.5"
        stroke="white" strokeWidth="1.3" strokeLinecap="round" />
      <line x1="33.2" y1="12.2" x2="38.8" y2="12.2"
        stroke="white" strokeWidth="1.1" strokeLinecap="round" />
      <line x1="33.2" y1="13.8" x2="38.8" y2="13.8"
        stroke="white" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  )
}

interface EmptyTransactionsProps {
  filtered?: boolean
  onClear?: () => void
}

export function EmptyTransactions({ filtered, onClear }: EmptyTransactionsProps) {
  if (filtered) {
    return (
      <div className="flex flex-col items-center justify-center py-14 px-6 text-center select-none">
        <div className="relative mb-5">
          <div className="absolute inset-0 rounded-full bg-ink-faint/10 blur-3xl scale-[2] pointer-events-none" />
          <div className="relative h-20 w-20 rounded-3xl bg-surface-2 border border-border flex items-center justify-center shadow-card">
            <ReceiptIllustration />
          </div>
        </div>
        <h3 className="text-lg font-black text-ink mb-1.5">No Matching Transactions</h3>
        <p className="text-sm text-ink-muted leading-relaxed max-w-[240px] mb-5">
          No transactions match your current filters. Try adjusting or clearing them.
        </p>
        {onClear && (
          <button
            onClick={onClear}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-surface-2 border border-border text-sm font-semibold text-ink hover:bg-border transition-colors"
          >
            Clear Filters
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center py-14 px-6 text-center select-none">
      {/* Ambient glow */}
      <div className="relative mb-6">
        <div className="absolute inset-0 rounded-full bg-brand-400/12 dark:bg-brand-500/8 blur-3xl scale-[2.4] pointer-events-none" />
        <div className="relative h-[88px] w-[88px] rounded-3xl bg-gradient-to-br from-brand-50 to-brand-100 dark:from-brand-950/50 dark:to-brand-900/30 border border-brand-100 dark:border-brand-900/40 shadow-card flex items-center justify-center">
          <ReceiptIllustration />
        </div>
        {/* Decorative dots */}
        <span className="absolute -top-1.5 -right-1.5 h-3 w-3 rounded-full bg-brand-400/40 dark:bg-brand-500/30" />
        <span className="absolute -bottom-1 -left-2 h-2 w-2 rounded-full bg-brand-300/50 dark:bg-brand-600/30" />
      </div>

      <h3 className="text-xl font-black text-ink mb-2">No Transactions Yet</h3>
      <p className="text-sm text-ink-muted leading-relaxed max-w-[260px] mb-6">
        Your purchases will appear here. Start by buying data or airtime.
      </p>

      <Link
        to="/services/data"
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-brand-600 text-white text-sm font-bold hover:bg-brand-700 active:scale-[0.98] transition-all shadow-brand"
      >
        <Wifi className="h-4 w-4" />
        Buy Data
      </Link>
    </div>
  )
}
