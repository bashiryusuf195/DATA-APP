import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import axios from 'axios'
import { formatDistanceToNow } from 'date-fns'
import { notificationsApi } from '@/api/notifications.api'
import { PageHeader } from '@/components/shared/PageHeader'
import { FilterBar } from '@/components/shared/FilterBar'
import { DataTable } from '@/components/shared/DataTable'
import { Pagination } from '@/components/shared/Pagination'
import { ErrorMessage } from '@/components/shared/ErrorMessage'
import { MetricCard } from '@/components/shared/MetricCard'
import { Button, Badge, Card, Select, Input } from '@/components/ui'
import { SkeletonTable, SkeletonCard } from '@/components/ui/Skeleton'
import type { NotificationJob } from '@/types'
import {
  RefreshCw, RotateCcw, Clock, CheckCircle2, XCircle, Loader2,
  Mail, MessageSquare, Smartphone, Bell, Radio,
} from 'lucide-react'

function errMsg(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) return err.response?.data?.error ?? err.message ?? fallback
  if (err instanceof Error) return err.message
  return fallback
}

const TYPE_ICON: Record<string, React.ReactNode> = {
  email:     <Mail          className="h-3.5 w-3.5" />,
  sms:       <MessageSquare className="h-3.5 w-3.5" />,
  push:      <Smartphone    className="h-3.5 w-3.5" />,
  in_app:    <Bell          className="h-3.5 w-3.5" />,
  broadcast: <Radio         className="h-3.5 w-3.5" />,
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'sent')       return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
  if (status === 'failed')     return <XCircle      className="h-3.5 w-3.5 text-rose-400" />
  if (status === 'processing') return <Loader2      className="h-3.5 w-3.5 text-blue-400 animate-spin" />
  if (status === 'cancelled')  return <XCircle      className="h-3.5 w-3.5 text-ink-faint" />
  return <Clock className="h-3.5 w-3.5 text-amber-400" />
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, 'success' | 'danger' | 'info' | 'warning' | 'neutral'> = {
    sent: 'success', failed: 'danger', processing: 'info', pending: 'warning', cancelled: 'neutral',
  }
  return <Badge variant={map[status] ?? 'neutral'}>{status}</Badge>
}

export function NotificationQueuePage() {
  const qc = useQueryClient()
  const [page,   setPage]   = useState(1)
  const [status, setStatus] = useState('')
  const [type,   setType]   = useState('')
  const [search, setSearch] = useState('')
  const limit = 25

  const { data: raw, isLoading, error, refetch } = useQuery({
    queryKey: ['notification-jobs', { status, type, search, page, limit }],
    queryFn:  () => notificationsApi.listJobs({
      status:  status  || undefined,
      type:    type    || undefined,
      search:  search  || undefined,
      page,
      limit,
    }),
    refetchInterval: 10_000,
  })

  const retryMutation = useMutation({
    mutationFn: (jobId: string) => notificationsApi.retryJob(jobId),
    onSuccess: () => {
      toast.success('Job re-queued for delivery')
      void qc.invalidateQueries({ queryKey: ['notification-jobs'] })
    },
    onError: (err) => toast.error(errMsg(err, 'Retry failed')),
  })

  const jobs  = raw?.data  ?? []
  const total = raw?.total ?? 0
  const stats = raw?.stats ?? { pending: 0, processing: 0, sent: 0, failed: 0, cancelled: 0 }

  const columns = [
    {
      key: 'type',
      header: 'Channel',
      render: (j: NotificationJob) => (
        <div className="flex items-center gap-1.5 text-ink-faint">
          {TYPE_ICON[j.type] ?? <Bell className="h-3.5 w-3.5" />}
          <Badge variant="neutral" size="sm">{j.type}</Badge>
        </div>
      ),
    },
    {
      key: 'notification_type',
      header: 'Type',
      render: (j: NotificationJob) => (
        <span className="text-xs font-mono text-ink-muted">{j.notification_type.replace(/_/g, ' ')}</span>
      ),
    },
    {
      key: 'recipient',
      header: 'Recipient',
      render: (j: NotificationJob) => (
        <div className="text-xs">
          {j.recipient_type === 'all' ? (
            <Badge variant="info" size="sm">Broadcast</Badge>
          ) : (
            <span className="text-ink-muted">
              {j.recipient_user_email ?? j.recipient_email ?? j.recipient_phone ?? (j.recipient_id ? j.recipient_id.slice(0, 8) + '…' : '—')}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'subject',
      header: 'Subject / Body',
      render: (j: NotificationJob) => (
        <p className="text-xs text-ink-muted truncate max-w-[200px]">
          {j.subject ?? j.body.slice(0, 60)}
        </p>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (j: NotificationJob) => (
        <div className="flex items-center gap-1.5">
          <StatusIcon status={j.status} />
          <StatusBadge status={j.status} />
        </div>
      ),
    },
    {
      key: 'retries',
      header: 'Retries',
      render: (j: NotificationJob) => (
        <span className="text-xs text-ink-faint tabular-nums">
          {j.retry_count} / {j.max_retries}
        </span>
      ),
    },
    {
      key: 'created_at',
      header: 'Created',
      render: (j: NotificationJob) => (
        <span className="text-xs text-ink-faint whitespace-nowrap">
          {formatDistanceToNow(new Date(j.created_at), { addSuffix: true })}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (j: NotificationJob) => (
        j.status === 'failed' && j.retry_count < j.max_retries ? (
          <Button
            variant="ghost" size="sm"
            icon={<RotateCcw className="h-3.5 w-3.5" />}
            onClick={() => retryMutation.mutate(j.id)}
            disabled={retryMutation.isPending}
          >
            Retry
          </Button>
        ) : null
      ),
    },
  ]

  if (error) return <ErrorMessage error={error} onRetry={() => void refetch()} endpoint="/admin/notification-jobs" />

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Notification Queue"
        subtitle="Monitor and retry notification delivery jobs"
        actions={
          <Button variant="secondary" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />}
            onClick={() => void refetch()}>Refresh</Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <MetricCard label="Pending"    value={stats.pending.toLocaleString()}    icon={<Clock        className="h-4 w-4" />} variant="default" />
            <MetricCard label="Processing" value={stats.processing.toLocaleString()} icon={<Loader2      className="h-4 w-4" />} variant="accent"  />
            <MetricCard label="Sent"       value={stats.sent.toLocaleString()}       icon={<CheckCircle2 className="h-4 w-4" />} variant="success" />
            <MetricCard label="Failed"     value={stats.failed.toLocaleString()}     icon={<XCircle      className="h-4 w-4" />} variant="danger"  />
            <MetricCard label="Cancelled"  value={stats.cancelled.toLocaleString()}  icon={<XCircle      className="h-4 w-4" />} variant="default" />
          </>
        )}
      </div>

      {/* Filters */}
      <FilterBar>
        <div className="flex-1 min-w-[180px] max-w-sm">
          <Input placeholder="Search recipient, type…" value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }} />
        </div>
        <Select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1) }}
          options={[
            { value: '',           label: 'All statuses' },
            { value: 'pending',    label: 'Pending' },
            { value: 'processing', label: 'Processing' },
            { value: 'sent',       label: 'Sent' },
            { value: 'failed',     label: 'Failed' },
            { value: 'cancelled',  label: 'Cancelled' },
          ]}
          className="w-36"
        />
        <Select
          value={type}
          onChange={(e) => { setType(e.target.value); setPage(1) }}
          options={[
            { value: '',          label: 'All channels' },
            { value: 'email',     label: 'Email' },
            { value: 'sms',       label: 'SMS' },
            { value: 'push',      label: 'Push' },
            { value: 'in_app',    label: 'In-App' },
            { value: 'broadcast', label: 'Broadcast' },
          ]}
          className="w-36"
        />
        {(status || type || search) && (
          <Button variant="ghost" size="sm" onClick={() => { setStatus(''); setType(''); setSearch(''); setPage(1) }}>
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
              data={jobs}
              rowKey={(j) => j.id}
              emptyMessage="No notification jobs found."
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
