import { Skeleton } from '@/components/ui'
import { WalletCardSkeleton } from './WalletCardSkeleton'

/** Mirrors the full dashboard layout — mobile-first, desktop grid on lg+. */
export function DashboardSkeleton() {
  return (
    <div className="space-y-5 dashboard-bg" aria-busy="true" aria-label="Loading dashboard">

      {/* ── Desktop greeting row ───────────────────────────────────────── */}
      <div className="hidden md:flex items-center justify-between pt-1">
        <div className="space-y-2">
          <Skeleton className="h-7 w-52 rounded-xl" />
          <Skeleton className="h-3 w-36 rounded" />
        </div>
        <div className="flex items-center gap-2.5">
          <Skeleton className="h-10 w-10 rounded-2xl" />
          <Skeleton className="h-10 w-10 rounded-2xl" />
          <Skeleton className="h-10 w-10 rounded-full" />
        </div>
      </div>

      {/* ── Desktop quick-stats strip ──────────────────────────────────── */}
      <div className="hidden md:flex gap-3 -mt-1">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex-1 bg-surface-1 rounded-2xl px-4 py-3 border border-border flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded-xl shrink-0" />
            <div className="space-y-1.5">
              <Skeleton className="h-2.5 w-16 rounded" />
              <Skeleton className="h-4 w-24 rounded" />
            </div>
          </div>
        ))}
      </div>

      {/* ── Mobile greeting + wallet hero ─────────────────────────────── */}
      <div className="md:hidden -mx-4 px-4 pt-2 pb-5">
        <Skeleton className="h-6 w-44 rounded-xl mb-1" />
        <Skeleton className="h-3 w-32 rounded mb-4" />
        <WalletCardSkeleton />
      </div>

      {/* ── KYC status card ───────────────────────────────────────────── */}
      <Skeleton className="h-16 rounded-2xl" />

      {/* ── Main 2-col grid ───────────────────────────────────────────── */}
      <div className="lg:grid lg:grid-cols-[5fr_7fr] xl:grid-cols-[2fr_3fr] lg:gap-6 lg:items-start">

        {/* LEFT — wallet card (desktop) + funding carousel */}
        <div className="space-y-4">
          <div className="hidden md:block">
            <WalletCardSkeleton />
          </div>
          {/* Funding carousel placeholder */}
          <Skeleton className="h-24 rounded-3xl" />
          {/* Referral banner (desktop) */}
          <Skeleton className="hidden lg:block h-20 rounded-3xl" />
        </div>

        {/* RIGHT — quick actions + recent txs */}
        <div className="mt-4 lg:mt-0 space-y-4">

          {/* Quick actions */}
          <div>
            <Skeleton className="h-4 w-24 rounded mb-3" />
            <div className="grid grid-cols-3 md:grid-cols-6 lg:grid-cols-3 xl:grid-cols-6 gap-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-surface-1 border border-border">
                  <Skeleton className="h-12 w-12 rounded-2xl" />
                  <Skeleton className="h-2.5 w-12 rounded" />
                </div>
              ))}
            </div>
          </div>

          {/* Referral banner mobile */}
          <Skeleton className="lg:hidden h-20 rounded-3xl" />

          {/* Recent transactions */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <Skeleton className="h-4 w-32 rounded" />
              <Skeleton className="h-3 w-14 rounded" />
            </div>
            <div className="bg-surface-1 rounded-3xl overflow-hidden border border-border divide-y divide-border">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-4">
                  <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                  <div className="flex-1 space-y-1.5 min-w-0">
                    <Skeleton className="h-3.5 w-28 rounded" />
                    <Skeleton className="h-3 w-20 rounded" />
                  </div>
                  <div className="space-y-1.5 text-right">
                    <Skeleton className="h-3.5 w-16 rounded ml-auto" />
                    <Skeleton className="h-3 w-12 rounded ml-auto" />
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
