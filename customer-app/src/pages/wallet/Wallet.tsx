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
  const { data: ledger, isLoading: ledgerLoading } = useWalletLedger({ limit: 20 })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between pt-2">
        <h1 className="text-xl font-bold text-ink">Wallet</h1>
        <Link to="/wallet/fund">
          <Button size="sm" icon={<Plus className="h-4 w-4" />}>Add Money</Button>
        </Link>
      </div>

      <WalletBalanceCard
        balance={balance?.balance}
        currency={balance?.currency}
        isLoading={balanceLoading}
      />

      {/* Ledger */}
      <div>
        <p className="text-sm font-semibold text-ink mb-3">Wallet History</p>
        <div className="bg-surface-1 rounded-2xl border border-border overflow-hidden">
          {ledgerLoading ? (
            <div className="p-4 space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-9 w-9 rounded-xl" />
                  <div className="flex-1 space-y-1.5"><Skeleton className="h-3.5 w-40" /><Skeleton className="h-3 w-24" /></div>
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
                    <div className={cn('h-9 w-9 rounded-xl flex items-center justify-center shrink-0', entry.type === 'credit' ? 'bg-success-light' : 'bg-surface-2')}>
                      <Icon className={cn('h-4 w-4', entry.type === 'credit' ? 'text-success' : 'text-ink-muted')} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-ink truncate">{entry.description}</p>
                      <p className="text-xs text-ink-faint mt-0.5">{fmtDateTime(entry.created_at)}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={cn('text-sm font-semibold', entry.type === 'credit' ? 'text-success' : 'text-ink')}>
                        {entry.type === 'credit' ? '+' : '-'}{fmtCurrency(entry.amount)}
                      </p>
                      <p className="text-[10px] text-ink-faint">{fmtCurrency(entry.balance_after)}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <EmptyState icon={ArrowDownLeft} title="No wallet activity" description="Transactions will appear here after you fund your wallet." />
          )}
        </div>
      </div>
    </div>
  )
}
