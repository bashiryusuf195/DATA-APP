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
import { Play, RefreshCw, CheckCircle2, XCircle, Loader2, Clock, AlertTriangle } from 'lucide-react'

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

export function ReconciliationPage() {
  const qc = useQueryClient()
  const [offset, setOffset] = useState(0)
  const limit = 20

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['recon-reports', offset],
    queryFn: () => financeApi.listReports({ limit, offset }),
    refetchInterval: 15_000,
  })

  const runMutation = useMutation({
    mutationFn: () => financeApi.runReconciliation(),
    onSuccess: (res) => {
      toast.success(`Reconciliation queued — job #${res.job_id}`)
      void qc.invalidateQueries({ queryKey: ['recon-reports'] })
    },
    onError: (err) => toast.error(errMsg(err, 'Failed to queue reconciliation')),
  })

  const reports = data?.data ?? []

  const runningCount  = reports.filter((r) => r.status === 'running').length
  const failedCount   = reports.filter((r) => r.status === 'failed').length
  const totalIssues   = reports.reduce((s, r) => s + r.total_issues, 0)

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
        title="Reconciliation Reports"
        subtitle="Automated integrity checks across transactions, ledger, and provider records"
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />}
              onClick={() => void refetch()}>Refresh</Button>
            <Button
              variant="primary"
              size="sm"
              icon={runMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              onClick={() => runMutation.mutate()}
              disabled={runMutation.isPending}
            >
              {runMutation.isPending ? 'Queuing…' : 'Run Now'}
            </Button>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Reports',   value: reports.length },
          { label: 'Running',         value: runningCount,  warn: runningCount > 0 },
          { label: 'Failed',          value: failedCount,   danger: failedCount > 0 },
          { label: 'Issues Found',    value: totalIssues,   warn: totalIssues > 0 },
        ].map(({ label, value, warn, danger }) => (
          <Card key={label} className="p-3 flex flex-col gap-0.5">
            <span className="text-[11px] text-ink-faint uppercase tracking-wide">{label}</span>
            <span className={`text-xl font-semibold ${danger ? 'text-rose-400' : warn ? 'text-amber-400' : 'text-ink'}`}>
              {value}
            </span>
          </Card>
        ))}
      </div>

      <Card>
        {isLoading ? (
          <SkeletonTable rows={8} />
        ) : (
          <DataTable
            columns={columns}
            data={reports}
            rowKey={(r) => r.id}
            emptyMessage="No reconciliation reports yet. Click Run Now to start a check."
          />
        )}

        {/* Pagination */}
        {reports.length === limit && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <Button variant="ghost" size="sm" onClick={() => setOffset(Math.max(0, offset - limit))} disabled={offset === 0}>Previous</Button>
            <span className="text-xs text-ink-faint">Showing {offset + 1}–{offset + reports.length}</span>
            <Button variant="ghost" size="sm" onClick={() => setOffset(offset + limit)}>Next</Button>
          </div>
        )}
      </Card>
    </div>
  )
}
