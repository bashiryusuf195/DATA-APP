import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { rolesApi } from '@/api/roles.api'
import { usersApi } from '@/api/users.api'
import type { AdminUser } from '@/api/users.api'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataTable } from '@/components/shared/DataTable'
import { StatCard } from '@/components/shared/StatCard'
import { ErrorMessage } from '@/components/shared/ErrorMessage'
import { EmptyState } from '@/components/shared/EmptyState'
import { Drawer } from '@/components/shared/Drawer'
import { Button, Badge, Card, Input, Select, Modal, Spinner, Skeleton } from '@/components/ui'
import { fmtDate } from '@/utils/format'
import type { AdminRole, PermissionGroup, UserRole } from '@/types'
import {
  Shield, Users, Key, RefreshCw, CheckCircle,
  Search, Trash2, UserCheck, X, AlertTriangle,
} from 'lucide-react'
import { ENDPOINTS } from '@/config/endpoints'
import toast from 'react-hot-toast'
import axios from 'axios'

function errMsg(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const d = err.response?.data as Record<string, unknown> | undefined
    return (d?.error as string) ?? (d?.message as string) ?? err.message ?? fallback
  }
  if (err instanceof Error) return err.message
  return fallback
}

function userStatusVariant(status: string): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'active')  return 'success'
  if (status === 'suspended' || status === 'banned') return 'danger'
  if (status === 'pending_verification') return 'warning'
  return 'neutral'
}

// ─── Permissions Matrix ───────────────────────────────────────────────────────

const ALL_ACTIONS = ['read', 'create', 'update', 'delete', 'execute', 'approve', 'reject', 'export']

function PermissionsMatrix({ groups }: { groups: PermissionGroup[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-2.5 px-3 text-ink-faint font-medium w-36 sticky left-0 bg-surface-1">
              Resource
            </th>
            {ALL_ACTIONS.map((a) => (
              <th key={a} className="py-2.5 px-2 text-center text-ink-faint font-medium capitalize min-w-[56px]">
                {a}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => {
            const actionSet = new Set(g.permissions.map((p) => p.action))
            return (
              <tr key={g.resource} className="border-b border-border/50 hover:bg-surface-2/50">
                <td className="py-2 px-3 font-mono font-medium text-ink sticky left-0 bg-surface-1">
                  {g.resource}
                </td>
                {ALL_ACTIONS.map((a) => (
                  <td key={a} className="py-2 px-2 text-center">
                    {actionSet.has(a) ? (
                      <CheckCircle className="h-3.5 w-3.5 text-emerald-400 mx-auto" />
                    ) : (
                      <span className="block h-3.5 w-3.5 mx-auto rounded-full border border-border" />
                    )}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── User Role Manager (left panel) ──────────────────────────────────────────

interface RemoveTarget { roleId: string; roleName: string }

function UserRoleManager({ allRoles }: { allRoles: AdminRole[] }) {
  const qc = useQueryClient()
  const dropdownRef = useRef<HTMLDivElement>(null)

  const [searchTerm, setSearchTerm]       = useState('')
  const [debouncedSearch, setDebounced]   = useState('')
  const [showDropdown, setShowDropdown]   = useState(false)
  const [selectedUser, setSelectedUser]   = useState<AdminUser | null>(null)
  const [selectedRoleId, setSelectedRoleId] = useState('')
  const [confirmRemove, setConfirmRemove] = useState<RemoveTarget | null>(null)

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setDebounced(searchTerm), 350)
    return () => clearTimeout(t)
  }, [searchTerm])

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Search users by email
  const { data: searchPage, isFetching: searching } = useQuery({
    queryKey: ['users-search', debouncedSearch],
    queryFn: () => usersApi.list({ email: debouncedSearch, limit: 6 }),
    enabled: debouncedSearch.length >= 2 && !selectedUser,
    placeholderData: (prev) => prev,
  })
  const searchResults = searchPage?.data ?? []

  // Load the selected user's current roles
  const {
    data: userRoles = [],
    isLoading: rolesLoading,
    isFetching: rolesFetching,
  } = useQuery({
    queryKey: ['user-roles', selectedUser?.id],
    queryFn: () => rolesApi.getUserRoles(selectedUser!.id),
    enabled: !!selectedUser,
  })

  // Assign role mutation
  const assignMutation = useMutation({
    mutationFn: () => rolesApi.assignRole(selectedUser!.id, selectedRoleId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['user-roles', selectedUser?.id] })
      void qc.invalidateQueries({ queryKey: ['roles'] })
      toast.success('Role assigned successfully')
      setSelectedRoleId('')
    },
    onError: (err) => toast.error(errMsg(err, 'Failed to assign role')),
  })

  // Remove role mutation
  const removeMutation = useMutation({
    mutationFn: ({ roleId }: { roleId: string }) =>
      rolesApi.revokeRole(selectedUser!.id, roleId),
    onSuccess: (_, { roleId }) => {
      void qc.invalidateQueries({ queryKey: ['user-roles', selectedUser?.id] })
      void qc.invalidateQueries({ queryKey: ['roles'] })
      const removed = userRoles.find((r) => r.role_id === roleId)
      toast.success(`Removed ${removed?.role_name ?? 'role'} successfully`)
      setConfirmRemove(null)
    },
    onError: (err) => {
      toast.error(errMsg(err, 'Failed to remove role'))
      setConfirmRemove(null)
    },
  })

  const assignedRoleIds = new Set(userRoles.map((r) => r.role_id))
  const availableRoles  = allRoles.filter((r) => r.is_active && !assignedRoleIds.has(r.id))

  function selectUser(user: AdminUser) {
    setSelectedUser(user)
    setSearchTerm('')
    setDebounced('')
    setShowDropdown(false)
    setSelectedRoleId('')
  }

  function clearUser() {
    setSelectedUser(null)
    setSearchTerm('')
    setDebounced('')
    setSelectedRoleId('')
  }

  const isSuperAdminRemoval = (ur: UserRole) => ur.role_slug === 'super_admin'

  return (
    <div className="space-y-4">
      {/* Search */}
      <div ref={dropdownRef} className="relative">
        <Input
          label="Find User"
          placeholder="Search by email…"
          value={searchTerm}
          disabled={!!selectedUser}
          prefix={<Search className="h-3.5 w-3.5" />}
          suffix={searching ? <Spinner size="sm" className="h-3.5 w-3.5" /> : undefined}
          onChange={(e) => {
            setSearchTerm(e.target.value)
            setShowDropdown(true)
          }}
          onFocus={() => setShowDropdown(true)}
        />

        {/* Dropdown results */}
        {showDropdown && !selectedUser && debouncedSearch.length >= 2 && (
          <div className="absolute z-20 top-full mt-1 w-full bg-surface-1 border border-border rounded-lg shadow-xl overflow-hidden">
            {searchResults.length === 0 && !searching ? (
              <p className="px-3 py-3 text-xs text-ink-faint text-center">
                No users found matching &ldquo;{debouncedSearch}&rdquo;
              </p>
            ) : (
              searchResults.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectUser(user)}
                  className="w-full text-left px-3 py-2.5 hover:bg-surface-2 border-b border-border/40 last:border-0 transition-colors"
                >
                  <p className="text-sm text-ink font-medium truncate">{user.email}</p>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <Badge variant={userStatusVariant(user.status)} size="sm">
                      {user.status.replace('_', ' ')}
                    </Badge>
                    {user.roles.slice(0, 3).map((r) => (
                      <Badge key={r} variant="neutral" size="sm">{r}</Badge>
                    ))}
                    {user.roles.length > 3 && (
                      <Badge variant="neutral" size="sm">+{user.roles.length - 3}</Badge>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* No user selected hint */}
      {!selectedUser && (
        <EmptyState
          icon={<UserCheck className="h-9 w-9" />}
          title="Select a user to manage roles"
          description="Type at least 2 characters of an email to search"
          className="py-10"
        />
      )}

      {/* Selected user card */}
      {selectedUser && (
        <div className="border border-border rounded-xl bg-surface-2/30 overflow-hidden">
          {/* User header */}
          <div className="flex items-start justify-between gap-2 px-4 py-3 bg-surface-2/60 border-b border-border">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink truncate">{selectedUser.email}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge variant={userStatusVariant(selectedUser.status)} size="sm" dot>
                  {selectedUser.status.replace('_', ' ')}
                </Badge>
                {selectedUser.full_name && (
                  <span className="text-xs text-ink-faint truncate">{selectedUser.full_name}</span>
                )}
              </div>
            </div>
            <Button variant="ghost" size="xs" onClick={clearUser} className="shrink-0 mt-0.5">
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="px-4 py-3 space-y-4">
            {/* Assigned roles */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-ink-muted uppercase tracking-wider">
                  Assigned Roles
                </p>
                {rolesFetching && !rolesLoading && (
                  <Spinner size="sm" className="h-3 w-3" />
                )}
              </div>

              {rolesLoading ? (
                <div className="space-y-1.5">
                  <Skeleton className="h-9 w-full" />
                  <Skeleton className="h-9 w-full" />
                </div>
              ) : userRoles.length === 0 ? (
                <p className="text-xs text-ink-faint py-2 text-center border border-dashed border-border rounded-lg">
                  No roles assigned to this user
                </p>
              ) : (
                <div className="space-y-1.5">
                  {userRoles.map((ur) => (
                    <div
                      key={ur.role_id}
                      className="flex items-center justify-between bg-surface-1 border border-border/60 rounded-lg px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium text-ink">{ur.role_name}</span>
                          {ur.role_slug === 'super_admin' && (
                            <Badge variant="danger" size="sm">Super Admin</Badge>
                          )}
                        </div>
                        {ur.assigned_by_email ? (
                          <p className="text-xs text-ink-faint">
                            Added by {ur.assigned_by_email} · {fmtDate(ur.assigned_at)}
                          </p>
                        ) : (
                          <p className="text-xs text-ink-faint">{fmtDate(ur.assigned_at)}</p>
                        )}
                        {ur.expires_at && (
                          <p className="text-xs text-amber-400">
                            Expires {fmtDate(ur.expires_at)}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        title={`Remove ${ur.role_name}`}
                        onClick={() => setConfirmRemove({ roleId: ur.role_id, roleName: ur.role_name })}
                        className="ml-2 p-1 rounded-md hover:bg-rose-500/10 text-ink-faint hover:text-rose-400 transition-colors shrink-0"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add role */}
            <div>
              <p className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-2">
                Add Role
              </p>
              {availableRoles.length === 0 ? (
                <p className="text-xs text-ink-faint py-1">
                  All available roles are already assigned.
                </p>
              ) : (
                <div className="flex gap-2 items-end">
                  <Select
                    options={availableRoles.map((r) => ({ value: r.id, label: r.name }))}
                    placeholder="Select role…"
                    value={selectedRoleId}
                    onChange={(e) => setSelectedRoleId(e.target.value)}
                    className="flex-1 text-sm"
                  />
                  <Button
                    size="sm"
                    disabled={!selectedRoleId}
                    loading={assignMutation.isPending}
                    onClick={() => assignMutation.mutate()}
                    className="shrink-0"
                  >
                    Assign
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Remove confirmation modal */}
      <Modal
        open={!!confirmRemove}
        onClose={() => setConfirmRemove(null)}
        title="Remove Role"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmRemove(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={removeMutation.isPending}
              onClick={() =>
                confirmRemove && removeMutation.mutate({ roleId: confirmRemove.roleId })
              }
            >
              Remove Role
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-ink-muted">
            Remove{' '}
            <span className="font-semibold text-ink">{confirmRemove?.roleName}</span> from{' '}
            <span className="font-semibold text-ink">{selectedUser?.email}</span>?
          </p>
          {confirmRemove &&
            userRoles.find((ur) => ur.role_id === confirmRemove.roleId) &&
            isSuperAdminRemoval(userRoles.find((ur) => ur.role_id === confirmRemove.roleId)!) && (
              <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2.5">
                <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-300">
                  This is the <strong>super_admin</strong> role. The system will reject removal
                  if this is the last super admin account.
                </p>
              </div>
            )}
        </div>
      </Modal>
    </div>
  )
}

// ─── Role Detail Drawer ───────────────────────────────────────────────────────

function RoleDetailDrawer({ role, onClose }: { role: AdminRole | null; onClose: () => void }) {
  if (!role) return null
  return (
    <Drawer open={!!role} onClose={onClose} title={role.name} subtitle={role.slug}>
      <div className="space-y-3 text-sm">
        <Row label="Name"        value={<span className="font-semibold">{role.name}</span>} />
        <Row label="Slug"        value={<span className="font-mono text-xs">{role.slug}</span>} />
        <Row
          label="Type"
          value={
            role.is_system
              ? <Badge variant="accent" size="sm">System</Badge>
              : <Badge variant="neutral" size="sm">Custom</Badge>
          }
        />
        <Row
          label="Status"
          value={
            role.is_active
              ? <Badge variant="success" size="sm" dot>Active</Badge>
              : <Badge variant="danger" size="sm" dot>Inactive</Badge>
          }
        />
        {role.description && (
          <Row label="Description" value={<span className="text-ink-muted">{role.description}</span>} />
        )}

        <div className="grid grid-cols-2 gap-3 pt-1">
          <div className="bg-surface-2 rounded-lg p-3 text-center">
            <p className="text-xl font-bold text-accent">{role.permission_count}</p>
            <p className="text-xs text-ink-faint mt-0.5">Permissions</p>
          </div>
          <div className="bg-surface-2 rounded-lg p-3 text-center">
            <p className="text-xl font-bold text-ink">{role.user_count}</p>
            <p className="text-xs text-ink-faint mt-0.5">Users</p>
          </div>
        </div>

        <Row label="Created" value={fmtDate(role.created_at)} />
        <Row label="Updated" value={fmtDate(role.updated_at)} />

        <p className="text-xs text-ink-faint pt-2">
          To manage user role assignments, use the &ldquo;User Role Management&rdquo; panel on the left.
        </p>
      </div>
    </Drawer>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = 'roles' | 'permissions'

export function RolesPage() {
  const [tab, setTab]           = useState<Tab>('roles')
  const [selected, setSelected] = useState<AdminRole | null>(null)

  const {
    data: roles = [],
    isLoading: rolesLoading,
    error: rolesError,
    refetch: refetchRoles,
  } = useQuery({ queryKey: ['roles'], queryFn: rolesApi.list })

  const {
    data: permGroups = [],
    isLoading: permsLoading,
    error: permsError,
    refetch: refetchPerms,
  } = useQuery({
    queryKey: ['permissions'],
    queryFn: rolesApi.permissions,
    enabled: tab === 'permissions',
  })

  const systemRoles      = roles.filter((r) => r.is_system).length
  const activeRoles      = roles.filter((r) => r.is_active).length
  const totalPermissions = permGroups.reduce((s, g) => s + g.permissions.length, 0)

  if (rolesError) {
    return (
      <ErrorMessage
        error={rolesError}
        onRetry={() => void refetchRoles()}
        endpoint={ENDPOINTS.roles.path}
      />
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Roles & Permissions"
        subtitle="Manage role-based access control and user assignments"
        actions={
          <Button
            variant="secondary"
            size="sm"
            icon={<RefreshCw className="h-3.5 w-3.5" />}
            onClick={() => { void refetchRoles(); void refetchPerms() }}
          >
            Refresh
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          title="Total Roles"
          value={roles.length}
          icon={<Shield className="h-4 w-4" />}
          loading={rolesLoading}
        />
        <StatCard
          title="System Roles"
          value={systemRoles}
          icon={<Key className="h-4 w-4" />}
          variant="accent"
          loading={rolesLoading}
        />
        <StatCard
          title="Active Roles"
          value={activeRoles}
          icon={<CheckCircle className="h-4 w-4" />}
          variant="success"
          loading={rolesLoading}
        />
        <StatCard
          title="Permissions"
          value={totalPermissions > 0 ? totalPermissions : '—'}
          subtitle={totalPermissions > 0 ? `across ${permGroups.length} resources` : 'load Permissions tab'}
          icon={<Users className="h-4 w-4" />}
          loading={tab === 'permissions' && permsLoading}
        />
      </div>

      {/* Split layout */}
      <div className="flex flex-col lg:flex-row gap-6 items-start">

        {/* ── Left: User Role Management ─────────────────────────────────── */}
        <Card className="w-full lg:w-80 shrink-0">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-1.5 bg-accent-subtle rounded-lg">
              <UserCheck className="h-4 w-4 text-accent" />
            </div>
            <h3 className="text-sm font-semibold text-ink">User Role Management</h3>
          </div>
          <UserRoleManager allRoles={roles} />
        </Card>

        {/* ── Right: Roles catalog + Permissions matrix ──────────────────── */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* Tab bar */}
          <div className="flex gap-1 border-b border-border">
            {(['roles', 'permissions'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
                  tab === t
                    ? 'border-accent text-accent'
                    : 'border-transparent text-ink-muted hover:text-ink'
                }`}
              >
                {t === 'roles' ? `Roles (${roles.length})` : 'Permissions'}
              </button>
            ))}
          </div>

          {/* Roles tab */}
          {tab === 'roles' && (
            <Card padding="none">
              {rolesLoading ? (
                <div className="p-5"><div className="space-y-3">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div></div>
              ) : roles.length === 0 ? (
                <EmptyState title="No roles found" />
              ) : (
                <DataTable
                  data={roles}
                  rowKey={(r) => r.id}
                  onRowClick={setSelected}
                  columns={[
                    {
                      key: 'name',
                      header: 'Role',
                      render: (r) => (
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-ink">{r.name}</span>
                            {r.is_system && <Badge variant="accent" size="sm">System</Badge>}
                          </div>
                          <p className="text-xs font-mono text-ink-faint">{r.slug}</p>
                        </div>
                      ),
                    },
                    {
                      key: 'description',
                      header: 'Description',
                      render: (r) => (
                        <span className="text-sm text-ink-muted">{r.description ?? '—'}</span>
                      ),
                    },
                    {
                      key: 'status',
                      header: 'Status',
                      render: (r) =>
                        r.is_active
                          ? <Badge variant="success" size="sm" dot>Active</Badge>
                          : <Badge variant="danger" size="sm" dot>Inactive</Badge>,
                    },
                    {
                      key: 'permissions',
                      header: 'Perms',
                      align: 'center',
                      render: (r) => (
                        <span className="text-sm font-semibold text-accent">{r.permission_count}</span>
                      ),
                    },
                    {
                      key: 'users',
                      header: 'Users',
                      align: 'center',
                      render: (r) => (
                        <span className="text-sm font-semibold text-ink">{r.user_count}</span>
                      ),
                    },
                    {
                      key: 'created',
                      header: 'Created',
                      render: (r) => (
                        <span className="text-xs text-ink-faint">{fmtDate(r.created_at)}</span>
                      ),
                    },
                  ]}
                />
              )}
            </Card>
          )}

          {/* Permissions tab */}
          {tab === 'permissions' && (
            <Card padding="none">
              {permsLoading ? (
                <div className="p-5">
                  <div className="space-y-3">
                    {Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
                  </div>
                </div>
              ) : permsError ? (
                <ErrorMessage
                  error={permsError}
                  onRetry={() => void refetchPerms()}
                  endpoint={ENDPOINTS.permissions.path}
                />
              ) : permGroups.length === 0 ? (
                <EmptyState
                  title="No permissions seeded"
                  description="Run migration 20260517000008_seed_permissions to populate this table."
                />
              ) : (
                <div className="p-1">
                  <PermissionsMatrix groups={permGroups} />
                </div>
              )}
            </Card>
          )}
        </div>
      </div>

      <RoleDetailDrawer role={selected} onClose={() => setSelected(null)} />
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-xs text-ink-faint w-32 shrink-0">{label}</span>
      <span className="text-sm text-ink text-right">{value}</span>
    </div>
  )
}
