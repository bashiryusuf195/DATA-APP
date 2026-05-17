import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import axios from 'axios'
import { catalogApi } from '@/api/catalog.api'
import { providersApi } from '@/api/providers.api'
import { PageHeader } from '@/components/shared/PageHeader'
import { FilterBar } from '@/components/shared/FilterBar'
import { DataTable } from '@/components/shared/DataTable'
import { ErrorMessage } from '@/components/shared/ErrorMessage'
import { Button, Badge, Modal, Input, Select, Card } from '@/components/ui'
import { SkeletonTable } from '@/components/ui/Skeleton'
import { fmtCurrency } from '@/utils/format'
import { ENDPOINTS } from '@/config/endpoints'
import type { ServicePlan, CatalogService, Provider, CreateServicePlanInput, UpdateServicePlanInput } from '@/types'
import { Plus, RefreshCw, Edit, ToggleLeft, ToggleRight, TrendingUp } from 'lucide-react'

function errMsg(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) return err.response?.data?.error ?? err.message ?? fallback
  if (err instanceof Error) return err.message
  return fallback
}

function calcMargin(cost: string | null, selling: string | null): string {
  const c = parseFloat(cost ?? '0')
  const s = parseFloat(selling ?? '0')
  if (!c || !s || c <= 0) return '—'
  const pct = ((s - c) / c) * 100
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`
}

function marginVariant(cost: string | null, selling: string | null): 'success' | 'danger' | 'neutral' {
  const c = parseFloat(cost ?? '0')
  const s = parseFloat(selling ?? '0')
  if (!c || !s) return 'neutral'
  return s >= c ? 'success' : 'danger'
}

// ── Plan form modal ───────────────────────────────────────────────────────────

interface PlanFormProps {
  open: boolean
  onClose: () => void
  services: CatalogService[]
  providers: Provider[]
  initial?: ServicePlan | null
  onSaved: () => void
}

interface PlanFormState extends CreateServicePlanInput {
  provider_metadata_raw: string
}

function buildFormState(initial?: ServicePlan | null): PlanFormState {
  if (initial) {
    return {
      service_id: initial.service_id,
      provider_code: initial.provider_code,
      name: initial.name,
      variation_code: initial.variation_code,
      amount: parseFloat(initial.amount) || 0,
      cost_price: initial.cost_price ? parseFloat(initial.cost_price) : null,
      selling_price: initial.selling_price ? parseFloat(initial.selling_price) : null,
      is_variable_amount: initial.is_variable_amount,
      metadata: initial.metadata,
      is_active: initial.is_active,
      primary_provider_code: initial.primary_provider_code ?? null,
      fallback_provider_code: initial.fallback_provider_code ?? null,
      provider_variation_code: initial.provider_variation_code ?? null,
      provider_metadata_raw: JSON.stringify(initial.provider_metadata ?? {}, null, 2),
    }
  }
  return {
    service_id: '',
    provider_code: '',
    name: '',
    variation_code: '',
    amount: 0,
    cost_price: null,
    selling_price: null,
    is_variable_amount: false,
    metadata: {},
    is_active: true,
    primary_provider_code: null,
    fallback_provider_code: null,
    provider_variation_code: null,
    provider_metadata_raw: '{}',
  }
}

function PlanFormModal({ open, onClose, services, providers, initial, onSaved }: PlanFormProps) {
  const isEdit = !!initial
  const [form, setForm] = useState<PlanFormState>(() => buildFormState(initial))
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({})

  useEffect(() => {
    if (open) {
      setForm(buildFormState(initial))
      setErrors({})
    }
  }, [open, initial])

  const serviceOptions = [
    { value: '', label: 'Select service…' },
    ...services.map((s) => ({ value: s.id, label: `${s.name} (${s.service_type})` })),
  ]

  const providerOptions = [
    { value: '', label: 'None (use routing rules)' },
    ...providers.map((p) => ({ value: p.provider_code, label: `${p.display_name} (${p.provider_code})` })),
  ]

  const margin = calcMargin(
    form.cost_price !== null ? String(form.cost_price) : null,
    form.selling_price !== null ? String(form.selling_price) : null,
  )

  const createMutation = useMutation({
    mutationFn: (body: CreateServicePlanInput) => catalogApi.createServicePlan(body),
    onSuccess: () => { toast.success('Plan created'); onSaved(); onClose() },
    onError: (err) => toast.error(errMsg(err, 'Failed to create plan')),
  })

  const updateMutation = useMutation({
    mutationFn: (body: UpdateServicePlanInput) => catalogApi.updateServicePlan(initial!.id, body),
    onSuccess: () => { toast.success('Plan updated'); onSaved(); onClose() },
    onError: (err) => toast.error(errMsg(err, 'Failed to update plan')),
  })

  function validate(): boolean {
    const e: typeof errors = {}
    if (!form.service_id) e.service_id = 'Service is required'
    if (!form.provider_code.trim()) e.provider_code = 'Provider code is required'
    if (!form.name.trim()) e.name = 'Plan name is required'
    if (!form.variation_code.trim()) e.variation_code = 'Variation code is required'
    if (form.amount < 0) e.amount = 'Amount must be ≥ 0'
    try { JSON.parse(form.provider_metadata_raw) } catch {
      e.provider_metadata_raw = 'Must be valid JSON'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function buildPayload(): CreateServicePlanInput {
    let provider_metadata: Record<string, unknown> = {}
    try { provider_metadata = JSON.parse(form.provider_metadata_raw) } catch { /* validated above */ }
    return {
      service_id: form.service_id,
      provider_code: form.provider_code,
      name: form.name,
      variation_code: form.variation_code,
      amount: form.amount,
      cost_price: form.cost_price,
      selling_price: form.selling_price,
      is_variable_amount: form.is_variable_amount,
      metadata: form.metadata,
      is_active: form.is_active,
      primary_provider_code: form.primary_provider_code || null,
      fallback_provider_code: form.fallback_provider_code || null,
      provider_variation_code: form.provider_variation_code || null,
      provider_metadata,
    }
  }

  function handleSubmit() {
    if (!validate()) return
    const payload = buildPayload()
    if (isEdit) updateMutation.mutate(payload)
    else createMutation.mutate(payload)
  }

  const pending = createMutation.isPending || updateMutation.isPending

  function numField(
    key: keyof Pick<PlanFormState, 'amount' | 'cost_price' | 'selling_price'>,
    label: string,
    hint?: string,
  ) {
    const raw = form[key]
    return (
      <Input
        label={label}
        type="number"
        min={0}
        step="0.01"
        value={raw === null || raw === undefined ? '' : String(raw)}
        onChange={(e) => {
          const v = e.target.value === '' ? null : parseFloat(e.target.value)
          setForm((f) => ({ ...f, [key]: v }))
        }}
        hint={hint}
        error={errors[key]}
      />
    )
  }

  function toggle(key: 'is_variable_amount' | 'is_active', label: string, hint?: string) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-border bg-surface-2 px-3 py-2">
        <div>
          <div className="text-sm text-ink">{label}</div>
          {hint && <div className="text-xs text-ink-faint">{hint}</div>}
        </div>
        <button
          type="button"
          onClick={() => setForm((f) => ({ ...f, [key]: !f[key] }))}
          className={`relative inline-flex h-5 w-9 rounded-full border-2 border-transparent transition-colors ${form[key] ? 'bg-accent' : 'bg-surface-3'}`}
          role="switch"
          aria-checked={form[key]}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${form[key] ? 'translate-x-4' : 'translate-x-0'}`} />
        </button>
      </div>
    )
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit Plan' : 'Create Service Plan'}
      subtitle={isEdit ? `Editing: ${initial?.name}` : 'Add a new plan to the service catalog'}
      size="xl"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={handleSubmit} disabled={pending}>
            {pending ? (isEdit ? 'Saving…' : 'Creating…') : (isEdit ? 'Save Changes' : 'Create Plan')}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-4 pb-2">
        {/* ── Column 1: Identity & Pricing ──────────────────────────────────── */}
        <div className="space-y-4">
          <p className="text-[11px] font-semibold text-ink-faint uppercase tracking-widest">Plan Details</p>

          <Select
            label="Service"
            value={form.service_id}
            onChange={(e) => setForm((f) => ({ ...f, service_id: e.target.value }))}
            options={serviceOptions}
            error={errors.service_id}
          />
          <Input
            label="Legacy Provider Code"
            value={form.provider_code}
            onChange={(e) => setForm((f) => ({ ...f, provider_code: e.target.value }))}
            placeholder="e.g. vtpass"
            hint="Backward-compatible identifier for existing integrations"
            error={errors.provider_code}
          />
          <Input
            label="Plan Name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="e.g. MTN 1GB 30 Days"
            error={errors.name}
          />
          <Input
            label="Variation Code"
            value={form.variation_code}
            onChange={(e) => setForm((f) => ({ ...f, variation_code: e.target.value }))}
            placeholder="e.g. mtn-1gb-30"
            error={errors.variation_code}
          />

          {numField('amount', 'Base Amount (₦)', 'Provider face value')}
          {numField('cost_price', 'Cost Price (₦)', 'What you pay the provider')}
          {numField('selling_price', 'Selling Price (₦)', 'What users pay')}

          <div className="flex items-center justify-between rounded-lg border border-border bg-surface-2 px-3 py-2">
            <div className="flex items-center gap-1.5 text-xs text-ink-muted">
              <TrendingUp className="h-3.5 w-3.5" />
              Margin
            </div>
            <span className={`text-sm font-semibold ${
              margin === '—' ? 'text-ink-faint'
              : margin.startsWith('+') ? 'text-emerald-400' : 'text-rose-400'
            }`}>{margin}</span>
          </div>
        </div>

        {/* ── Column 2: Provider Routing & Flags ────────────────────────────── */}
        <div className="space-y-4">
          <p className="text-[11px] font-semibold text-ink-faint uppercase tracking-widest">Provider Routing</p>
          <p className="text-xs text-ink-faint -mt-2">
            When set, these override the service-type routing rules for this plan.
          </p>

          <Select
            label="Primary Provider"
            value={form.primary_provider_code ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, primary_provider_code: e.target.value || null }))}
            options={providerOptions}
          />
          <Select
            label="Fallback Provider"
            value={form.fallback_provider_code ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, fallback_provider_code: e.target.value || null }))}
            options={providerOptions}
          />
          <Input
            label="Provider Variation Code"
            value={form.provider_variation_code ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, provider_variation_code: e.target.value || null }))}
            placeholder="Provider-specific variation identifier"
            hint="Leave blank to use the plan's variation_code"
          />

          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1.5">
              Provider Metadata <span className="text-ink-faint">(JSON, optional)</span>
            </label>
            <textarea
              value={form.provider_metadata_raw}
              onChange={(e) => setForm((f) => ({ ...f, provider_metadata_raw: e.target.value }))}
              rows={4}
              className={`w-full rounded-lg border bg-surface-2 text-ink text-sm font-mono px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-colors resize-y ${errors.provider_metadata_raw ? 'border-rose-500' : 'border-border'}`}
              spellCheck={false}
            />
            {errors.provider_metadata_raw && (
              <p className="mt-1 text-xs text-rose-400">{errors.provider_metadata_raw}</p>
            )}
          </div>

          <div className="pt-2 space-y-3 border-t border-border">
            <p className="text-[11px] font-semibold text-ink-faint uppercase tracking-widest">Flags</p>
            {toggle('is_variable_amount', 'Variable Amount', 'User supplies amount at purchase')}
            {toggle('is_active', 'Active')}
          </div>
        </div>
      </div>
    </Modal>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function ServicePlansPage() {
  const qc = useQueryClient()
  const [filterServiceId, setFilterServiceId] = useState('')
  const [filterProvider, setFilterProvider] = useState('')
  const [filterActive, setFilterActive] = useState('')
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [editItem, setEditItem] = useState<ServicePlan | null>(null)

  const { data: services = [] } = useQuery({
    queryKey: ['admin-services'],
    queryFn: () => catalogApi.listServices(),
  })

  const { data: providers = [] } = useQuery({
    queryKey: ['providers'],
    queryFn: providersApi.list,
  })

  const queryParams = {
    service_id: filterServiceId || undefined,
    provider_code: filterProvider || undefined,
    search: search.trim() || undefined,
    is_active: filterActive === '' ? undefined : filterActive === 'true',
  }

  const { data = [], isLoading, error, refetch } = useQuery({
    queryKey: ['admin-service-plans', queryParams],
    queryFn: () => catalogApi.listServicePlans(queryParams),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      catalogApi.updateServicePlan(id, { is_active }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-service-plans'] })
      toast.success('Plan status updated')
    },
    onError: (err) => toast.error(errMsg(err, 'Failed to update status')),
  })

  const handleSaved = () => {
    qc.invalidateQueries({ queryKey: ['admin-service-plans'] })
  }

  const serviceOptions = [
    { value: '', label: 'All services' },
    ...services.map((s) => ({ value: s.id, label: s.name })),
  ]

  const providerCodes = useMemo(() => {
    const codes = new Set(data.map((p) => p.provider_code))
    return [
      { value: '', label: 'All providers' },
      ...Array.from(codes).sort().map((c) => ({ value: c, label: c })),
    ]
  }, [data])

  if (error) {
    return <ErrorMessage error={error} onRetry={() => void refetch()} endpoint={ENDPOINTS.adminServicePlans.path} />
  }

  const hasFilters = !!(filterServiceId || filterProvider || filterActive || search)

  const columns = [
    {
      key: 'name',
      header: 'Plan',
      render: (p: ServicePlan) => (
        <div>
          <div className="font-medium text-ink">{p.name}</div>
          <div className="text-xs text-ink-faint font-mono">{p.variation_code}</div>
        </div>
      ),
    },
    {
      key: 'service',
      header: 'Service',
      render: (p: ServicePlan) => (
        <div>
          <div className="text-sm text-ink">{p.service_name}</div>
          <div className="text-xs text-ink-faint">{p.service_type.replace('_', ' ')}</div>
        </div>
      ),
    },
    {
      key: 'provider',
      header: 'Provider',
      render: (p: ServicePlan) => (
        <div className="space-y-0.5">
          <Badge variant="neutral" className="font-mono text-xs">{p.provider_code}</Badge>
          {p.primary_provider_code && (
            <div className="text-[10px] text-ink-faint">
              Route → <span className="font-mono text-accent">{p.primary_provider_code}</span>
              {p.fallback_provider_code && <span> / {p.fallback_provider_code}</span>}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'pricing',
      header: 'Amount / Cost / Selling',
      render: (p: ServicePlan) => (
        <div className="text-xs space-y-0.5">
          <div className="text-ink-muted">{fmtCurrency(p.amount)}</div>
          <div className="flex gap-2">
            <span className="text-ink-faint">Cost: {p.cost_price ? fmtCurrency(p.cost_price) : '—'}</span>
            <span className="text-ink-faint">Sell: {p.selling_price ? fmtCurrency(p.selling_price) : '—'}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'margin',
      header: 'Margin',
      align: 'right' as const,
      render: (p: ServicePlan) => {
        const m = calcMargin(p.cost_price, p.selling_price)
        return (
          <Badge variant={marginVariant(p.cost_price, p.selling_price)}>
            {m}
          </Badge>
        )
      },
    },
    {
      key: 'status',
      header: 'Status',
      render: (p: ServicePlan) => (
        <Badge variant={p.is_active ? 'success' : 'neutral'} dot>
          {p.is_active ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right' as const,
      render: (p: ServicePlan) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="xs"
            icon={<Edit className="h-3.5 w-3.5" />}
            onClick={(e) => { e.stopPropagation(); setEditItem(p) }}
            title="Edit"
          />
          <Button
            variant="ghost"
            size="xs"
            icon={p.is_active
              ? <ToggleRight className="h-3.5 w-3.5 text-emerald-400" />
              : <ToggleLeft className="h-3.5 w-3.5 text-ink-faint" />}
            onClick={(e) => { e.stopPropagation(); toggleMutation.mutate({ id: p.id, is_active: !p.is_active }) }}
            title={p.is_active ? 'Disable' : 'Enable'}
            disabled={toggleMutation.isPending}
          />
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Service Plans"
        subtitle="Data plans, cable bouquets, electricity token types and more"
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />}
              onClick={() => void refetch()}>Refresh</Button>
            <Button variant="primary" size="sm" icon={<Plus className="h-3.5 w-3.5" />}
              onClick={() => setCreateOpen(true)}>New Plan</Button>
          </div>
        }
      />

      <FilterBar>
        <div className="flex-1 min-w-[200px] max-w-sm">
          <Input
            placeholder="Search name or variation code…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          value={filterServiceId}
          onChange={(e) => setFilterServiceId(e.target.value)}
          options={serviceOptions}
          className="w-48"
        />
        <Select
          value={filterProvider}
          onChange={(e) => setFilterProvider(e.target.value)}
          options={providerCodes}
          className="w-40"
        />
        <Select
          value={filterActive}
          onChange={(e) => setFilterActive(e.target.value)}
          options={[
            { value: '', label: 'All statuses' },
            { value: 'true', label: 'Active only' },
            { value: 'false', label: 'Inactive only' },
          ]}
          className="w-36"
        />
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={() => {
            setSearch(''); setFilterServiceId(''); setFilterProvider(''); setFilterActive('')
          }}>
            Clear
          </Button>
        )}
      </FilterBar>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Plans', value: data.length },
          { label: 'Active', value: data.filter((p) => p.is_active).length },
          { label: 'With Pricing', value: data.filter((p) => p.cost_price && p.selling_price).length },
          { label: 'Plan Routing', value: data.filter((p) => p.primary_provider_code).length },
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
          <DataTable
            columns={columns}
            data={data}
            rowKey={(p) => p.id}
            emptyMessage={hasFilters ? 'No plans match the current filters.' : 'No plans found.'}
          />
        )}
      </Card>

      <PlanFormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        services={services}
        providers={providers}
        onSaved={handleSaved}
      />
      <PlanFormModal
        open={!!editItem}
        onClose={() => setEditItem(null)}
        services={services}
        providers={providers}
        initial={editItem}
        onSaved={handleSaved}
      />
    </div>
  )
}
