import { Skeleton } from '@/components/ui'

/** Full wallet-balance-card skeleton — matches the navy card dimensions exactly.
 *  Uses skeleton-on-dark to keep shimmer colours correct on the navy gradient. */
export function WalletCardSkeleton() {
  return (
    <div
      className="relative overflow-hidden rounded-3xl p-5 shadow-wallet ring-1 ring-inset ring-white/10 skeleton-on-dark"
      style={{ background: 'linear-gradient(135deg, #1E4E7E 0%, #163A5E 100%)' }}
      aria-busy="true"
      aria-label="Loading wallet balance"
    >
      {/* Decorative circles */}
      <div className="absolute -top-8 -right-8 h-28 w-28 rounded-full bg-white/5" />
      <div className="absolute -bottom-6 -left-6 h-20 w-20 rounded-full bg-white/5" />

      <div className="relative space-y-5">
        {/* Label row */}
        <div className="flex items-center justify-between">
          <Skeleton className="h-3 w-28 rounded" />
          <Skeleton className="h-7 w-7 rounded-lg" />
        </div>
        {/* Balance */}
        <Skeleton className="h-10 w-44 rounded-xl" />
        {/* Buttons */}
        <div className="flex gap-3">
          <Skeleton className="h-10 flex-1 rounded-2xl" />
          <Skeleton className="h-10 flex-1 rounded-2xl" />
        </div>
      </div>
    </div>
  )
}
