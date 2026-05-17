import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { usersApi, type AdminUser } from '@/api/users.api'
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
import { fmtDate } from '@/utils/format'
import { Search, RefreshCw, Users } from 'lucide-react'
import { useDebounce } from '@/hooks/useDebounce'
import { ENDPOINTS } from '@/config/endpoints'
import type { ReactNode } from 'react'

const STATUS_OPTIONS = [
  { value: 'active',    label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'pending',   label: 'Pending' },
  { value: 'banned',    label: 'Banned' },
]

const ROLE_OPTIONS = [
  { value: 'user',        label: 'User' },
  { value: 'admin',       label: 'Admin' },
  { value: 'super_admin', label: 'Super Admin' },
]

function statusVariant(s?: string): 'success' | 'warning' | 'danger' | 'neutral' {
  if (s === 'active')    return 'success'
  if (s === 'suspended') return 'warning'
  if (s === 'banned')    return 'danger'
  return 'neutral'
}

const columns: Column<AdminUser>[] = [
  {
    key: 'identity',
    header: 'Name / Email',
    render: (u) => (
      <div>
        <p className="text-sm font-medium text-ink">
          {[u.first_name, u.last_name].filter(Boolean).join(' ') || '—'}
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
      const r = u.roles?.[0] ?? u.role ?? 'user'
      return (
        <Badge variant={r === 'super_admin' ? 'danger' : r === 'admin' ? 'warning' : 'neutral'}>
          {r}
        </Badge>
      )
    },
  },
  {
    key: 'kyc',
    header: 'KYC',
    align: 'center',
    render: (u) => <span className="font-semibold text-sm text-ink">{u.kyc_level ?? 0}</span>,
  },
  {
    key: 'verified',
    header: 'Verified',
    render: (u) => <BoolBadge value={!!u.is_email_verified} />,
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
        'Suspend, ban or re-activate accounts',
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
  const enabled = ENDPOINTS.adminUsers.status === 'available'

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
    enabled,
  })

  const rows: AdminUser[] = raw?.data ?? []
  const total = raw?.total ?? rows.length

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
        <div className="w-36">
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}
            options={STATUS_OPTIONS} placeholder="All statuses" />
        </div>
        <div className="w-36">
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
        width="md"
      >
        {selected && <UserDetail user={selected} />}
      </Drawer>
    </div>
  )
}

function UserDetail({ user }: { user: AdminUser }) {
  const initials = (user.first_name?.[0] ?? user.email[0]).toUpperCase()
  const displayName = [user.first_name, user.last_name].filter(Boolean).join(' ') || 'No name set'

  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-surface-2 p-4 flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-accent-subtle flex items-center justify-center text-accent font-bold text-sm shrink-0">
          {initials}
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-ink text-sm truncate">{displayName}</p>
          <p className="text-xs text-ink-faint truncate">{user.email}</p>
        </div>
      </div>

      <div className="space-y-0">
        <Row label="User ID"        value={<span className="font-mono text-xs break-all">{user.id}</span>} />
        <Row label="Status"         value={<Badge variant={statusVariant(user.status)} dot>{user.status ?? '—'}</Badge>} />
        <Row label="Role"           value={user.roles?.[0] ?? user.role ?? 'user'} />
        <Row label="KYC Level"      value={String(user.kyc_level ?? 0)} />
        <Row label="Email Verified" value={<BoolBadge value={!!user.is_email_verified} />} />
        <Row label="Joined"         value={fmtDate(user.created_at)} />
        {user.updated_at && <Row label="Updated" value={fmtDate(user.updated_at)} />}
        {user.phone && <Row label="Phone" value={user.phone} />}
      </div>
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
