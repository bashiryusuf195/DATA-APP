import { Skeleton } from '@/components/ui'

/** Skeleton for the Referrals page — hero card + stats grid + charts + table. */
export function ReferralsSkeleton() {
  return (
    <div className="space-y-5 pt-2" aria-busy="true" aria-label="Loading referrals">
      {/* Back button placeholder */}
      <Skeleton className="h-5 w-14 rounded" />

      {/* Hero referral card — skeleton-on-dark for correct shimmer on purple gradient */}
      <div
        className="relative overflow-hidden rounded-3xl p-5 shadow-wallet skeleton-on-dark"
        style={{ background: 'linear-gradient(135deg, #4F46E5 0%, #6D28D9 50%, #7C3AED 100%)' }}
      >
        <div className="relative space-y-4">
          <div className="space-y-2">
            <Skeleton className="h-3 w-32 rounded" />
            <Skeleton className="h-7 w-48 rounded-xl" />
            <Skeleton className="h-3 w-40 rounded" />
          </div>
          <div className="flex items-center gap-2 p-3 rounded-2xl bg-white/10">
            <Skeleton className="h-4 flex-1 rounded" />
            <Skeleton className="h-7 w-16 rounded-xl" />
            <Skeleton className="h-7 w-16 rounded-xl" />
          </div>
        </div>
      </div>

      {/* 6 stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="bg-surface-1 rounded-2xl border border-border p-3.5 space-y-3">
            <Skeleton className="h-9 w-9 rounded-xl" />
            <div className="space-y-1.5">
              <Skeleton className="h-2.5 w-20 rounded" />
              <Skeleton className="h-6 w-16 rounded-lg" />
            </div>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[0, 1].map((i) => (
          <div key={i} className="bg-surface-1 rounded-2xl border border-border p-4 space-y-3">
            <Skeleton className="h-3.5 w-28 rounded" />
            <Skeleton className="h-24 w-full rounded-xl" />
            {/* x-axis labels */}
            <div className="flex justify-between">
              {[...Array(6)].map((_, j) => (
                <Skeleton key={j} className="h-2.5 w-6 rounded" />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* How it works */}
      <div className="bg-surface-1 rounded-2xl border border-border p-4 space-y-3">
        <Skeleton className="h-4 w-24 rounded" />
        <div className="flex gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex-1 space-y-2">
              <Skeleton className="h-8 w-8 rounded-full" />
              <Skeleton className="h-3 w-full rounded" />
              <Skeleton className="h-3 w-3/4 rounded" />
            </div>
          ))}
        </div>
      </div>

      {/* Recent rewards table */}
      <div className="bg-surface-1 rounded-2xl border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <Skeleton className="h-4 w-28 rounded" />
          <Skeleton className="h-6 w-20 rounded-xl" />
        </div>
        <div className="divide-y divide-border">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3.5">
              <Skeleton className="h-8 w-8 rounded-full shrink-0" />
              <div className="flex-1 space-y-1.5 min-w-0">
                <Skeleton className="h-3.5 w-32 rounded" />
                <Skeleton className="h-3 w-20 rounded" />
              </div>
              <div className="space-y-1.5 shrink-0 text-right">
                <Skeleton className="h-3.5 w-16 rounded ml-auto" />
                <Skeleton className="h-5 w-14 rounded-full ml-auto" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
