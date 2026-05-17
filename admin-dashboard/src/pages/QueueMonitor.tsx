import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { queueApi } from '@/api/queue.api'
import { PageHeader } from '@/components/shared/PageHeader'
import { MetricCard } from '@/components/shared/MetricCard'
import { ErrorMessage } from '@/components/shared/ErrorMessage'
import { Button, Badge, Card } from '@/components/ui'
import { SkeletonCard } from '@/components/ui/Skeleton'
import { fmtDate } from '@/utils/format'
import type { FailedJob } from '@/types'
import { RefreshCw, CheckCircle, XCircle, Clock, Layers } from 'lucide-react'
import { ENDPOINTS } from '@/config/endpoints'

export function QueueMonitorPage() {
  const { data: raw, isLoading, error, refetch } = useQuery({
    queryKey: ['queue-monitor'],
    queryFn: () => queueApi.failedJobs({ limit: 100 }),
    refetchInterval: 30_000,
  })

  const jobs: FailedJob[] = raw?.data ?? []
  const totalFailed = raw?.total ?? jobs.length

  const queueMap = jobs.reduce<Record<string, number>>((acc, j) => {
    const q = j.queue_name ?? 'unknown'
    acc[q] = (acc[q] ?? 0) + 1
    return acc
  }, {})
  const queues = Object.entries(queueMap)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)

  const maxRetries = jobs.length ? Math.max(...jobs.map((j) => j.retry_count ?? 0)) : 0
  const recentFailed = jobs.slice(0, 5)

  if (error) return <ErrorMessage error={error} onRetry={() => void refetch()} endpoint={ENDPOINTS.failedJobs.path} />

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Queue Monitor"
        subtitle="BullMQ worker queues and dead-letter jobs"
        actions={
          <Button variant="secondary" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />}
            onClick={() => void refetch()}>Refresh</Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <MetricCard
              label="Failed Jobs"
              value={totalFailed}
              sub="in dead-letter queue"
              icon={<XCircle className="h-4 w-4" />}
              variant={totalFailed > 0 ? 'danger' : 'success'}
            />
            <MetricCard
              label="Queues Affected"
              value={queues.length}
              sub="distinct queue names"
              icon={<Layers className="h-4 w-4" />}
              variant={queues.length > 0 ? 'warning' : 'default'}
            />
            <MetricCard
              label="Highest Retries"
              value={maxRetries}
              sub="max retry count seen"
              icon={<Clock className="h-4 w-4" />}
              variant={maxRetries >= 5 ? 'warning' : 'default'}
            />
            <MetricCard
              label="System Status"
              value={totalFailed === 0 ? 'Healthy' : 'Degraded'}
              sub={totalFailed === 0 ? 'no failed jobs' : `${totalFailed} failed`}
              icon={<CheckCircle className="h-4 w-4" />}
              variant={totalFailed === 0 ? 'success' : 'danger'}
            />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Queue breakdown */}
        <Card>
          <h3 className="text-sm font-semibold text-ink mb-4">Queue Breakdown</h3>
          {queues.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-center">
              <CheckCircle className="h-8 w-8 text-emerald-400 opacity-60 mb-2" />
              <p className="text-sm text-ink-faint">All queues healthy</p>
            </div>
          ) : (
            <div className="space-y-1">
              {queues.map(({ name, count }) => (
                <div
                  key={name}
                  className="flex items-center justify-between py-2 border-b border-border/50 last:border-0"
                >
                  <span className="font-mono text-sm text-ink">{name}</span>
                  <Badge variant={count >= 5 ? 'danger' : 'warning'}>{count}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Recent failures */}
        <div className="xl:col-span-2">
          <Card padding="none">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h3 className="text-sm font-semibold text-ink">Recent Failures</h3>
              <Link to="/failed-jobs" className="text-xs text-accent hover:underline">
                View all →
              </Link>
            </div>
            {recentFailed.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <CheckCircle className="h-10 w-10 text-emerald-400 opacity-50 mb-3" />
                <p className="text-sm text-ink-faint">No failed jobs — queues are healthy</p>
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {recentFailed.map((j) => (
                  <div key={j.id} className="flex items-center gap-3 px-5 py-3">
                    <XCircle className="h-4 w-4 text-rose-400 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink truncate">{j.job_name}</p>
                      <p className="text-xs text-rose-400 truncate">{j.error_message}</p>
                    </div>
                    <div className="shrink-0 text-right ml-2">
                      <Badge variant="neutral" size="sm">{j.queue_name}</Badge>
                      <p className="text-[11px] text-ink-faint mt-1">{fmtDate(j.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
