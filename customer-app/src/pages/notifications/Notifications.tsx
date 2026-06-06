import { useNavigate } from 'react-router-dom'
import { Bell, ArrowLeft, Check } from 'lucide-react'
import { Card, Skeleton } from '@/components/ui'
import { useNotifications, useMarkNotificationRead } from '@/hooks/useNotifications'
import { fmtRelativeTime } from '@/utils/format'
import { cn } from '@/utils/cn'

export function NotificationsPage() {
  const navigate = useNavigate()
  const { data, isLoading } = useNotifications({ limit: 50 })
  const markRead = useMarkNotificationRead()

  const notifications = data?.data ?? []

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
            <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <Bell className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-base font-semibold text-ink">Notifications</p>
              {data && data.unread_count > 0 && (
                <p className="text-xs text-ink-muted">{data.unread_count} unread</p>
              )}
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="h-9 w-9 rounded-full shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-3/4 rounded" />
                  <Skeleton className="h-3 w-full rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <div className="py-12 text-center">
            <Bell className="h-10 w-10 text-ink-faint mx-auto mb-3" />
            <p className="text-sm font-medium text-ink-muted">No notifications yet</p>
            <p className="text-xs text-ink-faint mt-1">We'll notify you of important updates here.</p>
          </div>
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
                {!n.is_read && (
                  <button
                    onClick={() => markRead.mutate(n.id)}
                    disabled={markRead.isPending}
                    className="shrink-0 p-1.5 rounded-lg hover:bg-brand-100 transition-colors"
                    title="Mark as read"
                  >
                    <Check className="h-3.5 w-3.5 text-brand-600" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
