import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, ArrowLeft } from 'lucide-react'
import { Card } from '@/components/ui'
import { NotificationsSkeleton } from '@/components/skeletons'
import { EmptyNotifications } from '@/components/shared/empty-states'
import { useNotifications, useMarkAllNotificationsRead } from '@/hooks/useNotifications'
import { fmtRelativeTime } from '@/utils/format'
import { cn } from '@/utils/cn'

export function NotificationsPage() {
  const navigate = useNavigate()
  const { data, isLoading } = useNotifications({ limit: 50 })
  const markAllRead = useMarkAllNotificationsRead()

  useEffect(() => {
    markAllRead.mutate()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const notifications = data?.data ?? []

  if (isLoading) return <NotificationsSkeleton />

  return (
    <div className="space-y-4 pt-2">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <Card>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="h-10 w-10 rounded-xl bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center">
              <Bell className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-base font-semibold text-ink">Notifications</p>
              {data && data.unread_count > 0 && (
                <p className="text-xs text-ink-muted">{data.unread_count} unread</p>
              )}
            </div>
          </div>
        </div>

        {notifications.length === 0 ? (
          <EmptyNotifications />
        ) : (
          <div className="divide-y divide-border -mx-5">
            {notifications.map((n) => (
              <div
                key={n.id}
                className={cn(
                  'flex items-start gap-3 px-5 py-4 transition-colors',
                  !n.is_read && 'bg-brand-50/60 dark:bg-brand-500/10'
                )}
              >
                <div className={cn(
                  'h-9 w-9 rounded-full flex items-center justify-center shrink-0 mt-0.5',
                  n.is_read ? 'bg-surface-2' : 'bg-brand-100 dark:bg-brand-500/20'
                )}>
                  <Bell className={cn('h-4 w-4', n.is_read ? 'text-ink-muted' : 'text-brand-600 dark:text-brand-400')} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={cn('text-sm text-ink', n.is_read ? 'font-normal' : 'font-semibold')}>
                    {n.title}
                  </p>
                  <p className="text-xs text-ink-muted mt-0.5 leading-relaxed">{n.body}</p>
                  <p className="text-xs text-ink-faint mt-1">{fmtRelativeTime(n.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
