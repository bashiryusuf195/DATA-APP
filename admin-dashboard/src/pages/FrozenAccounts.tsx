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
import { Button, Badge, Card, Input, Modal } from '@/components/ui'
import { SkeletonTable } from '@/components/ui/Skeleton'
import { fmtDate, fmtRelative } from '@/utils/format'
import type { FrozenAccount } from '@/types'
import { RefreshCw, Snowflake, Unlock, AlertTriangle } from 'lucide-react'

function errMsg(e: unknown, fallback: string) {
  if (axios.isAxiosError(e)) return e.response?.data?.error ?? e.message ?? fallback
  if (e instanceof Error) return e.message
  return fallback
}

// ── Unfreeze Confirmation Modal ───────────────────────────────────────────────

function UnfreezeModal({
  account, open, onClose,
}: { account: FrozenAccount | null; open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const [notes, setNotes] = useState('')

  useEffect(() => { if (open) setNotes('') }, [open])

  const mutation = useMutation({
    mutationFn: () => complianceApi.unfreezeAccount(account!.id, { notes: notes || undefined }),
    onSuccess: () => {
      toast.success(`Account unfrozen: ${account?.email ?? ''}`)
      qc.invalidateQueries({ queryKey: ['frozen-accounts'] })
      onClose()
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to unfreeze account')),
  })

  if (!account) return null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Unfreeze Account"
      subtitle="Restore account access — this action is logged"
      size="sm"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={mutation.isPending}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? 'Unfreezing…' : 'Confirm Unfreeze'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Warning */}
        <div className="flex items-start gap-3 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-3">
          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-300">Confirm unfreeze</p>
            <p className="text-xs text-amber-400/80 mt-0.5">
              This will restore full account access for <strong>{account.user_name ?? account.email}</strong>.
            </p>
          </div>
        </div>

        {/* Account info */}
        <div className="rounded-lg bg-surface-2 px-3 py-3 space-y-1">
          <p className="text-sm font-medium text-ink">{account.user_name ?? account.email}</p>
          <p className="text-xs text-ink-muted">{account.email}</p>
          {account.frozen_reason && (
            <p className="text-xs text-ink-faint mt-1">Frozen for: {account.frozen_reason}</p>
          )}
          {account.frozen_at && (
            <p className="text-xs text-ink-faint">Frozen: {fmtDate(account.frozen_at)}</p>
          )}
        </div>

        <Input
          label="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Reason for unfreezing…"
        />
      </div>
    </Modal>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function FrozenAccountsPage() {
  const [search, setSearch]             = useState('')
  const [page, setPage]                 = useState(1)
  const [unfreezeAcct, setUnfreezeAcct] = useState<FrozenAccount | null>(null)
  const [unfreezeOpen, setUnfreezeOpen] = useState(false)
  const limit = 25

  useEffect(() => { setPage(1) }, [search])

  const params = { search: search || undefined, page, limit }

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['frozen-accounts', params],
    queryFn: () => complianceApi.listFrozenAccounts(params),
  })

  const rows  = data?.data  ?? []
  const total = data?.total ?? 0

  function openUnfreeze(account: FrozenAccount) {
    setUnfreezeAcct(account)
    setUnfreezeOpen(true)
  }

  const columns = [
    {
      key: 'user', header: 'User',
      render: (a: FrozenAccount) => (
        <div>
          <p className="text-sm font-medium text-ink truncate max-w-[180px]">{a.user_name ?? a.email}</p>
          <p className="text-xs text-ink-faint truncate max-w-[180px]">{a.email}</p>
        </div>
      ),
    },
    {
      key: 'username', header: 'Username',
      render: (a: FrozenAccount) => (
        <span className="text-xs font-mono text-ink-muted">{a.username ?? '—'}</span>
      ),
    },
    {
      key: 'kyc', header: 'KYC',
      render: (a: FrozenAccount) => {
        const v: Record<string, 'neutral' | 'warning' | 'info' | 'success'> = {
          none: 'neutral', tier_1: 'warning', tier_2: 'info', tier_3: 'success',
        }
        const l: Record<string, string> = { none: 'None', tier_1: 'Tier 1', tier_2: 'Tier 2', tier_3: 'Tier 3' }
        return <Badge variant={v[a.kyc_level] ?? 'neutral'}>{l[a.kyc_level] ?? a.kyc_level}</Badge>
      },
    },
    {
      key: 'reason', header: 'Freeze Reason',
      render: (a: FrozenAccount) => (
        <span className="text-xs text-ink-muted truncate max-w-[200px] block">{a.frozen_reason ?? '—'}</span>
      ),
    },
    {
      key: 'frozen_at', header: 'Frozen At',
      render: (a: FrozenAccount) => (
        <span className="text-xs text-ink-faint whitespace-nowrap">{a.frozen_at ? fmtRelative(a.frozen_at) : '—'}</span>
      ),
    },
    {
      key: 'actions', header: '',
      render: (a: FrozenAccount) => (
        <Button
          variant="secondary"
          size="xs"
          icon={<Unlock className="h-3 w-3" />}
          onClick={(ev) => { ev.stopPropagation(); openUnfreeze(a) }}
        >
          Unfreeze
        </Button>
      ),
    },
  ]

  if (error) return <ErrorMessage error={error} onRetry={() => void refetch()} endpoint="/admin/frozen-accounts" />

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Frozen Accounts"
        subtitle="Accounts currently suspended by compliance actions"
        actions={
          <Button variant="secondary" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />}
            onClick={() => void refetch()}>Refresh</Button>
        }
      />

      {/* Summary card */}
      {!isLoading && total > 0 && (
        <div className="flex items-center gap-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20 px-4 py-3">
          <Snowflake className="h-5 w-5 text-cyan-400 shrink-0" />
          <p className="text-sm text-cyan-300">
            <strong>{total}</strong> account{total !== 1 ? 's' : ''} currently frozen.
          </p>
        </div>
      )}

      <FilterBar>
        <div className="flex-1 min-w-[180px] max-w-sm">
          <Input placeholder="Search email or username…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {search && (
          <Button variant="ghost" size="sm" onClick={() => setSearch('')}>Clear</Button>
        )}
      </FilterBar>

      <Card>
        {isLoading ? <SkeletonTable rows={6} /> : (
          <>
            <DataTable
              columns={columns}
              data={rows}
              rowKey={(a) => a.id}
              emptyMessage="No frozen accounts. All accounts are active."
            />
            <div className="px-4 pb-2">
              <Pagination page={page} limit={limit} total={total} onPage={setPage} />
            </div>
          </>
        )}
      </Card>

      <UnfreezeModal
        account={unfreezeAcct}
        open={unfreezeOpen}
        onClose={() => { setUnfreezeOpen(false); setUnfreezeAcct(null) }}
      />
    </div>
  )
}
