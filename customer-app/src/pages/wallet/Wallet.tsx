import { Link } from 'react-router-dom'
import { Plus, ArrowDownToLine } from 'lucide-react'
import { useWalletBalance } from '@/hooks/useWallet'
import { WalletBalanceCard } from '@/components/shared/WalletBalanceCard'
import { DedicatedAccountCard, QuickTransferCard } from '@/components/shared/FundingCarousel'
import { Button } from '@/components/ui'
import { fmtCurrency } from '@/utils/format'

export function WalletPage() {
  const { data: balance, isLoading: balanceLoading } = useWalletBalance()

  return (
    <div className="space-y-5 pt-1">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-ink">Wallet</h1>
        <div className="flex items-center gap-2">
          <Link to="/wallet/withdraw">
            <Button
              size="sm"
              variant="outline"
              icon={<ArrowDownToLine className="h-4 w-4" />}
              className="rounded-2xl"
            >
              Withdraw
            </Button>
          </Link>
          <Link to="/wallet/fund">
            <Button size="sm" icon={<Plus className="h-4 w-4" />} className="rounded-2xl shadow-brand">
              Add Money
            </Button>
          </Link>
        </div>
      </div>

      {/* Desktop: balance left, funding cards right — Mobile: stacked */}
      <div className="lg:grid lg:grid-cols-[2fr_3fr] lg:gap-6 lg:items-start space-y-5 lg:space-y-0">

        {/* Balance card */}
        <div>
          <WalletBalanceCard
            balance={balance?.balance}
            currency={balance?.currency}
            isLoading={balanceLoading}
          />

          {/* Quick stats strip — desktop only */}
          {!balanceLoading && balance && (
            <div className="hidden lg:grid grid-cols-2 gap-3 mt-4">
              <div className="bg-surface-1 rounded-2xl p-4 shadow-card border border-border text-center">
                <p className="text-xs font-semibold text-ink-faint uppercase tracking-wide mb-1">Available</p>
                <p className="text-lg font-bold text-ink">{fmtCurrency(balance.balance, balance.currency)}</p>
              </div>
              <div className="bg-brand-50 dark:bg-brand-950/30 rounded-2xl p-4 border border-brand-200 dark:border-brand-800 text-center">
                <p className="text-xs font-semibold text-brand-600 dark:text-brand-400 uppercase tracking-wide mb-1">Currency</p>
                <p className="text-lg font-bold text-brand-700 dark:text-brand-300">{balance.currency}</p>
              </div>
            </div>
          )}
        </div>

        {/* Funding cards — shown directly (no carousel) */}
        <div className="space-y-4">
          <div className="bg-surface-1 rounded-3xl p-4 shadow-card border border-border min-h-[180px] lm-funding-card">
            <DedicatedAccountCard />
          </div>
          <div className="bg-surface-1 rounded-3xl p-4 shadow-card border border-border min-h-[180px] lm-funding-card">
            <QuickTransferCard />
          </div>
        </div>

      </div>
    </div>
  )
}
