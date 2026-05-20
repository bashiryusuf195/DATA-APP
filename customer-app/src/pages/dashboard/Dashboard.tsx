import { Link } from 'react-router-dom'
import { Phone, Wifi, Zap, Tv, FileText, ShieldCheck, ArrowRight, Bell } from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'
import { useWalletBalance } from '@/hooks/useWallet'
import { useTransactions } from '@/hooks/useTransactions'
import { useNotifications } from '@/hooks/useNotifications'
import { WalletBalanceCard } from '@/components/shared/WalletBalanceCard'
import { TransactionCard } from '@/components/shared/TransactionCard'
import { ServiceCard } from '@/components/shared/ServiceCard'
import { KycBanner } from '@/components/shared/KycBanner'
import { Skeleton } from '@/components/ui'
import { EmptyState } from '@/components/shared/EmptyState'

const SERVICES = [
  { to: '/services/airtime',     label: 'Airtime',   icon: Phone,       color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
  { to: '/services/data',        label: 'Data',      icon: Wifi,        color: 'text-blue-600',    bgColor: 'bg-blue-50' },
  { to: '/services/electricity', label: 'Electricity',icon: Zap,       color: 'text-amber-600',   bgColor: 'bg-amber-50' },
  { to: '/services/cable-tv',    label: 'Cable TV',  icon: Tv,          color: 'text-purple-600',  bgColor: 'bg-purple-50' },
  { to: '/services/exam-pin',    label: 'Exam PIN',  icon: FileText,    color: 'text-rose-600',    bgColor: 'bg-rose-50' },
  { to: '/services/identity',    label: 'Identity',  icon: ShieldCheck, color: 'text-indigo-600',  bgColor: 'bg-indigo-50' },
]

export function DashboardPage() {
  const user = useAuthStore((s) => s.user)
  const { data: balance, isLoading: balanceLoading } = useWalletBalance()
  const { data: txData, isLoading: txLoading } = useTransactions({ limit: 5 })
  const { data: notifData } = useNotifications({ limit: 1 })

  const firstName = user?.first_name ?? user?.email?.split('@')[0] ?? 'there'
  const unread    = notifData?.unread_count ?? 0
  const recentTxs = txData?.data ?? []

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div className="flex items-center justify-between pt-2">
        <div>
          <p className="text-ink-muted text-sm">Good day,</p>
          <h1 className="text-xl font-bold text-ink">Hi, {firstName} 👋</h1>
        </div>
        <Link to="/notifications" className="relative p-2 rounded-xl bg-surface-1 border border-border hidden md:flex">
          <Bell className="h-5 w-5 text-ink-muted" />
          {unread > 0 && (
            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-danger" />
          )}
        </Link>
      </div>

      {/* KYC banner */}
      <KycBanner />

      {/* Wallet balance */}
      <WalletBalanceCard
        balance={balance?.balance}
        currency={balance?.currency}
        isLoading={balanceLoading}
      />

      {/* Quick services */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-ink">Quick Services</p>
          <Link to="/services" className="text-xs text-brand-600 hover:underline flex items-center gap-0.5">
            All <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          {SERVICES.map((s) => (
            <ServiceCard key={s.to} {...s} />
          ))}
        </div>
      </div>

      {/* Recent transactions */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-ink">Recent Transactions</p>
          <Link to="/transactions" className="text-xs text-brand-600 hover:underline flex items-center gap-0.5">
            See all <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        <div className="bg-surface-1 rounded-2xl border border-border overflow-hidden">
          {txLoading ? (
            <div className="p-4 space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-xl" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          ) : recentTxs.length > 0 ? (
            <div className="divide-y divide-border">
              {recentTxs.map((tx) => (
                <TransactionCard key={tx.id} tx={tx} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={ArrowRight}
              title="No transactions yet"
              description="Your transaction history will appear here."
            />
          )}
        </div>
      </div>
    </div>
  )
}
