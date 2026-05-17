import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { usersApi, type AdminUser, type AdminUserDetail } from '@/api/users.api'
import { EndpointGuard } from '@/components/shared/EndpointGuard'
import { PageHeader } from '@/components/shared/PageHeader'
import { FilterBar } from '@/components/shared/FilterBar'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { Pagination } from '@/components/shared/Pagination'
import { Drawer } from '@/components/shared/Drawer'
import { ErrorMessage } from '@/components/shared/ErrorMessage'
import { Button, Input, Select, Badge, Card } from '@/components/ui'
import { SkeletonTable } from '@/components/ui/Skeleton'
import { BoolBadge } from '@/components/shared/StatusBadge'
import { fmtDate, fmtCurrency } from '@/utils/format'
import { Search, RefreshCw, Users } from 'lucide-react'
import { useDebounce } from '@/hooks/useDebounce'
import { ENDPOINTS } from '@/config/endpoints'
import type { ReactNode } from 'react'

const STATUS_OPTIONS = [
  { value: 'active',               label: 'Active' },
  { value: 'suspended',            label: 'Suspended' },
  { value: 'pending_verification', label: 'Pending Verification' },
  { value: 'deactivated',          label: 'Deactivated' },
  { value: 'banned',               label: 'Banned' },
]

const ROLE_OPTIONS = [
  { value: 'customer',         label: 'Customer' },
  { value: 'merchant',         label: 'Merchant' },
  { value: 'agent',            label: 'Agent' },
  { value: 'support_agent',    label: 'Support Agent' },
  { value: 'compliance',       label: 'Compliance' },
  { value: 'finance',          label: 'Finance' },
  { value: 'admin',            label: 'Admin' },
  { value: 'super_admin',      label: 'Super Admin' },
]

function statusVariant(s?: string): 'success' | 'warning' | 'danger' | 'neutral' {
  if (s === 'active')               return 'success'
  if (s === 'suspended')            return 'warning'
  if (s === 'banned')               return 'danger'
  if (s === 'pending_verification') return 'neutral'
  return 'neutral'
}

function txStatusVariant(s: string): 'success' | 'warning' | 'danger' | 'neutral' {
  if (s === 'success' || s === 'completed') return 'success'
  if (s === 'pending')                      return 'warning'
  if (s === 'failed' || s === 'refunded')   return 'danger'
  return 'neutral'
}

function roleVariant(r: string): 'danger' | 'warning' | 'neutral' {
  if (r === 'super_admin') return 'danger'
  if (r === 'admin')       return 'warning'
  return 'neutral'
}

const columns: Column<AdminUser>[] = [
  {
    key: 'identity',
    header: 'Name / Email',
    render: (u) => (
      <div>
        <p className="text-sm font-medium text-ink">
          {u.full_name ?? '—'}
        </p>
        <p className="text-xs text-ink-faint font-mono">{u.email}</p>
      </div>
    ),
  },
  {
    key: 'status',
    header: 'Status',
    render: (u) => (
      <Badge variant={statusVariant(u.status)} dot>{u.status ?? '—'}</Badge>
    ),
  },
  {
    key: 'role',
    header: 'Role',
    render: (u) => {
      const r = u.roles[0] ?? 'customer'
      return <Badge variant={roleVariant(r)}>{r.replace(/_/g, ' ')}</Badge>
    },
  },
  {
    key: 'kyc',
    header: 'KYC',
    align: 'center',
    render: (u) => <span className="font-semibold text-sm text-ink">{u.kyc_level}</span>,
  },
  {
    key: 'balance',
    header: 'Balance',
    align: 'right',
    render: (u) => (
      <span className="font-mono text-sm text-ink">
        {u.wallet ? fmtCurrency(u.wallet.balance, u.wallet.currency) : '—'}
      </span>
    ),
  },
  {
    key: 'verified',
    header: 'Verified',
    render: (u) => <BoolBadge value={u.is_email_verified} />,
  },
  {
    key: 'joined',
    header: 'Joined',
    render: (u) => <span className="text-xs text-ink-faint">{fmtDate(u.created_at)}</span>,
  },
]

export function UsersPage() {
  return (
    <EndpointGuard
      endpointKey="adminUsers"
      pageTitle="Users"
      pageSubtitle="Manage platform users, KYC levels and roles"
      features={[
        'Search and filter users by email, status and role',
        'View user profile, KYC level and email verification',
        'View per-user wallet balance',
        'User activity and transaction history',
      ]}
    >
      <UsersContent />
    </EndpointGuard>
  )
}

function UsersContent() {
  const [page, setPage]     = useState(1)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [role, setRole]     = useState('')
  const [selected, setSelected] = useState<AdminUser | null>(null)
  const limit = 20

  const debouncedSearch = useDebounce(search)

  const { data: raw, isLoading, error, refetch } = useQuery({
    queryKey: ['users', { page, limit, email: debouncedSearch, status, role }],
    queryFn: () =>
      usersApi.list({
        page,
        limit,
        ...(debouncedSearch ? { email: debouncedSearch } : {}),
        ...(status ? { status } : {}),
        ...(role   ? { role }   : {}),
      }),
  })

  const rows: AdminUser[] = raw?.data ?? []
  const total = raw?.total ?? 0

  const handleSearch = useCallback((v: string) => { setSearch(v); setPage(1) }, [])

  if (error) return <ErrorMessage error={error} onRetry={() => void refetch()} endpoint={ENDPOINTS.adminUsers.path} />

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Users"
        subtitle="Manage platform users, KYC levels and roles"
        actions={
          <Button variant="secondary" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />}
            onClick={() => void refetch()}>Refresh</Button>
        }
      />

      <FilterBar>
        <div className="w-64">
          <Input
            placeholder="Search by email…"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            prefix={<Search className="h-3.5 w-3.5" />}
          />
        </div>
        <div className="w-44">
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}
            options={STATUS_OPTIONS} placeholder="All statuses" />
        </div>
        <div className="w-40">
          <Select value={role} onChange={(e) => { setRole(e.target.value); setPage(1) }}
            options={ROLE_OPTIONS} placeholder="All roles" />
        </div>
      </FilterBar>

      <Card padding="none">
        {isLoading ? (
          <div className="p-5"><SkeletonTable rows={10} /></div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Users className="h-12 w-12 text-ink-faint opacity-30 mb-3" />
            <p className="text-sm text-ink-faint">No users found</p>
          </div>
        ) : (
          <>
            <DataTable
              data={rows}
              rowKey={(u) => u.id}
              onRowClick={setSelected}
              columns={columns}
            />
            <div className="px-4 pb-4">
              <Pagination page={page} limit={limit} total={total} onPage={setPage} />
            </div>
          </>
        )}
      </Card>

      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title="User Detail"
        subtitle={selected?.email ?? ''}
        width="lg"
      >
        {selected && <UserDetailPanel userId={selected.id} summary={selected} />}
      </Drawer>
    </div>
  )
}

function UserDetailPanel({ userId, summary }: { userId: string; summary: AdminUser }) {
  const { data: detail, isLoading, error } = useQuery({
    queryKey: ['user', userId],
    queryFn:  () => usersApi.get(userId),
  })

  const initials = (summary.full_name?.[0] ?? summary.email[0]).toUpperCase()

  return (
    <div className="space-y-5">
      {/* Identity header */}
      <div className="rounded-xl bg-surface-2 p-4 flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-accent-subtle flex items-center justify-center text-accent font-bold text-sm shrink-0">
          {initials}
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-ink text-sm truncate">{summary.full_name ?? 'No name set'}</p>
          <p className="text-xs text-ink-faint truncate">{summary.email}</p>
        </div>
        <div className="ml-auto shrink-0">
          <Badge variant={statusVariant(summary.status)} dot>{summary.status}</Badge>
        </div>
      </div>

      {isLoading && <SkeletonTable rows={6} />}
      {error    && <p className="text-xs text-danger px-1">Failed to load user details.</p>}
      {detail   && <UserDetailContent detail={detail} />}
    </div>
  )
}

function UserDetailContent({ detail }: { detail: AdminUserDetail }) {
  const displayName =
    [detail.profile.first_name, detail.profile.last_name].filter(Boolean).join(' ') ||
    detail.profile.display_name ||
    '—'

  return (
    <div className="space-y-5">
      {/* Core fields */}
      <Section title="Account">
        <Row label="User ID"         value={<span className="font-mono text-xs break-all">{detail.id}</span>} />
        <Row label="Email"           value={detail.email} />
        {detail.phone    && <Row label="Phone"    value={detail.phone} />}
        {detail.username && <Row label="Username" value={`@${detail.username}`} />}
        <Row label="Status"          value={<Badge variant={statusVariant(detail.status)} dot>{detail.status}</Badge>} />
        <Row label="KYC Level"       value={detail.kyc_level} />
        <Row label="Login Count"     value={String(detail.login_count)} />
        <Row label="Email Verified"  value={<BoolBadge value={detail.is_email_verified} />} />
        <Row label="Phone Verified"  value={<BoolBadge value={detail.is_phone_verified} />} />
        <Row label="Last Login"      value={fmtDate(detail.last_login_at)} />
        <Row label="Joined"          value={fmtDate(detail.created_at)} />
      </Section>

      {/* Profile */}
      <Section title="Profile">
        <Row label="Full Name"     value={displayName} />
        {detail.profile.date_of_birth && <Row label="Date of Birth" value={detail.profile.date_of_birth} />}
        {detail.profile.gender        && <Row label="Gender"        value={detail.profile.gender} />}
        {(detail.profile.city || detail.profile.state || detail.profile.country) && (
          <Row label="Location" value={[detail.profile.city, detail.profile.state, detail.profile.country].filter(Boolean).join(', ')} />
        )}
        <Row label="BVN Verified" value={<BoolBadge value={detail.profile.bvn_verified} />} />
        <Row label="NIN Verified" value={<BoolBadge value={detail.profile.nin_verified} />} />
      </Section>

      {/* Roles */}
      {detail.roles.length > 0 && (
        <Section title="Roles">
          {detail.roles.map((r) => (
            <Row
              key={r.role}
              label={r.name}
              value={
                <div className="text-right">
                  <Badge variant={roleVariant(r.role)}>{r.role.replace(/_/g, ' ')}</Badge>
                  <p className="text-xs text-ink-faint mt-0.5">Since {fmtDate(r.assigned_at)}</p>
                  {r.expires_at && <p className="text-xs text-warning">Expires {fmtDate(r.expires_at)}</p>}
                </div>
              }
            />
          ))}
        </Section>
      )}

      {/* Wallets */}
      {detail.wallets.length > 0 && (
        <Section title="Wallets">
          {detail.wallets.map((w) => (
            <div key={w.wallet_id} className="py-2 border-b border-border/50 last:border-0">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-ink">
                    {w.label ?? w.wallet_type}
                    {w.is_default && <span className="ml-1.5 text-xs text-ink-faint">(default)</span>}
                  </p>
                  <p className="text-xs text-ink-faint font-mono">{w.wallet_id}</p>
                </div>
                <div className="text-right">
                  <p className="font-mono font-semibold text-sm text-ink">
                    {fmtCurrency(w.balance, w.currency)}
                  </p>
                  <Badge variant={w.status === 'active' ? 'success' : 'neutral'} className="text-xs">
                    {w.status}
                  </Badge>
                </div>
              </div>
            </div>
          ))}
        </Section>
      )}

      {/* Recent transactions */}
      {detail.recent_transactions.length > 0 && (
        <Section title="Recent Transactions">
          {detail.recent_transactions.map((t) => (
            <div key={t.id} className="py-2 border-b border-border/50 last:border-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-mono text-ink-faint truncate">{t.reference}</p>
                  <p className="text-xs text-ink capitalize">{t.type.replace(/_/g, ' ')}</p>
                  {t.provider && <p className="text-xs text-ink-faint">{t.provider}</p>}
                </div>
                <div className="text-right shrink-0">
                  <p className="font-mono text-sm font-medium text-ink">
                    {fmtCurrency(t.amount, t.currency)}
                  </p>
                  <Badge variant={txStatusVariant(t.status)}>{t.status}</Badge>
                </div>
              </div>
              <p className="text-xs text-ink-faint mt-1">{fmtDate(t.created_at)}</p>
            </div>
          ))}
        </Section>
      )}

      {/* Sessions */}
      {detail.sessions.length > 0 && (
        <Section title="Recent Sessions">
          {detail.sessions.map((s) => (
            <div key={s.id} className="py-2 border-b border-border/50 last:border-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs text-ink truncate">{s.ip_address ?? '—'}</p>
                  {s.user_agent && (
                    <p className="text-xs text-ink-faint truncate max-w-[200px]">{s.user_agent}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  {s.is_revoked
                    ? <Badge variant="danger">Revoked</Badge>
                    : <Badge variant="success">Active</Badge>}
                  <p className="text-xs text-ink-faint mt-0.5">{fmtDate(s.created_at)}</p>
                </div>
              </div>
            </div>
          ))}
        </Section>
      )}

      {/* Notifications */}
      <Section title="Notifications">
        <Row label="Total"  value={String(detail.notifications_count.total)} />
        <Row label="Unread" value={
          <Badge variant={detail.notifications_count.unread > 0 ? 'warning' : 'neutral'}>
            {detail.notifications_count.unread}
          </Badge>
        } />
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-ink-faint uppercase tracking-wide mb-2">{title}</p>
      <div className="rounded-lg border border-border/50 px-3">{children}</div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-border/50 last:border-0">
      <span className="text-xs text-ink-faint w-28 shrink-0">{label}</span>
      <span className="text-sm text-ink text-right">{value}</span>
    </div>
  )
}
