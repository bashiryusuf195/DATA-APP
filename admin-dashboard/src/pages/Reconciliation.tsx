import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import axios from 'axios'
import { formatDistanceToNow } from 'date-fns'
import { financeApi } from '@/api/finance.api'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataTable } from '@/components/shared/DataTable'
import { ErrorMessage } from '@/components/shared/ErrorMessage'
import { Button, Badge, Card } from '@/components/ui'
import { SkeletonTable } from '@/components/ui/Skeleton'
import { fmtDate } from '@/utils/format'
import type { ReconciliationReport, ReconReportStatus } from '@/types'
import {
  Play, RefreshCw, CheckCircle2, XCircle, Loader2, Clock,
  AlertTriangle, Wrench, RotateCcw, Hourglass, WifiOff,
} from 'lucide-react'

function errMsg(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) return err.response?.data?.error ?? err.message ?? fallback
  if (err instanceof Error) return err.message
  return fallback
}

type BadgeVariant = 'success' | 'danger' | 'warning' | 'info' | 'neutral'

function statusVariant(s: ReconReportStatus): BadgeVariant {
  return s === 'completed' ? 'success' : s === 'failed' ? 'danger' : s === 'running' ? 'info' : 'neutral'
}

function StatusIcon({ status }: { status: ReconReportStatus }) {
  if (status === 'completed') return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
  if (status === 'failed')    return <XCircle      className="h-3.5 w-3.5 text-rose-400" />
  if (status === 'running')   return <Loader2      className="h-3.5 w-3.5 text-blue-400 animate-spin" />
  return <Clock className="h-3.5 w-3.5 text-ink-faint" />
}

function StatCard({
  label, value, icon, color = 'text-ink', sub,
}: {
  label: string
  value: number | string
  icon: React.ReactNode
  color?: string
  sub?: string
}) {
  return (
    <Card className="p-4 flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-ink-faint uppercase tracking-wide">{label}</span>
        <span className="text-ink-faint opacity-60">{icon}</span>
      </div>
      <span className={`text-2xl font-semibold ${color}`}>{value}</span>
      {sub && <span className="text-[10px] text-ink-faint">{sub}</span>}
    </Card>
  )
}

export function ReconciliationPage() {
  const qc = useQueryClient()
  const [offset, setOffset] = useState(0)
  const limit = 20

  const { data: reportsData, isLoading, error, refetch } = useQuery({
    queryKey: ['recon-reports', offset],
    queryFn: () => financeApi.listReports({ limit, offset }),
    refetchInterval: 15_000,
  })

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['recon-stats'],
    queryFn: () => financeApi.getReconciliationStats(),
    refetchInterval: 30_000,
  })

  const runMutation = useMutation({
    mutationFn: () => financeApi.runReconciliation(),
    onSuccess: (res) => {
      toast.success(`Reconciliation queued — job #${res.job_id}`)
      void qc.invalidateQueries({ queryKey: ['recon-reports'] })
      void qc.invalidateQueries({ queryKey: ['recon-stats'] })
    },
    onError: (err) => toast.error(errMsg(err, 'Failed to queue reconciliation')),
  })

  const reports      = reportsData?.data ?? []
  const runningCount = reports.filter((r) => r.status === 'running').length
  const failedCount  = reports.filter((r) => r.status === 'failed').length
  const totalIssues  = reports.reduce((s, r) => s + r.total_issues, 0)

  if (error) {
    return <ErrorMessage error={error} onRetry={() => void refetch()} endpoint="/admin/reconciliation/reports" />
  }

  const columns = [
    {
      key: 'type',
      header: 'Type',
      render: (r: ReconciliationReport) => (
        <span className="text-sm font-medium text-ink capitalize">{r.report_type.replace(/_/g, ' ')}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r: ReconciliationReport) => (
        <div className="flex items-center gap-1.5">
          <StatusIcon status={r.status} />
          <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
        </div>
      ),
    },
    {
      key: 'checked',
      header: 'Checked',
      render: (r: ReconciliationReport) => (
        <span className="text-sm text-ink">{r.total_checked.toLocaleString()}</span>
      ),
    },
    {
      key: 'issues',
      header: 'Issues',
      render: (r: ReconciliationReport) => (
        <span className={`text-sm font-medium ${r.total_issues > 0 ? 'text-amber-400' : 'text-ink-faint'}`}>
          {r.total_issues > 0 ? (
            <span className="flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              {r.total_issues}
            </span>
          ) : '—'}
        </span>
      ),
    },
    {
      key: 'started',
      header: 'Started',
      render: (r: ReconciliationReport) => (
        <span className="text-xs text-ink-faint">{fmtDate(r.started_at)}</span>
      ),
    },
    {
      key: 'completed',
      header: 'Completed',
      render: (r: ReconciliationReport) => (
        <span className="text-xs text-ink-faint">
          {r.completed_at
            ? formatDistanceToNow(new Date(r.completed_at), { addSuffix: true })
            : '—'}
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Reconciliation"
        subtitle="Automated integrity checks, stale transaction repair, and provider verification"
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />}
              onClick={() => { void refetch(); void qc.invalidateQueries({ queryKey: ['recon-stats'] }) }}>
              Refresh
            </Button>
            <Button
              size="sm"
              icon={runMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              onClick={() => runMutation.mutate()}
              disabled={runMutation.isPending}
            >
              {runMutation.isPending ? 'Queuing…' : 'Run Reconciliation Now'}
            </Button>
          </div>
        }
      />

      {/* ── Provider reconciliation stats ──────────────────────────────────── */}
      <div>
        <h2 className="text-xs font-semibold text-ink-faint uppercase tracking-widest mb-3">
          Provider Reconciliation
        </h2>
        {statsLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-24 rounded-xl bg-surface-2 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard
              label="Total Reconciled"
              value={stats?.total_reconciled ?? 0}
              icon={<RefreshCw className="h-4 w-4" />}
            />
            <StatCard
              label="Repaired Successful"
              value={stats?.repaired_successful ?? 0}
              icon={<Wrench className="h-4 w-4" />}
              color={(stats?.repaired_successful ?? 0) > 0 ? 'text-emerald-400' : 'text-ink'}
            />
            <StatCard
              label="Refunded Failed"
              value={stats?.refunded_failed ?? 0}
              icon={<RotateCcw className="h-4 w-4" />}
              color={(stats?.refunded_failed ?? 0) > 0 ? 'text-amber-400' : 'text-ink'}
            />
            <StatCard
              label="Still Pending"
              value={stats?.still_pending ?? 0}
              icon={<Hourglass className="h-4 w-4" />}
              color={(stats?.still_pending ?? 0) > 0 ? 'text-amber-400' : 'text-ink'}
            />
            <StatCard
              label="Provider Errors"
              value={stats?.provider_errors ?? 0}
              icon={<WifiOff className="h-4 w-4" />}
              color={(stats?.provider_errors ?? 0) > 0 ? 'text-rose-400' : 'text-ink'}
            />
            <StatCard
              label="Last Run"
              value={stats?.last_run_at
                ? formatDistanceToNow(new Date(stats.last_run_at), { addSuffix: true })
                : '—'}
              icon={<Clock className="h-4 w-4" />}
              sub={stats?.last_run_at ? fmtDate(stats.last_run_at) : undefined}
            />
          </div>
        )}
      </div>

      {/* ── Audit report run stats ─────────────────────────────────────────── */}
      <div>
        <h2 className="text-xs font-semibold text-ink-faint uppercase tracking-widest mb-3">
          Audit Runs
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total Reports', value: reports.length },
            { label: 'Running',       value: runningCount, warn: runningCount > 0 },
            { label: 'Failed',        value: failedCount,  danger: failedCount > 0 },
            { label: 'Issues Found',  value: totalIssues,  warn: totalIssues > 0 },
          ].map(({ label, value, warn, danger }) => (
            <Card key={label} className="p-3 flex flex-col gap-0.5">
              <span className="text-[11px] text-ink-faint uppercase tracking-wide">{label}</span>
              <span className={`text-xl font-semibold ${danger ? 'text-rose-400' : warn ? 'text-amber-400' : 'text-ink'}`}>
                {value}
              </span>
            </Card>
          ))}
        </div>
      </div>

      {/* ── Report history table ───────────────────────────────────────────── */}
      <Card>
        {isLoading ? (
          <SkeletonTable rows={8} />
        ) : (
          <DataTable
            columns={columns}
            data={reports}
            rowKey={(r) => r.id}
            emptyMessage="No reconciliation reports yet. Click Run Reconciliation Now to start."
          />
        )}

        {reports.length === limit && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <Button variant="ghost" size="sm"
              onClick={() => setOffset(Math.max(0, offset - limit))}
              disabled={offset === 0}>
              Previous
            </Button>
            <span className="text-xs text-ink-faint">Showing {offset + 1}–{offset + reports.length}</span>
            <Button variant="ghost" size="sm" onClick={() => setOffset(offset + limit)}>Next</Button>
          </div>
        )}
      </Card>
    </div>
  )
}
