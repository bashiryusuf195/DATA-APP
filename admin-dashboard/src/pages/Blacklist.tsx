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
import { Button, Badge, Card, Select, Input, Modal } from '@/components/ui'
import { SkeletonTable } from '@/components/ui/Skeleton'
import { fmtRelative } from '@/utils/format'
import type { BlacklistEntry, BlacklistEntityType } from '@/types'
import { RefreshCw, Trash2, ShieldX } from 'lucide-react'

function errMsg(e: unknown, fallback: string) {
  if (axios.isAxiosError(e)) return e.response?.data?.error ?? e.message ?? fallback
  if (e instanceof Error) return e.message
  return fallback
}

const ENTITY_TYPE_VARIANT: Record<BlacklistEntityType, 'danger' | 'warning' | 'info' | 'neutral' | 'accent'> = {
  user:  'danger',
  email: 'warning',
  phone: 'warning',
  bvn:   'info',
  nin:   'info',
  ip:    'accent',
  card:  'neutral',
}

// ── Add Blacklist Modal ───────────────────────────────────────────────────────

const EMPTY_FORM = {
  entity_type: 'email' as BlacklistEntityType,
  entity_value: '',
  reason: '',
  notes: '',
}

function AddBlacklistModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => { if (open) { setForm(EMPTY_FORM); setErrors({}) } }, [open])

  const mutation = useMutation({
    mutationFn: () => complianceApi.addToBlacklist({
      entity_type:  form.entity_type,
      entity_value: form.entity_value,
      reason:       form.reason,
      notes:        form.notes || undefined,
    }),
    onSuccess: () => {
      toast.success('Entry added to blacklist')
      qc.invalidateQueries({ queryKey: ['blacklist'] })
      onClose()
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to add to blacklist')),
  })

  function validate() {
    const e: Record<string, string> = {}
    if (!form.entity_value.trim()) e.entity_value = 'Value is required'
    if (!form.reason.trim())       e.reason       = 'Reason is required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const placeholders: Record<BlacklistEntityType, string> = {
    user:  'User UUID',
    email: 'user@example.com',
    phone: '+2348012345678',
    bvn:   '12345678901',
    nin:   '12345678901',
    ip:    '192.168.1.1',
    card:  'Last 4 digits or BIN',
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add to Blacklist"
      subtitle="Block an entity from transacting on the platform"
      size="md"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={mutation.isPending}>Cancel</Button>
          <Button variant="danger" size="sm" onClick={() => { if (validate()) mutation.mutate() }} disabled={mutation.isPending}>
            {mutation.isPending ? 'Adding…' : 'Add to Blacklist'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Select
          label="Entity Type"
          value={form.entity_type}
          onChange={(e) => setForm((f) => ({ ...f, entity_type: e.target.value as BlacklistEntityType, entity_value: '' }))}
          options={[
            { value: 'user',  label: 'User (UUID)' },
            { value: 'email', label: 'Email Address' },
            { value: 'phone', label: 'Phone Number' },
            { value: 'bvn',   label: 'BVN' },
            { value: 'nin',   label: 'NIN' },
            { value: 'ip',    label: 'IP Address' },
            { value: 'card',  label: 'Card' },
          ]}
        />
        <Input
          label="Value *"
          value={form.entity_value}
          onChange={(e) => setForm((f) => ({ ...f, entity_value: e.target.value }))}
          placeholder={placeholders[form.entity_type]}
          error={errors.entity_value}
        />
        <Input
          label="Reason *"
          value={form.reason}
          onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
          placeholder="Why is this entity being blacklisted?"
          error={errors.reason}
        />
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1.5">Notes (optional)</label>
          <textarea
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            rows={2}
            className="w-full rounded-lg border border-border bg-surface-2 text-ink text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent/50 resize-none"
            placeholder="Additional context…"
          />
        </div>
      </div>
    </Modal>
  )
}

// ── Remove Confirmation Modal ─────────────────────────────────────────────────

function RemoveModal({
  entry, open, onClose,
}: { entry: BlacklistEntry | null; open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const [reason, setReason] = useState('')

  useEffect(() => { if (open) setReason('') }, [open])

  const mutation = useMutation({
    mutationFn: () => complianceApi.removeFromBlacklist(entry!.id, { reason: reason || undefined }),
    onSuccess: () => {
      toast.success('Entry removed from blacklist')
      qc.invalidateQueries({ queryKey: ['blacklist'] })
      onClose()
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to remove entry')),
  })

  if (!entry) return null
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Remove from Blacklist"
      subtitle="This action is logged and cannot be undone"
      size="sm"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={mutation.isPending}>Cancel</Button>
          <Button variant="danger" size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? 'Removing…' : 'Remove Entry'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg bg-surface-2 px-4 py-3">
          <p className="text-xs text-ink-faint mb-1">{entry.entity_type.toUpperCase()}</p>
          <p className="text-sm font-mono text-ink">{entry.entity_value}</p>
          <p className="text-xs text-ink-muted mt-1">{entry.reason}</p>
        </div>
        <Input
          label="Reason for removal (optional)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why is this entry being removed?"
        />
      </div>
    </Modal>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function BlacklistPage() {
  const [search, setSearch]           = useState('')
  const [entityType, setEntityType]   = useState('')
  const [page, setPage]               = useState(1)
  const [addOpen, setAddOpen]         = useState(false)
  const [removeEntry, setRemoveEntry] = useState<BlacklistEntry | null>(null)
  const [removeOpen, setRemoveOpen]   = useState(false)
  const limit = 25

  useEffect(() => { setPage(1) }, [search, entityType])

  const params = {
    search: search || undefined, entity_type: entityType || undefined, page, limit,
  }

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['blacklist', params],
    queryFn: () => complianceApi.listBlacklist(params),
  })

  const rows  = data?.data  ?? []
  const total = data?.total ?? 0

  function openRemove(entry: BlacklistEntry) {
    setRemoveEntry(entry)
    setRemoveOpen(true)
  }

  const columns = [
    {
      key: 'type', header: 'Type',
      render: (e: BlacklistEntry) => (
        <Badge variant={ENTITY_TYPE_VARIANT[e.entity_type]}>{e.entity_type.toUpperCase()}</Badge>
      ),
    },
    {
      key: 'value', header: 'Value',
      render: (e: BlacklistEntry) => (
        <span className="text-sm font-mono text-ink">{e.entity_value}</span>
      ),
    },
    {
      key: 'reason', header: 'Reason',
      render: (e: BlacklistEntry) => (
        <span className="text-xs text-ink-muted truncate max-w-[220px] block">{e.reason}</span>
      ),
    },
    {
      key: 'added', header: 'Added',
      render: (e: BlacklistEntry) => (
        <span className="text-xs text-ink-faint whitespace-nowrap">{fmtRelative(e.created_at)}</span>
      ),
    },
    {
      key: 'actions', header: '',
      render: (e: BlacklistEntry) => (
        <Button
          variant="ghost"
          size="xs"
          icon={<Trash2 className="h-3.5 w-3.5 text-rose-400" />}
          onClick={(ev) => { ev.stopPropagation(); openRemove(e) }}
        >
          Remove
        </Button>
      ),
    },
  ]

  if (error) return <ErrorMessage error={error} onRetry={() => void refetch()} endpoint="/admin/blacklist" />

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Blacklist / Watchlist"
        subtitle="Blocked users, emails, phones, BVNs, IPs and cards"
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => void refetch()}>Refresh</Button>
            <Button variant="danger" size="sm" icon={<ShieldX className="h-3.5 w-3.5" />} onClick={() => setAddOpen(true)}>Add to Blacklist</Button>
          </div>
        }
      />

      <FilterBar>
        <div className="flex-1 min-w-[180px] max-w-sm">
          <Input placeholder="Search value or reason…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select
          value={entityType}
          onChange={(e) => setEntityType(e.target.value)}
          options={[
            { value: '',      label: 'All types' },
            { value: 'user',  label: 'User' },
            { value: 'email', label: 'Email' },
            { value: 'phone', label: 'Phone' },
            { value: 'bvn',   label: 'BVN' },
            { value: 'nin',   label: 'NIN' },
            { value: 'ip',    label: 'IP Address' },
            { value: 'card',  label: 'Card' },
          ]}
          className="w-36"
        />
        {(search || entityType) && (
          <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setEntityType('') }}>Clear</Button>
        )}
      </FilterBar>

      <Card>
        {isLoading ? <SkeletonTable rows={8} /> : (
          <>
            <DataTable
              columns={columns}
              data={rows}
              rowKey={(e) => e.id}
              emptyMessage="No blacklist entries found."
            />
            <div className="px-4 pb-2">
              <Pagination page={page} limit={limit} total={total} onPage={setPage} />
            </div>
          </>
        )}
      </Card>

      <AddBlacklistModal open={addOpen} onClose={() => setAddOpen(false)} />
      <RemoveModal
        entry={removeEntry}
        open={removeOpen}
        onClose={() => { setRemoveOpen(false); setRemoveEntry(null) }}
      />
    </div>
  )
}
