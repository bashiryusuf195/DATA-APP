import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { notificationsApi } from '@/api/notifications.api'
import { PageHeader } from '@/components/shared/PageHeader'
import { Pagination } from '@/components/shared/Pagination'
import { ErrorMessage } from '@/components/shared/ErrorMessage'
import { Button, Badge, Card } from '@/components/ui'
import { SkeletonTable } from '@/components/ui/Skeleton'
import { fmtRelative } from '@/utils/format'
import type { Notification } from '@/types'
import { RefreshCw, Bell, Info, AlertTriangle, CheckCircle, ShoppingBag } from 'lucide-react'
import { cn } from '@/utils/cn'
import { ENDPOINTS } from '@/config/endpoints'

const TYPE_ICON: Record<string, React.ReactNode> = {
  purchase_successful: <CheckCircle className="h-4 w-4 text-emerald-400" />,
  purchase_failed:     <AlertTriangle className="h-4 w-4 text-rose-400" />,
  admin_alert:         <AlertTriangle className="h-4 w-4 text-amber-400" />,
  wallet_funded:       <ShoppingBag className="h-4 w-4 text-cyan-400" />,
}

const getIcon = (type: string) => TYPE_ICON[type] ?? <Info className="h-4 w-4 text-ink-faint" />

export function NotificationsPage() {
  const [page, setPage] = useState(1)
  const [channel, setChannel] = useState<'admin' | 'my'>('admin')
  const limit = 20

  const { data: raw, isLoading, error, refetch } = useQuery({
    queryKey: ['notifications', { channel, page, limit }],
    queryFn: () =>
      channel === 'admin'
        ? notificationsApi.adminList({ page, limit })
        : notificationsApi.myList({ page, limit }),
  })

  const rows: Notification[] = raw && 'data' in raw ? (raw.data as Notification[]) : []
  const total = raw && 'total' in raw ? (raw.total ?? rows.length) : rows.length

  if (error) return <ErrorMessage error={error} onRetry={() => void refetch()} endpoint={ENDPOINTS.notifications.path} />

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Notifications"
        subtitle="System and user notifications"
        actions={
          <Button variant="secondary" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />}
            onClick={() => void refetch()}>Refresh</Button>
        }
      />

      {/* Channel toggle */}
      <div className="flex gap-2">
        {(['admin', 'my'] as const).map((c) => (
          <button
            key={c}
            onClick={() => { setChannel(c); setPage(1) }}
            className={cn(
              'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
              channel === c
                ? 'bg-accent-subtle text-accent'
                : 'text-ink-muted hover:text-ink hover:bg-surface-2'
            )}
          >
            {c === 'admin' ? 'System / Admin' : 'My notifications'}
          </button>
        ))}
      </div>

      <Card padding="none">
        {isLoading ? (
          <div className="p-5"><SkeletonTable rows={8} /></div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Bell className="h-10 w-10 text-ink-faint opacity-40 mb-3" />
            <p className="text-sm text-ink-faint">No notifications found</p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-border/50">
              {rows.map((n) => (
                <div
                  key={n.id}
                  className={cn(
                    'flex gap-3 px-5 py-4 transition-colors',
                    !n.read && 'bg-accent-subtle/30'
                  )}
                >
                  <div className="mt-0.5 shrink-0">{getIcon(n.type)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className={cn('text-sm', n.read ? 'text-ink-muted' : 'font-semibold text-ink')}>
                        {n.title}
                      </p>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="neutral" size="sm">{n.channel}</Badge>
                        {!n.read && (
                          <span className="h-2 w-2 rounded-full bg-accent shrink-0" />
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-ink-muted mt-0.5 line-clamp-2">{n.message}</p>
                    <p className="text-[11px] text-ink-faint mt-1">{fmtRelative(n.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-4 pb-4">
              <Pagination page={page} limit={limit} total={total} onPage={setPage} />
            </div>
          </>
        )}
      </Card>
    </div>
  )
}
