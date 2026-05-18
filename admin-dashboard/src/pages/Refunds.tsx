import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import axios from 'axios'
import { formatDistanceToNow } from 'date-fns'
import { financeApi } from '@/api/finance.api'
import { PageHeader } from '@/components/shared/PageHeader'
import { FilterBar } from '@/components/shared/FilterBar'
import { DataTable } from '@/components/shared/DataTable'
import { Pagination } from '@/components/shared/Pagination'
import { ErrorMessage } from '@/components/shared/ErrorMessage'
import { Button, Badge, Card, Input, Select, Modal } from '@/components/ui'
import { SkeletonTable } from '@/components/ui/Skeleton'
import { fmtCurrency } from '@/utils/format'
import type { Refund, Reversal } from '@/types'
import { RefreshCw, RotateCcw, AlertTriangle, Hash, CheckCircle2, XCircle } from 'lucide-react'

function errMsg(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) return err.response?.data?.error ?? err.message ?? fallback
  if (err instanceof Error) return err.message
  return fallback
}

type BadgeVariant = 'success' | 'danger' | 'warning' | 'info' | 'neutral'

function statusVariant(s: string): BadgeVariant {
  if (s === 'processed' || s === 'completed') return 'success'
  if (s === 'failed')                         return 'danger'
  if (s === 'pending')                        return 'warning'
  return 'neutral'
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'processed' || status === 'completed') return <CheckCircle2 className="h-3 w-3 text-emerald-400" />
  if (status === 'failed')                              return <XCircle      className="h-3 w-3 text-rose-400" />
  return <AlertTriangle className="h-3 w-3 text-amber-400" />
}

// ── Confirmation modal ────────────────────────────────────────────────────────

interface ConfirmModalProps {
  open:         boolean
  onClose:      () => void
  onConfirm:    (reason: string) => void
  isPending:    boolean
  action:       'refund' | 'reversal'
  txnReference: string | null
  amount:       string | null
}

function ConfirmModal({ open, onClose, onConfirm, isPending, action, txnReference, amount }: ConfirmModalProps) {
  const [reason, setReason] = useState('')

  function handleConfirm() {
    if (!reason.trim()) { toast.error('Reason is required'); return }
    onConfirm(reason.trim())
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={action === 'refund' ? 'Issue Refund' : 'Reverse Transaction'}
      subtitle={`Transaction ${txnReference ?? ''} · ${amount ? fmtCurrency(parseFloat(amount)) : ''}`}
      size="md"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button
            variant={action === 'reversal' ? 'danger' : 'primary'}
            size="sm"
            onClick={handleConfirm}
            disabled={isPending || !reason.trim()}
          >
            {isPending ? 'Processing…' : action === 'refund' ? 'Issue Refund' : 'Reverse Transaction'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-amber-500/30 bg-amber-900/10 px-4 py-3 text-sm text-amber-300">
          {action === 'reversal'
            ? 'This will reverse the transaction, credit the user\'s wallet, and create balancing journal entries. This action cannot be undone.'
            : 'This will create a refund record and credit the user\'s wallet. This action is idempotent — duplicate refunds are rejected.'}
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1.5">Reason *</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Explain the reason for this action…"
            className="w-full rounded-lg border border-border bg-surface-2 text-ink text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-colors resize-none"
          />
        </div>
      </div>
    </Modal>
  )
}

// ── Refunds tab ───────────────────────────────────────────────────────────────

function RefundsTab() {
  const qc = useQueryClient()
  const [search, setSearch]   = useState('')
  const [status, setStatus]   = useState('')
  const [page, setPage]       = useState(1)
  const [confirm, setConfirm] = useState<{ txnId: string; txnRef: string | null; amount: string | null } | null>(null)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['finance-refunds', { search, status, page }],
    queryFn: () => financeApi.listRefunds({ search: search || undefined, status: status || undefined, page, limit: 25 }),
  })

  const refundMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => financeApi.refundTransaction(id, { reason }),
    onSuccess: () => {
      toast.success('Refund issued successfully')
      setConfirm(null)
      void qc.invalidateQueries({ queryKey: ['finance-refunds'] })
    },
    onError: (err) => toast.error(errMsg(err, 'Refund failed')),
  })

  const refunds = data?.data ?? []
  const total   = data?.total ?? 0

  if (error) {
    return <ErrorMessage error={error} onRetry={() => void refetch()} endpoint="/admin/finance/refunds" />
  }

  const columns = [
    {
      key: 'id',
      header: 'Refund ID',
      render: (r: Refund) => (
        <span className="text-xs font-mono text-ink-muted">{r.id.slice(0, 8)}…</span>
      ),
    },
    {
      key: 'transaction',
      header: 'Transaction',
      render: (r: Refund) => (
        r.transaction_reference ? (
          <div className="flex items-center gap-1.5">
            <Hash className="h-3 w-3 text-ink-faint" />
            <span className="text-xs font-mono text-ink">{r.transaction_reference}</span>
          </div>
        ) : <span className="text-xs text-ink-faint">—</span>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      render: (r: Refund) => (
        <span className="text-sm font-medium text-ink tabular-nums">{fmtCurrency(parseFloat(r.amount))}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r: Refund) => (
        <div className="flex items-center gap-1.5">
          <StatusIcon status={r.status} />
          <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
        </div>
      ),
    },
    {
      key: 'reason',
      header: 'Reason',
      render: (r: Refund) => (
        <span className="text-xs text-ink-muted max-w-[200px] truncate block">{r.reason}</span>
      ),
    },
    {
      key: 'created',
      header: 'Created',
      render: (r: Refund) => (
        <span className="text-xs text-ink-faint whitespace-nowrap">
          {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
        </span>
      ),
    },
  ]

  return (
    <>
      <FilterBar>
        <div className="flex-1 min-w-[200px] max-w-sm">
          <Input placeholder="Search transaction reference, reason…" value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }} />
        </div>
        <Select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1) }}
          options={[
            { value: '',           label: 'All statuses' },
            { value: 'pending',    label: 'Pending' },
            { value: 'processed',  label: 'Processed' },
            { value: 'failed',     label: 'Failed' },
          ]}
          className="w-36"
        />
        {(search || status) && (
          <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setStatus(''); setPage(1) }}>Clear</Button>
        )}
      </FilterBar>

      <Card>
        {isLoading ? <SkeletonTable rows={8} /> : (
          <>
            <DataTable
              columns={columns}
              data={refunds}
              rowKey={(r) => r.id}
              emptyMessage="No refunds found."
            />
            <div className="px-4 pb-2">
              <Pagination page={page} limit={25} total={total} onPage={setPage} />
            </div>
          </>
        )}
      </Card>

      {confirm && (
        <ConfirmModal
          open={!!confirm}
          onClose={() => setConfirm(null)}
          onConfirm={(reason) => refundMutation.mutate({ id: confirm.txnId, reason })}
          isPending={refundMutation.isPending}
          action="refund"
          txnReference={confirm.txnRef}
          amount={confirm.amount}
        />
      )}
    </>
  )
}

// ── Reversals tab ─────────────────────────────────────────────────────────────

function ReversalsTab() {
  const qc = useQueryClient()
  const [search, setSearch]   = useState('')
  const [status, setStatus]   = useState('')
  const [page, setPage]       = useState(1)
  const [confirm, setConfirm] = useState<{ txnId: string; txnRef: string | null; amount: string | null } | null>(null)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['finance-reversals', { search, status, page }],
    queryFn: () => financeApi.listReversals({ search: search || undefined, status: status || undefined, page, limit: 25 }),
  })

  const reversalMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => financeApi.reverseTransaction(id, { reason }),
    onSuccess: () => {
      toast.success('Transaction reversed successfully')
      setConfirm(null)
      void qc.invalidateQueries({ queryKey: ['finance-reversals'] })
      void qc.invalidateQueries({ queryKey: ['transactions'] })
    },
    onError: (err) => toast.error(errMsg(err, 'Reversal failed')),
  })

  const reversals = data?.data ?? []
  const total     = data?.total ?? 0

  if (error) {
    return <ErrorMessage error={error} onRetry={() => void refetch()} endpoint="/admin/finance/reversals" />
  }

  const columns = [
    {
      key: 'id',
      header: 'Reversal ID',
      render: (r: Reversal) => (
        <span className="text-xs font-mono text-ink-muted">{r.id.slice(0, 8)}…</span>
      ),
    },
    {
      key: 'transaction',
      header: 'Transaction',
      render: (r: Reversal) => (
        r.transaction_reference ? (
          <div className="flex items-center gap-1.5">
            <Hash className="h-3 w-3 text-ink-faint" />
            <span className="text-xs font-mono text-ink">{r.transaction_reference}</span>
          </div>
        ) : <span className="text-xs text-ink-faint">—</span>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      render: (r: Reversal) => (
        <span className="text-sm font-medium text-ink tabular-nums">{fmtCurrency(parseFloat(r.amount))}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r: Reversal) => (
        <div className="flex items-center gap-1.5">
          <StatusIcon status={r.status} />
          <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
        </div>
      ),
    },
    {
      key: 'reason',
      header: 'Reason',
      render: (r: Reversal) => (
        <span className="text-xs text-ink-muted max-w-[200px] truncate block">{r.reason}</span>
      ),
    },
    {
      key: 'created',
      header: 'Created',
      render: (r: Reversal) => (
        <span className="text-xs text-ink-faint whitespace-nowrap">
          {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
        </span>
      ),
    },
  ]

  return (
    <>
      <FilterBar>
        <div className="flex-1 min-w-[200px] max-w-sm">
          <Input placeholder="Search transaction reference, reason…" value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }} />
        </div>
        <Select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1) }}
          options={[
            { value: '',           label: 'All statuses' },
            { value: 'pending',    label: 'Pending' },
            { value: 'completed',  label: 'Completed' },
            { value: 'failed',     label: 'Failed' },
          ]}
          className="w-36"
        />
        {(search || status) && (
          <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setStatus(''); setPage(1) }}>Clear</Button>
        )}
      </FilterBar>

      <Card>
        {isLoading ? <SkeletonTable rows={8} /> : (
          <>
            <DataTable
              columns={columns}
              data={reversals}
              rowKey={(r) => r.id}
              emptyMessage="No reversals found."
            />
            <div className="px-4 pb-2">
              <Pagination page={page} limit={25} total={total} onPage={setPage} />
            </div>
          </>
        )}
      </Card>

      {confirm && (
        <ConfirmModal
          open={!!confirm}
          onClose={() => setConfirm(null)}
          onConfirm={(reason) => reversalMutation.mutate({ id: confirm.txnId, reason })}
          isPending={reversalMutation.isPending}
          action="reversal"
          txnReference={confirm.txnRef}
          amount={confirm.amount}
        />
      )}
    </>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

type Tab = 'refunds' | 'reversals'

export function RefundsPage() {
  const [tab, setTab] = useState<Tab>('refunds')
  const qc = useQueryClient()

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Refunds & Reversals"
        subtitle="Manage transaction refunds and account reversals with full audit trail"
        actions={
          <Button variant="secondary" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />}
            onClick={() => {
              void qc.invalidateQueries({ queryKey: ['finance-refunds'] })
              void qc.invalidateQueries({ queryKey: ['finance-reversals'] })
            }}>
            Refresh
          </Button>
        }
      />

      {/* Tab strip */}
      <div className="flex gap-1 p-1 bg-surface-2 rounded-xl w-fit">
        {([
          { key: 'refunds',   label: 'Refunds',   icon: <RotateCcw className="h-3.5 w-3.5" /> },
          { key: 'reversals', label: 'Reversals',  icon: <AlertTriangle className="h-3.5 w-3.5" /> },
        ] as { key: Tab; label: string; icon: React.ReactNode }[]).map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg transition-colors ${
              tab === key
                ? 'bg-surface-1 text-ink font-medium shadow-sm'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>

      {tab === 'refunds'   && <RefundsTab />}
      {tab === 'reversals' && <ReversalsTab />}
    </div>
  )
}
