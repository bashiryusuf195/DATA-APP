import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { complianceApi } from '@/api/compliance.api'
import { PageHeader } from '@/components/shared/PageHeader'
import { FilterBar } from '@/components/shared/FilterBar'
import { DataTable } from '@/components/shared/DataTable'
import { Pagination } from '@/components/shared/Pagination'
import { ErrorMessage } from '@/components/shared/ErrorMessage'
import { Button, Badge, Card, Select } from '@/components/ui'
import { SkeletonTable } from '@/components/ui/Skeleton'
import { fmtRelative, fmtDateShort } from '@/utils/format'
import type { ComplianceReport } from '@/types'
import { RefreshCw, FileText, Calendar } from 'lucide-react'

const REPORT_TYPE_LABEL: Record<string, string> = {
  aml:               'AML',
  cft:               'CFT',
  sar:               'SAR',
  velocity:          'Velocity',
  kyc_summary:       'KYC Summary',
  blacklist_summary: 'Blacklist Summary',
}

const REPORT_TYPE_VARIANT: Record<string, 'info' | 'danger' | 'warning' | 'neutral' | 'accent'> = {
  aml:               'danger',
  cft:               'danger',
  sar:               'warning',
  velocity:          'info',
  kyc_summary:       'accent',
  blacklist_summary: 'neutral',
}

const STATUS_VARIANT: Record<string, 'success' | 'neutral'> = {
  final: 'success',
  draft: 'neutral',
}

export function ComplianceReportsPage() {
  const [reportType, setReportType] = useState('')
  const [status, setStatus]         = useState('')
  const [page, setPage]             = useState(1)
  const limit = 25

  useEffect(() => { setPage(1) }, [reportType, status])

  const params = { report_type: reportType || undefined, status: status || undefined, page, limit }

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['compliance-reports', params],
    queryFn: () => complianceApi.listComplianceReports(params),
  })

  const rows  = data?.data  ?? []
  const total = data?.total ?? 0

  const columns = [
    {
      key: 'title', header: 'Report',
      render: (r: ComplianceReport) => (
        <div className="min-w-0 flex items-start gap-2.5">
          <div className="mt-0.5 p-1.5 rounded-lg bg-surface-2 shrink-0">
            <FileText className="h-3.5 w-3.5 text-ink-faint" />
          </div>
          <div>
            <p className="text-sm font-medium text-ink truncate max-w-[240px]">{r.title}</p>
            <Badge size="sm" variant={REPORT_TYPE_VARIANT[r.report_type] ?? 'neutral'} className="mt-0.5">
              {REPORT_TYPE_LABEL[r.report_type] ?? r.report_type}
            </Badge>
          </div>
        </div>
      ),
    },
    {
      key: 'period', header: 'Period',
      render: (r: ComplianceReport) => (
        <div className="flex items-center gap-1 text-xs text-ink-muted">
          <Calendar className="h-3 w-3 text-ink-faint shrink-0" />
          {r.period_start && r.period_end
            ? `${fmtDateShort(r.period_start)} – ${fmtDateShort(r.period_end)}`
            : '—'}
        </div>
      ),
    },
    {
      key: 'summary', header: 'Summary',
      render: (r: ComplianceReport) => (
        <span className="text-xs text-ink-muted truncate max-w-[260px] block">{r.summary ?? '—'}</span>
      ),
    },
    {
      key: 'status', header: 'Status',
      render: (r: ComplianceReport) => (
        <Badge variant={STATUS_VARIANT[r.status] ?? 'neutral'}>{r.status}</Badge>
      ),
    },
    {
      key: 'created', header: 'Generated',
      render: (r: ComplianceReport) => (
        <span className="text-xs text-ink-faint whitespace-nowrap">{fmtRelative(r.created_at)}</span>
      ),
    },
  ]

  if (error) return <ErrorMessage error={error} onRetry={() => void refetch()} endpoint="/admin/compliance/reports" />

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Compliance Reports"
        subtitle="AML, CFT, SAR and regulatory compliance reports"
        actions={
          <Button variant="secondary" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />}
            onClick={() => void refetch()}>Refresh</Button>
        }
      />

      <FilterBar>
        <Select
          value={reportType}
          onChange={(e) => setReportType(e.target.value)}
          options={[
            { value: '', label: 'All types' },
            { value: 'aml',               label: 'AML' },
            { value: 'cft',               label: 'CFT' },
            { value: 'sar',               label: 'SAR' },
            { value: 'velocity',          label: 'Velocity' },
            { value: 'kyc_summary',       label: 'KYC Summary' },
            { value: 'blacklist_summary', label: 'Blacklist Summary' },
          ]}
          className="w-44"
        />
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={[
            { value: '',      label: 'All statuses' },
            { value: 'draft', label: 'Draft' },
            { value: 'final', label: 'Final' },
          ]}
          className="w-32"
        />
        {(reportType || status) && (
          <Button variant="ghost" size="sm" onClick={() => { setReportType(''); setStatus('') }}>Clear</Button>
        )}
      </FilterBar>

      <Card>
        {isLoading ? <SkeletonTable rows={6} /> : (
          <>
            <DataTable
              columns={columns}
              data={rows}
              rowKey={(r) => r.id}
              emptyMessage="No compliance reports generated yet."
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
