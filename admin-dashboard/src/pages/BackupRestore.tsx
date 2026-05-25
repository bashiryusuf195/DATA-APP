import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { backupApi } from '@/api/backup.api'
import type { IntegrityReport } from '@/api/backup.api'
import { PageHeader }   from '@/components/shared/PageHeader'
import { ErrorMessage } from '@/components/shared/ErrorMessage'
import { Card }         from '@/components/ui'
import { Button }       from '@/components/ui'
import { Badge }        from '@/components/ui'
import { Input }        from '@/components/ui'
import { SkeletonTable } from '@/components/ui'
import { fmtRelative }  from '@/utils/format'
import {
  Download, Play, RefreshCw, ChevronDown, ChevronRight,
  CheckCircle2, AlertTriangle, XCircle, FileText,
  Database, Users, Activity, BarChart2, ShieldCheck,
} from 'lucide-react'

// ── Helpers ───────────────────────────────────────────────────────────────────

function severityVariant(r: IntegrityReport): 'success' | 'warning' | 'danger' {
  if (r.critical_issues > 0) return 'danger'
  if (r.total_issues > 0)    return 'warning'
  return 'success'
}

function SeverityBadge({ report }: { report: IntegrityReport }) {
  const v = severityVariant(report)
  const label =
    v === 'danger'  ? 'Critical' :
    v === 'warning' ? 'Warning'  : 'Passed'
  return <Badge variant={v} dot>{label}</Badge>
}

function SeverityIcon({ report }: { report: IntegrityReport }) {
  if (report.critical_issues > 0) return <XCircle className="h-5 w-5 text-red-400" />
  if (report.total_issues > 0)    return <AlertTriangle className="h-5 w-5 text-yellow-400" />
  return <CheckCircle2 className="h-5 w-5 text-green-400" />
}

function fmt(n: number | undefined) { return (n ?? 0).toLocaleString() }

function today() { return new Date().toISOString().slice(0, 10) }
function ninetyDaysAgo() {
  const d = new Date()
  d.setDate(d.getDate() - 90)
  return d.toISOString().slice(0, 10)
}

// ── Section: Data Exports ──────────────────────────────────────────────────────

function ExportSection() {
  const [from, setFrom] = useState(ninetyDaysAgo())
  const [to,   setTo]   = useState(today())
  const [downloading, setDownloading] = useState<string | null>(null)

  async function dl(key: string, fn: () => Promise<void>) {
    setDownloading(key)
    try { await fn() } finally { setDownloading(null) }
  }

  const exports: Array<{
    key: string
    label: string
    description: string
    icon: React.ReactNode
    role?: string
    action: () => Promise<void>
  }> = [
    {
      key: 'transactions',
      label: 'Transactions',
      description: 'All purchase transactions with status, amount, and provider info.',
      icon: <Activity className="h-4 w-4" />,
      action: () => backupApi.downloadTransactions({ from, to }),
    },
    {
      key: 'wallet-ledger',
      label: 'Wallet Ledger',
      description: 'Immutable double-entry ledger entries. Super admin only.',
      icon: <Database className="h-4 w-4" />,
      role: 'super_admin',
      action: () => backupApi.downloadWalletLedger({ from, to }),
    },
    {
      key: 'users',
      label: 'Users',
      description: 'User accounts with masked phone numbers. Super admin only.',
      icon: <Users className="h-4 w-4" />,
      role: 'super_admin',
      action: () => backupApi.downloadUsers({ from, to }),
    },
    {
      key: 'provider-attempts',
      label: 'Provider Attempts',
      description: 'Provider API call logs (no credentials or raw payloads).',
      icon: <BarChart2 className="h-4 w-4" />,
      action: () => backupApi.downloadProviderAttempts({ from, to }),
    },
    {
      key: 'reconciliation-reports',
      label: 'Reconciliation Reports',
      description: 'Daily reconciliation run summaries.',
      icon: <FileText className="h-4 w-4" />,
      action: () => backupApi.downloadReconciliationReports({ from, to }),
    },
  ]

  return (
    <Card className="p-6 space-y-5">
      <div className="flex items-center gap-2">
        <Download className="h-5 w-5 text-blue-400" />
        <h2 className="text-base font-semibold text-white">Data Exports</h2>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400">From</label>
          <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-40" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400">To</label>
          <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-40" />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {exports.map(ex => (
          <div
            key={ex.key}
            className="flex items-start justify-between gap-3 rounded-lg border border-white/10 bg-white/5 p-4"
          >
            <div className="flex items-start gap-3 min-w-0">
              <span className="mt-0.5 text-blue-400 shrink-0">{ex.icon}</span>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-white">{ex.label}</span>
                  {ex.role && (
                    <Badge variant="neutral" className="text-[10px]">super_admin</Badge>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-0.5">{ex.description}</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => dl(ex.key, ex.action)}
              disabled={downloading !== null}
              className="shrink-0"
            >
              {downloading === ex.key
                ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                : <Download className="h-3.5 w-3.5" />
              }
            </Button>
          </div>
        ))}
      </div>
    </Card>
  )
}

// ── Report detail row ─────────────────────────────────────────────────────────

function ReportRow({ report }: { report: IntegrityReport }) {
  const [expanded, setExpanded] = useState(false)

  const checks = [
    { label: 'Orphan Transactions',    result: report.orphan_transactions,    critical: true },
    { label: 'Negative Balances',      result: report.negative_balances,      critical: true },
    { label: 'Duplicate Provider Refs',result: report.duplicate_provider_refs,critical: true },
    { label: 'Duplicate Purchases',    result: report.duplicate_purchases,    critical: false },
    { label: 'Ghost Batches',          result: report.ghost_batches,          critical: false },
  ]

  return (
    <>
      <tr
        className="cursor-pointer hover:bg-white/5 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            {expanded
              ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
              : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
            }
            <SeverityIcon report={report} />
          </div>
        </td>
        <td className="px-4 py-3 text-sm text-gray-300">{fmtRelative(report.run_at)}</td>
        <td className="px-4 py-3 text-sm text-gray-400 font-mono text-xs">{report.run_by}</td>
        <td className="px-4 py-3"><SeverityBadge report={report} /></td>
        <td className="px-4 py-3 text-sm text-center">
          {report.critical_issues > 0
            ? <span className="text-red-400 font-medium">{fmt(report.critical_issues)}</span>
            : <span className="text-gray-500">—</span>
          }
        </td>
        <td className="px-4 py-3 text-sm text-center text-gray-300">{fmt(report.total_issues)}</td>
        <td className="px-4 py-3 text-sm text-gray-400">{report.duration_ms}ms</td>
      </tr>

      {expanded && (
        <tr>
          <td colSpan={7} className="bg-white/[0.03] px-4 py-4">
            <div className="space-y-3">
              {checks.map(c => (
                <div key={c.label} className="flex items-start gap-3">
                  <span className="mt-0.5">
                    {c.result.issue_count === 0
                      ? <CheckCircle2 className="h-4 w-4 text-green-400" />
                      : c.critical
                      ? <XCircle className="h-4 w-4 text-red-400" />
                      : <AlertTriangle className="h-4 w-4 text-yellow-400" />
                    }
                  </span>
                  <div>
                    <span className="text-sm text-white">{c.label}</span>
                    <span className="ml-2 text-xs text-gray-400">
                      {c.result.issue_count === 0
                        ? 'No issues'
                        : `${c.result.issue_count} issue${c.result.issue_count === 1 ? '' : 's'}`
                      }
                    </span>
                    {c.result.issues.length > 0 && (
                      <div className="mt-1 space-y-0.5">
                        {c.result.issues.slice(0, 5).map((issue, i) => (
                          <p key={i} className="text-xs text-gray-500 font-mono">
                            {issue.reference ?? issue.id ?? JSON.stringify(issue)}
                          </p>
                        ))}
                        {c.result.issues.length > 5 && (
                          <p className="text-xs text-gray-600">+{c.result.issues.length - 5} more</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ── Section: Integrity Checks ──────────────────────────────────────────────────

function IntegritySection() {
  const qc = useQueryClient()

  const { data: reports, isLoading, error, refetch } = useQuery({
    queryKey: ['integrity-reports'],
    queryFn: () => backupApi.listIntegrityReports(),
  })

  const runMutation = useMutation({
    mutationFn: () => backupApi.runIntegrityCheck(),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['integrity-reports'] }) },
  })

  const latest = reports?.[0]

  return (
    <Card className="p-6 space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-blue-400" />
          <h2 className="text-base font-semibold text-white">Integrity Checks</h2>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => runMutation.mutate()}
            disabled={runMutation.isPending}
          >
            {runMutation.isPending
              ? <><RefreshCw className="h-3.5 w-3.5 animate-spin mr-1.5" />Running…</>
              : <><Play className="h-3.5 w-3.5 mr-1.5" />Run Check</>
            }
          </Button>
        </div>
      </div>

      {runMutation.isError && (
        <ErrorMessage message={(runMutation.error as Error).message} />
      )}

      {latest && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Last Run',        value: fmtRelative(latest.run_at) },
            { label: 'Status',          value: <SeverityBadge report={latest} /> },
            { label: 'Critical Issues', value: <span className={latest.critical_issues > 0 ? 'text-red-400' : 'text-green-400'}>{fmt(latest.critical_issues)}</span> },
            { label: 'Total Issues',    value: fmt(latest.total_issues) },
          ].map(m => (
            <div key={m.label} className="rounded-lg border border-white/10 bg-white/5 p-3">
              <p className="text-xs text-gray-400">{m.label}</p>
              <div className="mt-1 text-sm font-medium text-white">{m.value}</div>
            </div>
          ))}
        </div>
      )}

      {error && <ErrorMessage message={(error as Error).message} />}

      {isLoading ? (
        <SkeletonTable rows={4} cols={7} />
      ) : !reports?.length ? (
        <p className="text-sm text-gray-500 text-center py-6">No reports yet. Run your first check.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/10 text-xs text-gray-400 uppercase tracking-wide">
                <th className="px-4 py-3 w-10" />
                <th className="px-4 py-3">Run At</th>
                <th className="px-4 py-3">Run By</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-center">Critical</th>
                <th className="px-4 py-3 text-center">Total</th>
                <th className="px-4 py-3">Duration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {reports.map(r => <ReportRow key={r.id} report={r} />)}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function BackupRestorePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Backup & Integrity"
        description="Export platform data as CSV and run integrity checks on the ledger."
      />
      <ExportSection />
      <IntegritySection />
    </div>
  )
}
