import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import axios from 'axios'
import { catalogApi } from '@/api/catalog.api'
import { PageHeader } from '@/components/shared/PageHeader'
import { FilterBar } from '@/components/shared/FilterBar'
import { DataTable } from '@/components/shared/DataTable'
import { ErrorMessage } from '@/components/shared/ErrorMessage'
import { Button, Badge, Modal, Input, Select, Card } from '@/components/ui'
import { SkeletonTable } from '@/components/ui/Skeleton'
import { fmtDate } from '@/utils/format'
import { ENDPOINTS } from '@/config/endpoints'
import type { CatalogService, CreateServiceInput, UpdateServiceInput, ServiceType } from '@/types'
import { Plus, RefreshCw, Edit, ToggleLeft, ToggleRight } from 'lucide-react'

const SERVICE_TYPE_OPTIONS = [
  { value: '', label: 'All types' },
  { value: 'airtime', label: 'Airtime' },
  { value: 'data', label: 'Data' },
  { value: 'electricity', label: 'Electricity' },
  { value: 'cable_tv', label: 'Cable TV' },
  { value: 'exam_pin', label: 'Exam PIN' },
  { value: 'identity_verification', label: 'Identity Verification' },
]

const SERVICE_TYPE_CREATE_OPTIONS = SERVICE_TYPE_OPTIONS.slice(1).map((o) => ({
  value: o.value,
  label: o.label,
}))

function errMsg(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) return err.response?.data?.error ?? err.message ?? fallback
  if (err instanceof Error) return err.message
  return fallback
}

function serviceTypeBadge(t: string) {
  const map: Record<string, 'info' | 'success' | 'warning' | 'neutral'> = {
    airtime: 'info',
    data: 'success',
    electricity: 'warning',
    cable_tv: 'neutral',
    exam_pin: 'neutral',
    identity_verification: 'neutral',
  }
  return <Badge variant={map[t] ?? 'neutral'}>{t.replace('_', ' ')}</Badge>
}

// ── Service form modal ────────────────────────────────────────────────────────

interface ServiceFormProps {
  open: boolean
  onClose: () => void
  initial?: CatalogService | null
  onSaved: () => void
}

const EMPTY_FORM: CreateServiceInput = {
  slug: '',
  name: '',
  service_type: 'airtime',
  is_active: true,
}

function ServiceFormModal({ open, onClose, initial, onSaved }: ServiceFormProps) {
  const isEdit = !!initial
  const [form, setForm] = useState<CreateServiceInput>(() =>
    initial
      ? { slug: initial.slug, name: initial.name, service_type: initial.service_type, is_active: initial.is_active }
      : { ...EMPTY_FORM }
  )
  const [errors, setErrors] = useState<Partial<Record<keyof CreateServiceInput, string>>>({})

  useEffect(() => {
    if (open) {
      setForm(initial
        ? { slug: initial.slug, name: initial.name, service_type: initial.service_type, is_active: initial.is_active }
        : { ...EMPTY_FORM }
      )
      setErrors({})
    }
  }, [open, initial])

  const createMutation = useMutation({
    mutationFn: (body: CreateServiceInput) => catalogApi.createService(body),
    onSuccess: () => { toast.success('Service created'); onSaved(); onClose() },
    onError: (err) => toast.error(errMsg(err, 'Failed to create service')),
  })

  const updateMutation = useMutation({
    mutationFn: (body: UpdateServiceInput) => catalogApi.updateService(initial!.id, body),
    onSuccess: () => { toast.success('Service updated'); onSaved(); onClose() },
    onError: (err) => toast.error(errMsg(err, 'Failed to update service')),
  })

  function validate(): boolean {
    const e: typeof errors = {}
    if (!form.name.trim()) e.name = 'Name is required'
    if (!form.slug.trim()) e.slug = 'Slug is required'
    else if (!/^[a-z0-9-]+$/.test(form.slug)) e.slug = 'Lowercase letters, numbers, hyphens only'
    if (!form.service_type) e.service_type = 'Service type is required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function handleSubmit() {
    if (!validate()) return
    if (isEdit) {
      updateMutation.mutate({ name: form.name, slug: form.slug, service_type: form.service_type, is_active: form.is_active })
    } else {
      createMutation.mutate(form)
    }
  }

  const pending = createMutation.isPending || updateMutation.isPending

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit Service' : 'Create Service'}
      subtitle={isEdit ? `Editing ${initial?.name}` : 'Add a new VTU service to the catalog'}
      size="md"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={handleSubmit} disabled={pending}>
            {pending ? (isEdit ? 'Saving…' : 'Creating…') : (isEdit ? 'Save Changes' : 'Create Service')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          label="Service Name"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="e.g. MTN Airtime"
          error={errors.name}
        />
        <Input
          label="Slug"
          value={form.slug}
          onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }))}
          placeholder="e.g. mtn-airtime"
          hint="URL-safe identifier: lowercase letters, numbers, hyphens"
          error={errors.slug}
        />
        <Select
          label="Service Type"
          value={form.service_type}
          onChange={(e) => setForm((f) => ({ ...f, service_type: e.target.value as ServiceType }))}
          options={SERVICE_TYPE_CREATE_OPTIONS}
          error={errors.service_type}
        />
        <div className="flex items-center justify-between rounded-lg border border-border bg-surface-2 px-3 py-2">
          <span className="text-sm text-ink">Active</span>
          <button
            type="button"
            onClick={() => setForm((f) => ({ ...f, is_active: !f.is_active }))}
            className={`relative inline-flex h-5 w-9 rounded-full border-2 border-transparent transition-colors ${form.is_active ? 'bg-accent' : 'bg-surface-3'}`}
            role="switch"
            aria-checked={form.is_active}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${form.is_active ? 'translate-x-4' : 'translate-x-0'}`} />
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function ServicesPage() {
  const qc = useQueryClient()
  const [filterType, setFilterType] = useState('')
  const [filterActive, setFilterActive] = useState('')
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [editItem, setEditItem] = useState<CatalogService | null>(null)

  const queryParams = {
    service_type: filterType || undefined,
    is_active: filterActive === '' ? undefined : filterActive === 'true',
  }

  const { data = [], isLoading, error, refetch } = useQuery({
    queryKey: ['admin-services', queryParams],
    queryFn: () => catalogApi.listServices(queryParams),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      catalogApi.updateService(id, { is_active }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-services'] })
      toast.success('Service status updated')
    },
    onError: (err) => toast.error(errMsg(err, 'Failed to update status')),
  })

  const filtered = useMemo(() => {
    if (!search.trim()) return data
    const term = search.toLowerCase()
    return data.filter(
      (s) => s.name.toLowerCase().includes(term) || s.slug.toLowerCase().includes(term)
    )
  }, [data, search])

  const handleSaved = () => qc.invalidateQueries({ queryKey: ['admin-services'] })

  if (error) {
    return <ErrorMessage error={error} onRetry={() => void refetch()} endpoint={ENDPOINTS.adminServices.path} />
  }

  const columns = [
    {
      key: 'name',
      header: 'Service',
      render: (s: CatalogService) => (
        <div>
          <div className="font-medium text-ink">{s.name}</div>
          <div className="text-xs text-ink-faint font-mono">{s.slug}</div>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (s: CatalogService) => serviceTypeBadge(s.service_type),
    },
    {
      key: 'status',
      header: 'Status',
      render: (s: CatalogService) => (
        <Badge variant={s.is_active ? 'success' : 'neutral'} dot>
          {s.is_active ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      key: 'updated',
      header: 'Updated',
      render: (s: CatalogService) => (
        <span className="text-xs text-ink-faint">{fmtDate(s.updated_at)}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right' as const,
      render: (s: CatalogService) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="xs"
            icon={<Edit className="h-3.5 w-3.5" />}
            onClick={(e) => { e.stopPropagation(); setEditItem(s) }}
            title="Edit"
          />
          <Button
            variant="ghost"
            size="xs"
            icon={s.is_active
              ? <ToggleRight className="h-3.5 w-3.5 text-emerald-400" />
              : <ToggleLeft className="h-3.5 w-3.5 text-ink-faint" />}
            onClick={(e) => { e.stopPropagation(); toggleMutation.mutate({ id: s.id, is_active: !s.is_active }) }}
            title={s.is_active ? 'Disable' : 'Enable'}
            disabled={toggleMutation.isPending}
          />
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Services Catalog"
        subtitle="Manage VTU services offered on the platform"
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />}
              onClick={() => void refetch()}>Refresh</Button>
            <Button variant="primary" size="sm" icon={<Plus className="h-3.5 w-3.5" />}
              onClick={() => setCreateOpen(true)}>New Service</Button>
          </div>
        }
      />

      <FilterBar>
        <div className="flex-1 min-w-[180px] max-w-xs">
          <Input
            placeholder="Search by name or slug…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          options={SERVICE_TYPE_OPTIONS}
          className="w-44"
        />
        <Select
          value={filterActive}
          onChange={(e) => setFilterActive(e.target.value)}
          options={[
            { value: '', label: 'All statuses' },
            { value: 'true', label: 'Active only' },
            { value: 'false', label: 'Inactive only' },
          ]}
          className="w-40"
        />
        {(search || filterType || filterActive) && (
          <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setFilterType(''); setFilterActive('') }}>
            Clear
          </Button>
        )}
      </FilterBar>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total', value: data.length },
          { label: 'Active', value: data.filter((s) => s.is_active).length },
          { label: 'Inactive', value: data.filter((s) => !s.is_active).length },
          { label: 'Shown', value: filtered.length },
        ].map(({ label, value }) => (
          <Card key={label} className="p-3 flex flex-col gap-0.5">
            <span className="text-[11px] text-ink-faint uppercase tracking-wide">{label}</span>
            <span className="text-xl font-semibold text-ink">{value}</span>
          </Card>
        ))}
      </div>

      <Card>
        {isLoading ? (
          <SkeletonTable rows={6} />
        ) : (
          <DataTable
            columns={columns}
            data={filtered}
            rowKey={(s) => s.id}
            emptyMessage={search || filterType || filterActive
              ? 'No services match the current filters.'
              : 'No services in the catalog yet.'}
          />
        )}
      </Card>

      <ServiceFormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={handleSaved}
      />
      <ServiceFormModal
        open={!!editItem}
        onClose={() => setEditItem(null)}
        initial={editItem}
        onSaved={handleSaved}
      />
    </div>
  )
}
