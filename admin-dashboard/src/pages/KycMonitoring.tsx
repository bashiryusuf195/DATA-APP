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
import { cn } from '@/utils/cn'
import type { KycUser, KycVerification, KycLevel } from '@/types'
import {
  ShieldCheck, ShieldAlert, Users, RefreshCw,
  CheckCircle2, BadgeCheck, XCircle,
} from 'lucide-react'

function errMsg(e: unknown, fallback: string) {
  if (axios.isAxiosError(e)) return e.response?.data?.error ?? e.message ?? fallback
  if (e instanceof Error) return e.message
  return fallback
}

const KYC_LEVEL_VARIANT: Record<KycLevel, 'neutral' | 'warning' | 'info' | 'success'> = {
  none:   'neutral',
  tier_1: 'warning',
  tier_2: 'info',
  tier_3: 'success',
}

const KYC_LEVEL_LABEL: Record<KycLevel, string> = {
  none:   'None',
  tier_1: 'Tier 1',
  tier_2: 'Tier 2',
  tier_3: 'Tier 3',
}

const VERIFY_STATUS_VARIANT: Record<string, 'success' | 'danger' | 'warning' | 'info' | 'neutral'> = {
  verified:      'success',
  failed:        'danger',
  pending:       'warning',
  in_progress:   'info',
  expired:       'neutral',
  manual_review: 'warning',
}

// ── Review Verification Modal (approve / reject NIN or BVN) ──────────────────

type DocType = 'nin' | 'bvn'
type ReviewAction = 'approve' | 'reject'

function ReviewVerificationModal({
  user, docType, action, open, onClose,
}: {
  user: KycUser | null
  docType: DocType | null
  action: ReviewAction | null
  open: boolean
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [notes, setNotes] = useState('')

  useEffect(() => { if (open) setNotes('') }, [open])

  const mutation = useMutation({
    mutationFn: () => complianceApi.reviewIdentityVerification(user!.id, {
      type:   docType!,
      action: action!,
      notes:  notes.trim() || undefined,
    }),
    onSuccess: () => {
      toast.success(`${docType?.toUpperCase()} ${action === 'approve' ? 'approved' : 'rejected'}`)
      qc.invalidateQueries({ queryKey: ['kyc-users'] })
      qc.invalidateQueries({ queryKey: ['kyc-verifications'] })
      onClose()
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to update verification')),
  })

  if (!user || !docType || !action) return null

  const isReject = action === 'reject'
  const label = `${isReject ? 'Reject' : 'Approve'} ${docType.toUpperCase()}`

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={label}
      subtitle={user.user_name ?? user.email}
      size="sm"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={mutation.isPending}>Cancel</Button>
          <Button
            variant={isReject ? 'danger' : 'primary'}
            size="sm"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || (isReject && !notes.trim())}
          >
            {mutation.isPending ? 'Saving…' : label}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {isReject && (
          <p className="text-xs text-ink-muted">This will mark the {docType.toUpperCase()} as failed. The customer will need to re-submit.</p>
        )}
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1.5">
            {isReject ? 'Reason (required)' : 'Notes (optional)'}
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-border bg-surface-2 text-ink text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent/50 resize-none"
            placeholder={isReject ? 'e.g. NIN does not match name on account' : 'Optional admin note…'}
          />
        </div>
      </div>
    </Modal>
  )
}

// ── KYC Level Update Modal ────────────────────────────────────────────────────

function UpdateKycModal({
  user, open, onClose,
}: { user: KycUser | null; open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const [level, setLevel] = useState<KycLevel>('none')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (open && user) { setLevel(user.kyc_level); setNotes('') }
  }, [open, user])

  const mutation = useMutation({
    mutationFn: () => complianceApi.updateKycStatus(user!.id, { kyc_level: level, notes: notes || undefined }),
    onSuccess: () => {
      toast.success('KYC level updated')
      qc.invalidateQueries({ queryKey: ['kyc-users'] })
      onClose()
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to update KYC level')),
  })

  if (!user) return null
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Update KYC Level"
      subtitle={user.user_name ?? user.email}
      size="sm"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={mutation.isPending}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending || level === user.kyc_level}>
            {mutation.isPending ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Select
          label="KYC Level"
          value={level}
          onChange={(e) => setLevel(e.target.value as KycLevel)}
          options={[
            { value: 'none',   label: 'None (unverified)' },
            { value: 'tier_1', label: 'Tier 1 (basic identity)' },
            { value: 'tier_2', label: 'Tier 2 (document verified)' },
            { value: 'tier_3', label: 'Tier 3 (fully verified)' },
          ]}
        />
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1.5">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-border bg-surface-2 text-ink text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent/50 resize-none"
            placeholder="Reason for change…"
          />
        </div>
      </div>
    </Modal>
  )
}

// ── User Drawer ───────────────────────────────────────────────────────────────

function maskDoc(val: string | null): string {
  if (!val) return '—'
  return val.length > 4 ? `${'•'.repeat(val.length - 4)}${val.slice(-4)}` : '••••'
}

function KycUserDrawer({
  user, onClose, onEdit,
}: { user: KycUser | null; onClose: () => void; onEdit: (u: KycUser) => void }) {
  const [reviewDocType, setReviewDocType] = useState<DocType | null>(null)
  const [reviewAction,  setReviewAction]  = useState<ReviewAction | null>(null)
  const [reviewOpen,    setReviewOpen]    = useState(false)

  function openReview(dt: DocType, act: ReviewAction) {
    setReviewDocType(dt); setReviewAction(act); setReviewOpen(true)
  }

  if (!user) return null

  const docs: Array<{ key: DocType; label: string; value: string | null; verified: boolean }> = [
    { key: 'nin', label: 'NIN', value: user.nin,  verified: user.nin_verified },
    { key: 'bvn', label: 'BVN', value: user.bvn,  verified: user.bvn_verified },
  ]

  return (
    <>
      <Drawer open={!!user} onClose={onClose} title={user.user_name ?? user.email} subtitle={user.email} width="md">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'KYC Level',  value: <Badge variant={KYC_LEVEL_VARIANT[user.kyc_level]}>{KYC_LEVEL_LABEL[user.kyc_level]}</Badge> },
              { label: 'Status',     value: <Badge variant={user.status === 'active' ? 'success' : 'warning'}>{user.status}</Badge> },
              { label: 'Risk Score', value: <span className="text-sm text-ink">{user.risk_score !== null ? `${user.risk_score} (${user.risk_level ?? '—'})` : '—'}</span> },
              { label: 'Joined',     value: <span className="text-sm text-ink">{fmtDate(user.created_at)}</span> },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-lg bg-surface-2 px-3 py-2">
                <p className="text-[10px] text-ink-faint uppercase tracking-wide mb-1">{label}</p>
                {value}
              </div>
            ))}
            <div className="col-span-2 rounded-lg bg-surface-2 px-3 py-2">
              <p className="text-[10px] text-ink-faint uppercase tracking-wide mb-1">Phone</p>
              <span className="text-sm text-ink">{user.phone ?? '—'}</span>
            </div>
          </div>

          {/* Identity documents */}
          <div>
            <p className="text-[10px] font-semibold text-ink-faint uppercase tracking-wide mb-2">Identity Documents</p>
            <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
              {docs.map(({ key, label, value, verified }) => (
                <div key={key} className="flex items-center justify-between px-3 py-2.5 bg-surface-1">
                  <div>
                    <p className="text-[10px] text-ink-faint uppercase tracking-wide">{label}</p>
                    <p className="text-sm font-mono text-ink mt-0.5">{maskDoc(value)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {!value ? (
                      <span className="text-xs text-ink-faint">Not submitted</span>
                    ) : verified ? (
                      <Badge variant="success" dot>Verified</Badge>
                    ) : (
                      <>
                        <Badge variant="warning" dot>Pending</Badge>
                        <button
                          onClick={() => openReview(key, 'approve')}
                          className="flex items-center gap-1 text-xs font-semibold text-success bg-success/10 hover:bg-success/20 px-2 py-1 rounded-lg transition-colors"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                        </button>
                        <button
                          onClick={() => openReview(key, 'reject')}
                          className="flex items-center gap-1 text-xs font-semibold text-danger bg-danger/10 hover:bg-danger/20 px-2 py-1 rounded-lg transition-colors"
                        >
                          <XCircle className="h-3.5 w-3.5" /> Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Button variant="secondary" size="sm" className="w-full" onClick={() => onEdit(user)}>
            Update KYC Level Manually
          </Button>
        </div>
      </Drawer>

      <ReviewVerificationModal
        user={user}
        docType={reviewDocType}
        action={reviewAction}
        open={reviewOpen}
        onClose={() => { setReviewOpen(false); setReviewDocType(null); setReviewAction(null) }}
      />
    </>
  )
}

// ── Users Tab ─────────────────────────────────────────────────────────────────

function UsersTab() {
  const [search, setSearch]       = useState('')
  const [kycLevel, setKycLevel]   = useState('')
  const [status, setStatus]       = useState('')
  const [page, setPage]           = useState(1)
  const [activeUser, setUser]     = useState<KycUser | null>(null)
  const [editUser, setEditUser]   = useState<KycUser | null>(null)
  const [editOpen, setEditOpen]   = useState(false)
  const limit = 25

  useEffect(() => { setPage(1) }, [search, kycLevel, status])

  const params = { search: search || undefined, kyc_level: kycLevel || undefined, status: status || undefined, page, limit }

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['kyc-users', params],
    queryFn: () => complianceApi.listKycUsers(params),
  })

  const rows  = data?.data  ?? []
  const total = data?.total ?? 0
  const stats = data?.stats ?? { total_users: 0, verified_tier1: 0, verified_tier2: 0, verified_tier3: 0, pending: 0, bvn_verified: 0, nin_verified: 0 }

  const columns = [
    {
      key: 'user', header: 'User',
      render: (u: KycUser) => (
        <div>
          <p className="text-sm font-medium text-ink truncate max-w-[180px]">{u.user_name ?? u.email}</p>
          <p className="text-xs text-ink-faint truncate max-w-[180px]">{u.email}</p>
        </div>
      ),
    },
    {
      key: 'kyc', header: 'KYC Level',
      render: (u: KycUser) => <Badge variant={KYC_LEVEL_VARIANT[u.kyc_level]}>{KYC_LEVEL_LABEL[u.kyc_level]}</Badge>,
    },
    {
      key: 'bvn', header: 'BVN',
      render: (u: KycUser) => u.bvn
        ? <Badge variant={u.bvn_verified ? 'success' : 'warning'} dot>{u.bvn_verified ? 'Verified' : 'Pending'}</Badge>
        : <span className="text-xs text-ink-faint">—</span>,
    },
    {
      key: 'nin', header: 'NIN',
      render: (u: KycUser) => u.nin
        ? <Badge variant={u.nin_verified ? 'success' : 'warning'} dot>{u.nin_verified ? 'Verified' : 'Pending'}</Badge>
        : <span className="text-xs text-ink-faint">—</span>,
    },
    {
      key: 'risk', header: 'Risk',
      render: (u: KycUser) => {
        if (!u.risk_level) return <span className="text-xs text-ink-faint">—</span>
        const v: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = { low: 'success', medium: 'warning', high: 'danger', critical: 'danger' }
        return <Badge variant={v[u.risk_level] ?? 'neutral'}>{u.risk_level}</Badge>
      },
    },
    {
      key: 'status', header: 'Status',
      render: (u: KycUser) => <Badge variant={u.status === 'active' ? 'success' : u.status === 'suspended' ? 'danger' : 'neutral'}>{u.status}</Badge>,
    },
    {
      key: 'joined', header: 'Joined',
      render: (u: KycUser) => <span className="text-xs text-ink-faint whitespace-nowrap">{fmtRelative(u.created_at)}</span>,
    },
  ]

  if (error) return <ErrorMessage error={error} onRetry={() => void refetch()} endpoint="/admin/kyc/users" />

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {isLoading ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />) : (
          <>
            <MetricCard label="Total Users"    value={stats.total_users.toLocaleString()} icon={<Users className="h-4 w-4" />} variant="default" />
            <MetricCard label="KYC Unverified" value={stats.pending.toLocaleString()}     icon={<ShieldAlert className="h-4 w-4" />} variant="warning" />
            <MetricCard label="BVN Verified"   value={stats.bvn_verified.toLocaleString()} icon={<CheckCircle2 className="h-4 w-4" />} variant="success" />
            <MetricCard label="NIN Verified"   value={stats.nin_verified.toLocaleString()} icon={<BadgeCheck className="h-4 w-4" />} variant="success" />
          </>
        )}
      </div>

      <FilterBar>
        <div className="flex-1 min-w-[180px] max-w-sm">
          <Input placeholder="Search email, phone, username…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select
          value={kycLevel}
          onChange={(e) => setKycLevel(e.target.value)}
          options={[
            { value: '', label: 'All KYC levels' },
            { value: 'none',   label: 'None' },
            { value: 'tier_1', label: 'Tier 1' },
            { value: 'tier_2', label: 'Tier 2' },
            { value: 'tier_3', label: 'Tier 3' },
          ]}
          className="w-36"
        />
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={[
            { value: '', label: 'All statuses' },
            { value: 'active',     label: 'Active' },
            { value: 'suspended',  label: 'Suspended' },
            { value: 'pending_verification', label: 'Pending' },
          ]}
          className="w-40"
        />
        {(search || kycLevel || status) && (
          <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setKycLevel(''); setStatus('') }}>Clear</Button>
        )}
      </FilterBar>

      <Card>
        {isLoading ? <SkeletonTable rows={8} /> : (
          <>
            <DataTable
              columns={columns}
              data={rows}
              rowKey={(u) => u.id}
              onRowClick={(u) => setUser(u)}
              emptyMessage="No users found matching the current filters."
            />
            <div className="px-4 pb-2">
              <Pagination page={page} limit={limit} total={total} onPage={setPage} />
            </div>
          </>
        )}
      </Card>

      <KycUserDrawer
        user={activeUser}
        onClose={() => setUser(null)}
        onEdit={(u) => { setEditUser(u); setEditOpen(true); setUser(null) }}
      />
      <UpdateKycModal user={editUser} open={editOpen} onClose={() => { setEditOpen(false); setEditUser(null) }} />
    </div>
  )
}

// ── Verifications Tab ─────────────────────────────────────────────────────────

function VerificationsTab() {
  const [verType, setVerType] = useState('')
  const [status, setStatus]   = useState('')
  const [page, setPage]       = useState(1)
  const limit = 25

  useEffect(() => { setPage(1) }, [verType, status])

  const params = { verification_type: verType || undefined, status: status || undefined, page, limit }

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['kyc-verifications', params],
    queryFn: () => complianceApi.listKycVerifications(params),
  })

  const rows  = data?.data  ?? []
  const total = data?.total ?? 0

  const columns = [
    {
      key: 'user', header: 'User',
      render: (v: KycVerification) => (
        <div>
          <p className="text-sm text-ink truncate max-w-[160px]">{v.user_name ?? v.email ?? '—'}</p>
          {v.email && v.user_name && v.user_name !== v.email && (
            <p className="text-xs text-ink-faint truncate max-w-[160px]">{v.email}</p>
          )}
        </div>
      ),
    },
    {
      key: 'type', header: 'Type',
      render: (v: KycVerification) => <Badge variant="info">{v.verification_type.toUpperCase()}</Badge>,
    },
    {
      key: 'status', header: 'Status',
      render: (v: KycVerification) => (
        <Badge variant={VERIFY_STATUS_VARIANT[v.status] ?? 'neutral'}>{v.status.replace('_', ' ')}</Badge>
      ),
    },
    {
      key: 'provider', header: 'Provider',
      render: (v: KycVerification) => <span className="text-xs text-ink-muted">{v.provider ?? '—'}</span>,
    },
    {
      key: 'verified', header: 'Verified At',
      render: (v: KycVerification) => <span className="text-xs text-ink-faint whitespace-nowrap">{v.verified_at ? fmtDate(v.verified_at) : '—'}</span>,
    },
    {
      key: 'failure', header: 'Failure Reason',
      render: (v: KycVerification) => (
        <span className="text-xs text-ink-muted max-w-[160px] truncate block">{v.failure_reason ?? '—'}</span>
      ),
    },
    {
      key: 'created', header: 'Created',
      render: (v: KycVerification) => <span className="text-xs text-ink-faint whitespace-nowrap">{fmtRelative(v.created_at)}</span>,
    },
  ]

  if (error) return <ErrorMessage error={error} onRetry={() => void refetch()} endpoint="/admin/kyc/verifications" />

  return (
    <div className="space-y-6">
      <FilterBar>
        <Select
          value={verType}
          onChange={(e) => setVerType(e.target.value)}
          options={[
            { value: '', label: 'All types' },
            { value: 'bvn',       label: 'BVN' },
            { value: 'nin',       label: 'NIN' },
            { value: 'address',   label: 'Address' },
            { value: 'selfie',    label: 'Selfie' },
            { value: 'liveness',  label: 'Liveness' },
          ]}
          className="w-36"
        />
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={[
            { value: '', label: 'All statuses' },
            { value: 'pending',       label: 'Pending' },
            { value: 'in_progress',   label: 'In Progress' },
            { value: 'verified',      label: 'Verified' },
            { value: 'failed',        label: 'Failed' },
            { value: 'expired',       label: 'Expired' },
            { value: 'manual_review', label: 'Manual Review' },
          ]}
          className="w-40"
        />
        {(verType || status) && (
          <Button variant="ghost" size="sm" onClick={() => { setVerType(''); setStatus('') }}>Clear</Button>
        )}
      </FilterBar>

      <Card>
        {isLoading ? <SkeletonTable rows={8} /> : (
          <>
            <DataTable
              columns={columns}
              data={rows}
              rowKey={(v) => v.id}
              emptyMessage="No verification events found."
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

// ── Page ──────────────────────────────────────────────────────────────────────

type Tab = 'users' | 'verifications'

export function KycMonitoringPage() {
  const [tab, setTab] = useState<Tab>('users')
  const qc = useQueryClient()

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="KYC Monitoring"
        subtitle="Identity verification status and compliance levels"
        actions={
          <Button variant="secondary" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />}
            onClick={() => {
              void qc.invalidateQueries({ queryKey: ['kyc-users'] })
              void qc.invalidateQueries({ queryKey: ['kyc-verifications'] })
            }}>
            Refresh
          </Button>
        }
      />

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {([
          { key: 'users',         label: 'Users',         icon: <Users className="h-3.5 w-3.5" /> },
          { key: 'verifications', label: 'Verifications', icon: <ShieldCheck className="h-3.5 w-3.5" /> },
        ] as { key: Tab; label: string; icon: React.ReactNode }[]).map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === key
                ? 'border-accent text-accent'
                : 'border-transparent text-ink-muted hover:text-ink hover:border-border'
            )}
          >
            {icon}{label}
          </button>
        ))}
      </div>

      {tab === 'users'         && <UsersTab />}
      {tab === 'verifications' && <VerificationsTab />}
    </div>
  )
}
