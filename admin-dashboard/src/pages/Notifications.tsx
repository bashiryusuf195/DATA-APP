import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { notificationsApi } from '@/api/notifications.api'
import { PageHeader } from '@/components/shared/PageHeader'
import { FilterBar } from '@/components/shared/FilterBar'
import { DataTable } from '@/components/shared/DataTable'
import { Pagination } from '@/components/shared/Pagination'
import { ErrorMessage } from '@/components/shared/ErrorMessage'
import { MetricCard } from '@/components/shared/MetricCard'
import { Button, Badge, Card, Select } from '@/components/ui'
import { SkeletonTable, SkeletonCard } from '@/components/ui/Skeleton'
import { fmtRelative } from '@/utils/format'
import type { Notification } from '@/types'
import {
  RefreshCw, Bell, CheckCircle2, XCircle, Clock, Mail,
  MessageSquare, Smartphone, Wifi, Eye,
} from 'lucide-react'
import { cn } from '@/utils/cn'

const CHANNEL_ICON: Record<string, React.ReactNode> = {
  email:  <Mail         className="h-3.5 w-3.5" />,
  sms:    <MessageSquare className="h-3.5 w-3.5" />,
  push:   <Smartphone   className="h-3.5 w-3.5" />,
  in_app: <Bell         className="h-3.5 w-3.5" />,
  webhook:<Wifi         className="h-3.5 w-3.5" />,
}

const STATUS_COLOR: Record<string, string> = {
  sent:    'text-emerald-400',
  failed:  'text-rose-400',
  pending: 'text-amber-400',
  read:    'text-ink-faint',
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, 'success' | 'danger' | 'warning' | 'neutral'> = {
    sent: 'success', failed: 'danger', pending: 'warning', read: 'neutral',
  }
  return <Badge variant={map[status] ?? 'neutral'}>{status}</Badge>
}

type N = Notification & { user_email?: string; user_name?: string }

export function NotificationsPage() {
  const [page,    setPage]    = useState(1)
  const [channel, setChannel] = useState('')
  const [status,  setStatus]  = useState('')
  const limit = 25

  const { data: raw, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-notifications', { channel, status, page, limit }],
    queryFn: () => notificationsApi.adminList({ channel: channel || undefined, status: status || undefined, page, limit }),
  })

  const rows  = (raw?.data ?? []) as N[]
  const total = raw?.total ?? 0
  const stats = raw?.stats ?? { sent: 0, failed: 0, pending: 0, read: 0 }

  const columns = [
    {
      key: 'channel',
      header: 'Channel',
      render: (n: N) => (
        <div className="flex items-center gap-1.5">
          <span className={cn('text-ink-faint', STATUS_COLOR[n.status])}>{CHANNEL_ICON[n.channel]}</span>
          <Badge variant="neutral" size="sm">{n.channel}</Badge>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (n: N) => (
        <span className="text-xs font-mono text-ink-muted">{n.type.replace(/_/g, ' ')}</span>
      ),
    },
    {
      key: 'title',
      header: 'Title / Message',
      render: (n: N) => (
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink truncate max-w-[260px]">{n.title}</p>
          <p className="text-xs text-ink-faint truncate max-w-[260px]">{n.message}</p>
        </div>
      ),
    },
    {
      key: 'recipient',
      header: 'Recipient',
      render: (n: N) => (
        <span className="text-xs text-ink-muted">
          {(n as N).user_email ?? (n.user_id ? n.user_id.slice(0, 8) + '…' : <span className="text-ink-faint">system</span>)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (n: N) => <StatusBadge status={n.status} />,
    },
    {
      key: 'created_at',
      header: 'Sent',
      render: (n: N) => (
        <span className="text-xs text-ink-faint whitespace-nowrap">{fmtRelative(n.created_at)}</span>
      ),
    },
  ]

  if (error) return <ErrorMessage error={error} onRetry={() => void refetch()} endpoint="/admin/notifications" />

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Notifications"
        subtitle="Full log of all notifications sent across channels"
        actions={
          <Button variant="secondary" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />}
            onClick={() => void refetch()}>Refresh</Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <MetricCard label="Sent"    value={stats.sent.toLocaleString()}    icon={<CheckCircle2 className="h-4 w-4" />} variant="success" />
            <MetricCard label="Failed"  value={stats.failed.toLocaleString()}  icon={<XCircle      className="h-4 w-4" />} variant="danger"  />
            <MetricCard label="Pending" value={stats.pending.toLocaleString()} icon={<Clock        className="h-4 w-4" />} variant="default" />
            <MetricCard label="Read"    value={stats.read.toLocaleString()}    icon={<Eye          className="h-4 w-4" />} variant="default" />
          </>
        )}
      </div>

      {/* Filters */}
      <FilterBar>
        <Select
          value={channel}
          onChange={(e) => { setChannel(e.target.value); setPage(1) }}
          options={[
            { value: '',        label: 'All channels' },
            { value: 'email',   label: 'Email' },
            { value: 'sms',     label: 'SMS' },
            { value: 'push',    label: 'Push' },
            { value: 'in_app',  label: 'In-App' },
            { value: 'webhook', label: 'Webhook' },
          ]}
          className="w-36"
        />
        <Select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1) }}
          options={[
            { value: '',        label: 'All statuses' },
            { value: 'sent',    label: 'Sent' },
            { value: 'failed',  label: 'Failed' },
            { value: 'pending', label: 'Pending' },
            { value: 'read',    label: 'Read' },
          ]}
          className="w-36"
        />
        {(channel || status) && (
          <Button variant="ghost" size="sm" onClick={() => { setChannel(''); setStatus(''); setPage(1) }}>
            Clear
          </Button>
        )}
      </FilterBar>

      {/* Table */}
      <Card>
        {isLoading ? (
          <SkeletonTable rows={8} />
        ) : (
          <>
            <DataTable
              columns={columns}
              data={rows}
              rowKey={(n) => n.id}
              emptyMessage="No notifications found."
            />
            <div className="px-4 pb-2">
              <Pagination page={page} limit={limit} total={total} onPage={setPage} />
            </div>
          </>
        )}
      </Card>
    </div>
  )
}
