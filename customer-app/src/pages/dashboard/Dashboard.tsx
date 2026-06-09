import { Link } from 'react-router-dom'
import {
  Phone, Wifi, Zap, Tv, ShieldCheck, Building2,
  Bell, ArrowRight, ArrowLeftRight, Gift, Sun, Moon,
} from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'
import { useThemeStore } from '@/store/theme.store'
import { useWalletBalance } from '@/hooks/useWallet'
import { useTransactions } from '@/hooks/useTransactions'
import { useNotifications } from '@/hooks/useNotifications'
import { WalletBalanceCard } from '@/components/shared/WalletBalanceCard'
import { TransactionCard } from '@/components/shared/TransactionCard'
import { KycBanner } from '@/components/shared/KycBanner'
import { ServiceStatusBanner } from '@/components/shared/ServiceStatusBanner'
import { FundingCarousel } from '@/components/shared/FundingCarousel'
import { Skeleton } from '@/components/ui'
import { EmptyState } from '@/components/shared/EmptyState'
import { cn } from '@/utils/cn'

function getGreetingInfo(): { greeting: string; subtitle: string } {
  const h = new Date().getHours()
  if (h >= 5 && h < 12)  return { greeting: 'Good Morning',   subtitle: 'Ready to power your day?' }
  if (h >= 12 && h < 17) return { greeting: 'Good Afternoon', subtitle: 'Stay connected with Hive Data.' }
  return                         { greeting: 'Good Evening',   subtitle: 'Manage your services with ease.' }
}

const QUICK_ACTIONS = [
  { to: '/services/airtime',     label: 'Airtime',     icon: Phone,       color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950', glow: 'group-hover:shadow-emerald-500/30' },
  { to: '/services/data',        label: 'Data',        icon: Wifi,        color: 'text-blue-600',    bg: 'bg-blue-50 dark:bg-blue-950',       glow: 'group-hover:shadow-blue-500/30'   },
  { to: '/services/electricity', label: 'Electricity', icon: Zap,         color: 'text-amber-600',   bg: 'bg-amber-50 dark:bg-amber-950',     glow: 'group-hover:shadow-amber-500/30'  },
  { to: '/services/cable-tv',    label: 'Cable TV',    icon: Tv,          color: 'text-purple-600',  bg: 'bg-purple-50 dark:bg-purple-950',   glow: 'group-hover:shadow-purple-500/30' },
  { to: '/services/exam-pin',    label: 'Exam PIN',    icon: ShieldCheck, color: 'text-rose-600',    bg: 'bg-rose-50 dark:bg-rose-950',       glow: 'group-hover:shadow-rose-500/30'   },
  { to: '/services/identity',    label: 'Identity',    icon: Building2,   color: 'text-indigo-600',  bg: 'bg-indigo-50 dark:bg-indigo-950',   glow: 'group-hover:shadow-indigo-500/30' },
]

function ReferralBanner() {
  return (
    <div
      className="relative overflow-hidden rounded-3xl p-4"
      style={{ background: 'linear-gradient(135deg, #F59E0B 0%, #EA8C00 45%, #D97706 100%)' }}
    >
      {/* Decorative circles */}
      <div className="absolute -top-5 -right-5 h-24 w-24 rounded-full bg-white/10 pointer-events-none" />
      <div className="absolute -bottom-4 right-12 h-16 w-16 rounded-full bg-white/10 pointer-events-none" />

      <div className="relative flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-white/80 text-xs font-semibold uppercase tracking-wider mb-0.5 flex items-center gap-1.5">
            <Gift className="h-3.5 w-3.5" /> Refer &amp; Earn
          </p>
          <p className="text-white font-black text-xl leading-none">
            ₦200 <span className="text-sm font-semibold text-white/70">per friend</span>
          </p>
          <p className="text-white/60 text-xs mt-1">Invite friends, earn instantly</p>
        </div>
        <Link
          to="/referrals"
          className="shrink-0 bg-white text-amber-700 text-xs font-black px-4 py-2.5 rounded-2xl hover:bg-amber-50 active:scale-95 transition-all shadow-md"
        >
          Get Link
        </Link>
      </div>
    </div>
  )
}

function SectionTitle({ children }: { children: string }) {
  return <p className="text-sm font-bold text-ink mb-3">{children}</p>
}

export function DashboardPage() {
  const user = useAuthStore((s) => s.user)
  const { dark, toggle: toggleDark } = useThemeStore()
  const { data: balance, isLoading: balanceLoading } = useWalletBalance()
  const { data: txData,  isLoading: txLoading }      = useTransactions({ limit: 5 })
  const { data: notifData }                          = useNotifications({ limit: 1 })

  const { greeting, subtitle } = getGreetingInfo()
  const firstName = user?.first_name ?? user?.email?.split('@')[0] ?? 'there'
  const unread    = notifData?.unread_count ?? 0
  const recentTxs = txData?.data ?? []

  const initials = [user?.first_name?.[0], user?.last_name?.[0]].filter(Boolean).join('').toUpperCase()
                || (user?.email?.[0] ?? 'U').toUpperCase()

  return (
    <div className="space-y-5 dashboard-bg">
      {/* ── Greeting row (desktop only) ─────────────────────────────────── */}
      <div className="hidden md:flex items-center justify-between pt-1">
        <div>
          <h1 className="text-2xl font-bold text-ink">{greeting}, {firstName} 👋</h1>
          <p className="text-xs text-ink-faint mt-0.5">{subtitle}</p>
          <div className="flex items-center gap-3 mt-1.5">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-success">
              <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
              Account Active
            </span>
            {unread > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] text-ink-faint">
                <Bell className="h-3 w-3" />
                {unread} unread
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={toggleDark}
            className="p-2.5 rounded-2xl bg-surface-1 border border-border hover:bg-surface-2 transition-colors shadow-card"
            aria-label="Toggle dark mode"
          >
            {dark ? <Sun className="h-5 w-5 text-ink-muted" /> : <Moon className="h-5 w-5 text-ink-muted" />}
          </button>
          <Link to="/notifications" className="relative p-2.5 rounded-2xl bg-surface-1 border border-border hover:bg-surface-2 transition-colors shadow-card">
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

      {/* ── Desktop quick stats strip ────────────────────────────────────── */}
      <div className="hidden md:flex gap-3 -mt-1">
        <div className="flex-1 bg-surface-1 rounded-2xl px-4 py-3 border border-border shadow-card flex items-center gap-3 dashboard-shine-card">
          <div className="h-8 w-8 rounded-xl bg-success/10 flex items-center justify-center shrink-0">
            <span className="h-2.5 w-2.5 rounded-full bg-success animate-pulse" />
          </div>
          <div>
            <p className="text-[10px] font-medium text-ink-faint uppercase tracking-wider">Status</p>
            <p className="text-sm font-bold text-ink">Account Active</p>
          </div>
        </div>
        <div className="flex-1 bg-surface-1 rounded-2xl px-4 py-3 border border-border shadow-card flex items-center gap-3 dashboard-shine-card">
          <div className="h-8 w-8 rounded-xl bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center shrink-0">
            <ArrowLeftRight className="h-4 w-4 text-brand-600 dark:text-brand-400" />
          </div>
          <div>
            <p className="text-[10px] font-medium text-ink-faint uppercase tracking-wider">Activity</p>
            <p className="text-sm font-bold text-ink">{recentTxs.length} Recent Txs</p>
          </div>
        </div>
        <div className="flex-1 bg-surface-1 rounded-2xl px-4 py-3 border border-border shadow-card flex items-center gap-3 dashboard-shine-card">
          <div className={cn(
            'h-8 w-8 rounded-xl flex items-center justify-center shrink-0',
            unread > 0 ? 'bg-danger/10' : 'bg-surface-2'
          )}>
            <Bell className={cn('h-4 w-4', unread > 0 ? 'text-danger' : 'text-ink-faint')} />
          </div>
          <div>
            <p className="text-[10px] font-medium text-ink-faint uppercase tracking-wider">Notifications</p>
            <p className="text-sm font-bold text-ink">{unread > 0 ? `${unread} Unread` : 'All Read'}</p>
          </div>
        </div>
      </div>

      {/* ── Mobile greeting + wallet hero ─────────────────────────────── */}
      <div className="md:hidden -mx-4 px-4 pt-2 pb-5 relative dashboard-mobile-hero">
        {/* Soft radial glow behind wallet card — light mode only */}
        <div
          className="dark:hidden pointer-events-none absolute inset-x-8 bottom-3 h-40 rounded-full"
          style={{
            background: 'radial-gradient(ellipse, rgba(79,70,229,0.24) 0%, transparent 70%)',
            filter: 'blur(32px)',
          }}
          aria-hidden="true"
        />
        <h1 className="text-xl font-bold text-ink mb-0.5">{greeting}, {firstName} 👋</h1>
        <p className="text-xs text-ink-faint mb-4">{subtitle}</p>
        <WalletBalanceCard balance={balance?.balance} currency={balance?.currency} isLoading={balanceLoading} />
      </div>

      {/* ── KYC banner — full width ───────────────────────────────────── */}
      <KycBanner />

      {/* ── Service status — only shown when a service is degraded ───── */}
      <ServiceStatusBanner />

      {/* ── Main 2-col grid (desktop) / stacked (mobile) ─────────────── */}
      <div className="lg:grid lg:grid-cols-[5fr_7fr] xl:grid-cols-[2fr_3fr] lg:gap-6 lg:items-start">

        {/* LEFT column: wallet balance + bank transfer + referral (desktop) */}
        <div className="space-y-4">
          {/* Wallet card shown in the mobile hero above — desktop only here */}
          <div className="hidden md:block">
            <WalletBalanceCard
              balance={balance?.balance}
              currency={balance?.currency}
              isLoading={balanceLoading}
            />
          </div>

          <FundingCarousel />

          {/* Referral banner — desktop left col only */}
          <div className="hidden lg:block">
            <ReferralBanner />
          </div>
        </div>

        {/* RIGHT column: quick actions + referral (mobile) + recent txs */}
        <div className="mt-4 lg:mt-0 space-y-4">

          {/* Quick Actions */}
          <div>
            <SectionTitle>Quick Actions</SectionTitle>
            <div className="grid grid-cols-3 md:grid-cols-6 lg:grid-cols-3 xl:grid-cols-6 gap-3">
              {QUICK_ACTIONS.map((s) => (
                <Link
                  key={`${s.to}-${s.label}`}
                  to={s.to}
                  className="group flex flex-col items-center gap-2 p-3 rounded-2xl bg-surface-1 shadow-card border border-border hover:border-brand-200 active:opacity-80 dashboard-shine-card"
                >
                  <div className={cn('h-12 w-12 rounded-2xl flex items-center justify-center transition-all duration-200 group-hover:scale-110 group-hover:shadow-md', s.bg, s.glow)}>
                    <s.icon className={cn('h-5 w-5', s.color)} />
                  </div>
                  <span className="text-[11px] font-semibold text-ink text-center leading-tight">{s.label}</span>
                </Link>
              ))}
            </div>
          </div>

          {/* Referral banner — mobile only (right col) */}
          <div className="lg:hidden">
            <ReferralBanner />
          </div>

          {/* Recent Transactions */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <SectionTitle>Recent Transactions</SectionTitle>
              <Link to="/transactions" className="text-xs font-semibold text-brand-600 hover:underline flex items-center gap-0.5 -mt-3">
                View All <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            <div className="bg-surface-1 rounded-3xl overflow-hidden shadow-card border border-border dashboard-shine-card">
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
                  icon={ArrowLeftRight}
                  title="No transactions yet"
                  description="Your transaction history will appear here."
                />
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
