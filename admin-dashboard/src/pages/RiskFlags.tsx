import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import axios from 'axios'
import { complianceApi } from '@/api/compliance.api'
import { PageHeader } from '@/components/shared/PageHeader'
import { FilterBar } from '@/components/shared/FilterBar'
import { DataTable } from '@/components/shared/DataTable'
import { Pagination } from '@/components/shared/Pagination'
import { ErrorMessage } from '@/components/shared/ErrorMessage'
import { MetricCard } from '@/components/shared/MetricCard'
import { Drawer } from '@/components/shared/Drawer'
import { Button, Badge, Card, Select, Input, Modal } from '@/components/ui'
import { SkeletonTable, SkeletonCard } from '@/components/ui/Skeleton'
import { fmtDate, fmtRelative } from '@/utils/format'
import type { RiskFlag, FlagType, FlagSeverity, FlagStatus } from '@/types'
import {
  Plus, RefreshCw, AlertTriangle, ShieldOff,
  Search, CheckCircle2,
} from 'lucide-react'

function errMsg(e: unknown, fallback: string) {
  if (axios.isAxiosError(e)) return e.response?.data?.error ?? e.message ?? fallback
  if (e instanceof Error) return e.message
  return fallback
}

const SEVERITY_VARIANT: Record<FlagSeverity, 'danger' | 'warning' | 'info' | 'neutral'> = {
  critical: 'danger',
  high:     'danger',
  medium:   'warning',
  low:      'neutral',
}

const STATUS_VARIANT: Record<FlagStatus, 'danger' | 'warning' | 'info' | 'success' | 'neutral'> = {
  open:          'danger',
  investigating: 'warning',
  resolved:      'success',
  dismissed:     'neutral',
}

const FLAG_TYPE_LABELS: Record<FlagType, string> = {
  suspicious_volume:  'Suspicious Volume',
  duplicate_funding:  'Duplicate Funding',
  fraud_suspected:    'Fraud Suspected',
  chargeback_risk:    'Chargeback Risk',
  account_takeover:   'Account Takeover',
  manual_review:      'Manual Review',
}

// ── Create Flag Modal ─────────────────────────────────────────────────────────

const EMPTY_FLAG = {
  user_id: '', flag_type: 'manual_review' as FlagType,
  severity: 'medium' as FlagSeverity, title: '', description: '', transaction_ref: '',
}

function CreateFlagModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState(EMPTY_FLAG)
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => { if (open) { setForm(EMPTY_FLAG); setErrors({}) } }, [open])

  const mutation = useMutation({
    mutationFn: () => complianceApi.createRiskFlag({
      user_id:         form.user_id,
      flag_type:       form.flag_type,
      severity:        form.severity,
      title:           form.title,
      description:     form.description || undefined,
      transaction_ref: form.transaction_ref || undefined,
    }),
    onSuccess: () => {
      toast.success('Risk flag created')
      qc.invalidateQueries({ queryKey: ['risk-flags'] })
      onClose()
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to create risk flag')),
  })

  function validate() {
    const e: Record<string, string> = {}
    if (!form.user_id.trim()) e.user_id = 'User ID is required'
    if (!form.title.trim())   e.title   = 'Title is required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New Risk Flag"
      subtitle="Flag suspicious activity for investigation"
      size="md"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={mutation.isPending}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={() => { if (validate()) mutation.mutate() }} disabled={mutation.isPending}>
            {mutation.isPending ? 'Creating…' : 'Create Flag'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          label="User ID *"
          value={form.user_id}
          onChange={(e) => setForm((f) => ({ ...f, user_id: e.target.value }))}
          placeholder="UUID of the user"
          error={errors.user_id}
        />
        <Input
          label="Title *"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          placeholder="Brief description of the flag"
          error={errors.title}
        />
        <div className="grid grid-cols-2 gap-4">
          <Select
            label="Flag Type"
            value={form.flag_type}
            onChange={(e) => setForm((f) => ({ ...f, flag_type: e.target.value as FlagType }))}
            options={Object.entries(FLAG_TYPE_LABELS).map(([v, l]) => ({ value: v, label: l }))}
          />
          <Select
            label="Severity"
            value={form.severity}
            onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value as FlagSeverity }))}
            options={[
              { value: 'low',      label: 'Low' },
              { value: 'medium',   label: 'Medium' },
              { value: 'high',     label: 'High' },
              { value: 'critical', label: 'Critical' },
            ]}
          />
        </div>
        <Input
          label="Transaction Reference"
          value={form.transaction_ref}
          onChange={(e) => setForm((f) => ({ ...f, transaction_ref: e.target.value }))}
          placeholder="Optional transaction ref"
        />
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1.5">Description</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            rows={3}
            className="w-full rounded-lg border border-border bg-surface-2 text-ink text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent/50 resize-none"
            placeholder="Detailed description of the suspicious activity…"
          />
        </div>
      </div>
    </Modal>
  )
}

// ── Flag Detail Drawer ────────────────────────────────────────────────────────

function FlagDrawer({ flag, onClose }: { flag: RiskFlag | null; onClose: () => void }) {
  const qc = useQueryClient()
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (flag) setNotes(flag.resolution_notes ?? '')
  }, [flag])

  const updateMutation = useMutation({
    mutationFn: (body: { status?: FlagStatus; severity?: FlagSeverity; resolution_notes?: string }) =>
      complianceApi.updateRiskFlag(flag!.id, body),
    onSuccess: () => {
      toast.success('Flag updated')
      qc.invalidateQueries({ queryKey: ['risk-flags'] })
    },
    onError: (e) => toast.error(errMsg(e, 'Update failed')),
  })

  if (!flag) return null

  const statusActions: FlagStatus[] = ['open', 'investigating', 'resolved', 'dismissed']

  return (
    <Drawer open={!!flag} onClose={onClose} title={flag.title} subtitle={FLAG_TYPE_LABELS[flag.flag_type]} width="md">
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Status',   value: <Badge variant={STATUS_VARIANT[flag.status]}>{flag.status}</Badge> },
            { label: 'Severity', value: <Badge variant={SEVERITY_VARIANT[flag.severity]}>{flag.severity}</Badge> },
            { label: 'User',     value: <span className="text-sm text-ink truncate">{flag.user_name ?? flag.email ?? flag.user_id ?? '—'}</span> },
            { label: 'Flagged',  value: <span className="text-sm text-ink">{fmtDate(flag.created_at)}</span> },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-lg bg-surface-2 px-3 py-2">
              <p className="text-[10px] text-ink-faint uppercase tracking-wide mb-1">{label}</p>
              {value}
            </div>
          ))}
          {flag.transaction_ref && (
            <div className="col-span-2 rounded-lg bg-surface-2 px-3 py-2">
              <p className="text-[10px] text-ink-faint uppercase tracking-wide mb-1">Transaction Ref</p>
              <span className="text-sm font-mono text-ink">{flag.transaction_ref}</span>
            </div>
          )}
          {flag.description && (
            <div className="col-span-2 rounded-lg bg-surface-2 px-3 py-2">
              <p className="text-[10px] text-ink-faint uppercase tracking-wide mb-1">Description</p>
              <p className="text-sm text-ink">{flag.description}</p>
            </div>
          )}
        </div>

        {/* Status change */}
        <div>
          <p className="text-[10px] text-ink-faint uppercase tracking-wide mb-2">Move Status</p>
          <div className="flex flex-wrap gap-1.5">
            {statusActions.filter((s) => s !== flag.status).map((s) => (
              <Button
                key={s}
                variant="secondary"
                size="xs"
                onClick={() => updateMutation.mutate({ status: s })}
                disabled={updateMutation.isPending}
              >
                → {s}
              </Button>
            ))}
          </div>
        </div>

        {/* Resolution notes */}
        <div className="border-t border-border pt-4 space-y-3">
          <p className="text-[10px] text-ink-faint uppercase tracking-wide">Resolution Notes</p>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-border bg-surface-2 text-ink text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent/50 resize-none"
            placeholder="Describe findings or resolution…"
          />
          <Button
            variant="primary" size="sm" className="w-full"
            onClick={() => updateMutation.mutate({ resolution_notes: notes })}
            disabled={updateMutation.isPending}
          >
            {updateMutation.isPending ? 'Saving…' : 'Save Notes'}
          </Button>
        </div>
      </div>
    </Drawer>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function RiskFlagsPage() {
  const [search, setSearch]       = useState('')
  const [flagType, setFlagType]   = useState('')
  const [severity, setSeverity]   = useState('')
  const [status, setStatus]       = useState('')
  const [page, setPage]           = useState(1)
  const [createOpen, setCreate]   = useState(false)
  const [activeFlag, setFlag]     = useState<RiskFlag | null>(null)
  const limit = 25

  useEffect(() => { setPage(1) }, [search, flagType, severity, status])

  const params = {
    search: search || undefined, flag_type: flagType || undefined,
    severity: severity || undefined, status: status || undefined, page, limit,
  }

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['risk-flags', params],
    queryFn: () => complianceApi.listRiskFlags(params),
  })

  const rows  = data?.data  ?? []
  const total = data?.total ?? 0
  const stats = data?.stats ?? { open: 0, investigating: 0, resolved: 0, dismissed: 0, critical: 0, high: 0 }

  const columns = [
    {
      key: 'flag', header: 'Flag',
      render: (f: RiskFlag) => (
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink truncate max-w-[200px]">{f.title}</p>
          <p className="text-xs text-ink-faint">{FLAG_TYPE_LABELS[f.flag_type]}</p>
        </div>
      ),
    },
    {
      key: 'user', header: 'User',
      render: (f: RiskFlag) => (
        <span className="text-xs text-ink-muted truncate max-w-[140px] block">{f.user_name ?? f.email ?? '—'}</span>
      ),
    },
    {
      key: 'severity', header: 'Severity',
      render: (f: RiskFlag) => <Badge variant={SEVERITY_VARIANT[f.severity]}>{f.severity}</Badge>,
    },
    {
      key: 'status', header: 'Status',
      render: (f: RiskFlag) => <Badge variant={STATUS_VARIANT[f.status]}>{f.status}</Badge>,
    },
    {
      key: 'txn', header: 'Txn Ref',
      render: (f: RiskFlag) => <span className="text-xs font-mono text-ink-faint">{f.transaction_ref ?? '—'}</span>,
    },
    {
      key: 'created', header: 'Created',
      render: (f: RiskFlag) => <span className="text-xs text-ink-faint whitespace-nowrap">{fmtRelative(f.created_at)}</span>,
    },
  ]

  if (error) return <ErrorMessage error={error} onRetry={() => void refetch()} endpoint="/admin/risk/flags" />

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Risk Flags"
        subtitle="Suspicious activity flags and manual review queue"
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => void refetch()}>Refresh</Button>
            <Button variant="primary" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setCreate(true)}>New Flag</Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {isLoading ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />) : (
          <>
            <MetricCard label="Open"          value={stats.open}          icon={<AlertTriangle className="h-4 w-4" />} variant="danger" />
            <MetricCard label="Investigating"  value={stats.investigating} icon={<Search className="h-4 w-4" />}        variant="warning" />
            <MetricCard label="Critical"       value={stats.critical}      icon={<ShieldOff className="h-4 w-4" />}     variant="danger" />
            <MetricCard label="Resolved"       value={stats.resolved}      icon={<CheckCircle2 className="h-4 w-4" />}  variant="success" />
          </>
        )}
      </div>

      <FilterBar>
        <div className="flex-1 min-w-[180px] max-w-sm">
          <Input placeholder="Search email, title…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select
          value={flagType}
          onChange={(e) => setFlagType(e.target.value)}
          options={[
            { value: '', label: 'All types' },
            ...Object.entries(FLAG_TYPE_LABELS).map(([v, l]) => ({ value: v, label: l })),
          ]}
          className="w-44"
        />
        <Select
          value={severity}
          onChange={(e) => setSeverity(e.target.value)}
          options={[
            { value: '', label: 'All severities' },
            { value: 'critical', label: 'Critical' },
            { value: 'high',     label: 'High' },
            { value: 'medium',   label: 'Medium' },
            { value: 'low',      label: 'Low' },
          ]}
          className="w-36"
        />
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={[
            { value: '', label: 'All statuses' },
            { value: 'open',          label: 'Open' },
            { value: 'investigating', label: 'Investigating' },
            { value: 'resolved',      label: 'Resolved' },
            { value: 'dismissed',     label: 'Dismissed' },
          ]}
          className="w-36"
        />
        {(search || flagType || severity || status) && (
          <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setFlagType(''); setSeverity(''); setStatus('') }}>Clear</Button>
        )}
      </FilterBar>

      <Card>
        {isLoading ? <SkeletonTable rows={8} /> : (
          <>
            <DataTable
              columns={columns}
              data={rows}
              rowKey={(f) => f.id}
              onRowClick={(f) => setFlag(f)}
              emptyMessage="No risk flags found."
            />
            <div className="px-4 pb-2">
              <Pagination page={page} limit={limit} total={total} onPage={setPage} />
            </div>
          </>
        )}
      </Card>

      <CreateFlagModal open={createOpen} onClose={() => setCreate(false)} />
      <FlagDrawer flag={activeFlag} onClose={() => setFlag(null)} />
    </div>
  )
}
