import { Bell } from 'lucide-react'
import { Skeleton } from '@/components/ui'
import { Card } from '@/components/ui'

/** Skeleton for the Notifications page — preserves the Card shell structure. */
export function NotificationsSkeleton() {
  return (
    <div className="space-y-4 pt-2" aria-busy="true" aria-label="Loading notifications">
      {/* Back button placeholder */}
      <Skeleton className="h-5 w-14 rounded" />

      <Card>
        {/* Header */}
        <div className="flex items-center gap-2.5 mb-5">
          <div className="h-10 w-10 rounded-xl bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center shrink-0">
            <Bell className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-28 rounded" />
            <Skeleton className="h-3 w-16 rounded" />
          </div>
        </div>

        {/* Notification rows */}
        <div className="space-y-0 divide-y divide-border -mx-5">
          {[...Array(6)].map((_, i) => (
            <NotifRowSkeleton key={i} />
          ))}
        </div>
      </Card>
    </div>
  )
}

function NotifRowSkeleton() {
  return (
    <div className="flex items-start gap-3 px-5 py-4">
      <Skeleton className="h-9 w-9 rounded-full shrink-0 mt-0.5" />
      <div className="flex-1 space-y-1.5 min-w-0">
        <Skeleton className="h-3.5 w-3/4 rounded" />
        <Skeleton className="h-3 w-full rounded" />
        <Skeleton className="h-3 w-2/3 rounded" />
        <Skeleton className="h-2.5 w-20 rounded mt-1" />
      </div>
    </div>
  )
}
