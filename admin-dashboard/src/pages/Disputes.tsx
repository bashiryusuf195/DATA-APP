import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import axios from 'axios'
import { formatDistanceToNow } from 'date-fns'
import { supportApi } from '@/api/support.api'
import { PageHeader } from '@/components/shared/PageHeader'
import { FilterBar } from '@/components/shared/FilterBar'
import { DataTable } from '@/components/shared/DataTable'
import { Drawer } from '@/components/shared/Drawer'
import { Pagination } from '@/components/shared/Pagination'
import { ErrorMessage } from '@/components/shared/ErrorMessage'
import { Button, Badge, Modal, Input, Select, Card } from '@/components/ui'
import { SkeletonTable } from '@/components/ui/Skeleton'
import { fmtCurrency, fmtDate } from '@/utils/format'
import type {
  Dispute, DisputeStatus, DisputeType, DisputeResolution,
  CreateDisputeInput, UpdateDisputeInput,
} from '@/types'
import { Plus, RefreshCw, Hash, User, ChevronRight } from 'lucide-react'

function errMsg(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) return err.response?.data?.error ?? err.message ?? fallback
  if (err instanceof Error) return err.message
  return fallback
}

type BadgeVariant = 'success' | 'danger' | 'warning' | 'info' | 'neutral'

function disputeStatusVariant(s: DisputeStatus): BadgeVariant {
  switch (s) {
    case 'open':         return 'info'
    case 'under_review': return 'warning'
    case 'escalated':    return 'danger'
    case 'resolved':     return 'success'
    case 'rejected':     return 'neutral'
    case 'closed':       return 'neutral'
  }
}

function disputeTypeLabel(t: DisputeType): string {
  return t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function resolutionLabel(r: DisputeResolution | null): string {
  if (!r) return '—'
  return r.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

// ── Create Dispute Modal ──────────────────────────────────────────────────────

const EMPTY_DISPUTE: CreateDisputeInput = {
  dispute_type: 'wrong_amount',
  transaction_reference: null,
  user_email: null,
  amount_disputed: null,
  currency: 'NGN',
}

function CreateDisputeModal({
  open, onClose, onSaved,
}: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<CreateDisputeInput>(EMPTY_DISPUTE)
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({})

  useEffect(() => {
    if (open) { setForm(EMPTY_DISPUTE); setErrors({}) }
  }, [open])

  const mutation = useMutation({
    mutationFn: (body: CreateDisputeInput) => supportApi.createDispute(body),
    onSuccess: () => { toast.success('Dispute created'); onSaved(); onClose() },
    onError: (err) => toast.error(errMsg(err, 'Failed to create dispute')),
  })

  function validate() {
    const e: typeof errors = {}
    if (!form.dispute_type) e.dispute_type = 'Type is required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const disputeTypeOptions = [
    { value: 'wrong_amount',     label: 'Wrong Amount' },
    { value: 'not_delivered',    label: 'Not Delivered' },
    { value: 'duplicate_charge', label: 'Duplicate Charge' },
    { value: 'unauthorized',     label: 'Unauthorized' },
    { value: 'provider_error',   label: 'Provider Error' },
    { value: 'other',            label: 'Other' },
  ]

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New Dispute"
      subtitle="Log a transaction dispute for investigation"
      size="md"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={mutation.isPending}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={() => { if (validate()) mutation.mutate(form) }} disabled={mutation.isPending}>
            {mutation.isPending ? 'Creating…' : 'Create Dispute'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Select
          label="Dispute Type *"
          value={form.dispute_type}
          onChange={(e) => setForm((f) => ({ ...f, dispute_type: e.target.value as DisputeType }))}
          options={disputeTypeOptions}
          error={errors.dispute_type}
        />
        <Input
          label="Transaction Reference"
          value={form.transaction_reference ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, transaction_reference: e.target.value || null }))}
          placeholder="e.g. TXN-20260518-XXXX"
        />
        <Input
          label="User Email"
          type="email"
          value={form.user_email ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, user_email: e.target.value || null }))}
          placeholder="user@example.com"
        />
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Amount Disputed (₦)"
            type="number"
            min={0}
            step="0.01"
            value={form.amount_disputed === null ? '' : String(form.amount_disputed)}
            onChange={(e) => setForm((f) => ({
              ...f,
              amount_disputed: e.target.value === '' ? null : parseFloat(e.target.value),
            }))}
            placeholder="0.00"
          />
          <Select
            label="Currency"
            value={form.currency ?? 'NGN'}
            onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
            options={[
              { value: 'NGN', label: 'NGN' },
              { value: 'USD', label: 'USD' },
            ]}
          />
        </div>
      </div>
    </Modal>
  )
}

// ── Dispute Detail Drawer ─────────────────────────────────────────────────────

function DisputeDrawer({
  dispute, onClose,
}: { dispute: Dispute | null; onClose: () => void }) {
  const qc = useQueryClient()
  const [resolutionNotes, setResolutionNotes] = useState('')
  const [selectedResolution, setSelectedResolution] = useState<DisputeResolution | ''>('')

  useEffect(() => {
    if (!dispute) { setResolutionNotes(''); setSelectedResolution('') }
    else {
      setResolutionNotes(dispute.resolution_notes ?? '')
      setSelectedResolution(dispute.resolution ?? '')
    }
  }, [dispute])

  const updateMutation = useMutation({
    mutationFn: (body: UpdateDisputeInput) =>
      supportApi.updateDispute(dispute!.id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['disputes'] })
      toast.success('Dispute updated')
    },
    onError: (err) => toast.error(errMsg(err, 'Update failed')),
  })

  const statusFlow: DisputeStatus[] = ['open', 'under_review', 'escalated', 'resolved', 'rejected', 'closed']

  const resolutionOptions = [
    { value: '',                  label: 'None' },
    { value: 'refund_issued',     label: 'Refund Issued' },
    { value: 'partial_refund',    label: 'Partial Refund' },
    { value: 'no_action',         label: 'No Action' },
    { value: 'provider_credited', label: 'Provider Credited' },
    { value: 'rejected',          label: 'Rejected' },
  ]

  if (!dispute) return null

  return (
    <Drawer
      open={!!dispute}
      onClose={onClose}
      title={dispute.reference}
      subtitle={disputeTypeLabel(dispute.dispute_type)}
      width="md"
    >
      <div className="space-y-5">
        {/* Meta */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-surface-2 px-3 py-2">
            <p className="text-[10px] text-ink-faint uppercase tracking-wide mb-1">Status</p>
            <Badge variant={disputeStatusVariant(dispute.status)}>{dispute.status.replace('_', ' ')}</Badge>
          </div>
          <div className="rounded-lg bg-surface-2 px-3 py-2">
            <p className="text-[10px] text-ink-faint uppercase tracking-wide mb-1">Amount</p>
            <span className="text-sm font-semibold text-ink">
              {dispute.amount_disputed ? fmtCurrency(dispute.amount_disputed) : '—'}
            </span>
          </div>
          <div className="rounded-lg bg-surface-2 px-3 py-2">
            <p className="text-[10px] text-ink-faint uppercase tracking-wide mb-1">Type</p>
            <span className="text-sm text-ink">{disputeTypeLabel(dispute.dispute_type)}</span>
          </div>
          <div className="rounded-lg bg-surface-2 px-3 py-2">
            <p className="text-[10px] text-ink-faint uppercase tracking-wide mb-1">Created</p>
            <span className="text-sm text-ink">{fmtDate(dispute.created_at)}</span>
          </div>
          {dispute.user_email && (
            <div className="col-span-2 rounded-lg bg-surface-2 px-3 py-2 flex items-center gap-2">
              <User className="h-3.5 w-3.5 text-ink-faint shrink-0" />
              <span className="text-sm text-ink truncate">{dispute.user_email}</span>
            </div>
          )}
          {dispute.transaction_reference && (
            <div className="col-span-2 rounded-lg bg-surface-2 px-3 py-2 flex items-center gap-2">
              <Hash className="h-3.5 w-3.5 text-ink-faint shrink-0" />
              <span className="text-sm font-mono text-ink truncate">{dispute.transaction_reference}</span>
            </div>
          )}
        </div>

        {/* Status actions */}
        <div>
          <p className="text-[10px] text-ink-faint uppercase tracking-wide mb-2">Move Status</p>
          <div className="flex flex-wrap gap-1.5">
            {statusFlow.filter((s) => s !== dispute.status).map((s) => (
              <Button
                key={s}
                variant="secondary"
                size="xs"
                onClick={() => updateMutation.mutate({ status: s })}
                disabled={updateMutation.isPending}
              >
                → {s.replace('_', ' ')}
              </Button>
            ))}
          </div>
        </div>

        {/* Resolution */}
        <div className="border-t border-border pt-4 space-y-3">
          <p className="text-[10px] text-ink-faint uppercase tracking-wide">Resolution</p>
          <Select
            label="Resolution outcome"
            value={selectedResolution}
            onChange={(e) => setSelectedResolution(e.target.value as DisputeResolution | '')}
            options={resolutionOptions}
          />
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1.5">Resolution Notes</label>
            <textarea
              value={resolutionNotes}
              onChange={(e) => setResolutionNotes(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-border bg-surface-2 text-ink text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-colors resize-none"
              placeholder="Describe how this was resolved…"
            />
          </div>
          <Button
            variant="primary"
            size="sm"
            className="w-full"
            onClick={() =>
              updateMutation.mutate({
                resolution: (selectedResolution || null) as DisputeResolution | null,
                resolution_notes: resolutionNotes || null,
              })
            }
            disabled={updateMutation.isPending}
          >
            {updateMutation.isPending ? 'Saving…' : 'Save Resolution'}
          </Button>
        </div>
      </div>
    </Drawer>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function DisputesPage() {
  const qc = useQueryClient()
  const [search, setSearch]             = useState('')
  const [filterStatus, setStatus]       = useState('')
  const [filterType, setType]           = useState('')
  const [page, setPage]                 = useState(1)
  const [createOpen, setCreateOpen]     = useState(false)
  const [activeDispute, setDispute]     = useState<Dispute | null>(null)

  useEffect(() => { setPage(1) }, [search, filterStatus, filterType])

  const params = {
    search:       search.trim() || undefined,
    status:       filterStatus  || undefined,
    dispute_type: filterType    || undefined,
    page,
    limit: 25,
  }

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['disputes', params],
    queryFn: () => supportApi.listDisputes(params),
  })

  const disputes = data?.data ?? []
  const total    = data?.total ?? 0

  if (error) {
    return (
      <ErrorMessage
        error={error}
        onRetry={() => void refetch()}
        endpoint="/admin/disputes"
      />
    )
  }

  const hasFilters = !!(search || filterStatus || filterType)

  const columns = [
    {
      key: 'ref',
      header: 'Reference',
      render: (d: Dispute) => (
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xs text-ink">{d.reference}</span>
          <ChevronRight className="h-3 w-3 text-ink-faint" />
        </div>
      ),
    },
    {
      key: 'user',
      header: 'User',
      render: (d: Dispute) => (
        <span className="text-xs text-ink-muted truncate max-w-[140px]">
          {d.user_email ?? <span className="text-ink-faint">—</span>}
        </span>
      ),
    },
    {
      key: 'txn',
      header: 'Transaction',
      render: (d: Dispute) => (
        <span className="font-mono text-xs text-ink-faint max-w-[120px] truncate">
          {d.transaction_reference ?? '—'}
        </span>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (d: Dispute) => (
        <span className="text-xs text-ink-muted">{disputeTypeLabel(d.dispute_type)}</span>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right' as const,
      render: (d: Dispute) => (
        <span className="text-sm text-ink">
          {d.amount_disputed ? fmtCurrency(d.amount_disputed) : '—'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (d: Dispute) => (
        <Badge variant={disputeStatusVariant(d.status)}>
          {d.status.replace('_', ' ')}
        </Badge>
      ),
    },
    {
      key: 'resolution',
      header: 'Resolution',
      render: (d: Dispute) => (
        <span className="text-xs text-ink-muted">{resolutionLabel(d.resolution)}</span>
      ),
    },
    {
      key: 'created',
      header: 'Created',
      align: 'right' as const,
      render: (d: Dispute) => (
        <span className="text-xs text-ink-faint whitespace-nowrap">
          {formatDistanceToNow(new Date(d.created_at), { addSuffix: true })}
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Disputes"
        subtitle="Transaction disputes under investigation"
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />}
              onClick={() => void refetch()}>Refresh</Button>
            <Button variant="primary" size="sm" icon={<Plus className="h-3.5 w-3.5" />}
              onClick={() => setCreateOpen(true)}>New Dispute</Button>
          </div>
        }
      />

      <FilterBar>
        <div className="flex-1 min-w-[200px] max-w-sm">
          <Input
            placeholder="Search reference, email, transaction…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          value={filterStatus}
          onChange={(e) => setStatus(e.target.value)}
          options={[
            { value: '',             label: 'All statuses' },
            { value: 'open',         label: 'Open' },
            { value: 'under_review', label: 'Under Review' },
            { value: 'escalated',    label: 'Escalated' },
            { value: 'resolved',     label: 'Resolved' },
            { value: 'rejected',     label: 'Rejected' },
            { value: 'closed',       label: 'Closed' },
          ]}
          className="w-40"
        />
        <Select
          value={filterType}
          onChange={(e) => setType(e.target.value)}
          options={[
            { value: '',                  label: 'All types' },
            { value: 'wrong_amount',      label: 'Wrong Amount' },
            { value: 'not_delivered',     label: 'Not Delivered' },
            { value: 'duplicate_charge',  label: 'Duplicate Charge' },
            { value: 'unauthorized',      label: 'Unauthorized' },
            { value: 'provider_error',    label: 'Provider Error' },
            { value: 'other',             label: 'Other' },
          ]}
          className="w-44"
        />
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={() => {
            setSearch(''); setStatus(''); setType('')
          }}>
            Clear
          </Button>
        )}
      </FilterBar>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total',        value: total },
          { label: 'Open',         value: disputes.filter((d) => d.status === 'open').length },
          { label: 'Under Review', value: disputes.filter((d) => d.status === 'under_review').length },
          { label: 'Resolved',     value: disputes.filter((d) => d.status === 'resolved').length },
        ].map(({ label, value }) => (
          <Card key={label} className="p-3 flex flex-col gap-0.5">
            <span className="text-[11px] text-ink-faint uppercase tracking-wide">{label}</span>
            <span className="text-xl font-semibold text-ink">{value}</span>
          </Card>
        ))}
      </div>

      <Card>
        {isLoading ? (
          <SkeletonTable rows={8} />
        ) : (
          <>
            <DataTable
              columns={columns}
              data={disputes}
              rowKey={(d) => d.id}
              onRowClick={(d) => setDispute(d)}
              emptyMessage={hasFilters ? 'No disputes match the filters.' : 'No disputes found.'}
            />
            <div className="px-4 pb-2">
              <Pagination page={page} limit={25} total={total} onPage={setPage} />
            </div>
          </>
        )}
      </Card>

      <CreateDisputeModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={() => qc.invalidateQueries({ queryKey: ['disputes'] })}
      />

      <DisputeDrawer
        dispute={activeDispute}
        onClose={() => setDispute(null)}
      />
    </div>
  )
}
