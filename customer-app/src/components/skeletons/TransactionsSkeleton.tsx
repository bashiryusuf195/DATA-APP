import { Skeleton } from '@/components/ui'

/** Skeleton for the full Transactions page — search bar + chips + list. */
export function TransactionsSkeleton() {
  return (
    <div className="space-y-3 pt-1" aria-busy="true" aria-label="Loading transactions">
      {/* Header */}
      <Skeleton className="h-7 w-36 rounded-xl" />

      {/* Search bar */}
      <Skeleton className="h-10 w-full rounded-2xl" />

      {/* Type chips row */}
      <div className="flex gap-1.5 overflow-hidden">
        {[80, 64, 48, 80, 72, 56, 72, 52].map((w, i) => (
          <Skeleton key={i} className="h-7 rounded-2xl shrink-0" style={{ width: w }} />
        ))}
      </div>

      {/* Transaction groups */}
      <div className="space-y-4">
        {[4, 3].map((count, gi) => (
          <div key={gi}>
            {/* Date label */}
            <Skeleton className="h-3 w-20 rounded mb-3" />
            {/* Mobile cards */}
            <div className="md:hidden bg-surface-1 rounded-3xl overflow-hidden border border-border divide-y divide-border">
              {[...Array(count)].map((_, i) => (
                <TxRowSkeleton key={i} />
              ))}
            </div>
            {/* Desktop table */}
            <div className="hidden md:block bg-surface-1 rounded-3xl overflow-hidden border border-border">
              <table className="w-full">
                <tbody className="divide-y divide-border">
                  {[...Array(count)].map((_, i) => (
                    <tr key={i}>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                          <Skeleton className="h-3.5 w-24 rounded" />
                        </div>
                      </td>
                      <td className="px-5 py-3.5"><Skeleton className="h-3 w-36 rounded" /></td>
                      <td className="px-5 py-3.5"><Skeleton className="h-3 w-28 rounded font-mono" /></td>
                      <td className="px-5 py-3.5"><Skeleton className="h-3 w-24 rounded" /></td>
                      <td className="px-5 py-3.5 text-right"><Skeleton className="h-3.5 w-16 rounded ml-auto" /></td>
                      <td className="px-5 py-3.5 text-center"><Skeleton className="h-5 w-16 rounded-full mx-auto" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function TxRowSkeleton() {
  return (
    <div className="flex items-center gap-3 p-4">
      <Skeleton className="h-10 w-10 rounded-full shrink-0" />
      <div className="flex-1 space-y-1.5 min-w-0">
        <Skeleton className="h-3.5 w-28 rounded" />
        <Skeleton className="h-3 w-20 rounded" />
      </div>
      <div className="space-y-1.5 text-right shrink-0">
        <Skeleton className="h-3.5 w-16 rounded ml-auto" />
        <Skeleton className="h-5 w-14 rounded-full ml-auto" />
      </div>
    </div>
  )
}
