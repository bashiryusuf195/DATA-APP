import { Link } from 'react-router-dom'
import { Eye, EyeOff, Plus, ArrowRightLeft } from 'lucide-react'
import { useState } from 'react'
import { fmtCurrency } from '@/utils/format'
import { Skeleton } from '@/components/ui'
import { cn } from '@/utils/cn'

interface WalletBalanceCardProps {
  balance?: number
  currency?: string
  isLoading?: boolean
}

export function WalletBalanceCard({ balance, currency = 'NGN', isLoading }: WalletBalanceCardProps) {
  const [hidden, setHidden] = useState(false)

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 p-5 text-white shadow-lg shadow-brand-600/25">
      {/* Background decoration */}
      <div className="absolute top-0 right-0 h-32 w-32 rounded-full bg-white/5 -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 h-24 w-24 rounded-full bg-white/5 translate-y-1/2 -translate-x-1/2" />

      <div className="relative">
        <div className="flex items-center justify-between mb-4">
          <p className="text-white/70 text-sm font-medium">Wallet Balance</p>
          <button
            onClick={() => setHidden((h) => !h)}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            aria-label={hidden ? 'Show balance' : 'Hide balance'}
          >
            {hidden ? (
              <EyeOff className="h-4 w-4 text-white/70" />
            ) : (
              <Eye className="h-4 w-4 text-white/70" />
            )}
          </button>
        </div>

        {isLoading ? (
          <Skeleton className="h-9 w-40 bg-white/20 mb-6" />
        ) : (
          <p className={cn('text-3xl font-bold tracking-tight mb-6', hidden && 'blur-md select-none')}>
            {fmtCurrency(balance ?? 0, currency)}
          </p>
        )}

        <div className="flex gap-3">
          <Link
            to="/wallet/fund"
            className="flex-1 flex items-center justify-center gap-2 bg-white text-brand-700 font-semibold text-sm rounded-xl py-2.5 hover:bg-brand-50 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Money
          </Link>
          <Link
            to="/wallet"
            className="flex-1 flex items-center justify-center gap-2 bg-white/15 text-white font-semibold text-sm rounded-xl py-2.5 hover:bg-white/20 transition-colors"
          >
            <ArrowRightLeft className="h-4 w-4" />
            History
          </Link>
        </div>
      </div>
    </div>
  )
}
