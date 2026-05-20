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
import { Pagination } from '@/components/shared/Pagination'
import { Button, Badge, Modal, Input, Select, Card } from '@/components/ui'
import { SkeletonTable } from '@/components/ui/Skeleton'
import { fmtCurrency } from '@/utils/format'
import { ENDPOINTS } from '@/config/endpoints'
import type { ServicePlan, CatalogService, Provider, CreateServicePlanInput, UpdateServicePlanInput } from '@/types'
import { Plus, RefreshCw, Edit, ToggleLeft, ToggleRight, TrendingUp, ToggleRight as BulkIcon } from 'lucide-react'

const PAGE_SIZE = 50

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
  duration_days_str: string
}

const OPERATOR_OPTIONS = [
  { value: '', label: 'None' },
  // Telecom
  { value: 'mtn', label: 'MTN' },
  { value: 'airtel', label: 'Airtel' },
  { value: 'glo', label: 'Glo' },
  { value: '9mobile', label: '9mobile' },
  // Cable TV
  { value: 'dstv', label: 'DStv' },
  { value: 'gotv', label: 'GOtv' },
  { value: 'startimes', label: 'StarTimes' },
  // Electricity DISCOs
  { value: 'ekedc', label: 'EKEDC' },
  { value: 'ikedc', label: 'IKEDC' },
  { value: 'aedc', label: 'AEDC' },
  { value: 'phed', label: 'PHED' },
  { value: 'kedco', label: 'KEDCO' },
  // Exams
  { value: 'waec', label: 'WAEC' },
  { value: 'neco', label: 'NECO' },
  { value: 'jamb', label: 'JAMB' },
  // Identity
  { value: 'nin', label: 'NIN' },
  { value: 'bvn', label: 'BVN' },
]

const CATEGORY_OPTIONS = [
  { value: '', label: 'None' },
  { value: 'sme', label: 'SME' },
  { value: 'corporate', label: 'Corporate' },
  { value: 'gifting', label: 'Gifting' },
  { value: 'direct', label: 'Direct' },
  { value: 'dnd', label: 'DND' },
  { value: 'social', label: 'Social' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'annual', label: 'Annual' },
]

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
      network_operator: initial.network_operator ?? null,
      plan_category: initial.plan_category ?? null,
      duration_days: initial.duration_days ?? null,
      duration_days_str: initial.duration_days != null ? String(initial.duration_days) : '',
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
    network_operator: null,
    plan_category: null,
    duration_days: null,
    duration_days_str: '',
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

  const selectedService = services.find((s) => s.id === form.service_id)
  const selectedServiceType = selectedService?.service_type ?? ''
  const operatorFieldLabel = ['data', 'airtime'].includes(selectedServiceType)
    ? 'Network'
    : 'Operator / Biller'

  const providerOptions = [
    { value: '', label: 'None (use routing rules)' },
    ...providers.map((p) => ({ value: p.provider_code, label: `${p.name} (${p.provider_code})` })),
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
    if (form.duration_days_str && isNaN(parseInt(form.duration_days_str, 10)))
      e.duration_days_str = 'Must be a positive integer'
    try { JSON.parse(form.provider_metadata_raw) } catch {
      e.provider_metadata_raw = 'Must be valid JSON'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function buildPayload(): CreateServicePlanInput {
    let provider_metadata: Record<string, unknown> = {}
    try { provider_metadata = JSON.parse(form.provider_metadata_raw) } catch { /* validated above */ }
    const duration_days = form.duration_days_str
      ? parseInt(form.duration_days_str, 10)
      : null
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
      network_operator: form.network_operator || null,
      plan_category: form.plan_category || null,
      duration_days,
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

          <div className="grid grid-cols-2 gap-3">
            <Select
              label={operatorFieldLabel}
              value={form.network_operator ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, network_operator: e.target.value || null }))}
              options={OPERATOR_OPTIONS}
            />
            <Select
              label="Category"
              value={form.plan_category ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, plan_category: e.target.value || null }))}
              options={CATEGORY_OPTIONS}
            />
          </div>

          <Input
            label="Duration (days)"
            type="number"
            min={1}
            step={1}
            value={form.duration_days_str}
            onChange={(e) => setForm((f) => ({ ...f, duration_days_str: e.target.value }))}
            placeholder="Leave blank for unlimited"
            hint="Optional — leave blank for variable/unlimited"
            error={errors.duration_days_str}
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
            label="Provider Plan ID / Variation Code"
            value={form.provider_variation_code ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, provider_variation_code: e.target.value || null }))}
            placeholder="e.g. 7 (SMShika data) or leave blank"
            hint={
              selectedServiceType === 'data'
                ? 'SMShika data: enter the numeric plan ID from your SMShika plan list (e.g. 1, 7, 42). Required — purchase will fail without it.'
                : "Provider-specific plan identifier. Leave blank to use the plan's variation_code."
            }
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

// ── Bulk toggle confirmation modal ────────────────────────────────────────────

interface BulkToggleModalProps {
  open: boolean
  onClose: () => void
  selectedIds: string[]
  targetActive: boolean
  onConfirm: () => void
  isPending: boolean
}

function BulkToggleModal({ open, onClose, selectedIds, targetActive, onConfirm, isPending }: BulkToggleModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Bulk ${targetActive ? 'Enable' : 'Disable'} Plans`}
      subtitle={`${selectedIds.length} plan${selectedIds.length !== 1 ? 's' : ''} selected`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button
            variant={targetActive ? 'primary' : 'danger'}
            size="sm"
            onClick={onConfirm}
            disabled={isPending}
          >
            {isPending ? 'Applying…' : `${targetActive ? 'Enable' : 'Disable'} ${selectedIds.length} Plan${selectedIds.length !== 1 ? 's' : ''}`}
          </Button>
        </>
      }
    >
      <p className="text-sm text-ink-muted">
        This will {targetActive ? 'activate' : 'deactivate'} {selectedIds.length} selected plan{selectedIds.length !== 1 ? 's' : ''}.
        The change takes effect immediately.
      </p>
    </Modal>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function ServicePlansPage() {
  const qc = useQueryClient()
  const [filterServiceId, setFilterServiceId] = useState('')
  const [filterServiceType, setFilterServiceType] = useState('')
  const [filterOperator, setFilterOperator] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterProvider, setFilterProvider] = useState('')
  const [filterActive, setFilterActive] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [createOpen, setCreateOpen] = useState(false)
  const [editItem, setEditItem] = useState<ServicePlan | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkTarget, setBulkTarget] = useState<boolean | null>(null)

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
    service_type: filterServiceType || undefined,
    network_operator: filterOperator || undefined,
    plan_category: filterCategory || undefined,
    provider_code: filterProvider || undefined,
    search: search.trim() || undefined,
    is_active: filterActive === '' ? undefined : filterActive === 'true',
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  }

  const { data: result, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-service-plans', queryParams],
    queryFn: () => catalogApi.listServicePlans(queryParams),
  })

  const plans = result?.plans ?? []
  const total = result?.meta.total ?? 0

  function resetPage() { setPage(1); setSelectedIds(new Set()) }

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      catalogApi.updateServicePlan(id, { is_active }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-service-plans'] })
      toast.success('Plan status updated')
    },
    onError: (err) => toast.error(errMsg(err, 'Failed to update status')),
  })

  const bulkMutation = useMutation({
    mutationFn: ({ ids, is_active }: { ids: string[]; is_active: boolean }) =>
      Promise.all(ids.map((id) => catalogApi.updateServicePlan(id, { is_active }))),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['admin-service-plans'] })
      setSelectedIds(new Set())
      setBulkTarget(null)
      toast.success(`${vars.ids.length} plan${vars.ids.length !== 1 ? 's' : ''} ${vars.is_active ? 'enabled' : 'disabled'}`)
    },
    onError: (err) => toast.error(errMsg(err, 'Bulk update failed')),
  })

  const handleSaved = () => {
    qc.invalidateQueries({ queryKey: ['admin-service-plans'] })
    setSelectedIds(new Set())
  }

  const serviceOptions = [
    { value: '', label: 'All services' },
    ...services.map((s) => ({ value: s.id, label: s.name })),
  ]

  const serviceTypeOptions = [
    { value: '', label: 'All types' },
    { value: 'airtime', label: 'Airtime' },
    { value: 'data', label: 'Data' },
    { value: 'electricity', label: 'Electricity' },
    { value: 'cable_tv', label: 'Cable TV' },
    { value: 'exam_pin', label: 'Exam PIN' },
    { value: 'identity_verification', label: 'Identity' },
  ]

  const operatorOptions = [
    { value: '', label: 'All operators' },
    ...OPERATOR_OPTIONS.filter((o) => o.value),
  ]

  const categoryOptions = [
    { value: '', label: 'All categories' },
    ...CATEGORY_OPTIONS.filter((o) => o.value),
  ]

  const providerCodes = useMemo(() => {
    const codes = new Set(plans.map((p) => p.provider_code))
    return [
      { value: '', label: 'All providers' },
      ...Array.from(codes).sort().map((c) => ({ value: c, label: c })),
    ]
  }, [plans])

  const allPageSelected = plans.length > 0 && plans.every((p) => selectedIds.has(p.id))

  function toggleSelectAll() {
    if (allPageSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        plans.forEach((p) => next.delete(p.id))
        return next
      })
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        plans.forEach((p) => next.add(p.id))
        return next
      })
    }
  }

  function toggleSelectOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (error) {
    return <ErrorMessage error={error} onRetry={() => void refetch()} endpoint={ENDPOINTS.adminServicePlans.path} />
  }

  const hasFilters = !!(filterServiceId || filterServiceType || filterOperator || filterCategory || filterProvider || filterActive || search)

  const columns = [
    {
      key: 'select',
      header: '',
      render: (p: ServicePlan) => (
        <input
          type="checkbox"
          checked={selectedIds.has(p.id)}
          onChange={() => toggleSelectOne(p.id)}
          onClick={(e) => e.stopPropagation()}
          className="h-3.5 w-3.5 accent-accent cursor-pointer"
          aria-label={`Select ${p.name}`}
        />
      ),
    },
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
      key: 'operator',
      header: 'Operator / Cat',
      render: (p: ServicePlan) => (
        <div className="space-y-0.5">
          {p.network_operator
            ? <Badge variant="neutral" className="uppercase text-[10px]">{p.network_operator}</Badge>
            : <span className="text-xs text-ink-faint">—</span>}
          {p.plan_category && (
            <div className="text-[10px] text-ink-faint capitalize">{p.plan_category}</div>
          )}
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

  const selCount = selectedIds.size

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
        <div className="flex-1 min-w-[180px] max-w-xs">
          <Input
            placeholder="Search name or variation code…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); resetPage() }}
          />
        </div>
        <Select
          value={filterServiceType}
          onChange={(e) => { setFilterServiceType(e.target.value); resetPage() }}
          options={serviceTypeOptions}
          className="w-36"
        />
        <Select
          value={filterServiceId}
          onChange={(e) => { setFilterServiceId(e.target.value); resetPage() }}
          options={serviceOptions}
          className="w-44"
        />
        <Select
          value={filterOperator}
          onChange={(e) => { setFilterOperator(e.target.value); resetPage() }}
          options={operatorOptions}
          className="w-36"
        />
        <Select
          value={filterCategory}
          onChange={(e) => { setFilterCategory(e.target.value); resetPage() }}
          options={categoryOptions}
          className="w-36"
        />
        <Select
          value={filterProvider}
          onChange={(e) => { setFilterProvider(e.target.value); resetPage() }}
          options={providerCodes}
          className="w-36"
        />
        <Select
          value={filterActive}
          onChange={(e) => { setFilterActive(e.target.value); resetPage() }}
          options={[
            { value: '', label: 'All statuses' },
            { value: 'true', label: 'Active only' },
            { value: 'false', label: 'Inactive only' },
          ]}
          className="w-32"
        />
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={() => {
            setSearch(''); setFilterServiceId(''); setFilterServiceType('')
            setFilterOperator(''); setFilterCategory(''); setFilterProvider('')
            setFilterActive(''); resetPage()
          }}>
            Clear
          </Button>
        )}
      </FilterBar>

      {/* Bulk actions bar */}
      <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-2 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={allPageSelected}
            onChange={toggleSelectAll}
            className="h-3.5 w-3.5 accent-accent cursor-pointer"
            aria-label="Select all on this page"
          />
          <span className="text-xs text-ink-muted">
            {selCount > 0 ? `${selCount} selected` : 'Select page'}
          </span>
        </div>
        {selCount > 0 && (
          <div className="flex gap-2 ml-auto">
            <Button
              variant="secondary"
              size="sm"
              icon={<BulkIcon className="h-3.5 w-3.5 text-emerald-400" />}
              onClick={() => setBulkTarget(true)}
              disabled={bulkMutation.isPending}
            >
              Enable
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<ToggleLeft className="h-3.5 w-3.5 text-ink-faint" />}
              onClick={() => setBulkTarget(false)}
              disabled={bulkMutation.isPending}
            >
              Disable
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedIds(new Set())}
            >
              Clear
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Plans', value: total },
          { label: 'This Page', value: plans.length },
          { label: 'With Pricing', value: plans.filter((p) => p.cost_price && p.selling_price).length },
          { label: 'Plan Routing', value: plans.filter((p) => p.primary_provider_code).length },
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
            data={plans}
            rowKey={(p) => p.id}
            emptyMessage={hasFilters ? 'No plans match the current filters.' : 'No plans found.'}
          />
        )}
      </Card>

      {total > PAGE_SIZE && (
        <Pagination
          page={page}
          limit={PAGE_SIZE}
          total={total}
          onPage={(p) => { setPage(p); setSelectedIds(new Set()) }}
        />
      )}

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
      <BulkToggleModal
        open={bulkTarget !== null}
        onClose={() => setBulkTarget(null)}
        selectedIds={Array.from(selectedIds)}
        targetActive={bulkTarget ?? true}
        onConfirm={() => bulkMutation.mutate({ ids: Array.from(selectedIds), is_active: bulkTarget ?? true })}
        isPending={bulkMutation.isPending}
      />
    </div>
  )
}
