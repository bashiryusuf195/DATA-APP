import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import axios from 'axios'
import { financeApi } from '@/api/finance.api'
import { apiClient } from '@/api/client'
import { PageHeader } from '@/components/shared/PageHeader'
import { FilterBar } from '@/components/shared/FilterBar'
import { DataTable } from '@/components/shared/DataTable'
import { ErrorMessage } from '@/components/shared/ErrorMessage'
import { Button, Badge, Card, Input, Select } from '@/components/ui'
import { SkeletonTable } from '@/components/ui/Skeleton'
import { fmtDate } from '@/utils/format'
import type { ReconciliationIssue, IssueSeverity } from '@/types'
import { RefreshCw, CheckCircle2, Hash, AlertTriangle } from 'lucide-react'

function errMsg(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) return err.response?.data?.error ?? err.message ?? fallback
  if (err instanceof Error) return err.message
  return fallback
}

type BadgeVariant = 'success' | 'danger' | 'warning' | 'info' | 'neutral'

function severityVariant(s: IssueSeverity): BadgeVariant {
  return s === 'critical' ? 'danger' : s === 'high' ? 'warning' : s === 'medium' ? 'info' : 'neutral'
}

async function resolveIssue(issueId: string): Promise<void> {
  await apiClient.patch(`/admin/reconciliation/issues/${issueId}`, { resolved: true })
}

export function ReconciliationIssuesPage() {
  const qc = useQueryClient()
  const [search,       setSearch]    = useState('')
  const [severity,     setSeverity]  = useState('')
  const [issueType,    setIssueType] = useState('')
  const [showResolved, setShowResolved] = useState(false)
  const [offset,       setOffset]    = useState(0)
  const limit = 25

  const params = {
    limit,
    offset,
    severity:   severity  || undefined,
    issue_type: issueType || undefined,
    resolved:   showResolved ? undefined : false,
  }

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['recon-issues', params],
    queryFn: () => financeApi.listIssues(params),
  })

  const resolveMutation = useMutation({
    mutationFn: (id: string) => resolveIssue(id),
    onSuccess: () => {
      toast.success('Issue marked as resolved')
      void qc.invalidateQueries({ queryKey: ['recon-issues'] })
    },
    onError: (err) => toast.error(errMsg(err, 'Failed to resolve issue')),
  })

  const issues = data?.data ?? []

  const criticalCount = issues.filter((i) => i.severity === 'critical').length
  const highCount     = issues.filter((i) => i.severity === 'high').length
  const openCount     = issues.filter((i) => !i.resolved).length

  if (error) {
    return <ErrorMessage error={error} onRetry={() => void refetch()} endpoint="/admin/reconciliation/issues" />
  }

  const hasFilters = !!(severity || issueType || showResolved)

  const columns = [
    {
      key: 'severity',
      header: 'Severity',
      render: (i: ReconciliationIssue) => (
        <Badge variant={severityVariant(i.severity)}>{i.severity}</Badge>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (i: ReconciliationIssue) => (
        <span className="text-xs font-mono text-ink-muted">{i.issue_type.replace(/_/g, ' ')}</span>
      ),
    },
    {
      key: 'description',
      header: 'Description',
      render: (i: ReconciliationIssue) => (
        <div className="max-w-[380px]">
          <p className="text-sm text-ink truncate">{i.description}</p>
          {i.transaction_reference && (
            <div className="flex items-center gap-1 mt-0.5">
              <Hash className="h-3 w-3 text-ink-faint" />
              <span className="text-xs font-mono text-ink-faint">{i.transaction_reference}</span>
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (i: ReconciliationIssue) => (
        i.resolved
          ? <Badge variant="success">Resolved</Badge>
          : <Badge variant="warning">Open</Badge>
      ),
    },
    {
      key: 'created',
      header: 'Detected',
      render: (i: ReconciliationIssue) => (
        <span className="text-xs text-ink-faint">{fmtDate(i.created_at)}</span>
      ),
    },
    {
      key: 'action',
      header: '',
      align: 'right' as const,
      render: (i: ReconciliationIssue) =>
        !i.resolved ? (
          <Button
            variant="ghost"
            size="xs"
            icon={<CheckCircle2 className="h-3.5 w-3.5" />}
            onClick={(e) => { e.stopPropagation(); resolveMutation.mutate(i.id) }}
            disabled={resolveMutation.isPending}
          >
            Resolve
          </Button>
        ) : null,
    },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Reconciliation Issues"
        subtitle="Detected anomalies across transactions, ledger entries, and provider records"
        actions={
          <Button variant="secondary" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />}
            onClick={() => void refetch()}>Refresh</Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Open Issues',  value: openCount,     danger: openCount > 0 },
          { label: 'Critical',     value: criticalCount, danger: criticalCount > 0 },
          { label: 'High',         value: highCount,     warn: highCount > 0 },
          { label: 'Total Loaded', value: issues.length },
        ].map(({ label, value, warn, danger }) => (
          <Card key={label} className="p-3 flex flex-col gap-0.5">
            <span className="text-[11px] text-ink-faint uppercase tracking-wide">{label}</span>
            <span className={`text-xl font-semibold ${danger ? 'text-rose-400' : warn ? 'text-amber-400' : 'text-ink'}`}>
              {value}
            </span>
          </Card>
        ))}
      </div>

      {/* Critical banner */}
      {criticalCount > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-900/10 px-4 py-2.5">
          <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
          <span className="text-sm text-rose-300">
            {criticalCount} critical issue{criticalCount > 1 ? 's' : ''} require immediate investigation.
          </span>
        </div>
      )}

      <FilterBar>
        <div className="flex-1 min-w-[200px] max-w-sm">
          <Input
            placeholder="Search descriptions…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          value={severity}
          onChange={(e) => setSeverity(e.target.value)}
          options={[
            { value: '',         label: 'All severities' },
            { value: 'critical', label: 'Critical' },
            { value: 'high',     label: 'High' },
            { value: 'medium',   label: 'Medium' },
            { value: 'low',      label: 'Low' },
          ]}
          className="w-36"
        />
        <Select
          value={issueType}
          onChange={(e) => setIssueType(e.target.value)}
          options={[
            { value: '',                          label: 'All types' },
            { value: 'pending_too_long',          label: 'Pending too long' },
            { value: 'wallet_balance_mismatch',   label: 'Balance mismatch' },
            { value: 'missing_provider_reference',label: 'Missing prov. ref' },
            { value: 'failed_no_refund_metadata', label: 'Failed no refund' },
          ]}
          className="w-40"
        />
        <label className="flex items-center gap-1.5 text-sm text-ink-muted cursor-pointer">
          <input
            type="checkbox"
            className="rounded"
            checked={showResolved}
            onChange={(e) => setShowResolved(e.target.checked)}
          />
          Show resolved
        </label>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={() => {
            setSearch(''); setSeverity(''); setIssueType(''); setShowResolved(false)
          }}>
            Clear
          </Button>
        )}
      </FilterBar>

      <Card>
        {isLoading ? (
          <SkeletonTable rows={8} />
        ) : (
          <DataTable
            columns={columns}
            data={issues.filter((i) =>
              !search || i.description.toLowerCase().includes(search.toLowerCase()) ||
              (i.transaction_reference ?? '').toLowerCase().includes(search.toLowerCase())
            )}
            rowKey={(i) => i.id}
            emptyMessage={hasFilters ? 'No issues match the current filters.' : 'No reconciliation issues found.'}
          />
        )}

        {issues.length === limit && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <Button variant="ghost" size="sm" onClick={() => setOffset(Math.max(0, offset - limit))} disabled={offset === 0}>Previous</Button>
            <span className="text-xs text-ink-faint">Showing {offset + 1}–{offset + issues.length}</span>
            <Button variant="ghost" size="sm" onClick={() => setOffset(offset + limit)}>Next</Button>
          </div>
        )}
      </Card>
    </div>
  )
}
