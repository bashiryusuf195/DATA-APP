import { Link } from 'react-router-dom'
import { Plus, ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import { useWalletBalance, useWalletLedger } from '@/hooks/useWallet'
import { WalletBalanceCard } from '@/components/shared/WalletBalanceCard'
import { Skeleton, Button } from '@/components/ui'
import { EmptyState } from '@/components/shared/EmptyState'
import { fmtCurrency, fmtDateTime } from '@/utils/format'
import { cn } from '@/utils/cn'

export function WalletPage() {
  const { data: balance, isLoading: balanceLoading } = useWalletBalance()
  const { data: ledger,  isLoading: ledgerLoading  } = useWalletLedger({ limit: 20 })

  return (
    <div className="space-y-5 pt-1">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-ink">Wallet</h1>
        <Link to="/wallet/fund">
          <Button size="sm" icon={<Plus className="h-4 w-4" />} className="rounded-2xl shadow-brand">
            Add Money
          </Button>
        </Link>
      </div>

      {/* Desktop: balance card left, ledger right; Mobile: stacked */}
      <div className="lg:grid lg:grid-cols-[2fr_3fr] lg:gap-6 lg:items-start space-y-5 lg:space-y-0">

        {/* Balance card */}
        <div>
          <WalletBalanceCard
            balance={balance?.balance}
            currency={balance?.currency}
            isLoading={balanceLoading}
          />

          {/* Quick stats (desktop only) */}
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

        {/* Ledger */}
        <div>
          <p className="text-sm font-bold text-ink mb-3">Wallet History</p>
          <div className="bg-surface-1 rounded-3xl overflow-hidden shadow-card border border-border">
            {ledgerLoading ? (
              <div className="p-4 space-y-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3.5 w-40" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-4 w-20" />
                  </div>
                ))}
              </div>
            ) : ledger?.data.length ? (
              <div className="divide-y divide-border">
                {ledger.data.map((entry) => {
                  const Icon = entry.type === 'credit' ? ArrowDownLeft : ArrowUpRight
                  return (
                    <div key={entry.id} className="flex items-center gap-3.5 py-3.5 px-4">
                      <div className={cn(
                        'h-10 w-10 rounded-full flex items-center justify-center shrink-0',
                        entry.type === 'credit' ? 'bg-teal-100' : 'bg-surface-2'
                      )}>
                        <Icon className={cn('h-4.5 w-4.5', entry.type === 'credit' ? 'text-teal-600' : 'text-ink-muted')} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-ink truncate">{entry.description}</p>
                        <p className="text-xs text-ink-faint mt-0.5">{fmtDateTime(entry.created_at)}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={cn(
                          'text-sm font-bold',
                          entry.type === 'credit' ? 'text-success' : 'text-danger'
                        )}>
                          {entry.type === 'credit' ? '+' : '-'}{fmtCurrency(entry.amount)}
                        </p>
                        <p className="text-[10px] text-ink-faint">{fmtCurrency(entry.balance_after)}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <EmptyState
                icon={ArrowDownLeft}
                title="No wallet activity"
                description="Transactions will appear here after you fund your wallet."
              />
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
