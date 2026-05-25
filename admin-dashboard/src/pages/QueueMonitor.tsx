import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queueApi } from '@/api/queue.api'
import { useAuthStore } from '@/store/auth.store'
import { PageHeader } from '@/components/shared/PageHeader'
import { ErrorMessage } from '@/components/shared/ErrorMessage'
import { Button, Badge, Card } from '@/components/ui'
import { SkeletonCard } from '@/components/ui/Skeleton'
import { fmtRelative } from '@/utils/format'
import { cn } from '@/utils/cn'
import type { QueueStats, QueueJobItem, JobState } from '@/types'
import {
  RefreshCw, RotateCcw, Trash2, Activity, AlertTriangle,
  CheckCircle2, Clock, Layers, XCircle,
  Eye, Pause, Play,
} from 'lucide-react'
import toast from 'react-hot-toast'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtAge(ms: number | null): string {
  if (ms === null) return '—'
  if (ms < 60_000)   return `${Math.round(ms / 1000)}s`
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`
  return `${Math.round(ms / 3_600_000)}h`
}

function fmtEpoch(ms: number | null): string {
  if (!ms) return '—'
  return fmtRelative(new Date(ms).toISOString())
}

function statusColor(q: QueueStats) {
  if (q.failed > 0 || q.paused) return 'border-rose-500/30 bg-rose-500/5'
  if (q.waiting > 5 || q.delayed > 0) return 'border-amber-500/30 bg-amber-500/5'
  return 'border-emerald-500/30 bg-emerald-500/5'
}

function healthDot(q: QueueStats) {
  if (q.failed > 0 || q.paused) return 'bg-rose-500'
  if (q.waiting > 5 || q.delayed > 0) return 'bg-amber-500'
  return 'bg-emerald-500'
}

// ── Job state badge ────────────────────────────────────────────────────────────

function StateBadge({ state }: { state: string }) {
  const map: Record<string, string> = {
    waiting:   'bg-blue-500/15 text-blue-400 border-blue-500/30',
    active:    'bg-amber-500/15 text-amber-400 border-amber-500/30',
    completed: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    failed:    'bg-rose-500/15 text-rose-400 border-rose-500/30',
    delayed:   'bg-purple-500/15 text-purple-400 border-purple-500/30',
  }
  return (
    <span className={cn('inline-flex px-1.5 py-0.5 rounded border text-[10px] font-semibold uppercase', map[state] ?? 'bg-surface-2 text-ink-faint border-border')}>
      {state}
    </span>
  )
}

// ── Job drilldown panel ────────────────────────────────────────────────────────

function JobPanel({
  queueName,
  state,
  isSuperAdmin,
  onClose,
}: {
  queueName:    string
  state:        JobState
  isSuperAdmin: boolean
  onClose:      () => void
}) {
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['queue-jobs', queueName, state, page],
    queryFn:  () => queueApi.queueJobs(queueName, state, page, 25),
    refetchInterval: 15_000,
  })

  const retryMut = useMutation({
    mutationFn: ({ jobId }: { jobId: string }) => queueApi.retryQueueJob(queueName, jobId),
    onSuccess: (_, { jobId }) => {
      void qc.invalidateQueries({ queryKey: ['queue-jobs', queueName] })
      void qc.invalidateQueries({ queryKey: ['queue-stats'] })
      toast.success(`Job ${jobId} re-queued`)
    },
    onError: () => toast.error('Retry failed'),
  })

  const removeMut = useMutation({
    mutationFn: ({ jobId }: { jobId: string }) => queueApi.removeQueueJob(queueName, jobId),
    onSuccess: (_, { jobId }) => {
      void qc.invalidateQueries({ queryKey: ['queue-jobs', queueName] })
      void qc.invalidateQueries({ queryKey: ['queue-stats'] })
      toast.success(`Job ${jobId} removed`)
    },
    onError: () => toast.error('Remove failed'),
  })

  const jobs: QueueJobItem[] = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / 25)

  return (
    <Card padding="none" className="mt-4">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <StateBadge state={state} />
          <span className="font-semibold text-sm text-ink font-mono">{queueName}</span>
          {total > 0 && <span className="text-xs text-ink-faint">({total} jobs)</span>}
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>✕ Close</Button>
      </div>

      {isLoading ? (
        <div className="p-6 text-center text-ink-faint text-sm animate-pulse">Loading jobs…</div>
      ) : error ? (
        <div className="p-6 text-center text-rose-400 text-sm">Failed to load jobs.</div>
      ) : jobs.length === 0 ? (
        <div className="p-8 flex flex-col items-center gap-2 text-ink-faint">
          <CheckCircle2 className="h-8 w-8 opacity-30" />
          <p className="text-sm">No {state} jobs in this queue.</p>
        </div>
      ) : (
        <div className="divide-y divide-border/50">
          {jobs.map((job) => {
            const isExpanded = expandedId === job.id
            return (
              <div key={job.id} className="px-5 py-3 space-y-2">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs text-ink-faint">#{job.id}</span>
                      <span className="text-sm font-medium text-ink truncate">{job.name}</span>
                      {job.attempts_made > 0 && (
                        <Badge variant="neutral" size="sm">{job.attempts_made} attempts</Badge>
                      )}
                    </div>
                    {job.failed_reason && (
                      <p className="text-xs text-rose-400 mt-0.5 truncate">{job.failed_reason}</p>
                    )}
                    <p className="text-[10px] text-ink-faint mt-0.5">
                      Created {fmtEpoch(job.timestamp)}
                      {job.finished_on && ` · finished ${fmtEpoch(job.finished_on)}`}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : job.id)}
                      className="p-1.5 rounded hover:bg-surface-2 text-ink-faint hover:text-ink transition-colors"
                      title="Inspect payload"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </button>

                    {state === 'failed' && (
                      <button
                        onClick={() => retryMut.mutate({ jobId: job.id })}
                        disabled={retryMut.isPending}
                        className="p-1.5 rounded hover:bg-surface-2 text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-40"
                        title="Retry job"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </button>
                    )}

                    {(isSuperAdmin || state === 'failed') && (
                      <button
                        onClick={() => {
                          if (!window.confirm(`Remove job ${job.id} from ${queueName}?`)) return
                          removeMut.mutate({ jobId: job.id })
                        }}
                        disabled={removeMut.isPending}
                        className="p-1.5 rounded hover:bg-surface-2 text-rose-400 hover:text-rose-300 transition-colors disabled:opacity-40"
                        title="Remove job"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <pre className="rounded-md bg-surface-2 p-3 text-[10px] text-ink-muted font-mono overflow-x-auto max-h-48 whitespace-pre-wrap break-all">
                    {JSON.stringify(job.data, null, 2)}
                  </pre>
                )}
              </div>
            )
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-border">
          <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Prev</Button>
          <span className="text-xs text-ink-faint">Page {page} / {totalPages}</span>
          <Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next →</Button>
        </div>
      )}
    </Card>
  )
}

// ── Queue card ─────────────────────────────────────────────────────────────────

function QueueCard({
  q,
  isSuperAdmin,
  onClearCompleted,
  clearing,
}: {
  q:                QueueStats
  isSuperAdmin:     boolean
  onClearCompleted: () => void
  clearing:         boolean
}) {
  const [drillState, setDrillState] = useState<JobState | null>(null)

  const counts: Array<{ label: string; value: number; state: JobState; color: string }> = [
    { label: 'Waiting',   value: q.waiting,   state: 'waiting',   color: q.waiting   > 5  ? 'text-amber-400' : 'text-ink' },
    { label: 'Active',    value: q.active,    state: 'active',    color: q.active    > 0  ? 'text-blue-400'  : 'text-ink' },
    { label: 'Delayed',   value: q.delayed,   state: 'delayed',   color: q.delayed   > 0  ? 'text-purple-400': 'text-ink' },
    { label: 'Failed',    value: q.failed,    state: 'failed',    color: q.failed    > 0  ? 'text-rose-400'  : 'text-ink' },
    { label: 'Completed', value: q.completed, state: 'completed', color: 'text-emerald-400' },
  ]

  const toggleDrill = (state: JobState) =>
    setDrillState((prev) => (prev === state ? null : state))

  return (
    <div>
      <Card className={cn('flex flex-col gap-3', statusColor(q))}>
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className={cn('h-2 w-2 rounded-full shrink-0', healthDot(q))} />
            <span className="font-mono text-sm font-semibold text-ink truncate">{q.name}</span>
            {q.paused && (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-400 border border-amber-500/30 bg-amber-500/10 px-1.5 rounded">
                <Pause className="h-2.5 w-2.5" /> Paused
              </span>
            )}
          </div>
          {q.failed > 0 && (
            <Badge variant="danger" size="sm">{q.failed} failed</Badge>
          )}
        </div>

        {/* Count grid — each cell is clickable to drill into that state */}
        <div className="grid grid-cols-5 gap-1.5">
          {counts.map(({ label, value, state, color }) => (
            <button
              key={state}
              onClick={() => toggleDrill(state)}
              className={cn(
                'flex flex-col items-center rounded-lg p-1.5 transition-colors',
                drillState === state ? 'bg-accent-subtle ring-1 ring-accent' : 'bg-surface-2 hover:bg-surface-3',
              )}
              title={`View ${label} jobs`}
            >
              <span className={cn('text-base font-bold leading-none', color)}>{value}</span>
              <span className="text-[9px] text-ink-faint mt-0.5">{label}</span>
            </button>
          ))}
        </div>

        {/* Metadata row */}
        <div className="text-[11px] text-ink-faint space-y-0.5">
          {q.oldest_waiting_age_ms !== null && (
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Oldest waiting: <span className="text-ink-muted">{fmtAge(q.oldest_waiting_age_ms)}</span>
            </div>
          )}
          {q.latest_failure_reason && (
            <div className="flex items-start gap-1">
              <AlertTriangle className="h-3 w-3 text-rose-400 shrink-0 mt-px" />
              <span className="truncate text-rose-400">{q.latest_failure_reason}</span>
            </div>
          )}
          {q.latest_failure_at && (
            <div className="text-[10px] text-ink-faint">Last failure: {fmtEpoch(q.latest_failure_at)}</div>
          )}
        </div>

        {/* Actions */}
        {isSuperAdmin && q.completed > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-ink-faint text-[11px]"
            icon={<Trash2 className="h-3 w-3" />}
            loading={clearing}
            onClick={() => {
              if (!window.confirm(`Clear all completed jobs in '${q.name}'?`)) return
              onClearCompleted()
            }}
          >
            Clear {q.completed} completed
          </Button>
        )}
      </Card>

      {/* Drilldown panel renders below the card */}
      {drillState && (
        <JobPanel
          queueName={q.name}
          state={drillState}
          isSuperAdmin={isSuperAdmin}
          onClose={() => setDrillState(null)}
        />
      )}
    </div>
  )
}

// ── Summary tile ───────────────────────────────────────────────────────────────

function Tile({ label, value, sub, icon, color = 'text-ink' }: {
  label: string; value: string | number; sub?: string
  icon: React.ReactNode; color?: string
}) {
  return (
    <div className="bg-surface-1 border border-border rounded-xl p-4 flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-ink-faint uppercase tracking-wide">{label}</span>
        <span className="text-ink-faint opacity-50">{icon}</span>
      </div>
      <span className={cn('text-2xl font-semibold', color)}>{value}</span>
      {sub && <span className="text-[10px] text-ink-faint">{sub}</span>}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function QueueMonitorPage() {
  const qc   = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const isSuperAdmin = user?.role === 'super_admin'

  const { data: queues = [], isLoading, error, refetch } = useQuery({
    queryKey: ['queue-stats'],
    queryFn:  queueApi.queueStats,
    refetchInterval: 30_000,
  })

  const clearMut = useMutation({
    mutationFn: (queueName: string) => queueApi.clearCompleted(queueName),
    onSuccess: (res, queueName) => {
      void qc.invalidateQueries({ queryKey: ['queue-stats'] })
      toast.success(`Cleared ${res.removed} completed jobs from ${queueName}`)
    },
    onError: () => toast.error('Clear failed'),
  })

  const totalWaiting   = queues.reduce((s, q) => s + q.waiting,   0)
  const totalActive    = queues.reduce((s, q) => s + q.active,    0)
  const totalFailed    = queues.reduce((s, q) => s + q.failed,    0)
  const totalDelayed   = queues.reduce((s, q) => s + q.delayed,   0)
  const totalCompleted = queues.reduce((s, q) => s + q.completed, 0)
  const pausedCount    = queues.filter((q) => q.paused).length

  const [filter, setFilter] = useState<'all' | 'failed' | 'active' | 'dlq'>('all')

  const filtered = queues.filter((q) => {
    if (filter === 'failed') return q.failed > 0
    if (filter === 'active') return q.active > 0 || q.waiting > 0
    if (filter === 'dlq')    return q.name.includes('dlq')
    return true
  })

  if (error) return (
    <ErrorMessage error={error} onRetry={() => void refetch()} endpoint="/admin/queue-monitor" />
  )

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Queue Monitor"
        subtitle="Live BullMQ job health — waiting, active, failed, and delayed counts from Redis"
        actions={
          <Button variant="secondary" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />}
            onClick={() => void refetch()}>Refresh</Button>
        }
      />

      {/* ── Summary tiles ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-surface-2 animate-pulse" />
          ))
        ) : (
          <>
            <Tile label="Queues"     value={queues.length}  icon={<Layers      className="h-4 w-4" />} />
            <Tile label="Waiting"    value={totalWaiting}   icon={<Clock       className="h-4 w-4" />}
              color={totalWaiting > 10 ? 'text-amber-400' : 'text-ink'} />
            <Tile label="Active"     value={totalActive}    icon={<Activity    className="h-4 w-4" />}
              color={totalActive  > 0  ? 'text-blue-400'  : 'text-ink'} />
            <Tile label="Failed"     value={totalFailed}    icon={<XCircle     className="h-4 w-4" />}
              color={totalFailed  > 0  ? 'text-rose-400'  : 'text-ink'}
              sub={totalFailed > 0 ? 'needs attention' : 'all clear'} />
            <Tile label="Delayed"    value={totalDelayed}   icon={<AlertTriangle className="h-4 w-4" />}
              color={totalDelayed > 0  ? 'text-purple-400': 'text-ink'} />
            <Tile label="Completed"  value={totalCompleted} icon={<CheckCircle2 className="h-4 w-4" />}
              color="text-emerald-400"
              sub={pausedCount > 0 ? `${pausedCount} paused` : undefined} />
          </>
        )}
      </div>

      {/* ── Filters ───────────────────────────────────────────────────────── */}
      <div className="flex gap-2 flex-wrap">
        {([
          { key: 'all',    label: 'All queues' },
          { key: 'failed', label: `Failed (${totalFailed})` },
          { key: 'active', label: `Active / Waiting` },
          { key: 'dlq',    label: 'Dead-letter' },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border',
              filter === key
                ? 'bg-accent text-white border-accent'
                : 'bg-surface-1 text-ink-muted border-border hover:text-ink hover:border-ink-faint',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Queue grid ────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-ink-faint">
            <Play className="h-8 w-8 opacity-30" />
            <p className="text-sm">No queues match this filter.</p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((q) => (
            <QueueCard
              key={q.name}
              q={q}
              isSuperAdmin={isSuperAdmin}
              onClearCompleted={() => clearMut.mutate(q.name)}
              clearing={clearMut.isPending && clearMut.variables === q.name}
            />
          ))}
        </div>
      )}

      {!isLoading && (
        <p className="text-[11px] text-ink-faint text-center">
          Auto-refreshes every 30 s · Click a count cell to inspect jobs
          {!isSuperAdmin && ' · Super-admin required to clear completed jobs'}
        </p>
      )}
    </div>
  )
}
