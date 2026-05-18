import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queueApi } from '@/api/queue.api'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataTable } from '@/components/shared/DataTable'
import { Pagination } from '@/components/shared/Pagination'
import { Drawer } from '@/components/shared/Drawer'
import { ErrorMessage } from '@/components/shared/ErrorMessage'
import { Button, Badge, Input, Select, Card } from '@/components/ui'
import { SkeletonTable } from '@/components/ui/Skeleton'
import { fmtDate, truncate } from '@/utils/format'
import type { FailedJob } from '@/types'
import { RefreshCw, AlertTriangle, RotateCcw, Search } from 'lucide-react'
import { useDebounce } from '@/hooks/useDebounce'
import { ENDPOINTS } from '@/config/endpoints'
import toast from 'react-hot-toast'

const QUEUE_OPTIONS = [
  { value: 'vtu-purchases',     label: 'VTU Purchases' },
  { value: 'airtime-purchases', label: 'Airtime Purchases' },
  { value: 'paystack-webhooks', label: 'Paystack Webhooks' },
]

export function FailedDeliveriesPage() {
  const [page, setPage] = useState(1)
  const [queueFilter, setQueueFilter] = useState('')
  const [referenceSearch, setReferenceSearch] = useState('')
  const [selected, setSelected] = useState<FailedJob | null>(null)
  const limit = 20
  const qc = useQueryClient()

  const debouncedReference = useDebounce(referenceSearch)

  const { data: raw, isLoading, error, refetch } = useQuery({
    queryKey: ['failed-deliveries', { page, limit, queue_name: queueFilter, reference: debouncedReference }],
    queryFn: () => queueApi.failedJobs({ page, limit, queue_name: queueFilter || undefined }),
  })

  const retryMutation = useMutation({
    mutationFn: (id: string) => queueApi.retryFailedJob(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['failed-deliveries'] })
      toast.success('Job re-queued successfully')
      setSelected(null)
    },
    onError: () => toast.error('Failed to retry job'),
  })

  const allRows: FailedJob[] = raw?.data ?? []
  const total = raw?.total ?? allRows.length

  const rows = debouncedReference
    ? allRows.filter((j) => j.reference?.toLowerCase().includes(debouncedReference.toLowerCase()))
    : allRows

  if (error) return <ErrorMessage error={error} onRetry={() => void refetch()} endpoint={ENDPOINTS.failedJobs.path} />

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Failed Deliveries"
        subtitle="Permanently failed background jobs — retry or investigate"
        actions={
          <Button variant="secondary" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />}
            onClick={() => void refetch()}>Refresh</Button>
        }
      />

      {total > 0 && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
          <p className="text-sm text-amber-300">
            <span className="font-semibold">{total}</span> jobs have permanently failed and require manual intervention.
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <div className="w-56">
          <Input
            placeholder="Search by reference…"
            value={referenceSearch}
            onChange={(e) => setReferenceSearch(e.target.value)}
            prefix={<Search className="h-3.5 w-3.5" />}
          />
        </div>
        <div className="w-48">
          <Select
            value={queueFilter}
            onChange={(e) => { setQueueFilter(e.target.value); setPage(1) }}
            options={QUEUE_OPTIONS}
            placeholder="All queues"
          />
        </div>
      </div>

      <Card padding="none">
        {isLoading ? (
          <div className="p-5"><SkeletonTable rows={6} /></div>
        ) : (
          <>
            <DataTable
              data={rows}
              rowKey={(j) => j.id}
              onRowClick={setSelected}
              emptyMessage="No failed deliveries."
              columns={[
                {
                  key: 'queue',
                  header: 'Queue / Service',
                  render: (j) => (
                    <div className="space-y-0.5">
                      <Badge variant="neutral">{j.queue_name}</Badge>
                      <p className="font-mono text-xs text-ink-muted">{j.job_name}</p>
                    </div>
                  ),
                },
                {
                  key: 'reference',
                  header: 'Reference',
                  render: (j) => (
                    <span className="font-mono text-xs text-ink-muted">
                      {j.reference ? truncate(j.reference, 22) : '—'}
                    </span>
                  ),
                },
                {
                  key: 'retries',
                  header: 'Attempts',
                  align: 'center',
                  render: (j) => (
                    <span className="font-bold text-rose-400">{j.retry_count}</span>
                  ),
                },
                {
                  key: 'error',
                  header: 'Error',
                  render: (j) => (
                    <span className="text-xs text-rose-400 truncate max-w-[200px] block">
                      {j.error_message}
                    </span>
                  ),
                },
                {
                  key: 'date',
                  header: 'Failed At',
                  render: (j) => <span className="text-xs text-ink-faint">{fmtDate(j.created_at)}</span>,
                },
                {
                  key: 'actions',
                  header: '',
                  align: 'right',
                  render: (j) => (
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<RotateCcw className="h-3 w-3" />}
                      loading={retryMutation.isPending && retryMutation.variables === j.id}
                      onClick={(e) => { e.stopPropagation(); retryMutation.mutate(j.id) }}
                    >
                      Retry
                    </Button>
                  ),
                },
              ]}
            />
            <div className="px-4 pb-4">
              <Pagination page={page} limit={limit} total={total} onPage={setPage} />
            </div>
          </>
        )}
      </Card>

      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title="Failed Delivery"
        subtitle={selected ? `${selected.queue_name} · ${selected.job_name}` : ''}
        width="lg"
      >
        {selected && (
          <div className="space-y-4 text-sm">
            <Row label="Queue"     value={<Badge variant="neutral">{selected.queue_name}</Badge>} />
            <Row label="Job"       value={<span className="font-mono">{selected.job_name}</span>} />
            <Row label="Reference" value={<span className="font-mono text-xs">{selected.reference ?? '—'}</span>} />
            <Row label="Attempts"  value={<span className="text-rose-400 font-bold">{selected.retry_count}</span>} />
            <Row label="Failed At" value={fmtDate(selected.created_at)} />

            <div>
              <p className="text-xs text-ink-faint font-medium mb-1.5">Error Message</p>
              <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-3">
                <p className="text-xs text-rose-300">{selected.error_message}</p>
              </div>
            </div>

            {selected.stack_trace && (
              <div>
                <p className="text-xs text-ink-faint font-medium mb-1.5">Stack Trace</p>
                <pre className="text-xs bg-surface-2 rounded-lg p-3 overflow-auto max-h-64 text-ink-faint whitespace-pre-wrap">
                  {selected.stack_trace}
                </pre>
              </div>
            )}

            <div>
              <p className="text-xs text-ink-faint font-medium mb-1.5">Job Payload</p>
              <pre className="text-xs bg-surface-2 rounded-lg p-3 overflow-auto max-h-48 text-ink-muted">
                {JSON.stringify(selected.payload, null, 2)}
              </pre>
            </div>

            <Button
              variant="secondary"
              size="sm"
              icon={<RotateCcw className="h-3.5 w-3.5" />}
              loading={retryMutation.isPending}
              onClick={() => retryMutation.mutate(selected.id)}
              className="w-full"
            >
              Re-queue Job
            </Button>
          </div>
        )}
      </Drawer>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-xs text-ink-faint w-24 shrink-0">{label}</span>
      <span className="text-sm text-ink text-right">{value}</span>
    </div>
  )
}
