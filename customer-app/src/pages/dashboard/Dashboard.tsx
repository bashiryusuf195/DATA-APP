import { Link } from 'react-router-dom'
import {
  Phone, Wifi, Zap, Tv, ShieldCheck, Building2,
  Bell, ArrowRight, Gift, Copy, CheckCheck, Sun, Moon,
} from 'lucide-react'
import { useState } from 'react'
import { useAuthStore } from '@/store/auth.store'
import { useThemeStore } from '@/store/theme.store'
import { useWalletBalance, useDedicatedAccount } from '@/hooks/useWallet'
import { useTransactions } from '@/hooks/useTransactions'
import { useNotifications } from '@/hooks/useNotifications'
import { WalletBalanceCard } from '@/components/shared/WalletBalanceCard'
import { TransactionCard } from '@/components/shared/TransactionCard'
import { KycBanner } from '@/components/shared/KycBanner'
import { Skeleton } from '@/components/ui'
import { EmptyState } from '@/components/shared/EmptyState'
import { fmtCurrency } from '@/utils/format'
import { cn } from '@/utils/cn'

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

const QUICK_ACTIONS = [
  { to: '/services/airtime',     label: 'Airtime',     icon: Phone,       color: 'text-emerald-600', bg: 'bg-emerald-50' },
  { to: '/services/data',        label: 'Data',        icon: Wifi,        color: 'text-blue-600',    bg: 'bg-blue-50'    },
  { to: '/services/electricity', label: 'Electricity', icon: Zap,         color: 'text-amber-600',   bg: 'bg-amber-50'   },
  { to: '/services/cable-tv',    label: 'Cable TV',    icon: Tv,          color: 'text-purple-600',  bg: 'bg-purple-50'  },
  { to: '/services/exam-pin',    label: 'Exam PIN',    icon: ShieldCheck, color: 'text-rose-600',    bg: 'bg-rose-50'    },
  { to: '/services/identity',    label: 'Identity',    icon: Building2,   color: 'text-indigo-600',  bg: 'bg-indigo-50'  },
]

export function DashboardPage() {
  const user = useAuthStore((s) => s.user)
  const { dark, toggle: toggleDark } = useThemeStore()
  const { data: balance, isLoading: balanceLoading } = useWalletBalance()
  const { data: txData,  isLoading: txLoading }      = useTransactions({ limit: 5 })
  const { data: notifData }                          = useNotifications({ limit: 1 })
  const { data: dva,     isLoading: dvaLoading }     = useDedicatedAccount()
  const [copied, setCopied] = useState(false)

  const firstName = user?.first_name ?? user?.email?.split('@')[0] ?? 'there'
  const unread    = notifData?.unread_count ?? 0
  const recentTxs = txData?.data ?? []

  const initials = [user?.first_name?.[0], user?.last_name?.[0]].filter(Boolean).join('').toUpperCase()
                || (user?.email?.[0] ?? 'U').toUpperCase()

  const handleCopyAccount = () => {
    if (!dva?.account_number) return
    navigator.clipboard.writeText(dva.account_number).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="space-y-5">
      {/* ── Greeting row (desktop only — mobile gets this from AppHeader) ─── */}
      <div className="hidden md:flex items-center justify-between pt-1">
        <div>
          <p className="text-ink-muted text-sm">{getGreeting()},</p>
          <h1 className="text-2xl font-bold text-ink">{firstName} 👋</h1>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={toggleDark}
            className="p-2.5 rounded-2xl bg-surface-1 border border-border hover:bg-surface-2 transition-colors"
            aria-label="Toggle dark mode"
          >
            {dark ? <Sun className="h-5 w-5 text-ink-muted" /> : <Moon className="h-5 w-5 text-ink-muted" />}
          </button>
          <Link to="/notifications" className="relative p-2.5 rounded-2xl bg-surface-1 border border-border hover:bg-surface-2 transition-colors">
            <Bell className="h-5 w-5 text-ink-muted" />
            {unread > 0 && (
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-danger" />
            )}
          </Link>
          <Link to="/profile">
            <div className="h-10 w-10 rounded-full bg-brand-100 flex items-center justify-center border-2 border-brand-200">
              <span className="text-sm font-bold text-brand-700">{initials}</span>
            </div>
          </Link>
        </div>
      </div>

      {/* ── Mobile greeting (below fixed header) ─────────────────────────── */}
      <div className="md:hidden pt-1">
        <p className="text-ink-muted text-sm">{getGreeting()},</p>
        <h1 className="text-xl font-bold text-ink">{firstName} 👋</h1>
      </div>

      {/* ── KYC banner ───────────────────────────────────────────────────── */}
      <KycBanner />

      {/* ── Wallet balance card ───────────────────────────────────────────── */}
      <WalletBalanceCard
        balance={balance?.balance}
        currency={balance?.currency}
        isLoading={balanceLoading}
      />

      {/* ── Deposit Account card ─────────────────────────────────────────── */}
      <div className="bg-surface-1 rounded-3xl p-4 shadow-card">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-bold text-ink">Bank Transfer</p>
          <Link to="/wallet/fund" className="text-xs font-semibold text-brand-600 hover:underline flex items-center gap-0.5">
            Card / USSD <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {dvaLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : dva ? (
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-ink-faint">Bank:</span>
              <span className="font-semibold text-ink">{dva.bank_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-faint">Account Name:</span>
              <span className="font-semibold text-ink">{dva.account_name}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink-faint">Account Number:</span>
              <button
                onClick={handleCopyAccount}
                className="flex items-center gap-1.5 font-bold text-brand-600 hover:text-brand-700 transition-colors"
              >
                <span className="font-mono text-base tracking-wider">{dva.account_number}</span>
                {copied
                  ? <CheckCheck className="h-3.5 w-3.5 text-success" />
                  : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-ink-faint">Account Name:</span>
              <span className="font-semibold text-ink">
                {[user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.username || '—'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink-faint">Add Money:</span>
              <Link to="/wallet/fund" className="flex items-center gap-1.5 text-brand-600 font-semibold hover:underline">
                Fund via Card / Bank <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        )}
        <p className="text-[10px] text-ink-faint mt-3 leading-relaxed">
          Transfer to this account from any bank — your wallet is credited instantly.
        </p>
      </div>

      {/* ── Quick Actions ─────────────────────────────────────────────────── */}
      <div>
        <p className="text-sm font-bold text-ink mb-3">Quick Actions</p>
        <div className="grid grid-cols-3 gap-3">
          {QUICK_ACTIONS.map((s) => (
            <Link
              key={`${s.to}-${s.label}`}
              to={s.to}
              className="flex flex-col items-center gap-2.5 p-3 rounded-2xl bg-surface-1 shadow-card border border-border hover:border-brand-200 active:scale-95 transition-all duration-100"
            >
              <div className={cn('h-11 w-11 rounded-2xl flex items-center justify-center', s.bg)}>
                <s.icon className={cn('h-5 w-5', s.color)} />
              </div>
              <span className="text-[11px] font-semibold text-ink text-center leading-tight">{s.label}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* ── Refer & Earn banner ───────────────────────────────────────────── */}
      <div className="rounded-3xl p-4 flex items-center justify-between gap-3"
        style={{ background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)' }}>
        <div>
          <p className="text-white font-bold text-sm flex items-center gap-1.5">
            <Gift className="h-4 w-4" /> Refer & Earn ₦200
          </p>
          <p className="text-white/80 text-xs mt-0.5">Get ₦200 for every friend you refer</p>
        </div>
        <Link
          to="/referrals"
          className="shrink-0 bg-white text-amber-700 text-xs font-bold px-3.5 py-2 rounded-xl hover:bg-amber-50 transition-colors"
        >
          Get My Link
        </Link>
      </div>

      {/* ── Recent Transactions ───────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-bold text-ink">Recent Transactions</p>
          <Link to="/transactions" className="text-xs font-semibold text-brand-600 hover:underline flex items-center gap-0.5">
            View All <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        <div className="bg-surface-1 rounded-3xl overflow-hidden shadow-card">
          {txLoading ? (
            <div className="p-4 space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
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
