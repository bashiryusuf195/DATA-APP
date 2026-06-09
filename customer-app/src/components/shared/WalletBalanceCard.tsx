import { Link } from 'react-router-dom'
import { Eye, EyeOff, Plus, ArrowDownLeft } from 'lucide-react'
import { fmtCurrency } from '@/utils/format'
import { Skeleton } from '@/components/ui'
import { cn } from '@/utils/cn'
import { useBalanceVisibility } from '@/hooks/useBalanceVisibility'

interface WalletBalanceCardProps {
  balance?: number
  currency?: string
  isLoading?: boolean
}

export function WalletBalanceCard({ balance, currency = 'NGN', isLoading }: WalletBalanceCardProps) {
  const { hidden, toggle: toggleBalanceHidden } = useBalanceVisibility()

  return (
    <div className="relative overflow-hidden rounded-3xl p-5 text-white shadow-wallet wallet-card-shimmer ring-1 ring-inset ring-white/10"
      style={{ background: 'linear-gradient(135deg, #1E4E7E 0%, #163A5E 100%)' }}>
      {/* Decorative circles */}
      <div className="absolute -top-8 -right-8 h-28 w-28 rounded-full bg-white/5" />
      <div className="absolute -bottom-6 -left-6 h-20 w-20 rounded-full bg-white/5" />

      <div className="relative">
        {/* Top row */}
        <div className="flex items-center justify-between mb-1">
          <p className="text-white/70 text-xs font-medium tracking-wide uppercase">Current Balance</p>
          <button
            onClick={toggleBalanceHidden}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            aria-label={hidden ? 'Show balance' : 'Hide balance'}
          >
            {hidden
              ? <EyeOff className="h-4 w-4 text-white/60" />
              : <Eye    className="h-4 w-4 text-white/60" />}
          </button>
        </div>

        {/* Balance — skeleton-on-dark overrides shimmer colours for the navy card */}
        {isLoading ? (
          <div className="skeleton-on-dark mb-5 mt-1">
            <Skeleton className="h-10 w-44 rounded-xl" />
          </div>
        ) : (
          <p className={cn('text-4xl font-bold tracking-tight mb-5 mt-1', hidden && 'blur-md select-none')}>
            {fmtCurrency(balance ?? 0, currency)}
          </p>
        )}

        {/* Action buttons */}
        <div className="flex gap-3">
          <Link
            to="/wallet/fund"
            className="flex-1 flex items-center justify-center gap-2 bg-white text-wallet font-semibold text-sm rounded-2xl py-2.5 hover:bg-blue-50 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Money
          </Link>
          <Link
            to="/wallet"
            className="flex-1 flex items-center justify-center gap-2 bg-white/15 border border-white/25 text-white font-semibold text-sm rounded-2xl py-2.5 hover:bg-white/20 transition-colors"
          >
            <ArrowDownLeft className="h-4 w-4" />
            Withdraw
          </Link>
        </div>
      </div>
    </div>
  )
}
