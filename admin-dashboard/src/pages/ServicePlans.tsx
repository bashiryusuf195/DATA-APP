import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import axios from 'axios'
import { catalogApi } from '@/api/catalog.api'
import { providersApi } from '@/api/providers.api'
import { routingApi } from '@/api/routing.api'
import { PageHeader } from '@/components/shared/PageHeader'
import { FilterBar } from '@/components/shared/FilterBar'
import { DataTable } from '@/components/shared/DataTable'
import { ErrorMessage } from '@/components/shared/ErrorMessage'
import { Pagination } from '@/components/shared/Pagination'
import { Button, Badge, Modal, Input, Select, Card } from '@/components/ui'
import { SkeletonTable } from '@/components/ui/Skeleton'
import { fmtCurrency } from '@/utils/format'
import { ENDPOINTS } from '@/config/endpoints'
import type { ServicePlan, CatalogService, Provider, CreateServicePlanInput, UpdateServicePlanInput, RoutingRule, ProviderPlanMapping, CreatePlanMappingInput } from '@/types'
import { Plus, RefreshCw, Edit, ToggleLeft, ToggleRight, TrendingUp, ToggleRight as BulkIcon, AlertTriangle, UserCheck, XCircle, Download, Loader2, Trash2, ListOrdered, ArrowUp, ArrowDown } from 'lucide-react'

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
  plan_sort_order_str: string
}

// ── Service-type field configuration ─────────────────────────────────────────

interface ServiceTypeConfig {
  operatorLabel: string
  operatorOptions: { value: string; label: string }[]
  categoryLabel: string
  categoryOptions: { value: string; label: string }[]
  variableAmountDefault: boolean
  providerCodeLabel: string
  providerCodeHint: string
  variationCodePlaceholder?: string
  variationCodeHint?: string
  providerCodePlaceholder?: string
}

const SERVICE_TYPE_CONFIGS: Record<string, ServiceTypeConfig> = {
  data: {
    operatorLabel: 'Network',
    operatorOptions: [
      { value: 'mtn',     label: 'MTN'     },
      { value: 'airtel',  label: 'Airtel'  },
      { value: 'glo',     label: 'Glo'     },
      { value: '9mobile', label: '9mobile' },
    ],
    categoryLabel: 'Category',
    categoryOptions: [
      { value: 'sme',       label: 'SME'       },
      { value: 'corporate', label: 'Corporate' },
      { value: 'gifting',   label: 'Gifting'   },
      { value: 'direct',    label: 'Direct'    },
      { value: 'dnd',       label: 'DND'       },
      { value: 'social',    label: 'Social'    },
      { value: 'daily',     label: 'Daily'     },
      { value: 'weekly',    label: 'Weekly'    },
      { value: 'monthly',   label: 'Monthly'   },
    ],
    variableAmountDefault: false,
    providerCodeLabel: 'Provider Plan ID',
    providerCodeHint: 'SMShika data: enter the numeric plan ID from your SMShika plan list (e.g. 1, 7, 42). Required — purchase will fail without it.',
  },
  airtime: {
    operatorLabel: 'Network',
    operatorOptions: [
      { value: 'mtn',     label: 'MTN'     },
      { value: 'airtel',  label: 'Airtel'  },
      { value: 'glo',     label: 'Glo'     },
      { value: '9mobile', label: '9mobile' },
    ],
    categoryLabel: 'Airtime Type',
    categoryOptions: [
      { value: 'vtu',            label: 'VTU'            },
      { value: 'share-and-sell', label: 'Share & Sell'   },
      { value: 'recharge-card',  label: 'Recharge Card'  },
    ],
    variableAmountDefault: true,
    providerCodeLabel: 'Provider Plan ID / Variation Code',
    providerCodeHint: 'Provider-specific plan identifier. Usually not needed for airtime VTU.',
  },
  electricity: {
    operatorLabel: 'DISCO',
    operatorOptions: [
      { value: 'ekedc',  label: 'EKEDC — Eko Electric (01)'    },
      { value: 'ikedc',  label: 'IKEDC — Ikeja Electric (02)'  },
      { value: 'aedc',   label: 'AEDC — Abuja Electric (03)'   },
      { value: 'kedc',   label: 'KEDC — Kano Electric (04)'    },
      { value: 'phedc',  label: 'PHEDC — Port Harcourt (05)'   },
      { value: 'jedc',   label: 'JEDC — Jos Electric (06)'     },
      { value: 'ibedc',  label: 'IBEDC — Ibadan Electric (07)' },
      { value: 'kaedc',  label: 'KAEDC — Kaduna Electric (08)' },
      { value: 'eedc',   label: 'EEDC — Enugu Electric (09)'   },
      { value: 'bedc',   label: 'BEDC — Benin Electric (10)'   },
      { value: 'yedc',   label: 'YEDC — Yola Electric (11)'    },
      { value: 'aba',    label: 'ABA/APLE — Aba Power (12)'    },
    ],
    categoryLabel: 'Meter Type',
    categoryOptions: [
      { value: 'prepaid',  label: 'Prepaid'  },
      { value: 'postpaid', label: 'Postpaid' },
    ],
    variableAmountDefault: true,
    providerCodeLabel: 'Provider DISCO Code (Clubkonnect)',
    providerCodeHint: 'Clubkonnect numeric DISCO ID — required for purchase and meter verification. Use the code shown in brackets next to the DISCO name above (01=EKEDC, 02=IKEDC … 11=YEDC, 12=ABA/APLE).',
    providerCodePlaceholder: 'e.g. 11 (YEDC), 02 (IKEDC)',
    variationCodePlaceholder: 'e.g. yedc-prepaid',
    variationCodeHint: 'Internal app code — combine DISCO slug + meter type. Must be unique per service type (e.g. yedc-prepaid, ikedc-postpaid, aedc-prepaid).',
  },
  cable_tv: {
    operatorLabel: 'Biller',
    operatorOptions: [
      { value: 'dstv',       label: 'DStv'       },
      { value: 'gotv',       label: 'GOtv'       },
      { value: 'startimes',  label: 'StarTimes'  },
      { value: 'showmax',    label: 'Showmax'    },
    ],
    categoryLabel: 'Package Type',
    categoryOptions: [
      { value: 'compact',       label: 'Compact'       },
      { value: 'compact-plus',  label: 'Compact Plus'  },
      { value: 'premium',       label: 'Premium'       },
      { value: 'yanga',         label: 'Yanga'         },
      { value: 'jolli',         label: 'Jolli'         },
      { value: 'max',           label: 'Max'           },
      { value: 'basic',         label: 'Basic'         },
      { value: 'classic',       label: 'Classic'       },
      { value: 'mobile',        label: 'Mobile'        },
      { value: 'pro',           label: 'Pro'           },
    ],
    variableAmountDefault: false,
    providerCodeLabel: 'Provider Plan ID',
    providerCodeHint: 'Provider plan code for this bouquet (e.g. VTPass cable plan code). Required — purchase will fail without it.',
  },
  exam_pin: {
    operatorLabel: 'Exam Body',
    operatorOptions: [
      { value: 'waec', label: 'WAEC' },
      { value: 'neco', label: 'NECO' },
      { value: 'jamb', label: 'JAMB' },
    ],
    categoryLabel: 'PIN Type',
    categoryOptions: [
      { value: 'result-checker',   label: 'Result Checker'   },
      { value: 'registration-pin', label: 'Registration PIN' },
      { value: 'epin',             label: 'ePIN'             },
      { value: 'token',            label: 'Token'            },
    ],
    variableAmountDefault: false,
    providerCodeLabel: 'Provider Plan ID',
    providerCodeHint: 'Provider plan code for this exam PIN type. Required.',
  },
  identity_verification: {
    operatorLabel: 'Verification Type',
    operatorOptions: [
      { value: 'nin',   label: 'NIN'   },
      { value: 'bvn',   label: 'BVN'   },
      { value: 'phone', label: 'Phone' },
      { value: 'cac',   label: 'CAC'   },
    ],
    categoryLabel: 'Package / Tier',
    categoryOptions: [
      { value: 'basic',    label: 'Basic'    },
      { value: 'standard', label: 'Standard' },
      { value: 'premium',  label: 'Premium'  },
    ],
    variableAmountDefault: false,
    providerCodeLabel: 'Provider Plan ID / Variation Code',
    providerCodeHint: 'Provider-specific plan identifier. Optional depending on provider.',
  },
}

const DEFAULT_CONFIG: ServiceTypeConfig = {
  operatorLabel: 'Operator / Biller',
  operatorOptions: [
    { value: 'mtn', label: 'MTN' }, { value: 'airtel', label: 'Airtel' },
    { value: 'glo', label: 'Glo' }, { value: '9mobile', label: '9mobile' },
    { value: 'dstv', label: 'DStv' }, { value: 'gotv', label: 'GOtv' },
    { value: 'ekedc', label: 'EKEDC' }, { value: 'ikedc', label: 'IKEDC' },
    { value: 'aedc', label: 'AEDC' }, { value: 'phed', label: 'PHED' },
    { value: 'kedco', label: 'KEDCO' }, { value: 'waec', label: 'WAEC' },
    { value: 'neco', label: 'NECO' }, { value: 'jamb', label: 'JAMB' },
    { value: 'nin', label: 'NIN' }, { value: 'bvn', label: 'BVN' },
  ],
  categoryLabel: 'Category',
  categoryOptions: [
    { value: 'sme', label: 'SME' }, { value: 'corporate', label: 'Corporate' },
    { value: 'prepaid', label: 'Prepaid' }, { value: 'postpaid', label: 'Postpaid' },
    { value: 'gifting', label: 'Gifting' }, { value: 'direct', label: 'Direct' },
  ],
  variableAmountDefault: false,
  providerCodeLabel: 'Provider Plan ID / Variation Code',
  providerCodeHint: "Provider-specific plan identifier. Leave blank to use the plan's variation_code.",
}

// ── ComboField: dropdown with inline custom-value escape hatch ────────────────

interface ComboFieldProps {
  label: string
  value: string | null
  onChange: (v: string | null) => void
  options: { value: string; label: string }[]
  noneLabel?: string
  hint?: string
  error?: string
}

function ComboField({ label, value, onChange, options, noneLabel = 'None', hint, error }: ComboFieldProps) {
  const isKnown = !value || options.some((o) => o.value === value)
  const [mode, setMode] = useState<'select' | 'custom'>(isKnown ? 'select' : 'custom')
  const [customVal, setCustomVal] = useState(!isKnown ? (value ?? '') : '')

  function handleSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const v = e.target.value
    if (v === '__custom__') {
      setMode('custom')
      setCustomVal('')
      onChange(null)
    } else {
      setMode('select')
      onChange(v || null)
    }
  }

  function handleCustomChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value
    setCustomVal(v)
    onChange(v.trim() || null)
  }

  const selectValue = mode === 'custom' ? '__custom__' : (value ?? '')

  return (
    <div>
      <Select
        label={label}
        value={selectValue}
        onChange={handleSelect}
        options={[
          { value: '', label: noneLabel },
          ...options,
          { value: '__custom__', label: '+ Custom…' },
        ]}
        error={mode === 'select' ? error : undefined}
      />
      {mode === 'custom' && (
        <div className="mt-1.5">
          <Input
            value={customVal}
            onChange={handleCustomChange}
            placeholder={`Type custom ${label.toLowerCase()}…`}
            error={error}
          />
        </div>
      )}
      {hint && !error && <p className="mt-1 text-xs text-ink-faint">{hint}</p>}
    </div>
  )
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
      network_operator: initial.network_operator ?? null,
      plan_category: initial.plan_category ?? null,
      duration_days: initial.duration_days ?? null,
      duration_days_str: initial.duration_days != null ? String(initial.duration_days) : '',
      plan_sort_order: initial.plan_sort_order ?? 0,
      plan_sort_order_str: String(initial.plan_sort_order ?? 0),
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
    plan_sort_order: 0,
    plan_sort_order_str: '0',
    primary_provider_code: null,
    fallback_provider_code: null,
    provider_variation_code: null,
    provider_metadata_raw: '{}',
  }
}

// ── Provider Mapping sub-components ──────────────────────────────────────────

interface MappingFormProps {
  planId: string
  initial?: ProviderPlanMapping
  onSave: (body: CreatePlanMappingInput) => void
  onCancel: () => void
  pending: boolean
}

function MappingForm({ planId, initial, onSave, onCancel, pending }: MappingFormProps) {
  const [f, setF] = useState({
    provider_code:       initial?.provider_code       ?? '',
    provider_plan_code:  initial?.provider_plan_code  ?? '',
    provider_cost_price: initial?.provider_cost_price != null ? String(initial.provider_cost_price) : '',
    provider_operator:   initial?.provider_operator   ?? '',
    provider_category:   initial?.provider_category   ?? '',
    priority:            String(initial?.priority ?? 100),
    enabled:             initial?.enabled             ?? true,
    allow_loss_fallback: initial?.allow_loss_fallback ?? false,
  })

  function handleSave() {
    onSave({
      plan_id:             planId,
      provider_code:       f.provider_code.trim(),
      provider_plan_code:  f.provider_plan_code.trim(),
      provider_cost_price: f.provider_cost_price ? parseFloat(f.provider_cost_price) : null,
      provider_operator:   f.provider_operator.trim() || null,
      provider_category:   f.provider_category.trim() || null,
      priority:            parseInt(f.priority) || 100,
      enabled:             f.enabled,
      allow_loss_fallback: f.allow_loss_fallback,
    })
  }

  return (
    <div className="rounded-lg border border-accent/50 bg-surface-2 p-3 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Input label="Provider Code" value={f.provider_code} onChange={(e) => setF((x) => ({ ...x, provider_code: e.target.value }))} placeholder="e.g. vtpass" disabled={!!initial} />
        <Input label="Provider Plan Code" value={f.provider_plan_code} onChange={(e) => setF((x) => ({ ...x, provider_plan_code: e.target.value }))} placeholder="e.g. mtn-1gb" />
        <Input label="Cost Price (₦)" type="number" min={0} step="0.01" value={f.provider_cost_price} onChange={(e) => setF((x) => ({ ...x, provider_cost_price: e.target.value }))} placeholder="Optional" />
        <Input label="Priority" type="number" min={0} max={9999} value={f.priority} onChange={(e) => setF((x) => ({ ...x, priority: e.target.value }))} />
        <Input label="Operator Override" value={f.provider_operator} onChange={(e) => setF((x) => ({ ...x, provider_operator: e.target.value }))} placeholder="Optional" />
        <Input label="Category Override" value={f.provider_category} onChange={(e) => setF((x) => ({ ...x, provider_category: e.target.value }))} placeholder="Optional" />
      </div>
      <div className="flex gap-4 text-sm">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={f.enabled} onChange={(e) => setF((x) => ({ ...x, enabled: e.target.checked }))} className="rounded" />
          Enabled
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={f.allow_loss_fallback} onChange={(e) => setF((x) => ({ ...x, allow_loss_fallback: e.target.checked }))} className="rounded" />
          Allow loss fallback
        </label>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onCancel} disabled={pending}>Cancel</Button>
        <Button variant="primary" size="sm" onClick={handleSave} disabled={pending}>{pending ? 'Saving…' : (initial ? 'Update' : 'Add Mapping')}</Button>
      </div>
    </div>
  )
}

function MappingRow({ mapping, onEdit, onDelete, deleting }: { mapping: ProviderPlanMapping; onEdit: () => void; onDelete: () => void; deleting: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-xs font-medium text-ink">{mapping.provider_code}</span>
          <span className="text-ink-faint text-xs">→</span>
          <span className="font-mono text-xs text-ink">{mapping.provider_plan_code}</span>
          {!mapping.enabled && <Badge variant="danger">disabled</Badge>}
          {mapping.allow_loss_fallback && <Badge variant="neutral">loss ok</Badge>}
        </div>
        <div className="flex gap-3 mt-0.5 flex-wrap">
          {mapping.provider_cost_price != null && <span className="text-[11px] text-ink-faint">cost: ₦{mapping.provider_cost_price}</span>}
          {mapping.provider_operator && <span className="text-[11px] text-ink-faint">op: {mapping.provider_operator}</span>}
          {mapping.provider_category && <span className="text-[11px] text-ink-faint">cat: {mapping.provider_category}</span>}
          <span className="text-[11px] text-ink-faint">priority: {mapping.priority}</span>
        </div>
      </div>
      <div className="flex gap-1 shrink-0">
        <Button variant="ghost" size="sm" onClick={onEdit}><Edit className="w-3.5 h-3.5" /></Button>
        <Button variant="ghost" size="sm" onClick={onDelete} disabled={deleting}><Trash2 className="w-3.5 h-3.5 text-rose-400" /></Button>
      </div>
    </div>
  )
}

function PlanMappingsSection({ planId }: { planId: string }) {
  const qc = useQueryClient()
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const { data: mappings = [], isLoading } = useQuery({
    queryKey: ['plan-mappings', planId],
    queryFn: () => catalogApi.listPlanMappings(planId),
  })

  const createMut = useMutation({
    mutationFn: (body: CreatePlanMappingInput) => catalogApi.createPlanMapping(body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['plan-mappings', planId] }); setAdding(false); toast.success('Mapping added') },
    onError: (err) => toast.error(errMsg(err, 'Failed to add mapping')),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: CreatePlanMappingInput }) => catalogApi.updatePlanMapping(id, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['plan-mappings', planId] }); setEditingId(null); toast.success('Mapping updated') },
    onError: (err) => toast.error(errMsg(err, 'Failed to update mapping')),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => catalogApi.deletePlanMapping(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['plan-mappings', planId] }); toast.success('Mapping deleted') },
    onError: (err) => toast.error(errMsg(err, 'Failed to delete mapping')),
  })

  return (
    <div className="border-t border-border pt-4 space-y-3 px-1">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold text-ink-faint uppercase tracking-widest">Provider Mappings</p>
        {!adding && <Button variant="secondary" size="sm" onClick={() => setAdding(true)}><Plus className="w-3.5 h-3.5 mr-1" />Add</Button>}
      </div>
      {adding && (
        <MappingForm planId={planId} onSave={(body) => createMut.mutate(body)} onCancel={() => setAdding(false)} pending={createMut.isPending} />
      )}
      {isLoading && <p className="text-xs text-ink-faint py-2">Loading…</p>}
      {!isLoading && mappings.length === 0 && !adding && (
        <p className="text-xs text-ink-faint py-2 text-center">No mappings configured. Add one to override per-provider plan codes.</p>
      )}
      {mappings.map((m) =>
        editingId === m.id ? (
          <MappingForm key={m.id} planId={planId} initial={m} onSave={(body) => updateMut.mutate({ id: m.id, body })} onCancel={() => setEditingId(null)} pending={updateMut.isPending} />
        ) : (
          <MappingRow key={m.id} mapping={m} onEdit={() => setEditingId(m.id)} onDelete={() => deleteMut.mutate(m.id)} deleting={deleteMut.isPending} />
        )
      )}
    </div>
  )
}

// ── Plan form modal ───────────────────────────────────────────────────────────

function PlanFormModal({ open, onClose, services, providers, initial, onSaved }: PlanFormProps) {
  const isEdit = !!initial
  const [form, setForm] = useState<PlanFormState>(() => buildFormState(initial))
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({})
  // Incrementing key forces ComboField components to remount on form reset,
  // so their local select/custom mode re-initialises from the new form values.
  const [formKey, setFormKey] = useState(0)

  useEffect(() => {
    if (open) {
      setForm(buildFormState(initial))
      setErrors({})
      setFormKey((k) => k + 1)
    }
  }, [open, initial])

  const serviceOptions = [
    { value: '', label: 'Select service…' },
    ...services.map((s) => ({ value: s.id, label: `${s.name} (${s.service_type})` })),
  ]

  const selectedService = services.find((s) => s.id === form.service_id)
  const selectedServiceType = selectedService?.service_type ?? ''
  const config = SERVICE_TYPE_CONFIGS[selectedServiceType] ?? DEFAULT_CONFIG

  // When service type changes on a new plan, apply sensible defaults
  function handleServiceChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newServiceId = e.target.value
    const newService = services.find((s) => s.id === newServiceId)
    const newConfig = newService ? (SERVICE_TYPE_CONFIGS[newService.service_type] ?? DEFAULT_CONFIG) : null
    setForm((f) => ({
      ...f,
      service_id: newServiceId,
      ...(!isEdit && newConfig ? { is_variable_amount: newConfig.variableAmountDefault } : {}),
    }))
  }

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

    // Service-type-aware rules
    if (selectedServiceType) {
      // Operator/DISCO/Biller required when there are defined options
      if (config.operatorOptions.length > 0 && !form.network_operator) {
        e.network_operator = `${config.operatorLabel} is required`
      }
      // Electricity and cable_tv require category (meter type / package type)
      if (['electricity', 'cable_tv'].includes(selectedServiceType) && !form.plan_category) {
        e.plan_category = `${config.categoryLabel} is required`
      }
      // Electricity always requires provider_variation_code (Clubkonnect numeric DISCO ID)
      if (selectedServiceType === 'electricity' && !form.provider_variation_code) {
        e.provider_variation_code = 'Clubkonnect DISCO ID is required (e.g. 11 for YEDC, 02 for IKEDC)'
      }
      // Data requires provider_variation_code for SMShika
      if (
        selectedServiceType === 'data' &&
        form.primary_provider_code === 'smshika' &&
        !form.provider_variation_code
      ) {
        e.provider_variation_code = `${config.providerCodeLabel} is required for SMShika`
      }
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
    const plan_sort_order = parseInt(form.plan_sort_order_str, 10) || 0
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
      plan_sort_order,
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

  // Inline service-type hint shown below the service selector
  const serviceTypeHint: Record<string, string> = {
    electricity: 'Variable Amount auto-enabled. Set: Variation Code (e.g. yedc-prepaid) · DISCO · Meter Type · Provider DISCO Code (Clubkonnect numeric, e.g. 11).',
    airtime:     'Variable Amount auto-enabled for new plans. Set Network.',
    data:        'Set Network + Category + Provider Plan ID (required for SMShika).',
    cable_tv:    'Set Biller + Package Type + Provider Plan ID.',
    exam_pin:    'Set Exam Body + PIN Type + Provider Plan ID.',
    identity_verification: 'Set Verification Type + Tier.',
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

          <div>
            <Select
              label="Service"
              value={form.service_id}
              onChange={handleServiceChange}
              options={serviceOptions}
              error={errors.service_id}
            />
            {selectedServiceType && serviceTypeHint[selectedServiceType] && (
              <p className="mt-1 text-xs text-ink-faint">{serviceTypeHint[selectedServiceType]}</p>
            )}
          </div>

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
            placeholder={config.variationCodePlaceholder ?? 'e.g. mtn-1gb-30'}
            hint={config.variationCodeHint ?? 'Internal slug — must be unique per service type'}
            error={errors.variation_code}
          />

          <div className="grid grid-cols-2 gap-3">
            <ComboField
              key={`${formKey}-operator`}
              label={config.operatorLabel}
              value={form.network_operator ?? null}
              onChange={(v) => setForm((f) => ({ ...f, network_operator: v }))}
              options={config.operatorOptions}
              noneLabel="None"
              error={errors.network_operator}
            />
            <ComboField
              key={`${formKey}-category`}
              label={config.categoryLabel}
              value={form.plan_category ?? null}
              onChange={(v) => setForm((f) => ({ ...f, plan_category: v }))}
              options={config.categoryOptions}
              noneLabel="None"
              error={errors.plan_category}
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

          <Input
            label="Plan Sort Order"
            type="number"
            min={0}
            step={1}
            value={form.plan_sort_order_str}
            onChange={(e) => setForm((f) => ({ ...f, plan_sort_order_str: e.target.value }))}
            placeholder="0"
            hint="Lower = displayed first within category (0 = top)"
          />

          {numField('amount', 'Base Amount (₦)', 'Provider face value (0 for variable-amount plans)')}
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
            label={config.providerCodeLabel}
            value={form.provider_variation_code ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, provider_variation_code: e.target.value || null }))}
            placeholder={
              config.providerCodePlaceholder ??
              (selectedServiceType === 'data'
                ? 'e.g. 7 (SMShika numeric plan ID)'
                : 'Provider-specific identifier')
            }
            hint={config.providerCodeHint}
            error={errors.provider_variation_code}
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
            {toggle('is_variable_amount', 'Variable Amount', 'User supplies amount at purchase (electricity, airtime)')}
            {toggle('is_active', 'Active')}
          </div>
        </div>
      </div>
      {isEdit && initial?.id && <PlanMappingsSection planId={initial.id} />}
    </Modal>
  )
}

// ── Category display-order modal ──────────────────────────────────────────────

const CAT_ORDER_SERVICE_TYPES = [
  { value: 'data',                  label: 'Data'     },
  { value: 'airtime',               label: 'Airtime'  },
  { value: 'electricity',           label: 'Electricity' },
  { value: 'cable_tv',              label: 'Cable TV' },
  { value: 'exam_pin',              label: 'Exam PIN' },
  { value: 'identity_verification', label: 'Identity' },
]

function CategoryOrderModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const [serviceType, setServiceType] = useState('data')
  const [network, setNetwork]         = useState('mtn')
  const [localOrder, setLocalOrder]   = useState<string[]>([])

  const { data: savedOrders = [], isLoading } = useQuery({
    queryKey: ['admin-category-orders'],
    queryFn:  () => catalogApi.listCategoryOrders(),
    enabled:  open,
  })

  const config = SERVICE_TYPE_CONFIGS[serviceType]

  // Rebuild local order when service type, network, or saved data changes
  useEffect(() => {
    if (!config) return
    const baseCategories = config.categoryOptions.map((o) => o.value)
    const saved = savedOrders
      .filter((o) => o.service_type === serviceType && o.network_operator === network)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((o) => o.plan_category)
    const savedSet = new Set(saved)
    const remaining = baseCategories.filter((c) => !savedSet.has(c))
    setLocalOrder([...saved, ...remaining])
  }, [serviceType, network, savedOrders, config])

  // Reset network when service type changes
  useEffect(() => {
    const first = SERVICE_TYPE_CONFIGS[serviceType]?.operatorOptions[0]?.value ?? ''
    setNetwork(first)
  }, [serviceType])

  const saveMutation = useMutation({
    mutationFn: () =>
      catalogApi.upsertCategoryOrders({
        orders: localOrder.map((cat, idx) => ({
          service_type:     serviceType,
          network_operator: config?.operatorOptions.length > 0 ? network : null,
          plan_category:    cat,
          sort_order:       idx,
        })),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin-category-orders'] })
      toast.success('Category order saved')
      onClose()
    },
    onError: (err) => toast.error(errMsg(err, 'Failed to save category order')),
  })

  function moveUp(i: number) {
    if (i === 0) return
    setLocalOrder((prev) => {
      const next = [...prev]
      ;[next[i - 1], next[i]] = [next[i], next[i - 1]]
      return next
    })
  }

  function moveDown(i: number) {
    if (i === localOrder.length - 1) return
    setLocalOrder((prev) => {
      const next = [...prev]
      ;[next[i], next[i + 1]] = [next[i + 1], next[i]]
      return next
    })
  }

  const catLabel = (cat: string) =>
    config?.categoryOptions.find((o) => o.value === cat)?.label ?? cat

  if (!open) return null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Category Display Order"
      subtitle="Set the order plan categories appear in the customer app"
      size="md"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saveMutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || isLoading || localOrder.length === 0}
          >
            {saveMutation.isPending ? 'Saving…' : 'Save Order'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Service Type"
            value={serviceType}
            onChange={(e) => setServiceType(e.target.value)}
            options={CAT_ORDER_SERVICE_TYPES}
          />
          {config?.operatorOptions.length > 0 && (
            <Select
              label={config.operatorLabel}
              value={network}
              onChange={(e) => setNetwork(e.target.value)}
              options={config.operatorOptions}
            />
          )}
        </div>

        {isLoading ? (
          <SkeletonTable rows={4} />
        ) : localOrder.length === 0 ? (
          <p className="text-sm text-ink-muted text-center py-4">
            No categories configured for this selection.
          </p>
        ) : (
          <div className="space-y-1.5">
            <p className="text-xs text-ink-faint mb-1">
              Use the arrows to reorder. The first item appears first in the customer app.
            </p>
            {localOrder.map((cat, i) => (
              <div
                key={cat}
                className="flex items-center gap-2 rounded-lg border border-border bg-surface-1 px-3 py-2.5"
              >
                <span className="text-xs text-ink-faint w-5 shrink-0 text-right font-mono">
                  {i + 1}.
                </span>
                <span className="flex-1 text-sm font-medium text-ink">{catLabel(cat)}</span>
                <div className="flex gap-0.5">
                  <button
                    type="button"
                    onClick={() => moveUp(i)}
                    disabled={i === 0}
                    className="p-1 rounded text-ink-faint hover:text-ink hover:bg-surface-2 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
                    aria-label="Move up"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveDown(i)}
                    disabled={i === localOrder.length - 1}
                    className="p-1 rounded text-ink-faint hover:text-ink hover:bg-surface-2 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
                    aria-label="Move down"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}

// ── Plan display-order modal ──────────────────────────────────────────────────

function PlanOrderModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const [serviceType, setServiceType] = useState('data')
  const [network, setNetwork]         = useState('mtn')
  const [category, setCategory]       = useState('sme')
  const [localPlans, setLocalPlans]   = useState<ServicePlan[]>([])

  const config = SERVICE_TYPE_CONFIGS[serviceType]

  // Reset network when service type changes
  useEffect(() => {
    const first = SERVICE_TYPE_CONFIGS[serviceType]?.operatorOptions[0]?.value ?? ''
    setNetwork(first)
  }, [serviceType])

  // Reset category when service type changes
  useEffect(() => {
    const first = SERVICE_TYPE_CONFIGS[serviceType]?.categoryOptions[0]?.value ?? ''
    setCategory(first)
  }, [serviceType])

  const { data: plansData, isLoading } = useQuery({
    queryKey: ['plan-order-plans', serviceType, network, category],
    queryFn: () =>
      catalogApi.listServicePlans({
        service_type:     serviceType,
        network_operator: config?.operatorOptions.length > 0 ? network : undefined,
        plan_category:    category || undefined,
        limit:            500,
      }),
    enabled: open && !!serviceType,
  })

  // Sync local list when query results arrive
  useEffect(() => {
    if (!plansData) return
    const sorted = [...plansData.plans].sort((a, b) => (a.plan_sort_order ?? 0) - (b.plan_sort_order ?? 0))
    setLocalPlans(sorted)
  }, [plansData])

  const saveMutation = useMutation({
    mutationFn: async () => {
      for (let i = 0; i < localPlans.length; i++) {
        const plan = localPlans[i]
        if ((plan.plan_sort_order ?? 0) !== i) {
          await catalogApi.updateServicePlan(plan.id, { plan_sort_order: i })
        }
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin-service-plans'] })
      toast.success('Plan order saved')
      onClose()
    },
    onError: (err) => toast.error(errMsg(err, 'Failed to save plan order')),
  })

  function moveUp(i: number) {
    if (i === 0) return
    setLocalPlans((prev) => {
      const next = [...prev]
      ;[next[i - 1], next[i]] = [next[i], next[i - 1]]
      return next
    })
  }

  function moveDown(i: number) {
    if (i === localPlans.length - 1) return
    setLocalPlans((prev) => {
      const next = [...prev]
      ;[next[i], next[i + 1]] = [next[i + 1], next[i]]
      return next
    })
  }

  if (!open) return null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Plan Display Order"
      subtitle="Set the order plans appear within a category in the customer app"
      size="md"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saveMutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || isLoading || localPlans.length === 0}
          >
            {saveMutation.isPending ? 'Saving…' : 'Save Order'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Select
            label="Service Type"
            value={serviceType}
            onChange={(e) => setServiceType(e.target.value)}
            options={CAT_ORDER_SERVICE_TYPES}
          />
          <Select
            label={config?.operatorLabel ?? 'Network'}
            value={network}
            onChange={(e) => setNetwork(e.target.value)}
            options={config?.operatorOptions ?? []}
          />
          <Select
            label={config?.categoryLabel ?? 'Category'}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            options={config?.categoryOptions ?? []}
          />
        </div>

        {isLoading ? (
          <SkeletonTable rows={5} />
        ) : localPlans.length === 0 ? (
          <p className="text-sm text-ink-muted text-center py-4">
            No plans found for this selection.
          </p>
        ) : (
          <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
            <p className="text-xs text-ink-faint mb-1">
              Use the arrows to reorder. The first item appears first in the customer app.
            </p>
            {localPlans.map((plan, i) => (
              <div
                key={plan.id}
                className="flex items-center gap-2 rounded-lg border border-border bg-surface-1 px-3 py-2.5"
              >
                <span className="text-xs text-ink-faint w-5 shrink-0 text-right font-mono">
                  {i + 1}.
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink truncate">{plan.name}</p>
                  <p className="text-xs text-ink-faint">₦{plan.amount.toLocaleString()}</p>
                </div>
                <div className="flex gap-0.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => moveUp(i)}
                    disabled={i === 0}
                    className="p-1 rounded text-ink-faint hover:text-ink hover:bg-surface-2 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
                    aria-label="Move up"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveDown(i)}
                    disabled={i === localPlans.length - 1}
                    className="p-1 rounded text-ink-faint hover:text-ink hover:bg-surface-2 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
                    aria-label="Move down"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
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

// ── Bulk clear override confirmation modal ────────────────────────────────────

interface BulkClearOverrideModalProps {
  open: boolean
  onClose: () => void
  selectedIds: string[]
  onConfirm: () => void
  isPending: boolean
}

function BulkClearOverrideModal({ open, onClose, selectedIds, onConfirm, isPending }: BulkClearOverrideModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Clear Provider Override"
      subtitle={`${selectedIds.length} plan${selectedIds.length !== 1 ? 's' : ''} selected`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button variant="danger" size="sm" onClick={onConfirm} disabled={isPending}>
            {isPending ? 'Clearing…' : `Clear Override on ${selectedIds.length} Plan${selectedIds.length !== 1 ? 's' : ''}`}
          </Button>
        </>
      }
    >
      <p className="text-sm text-ink-muted">
        This will remove the primary and fallback provider overrides from {selectedIds.length} selected
        plan{selectedIds.length !== 1 ? 's' : ''}. Plans will revert to using service routing rules.
        Provider plan codes (variation codes) are not affected.
      </p>
    </Modal>
  )
}

// ── Bulk set provider modal ───────────────────────────────────────────────────

interface BulkSetProviderModalProps {
  open: boolean
  onClose: () => void
  selectedIds: string[]
  providers: Provider[]
  onConfirm: (providerCode: string) => void
  isPending: boolean
}

function BulkSetProviderModal({ open, onClose, selectedIds, providers, onConfirm, isPending }: BulkSetProviderModalProps) {
  const [chosenProvider, setChosenProvider] = useState('')

  useEffect(() => {
    if (!open) setChosenProvider('')
  }, [open])

  const providerOptions = [
    { value: '', label: 'Select provider…' },
    ...providers.map((p) => ({ value: p.provider_code, label: `${p.name} (${p.provider_code})` })),
  ]

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Set Primary Provider"
      subtitle={`${selectedIds.length} plan${selectedIds.length !== 1 ? 's' : ''} selected`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => { if (chosenProvider) onConfirm(chosenProvider) }}
            disabled={isPending || !chosenProvider}
          >
            {isPending ? 'Applying…' : `Set Provider for ${selectedIds.length} Plan${selectedIds.length !== 1 ? 's' : ''}`}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-ink-muted">
          This will set the primary provider override for {selectedIds.length} selected
          plan{selectedIds.length !== 1 ? 's' : ''}, bypassing service routing rules.
        </p>
        <Select
          label="Primary Provider"
          value={chosenProvider}
          onChange={(e) => setChosenProvider(e.target.value)}
          options={providerOptions}
        />
      </div>
    </Modal>
  )
}

// ── Import Plans Modal ────────────────────────────────────────────────────────

interface ImportPlan {
  plan_code:       string
  name:            string
  operator:        string
  amount:          number
  category?:       string
  duration_days?:  number
  provider_plan_id: string
}

function parseDuration(s: string): number | undefined {
  const m = /(\d+)\s*day/i.exec(s)
  if (m) return parseInt(m[1], 10)
  const m2 = /(\d+)\s*month/i.exec(s)
  if (m2) return parseInt(m2[1], 10) * 30
  const n = parseInt(s, 10)
  return isNaN(n) ? undefined : n
}

function normalizeDataPlan(raw: Record<string, unknown>, network: string): ImportPlan | null {
  const id   = raw.id ?? raw.plan_id ?? raw.data_id
  const name = String(raw.plan ?? raw.name ?? raw.description ?? raw.plan_name ?? id ?? '').trim()
  const amt  = parseFloat(String(raw.amount ?? raw.price ?? raw.plan_amount ?? 0))
  if (!id || !name) return null
  return {
    plan_code:       `${network.toLowerCase()}-${id}`,
    name:            name || String(id),
    operator:        network.toLowerCase(),
    amount:          isNaN(amt) ? 0 : amt,
    category:        String(raw.plan_type ?? raw.type ?? raw.category ?? '').toLowerCase() || undefined,
    duration_days:   raw.month_validate ? parseDuration(String(raw.month_validate)) : undefined,
    provider_plan_id: String(id),
  }
}

function normalizeCablePlan(raw: Record<string, unknown>): ImportPlan | null {
  const plan_code = String(raw.plan_code ?? '')
  const name      = String(raw.name ?? '')
  const operator  = String(raw.operator ?? '')
  if (!plan_code || !name) return null
  const amt = parseFloat(String(raw.amount ?? 0))
  return { plan_code, name, operator, amount: isNaN(amt) ? 0 : amt, provider_plan_id: plan_code }
}

function normalizeElectricityPlan(raw: Record<string, unknown>): ImportPlan | null {
  const plan_code     = String(raw.plan_code ?? '')
  const name          = String(raw.name ?? '')
  const operator      = String(raw.operator ?? '')
  const category      = String(raw.plan_category ?? raw.category ?? '')
  const provider_code = String(raw.provider_code ?? '')
  if (!plan_code || !name || !provider_code) return null
  return { plan_code, name, operator, amount: 0, category, provider_plan_id: provider_code }
}

interface ImportPlansModalProps {
  open:     boolean
  onClose:  () => void
  services: CatalogService[]
  onSaved:  () => void
}

const IMPORT_PROVIDER_OPTIONS = [
  { value: 'legitdataway', label: 'LegitDataWay' },
  { value: 'smshika',      label: 'SMShika'       },
]

function ImportPlansModal({ open, onClose, services, onSaved }: ImportPlansModalProps) {
  const [providerCode,  setProviderCode]  = useState('legitdataway')
  const [serviceType,   setServiceType]   = useState<'data' | 'cable_tv' | 'electricity'>('data')
  const [network,       setNetwork]       = useState('mtn')
  const [serviceId,     setServiceId]     = useState('')
  const [markupPct,     setMarkupPct]     = useState('5')
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set())
  const [plans,         setPlans]         = useState<ImportPlan[]>([])
  const [fetched,       setFetched]       = useState(false)
  const [fetchError,    setFetchError]    = useState('')

  useEffect(() => {
    if (!open) { setFetched(false); setPlans([]); setSelectedCodes(new Set()); setFetchError('') }
  }, [open])

  const fetchMutation = useMutation({
    mutationFn: () => catalogApi.fetchProviderPlans(providerCode, serviceType, serviceType === 'data' ? network : undefined),
    onSuccess: (data) => {
      const normalized = data.plans
        .map((raw) =>
          serviceType === 'data'        ? normalizeDataPlan(raw, network) :
          serviceType === 'electricity' ? normalizeElectricityPlan(raw) :
          normalizeCablePlan(raw)
        )
        .filter((p): p is ImportPlan => p !== null)
      setPlans(normalized)
      setSelectedCodes(new Set(normalized.map((p) => p.plan_code)))
      setFetched(true)
      setFetchError('')
    },
    onError: (err: Error) => { setFetchError(err.message); setFetched(true) },
  })

  const importMutation = useMutation({
    mutationFn: () => {
      const markup   = parseFloat(markupPct) || 0
      const selected = plans.filter((p) => selectedCodes.has(p.plan_code))
      return catalogApi.bulkImportPlans({
        service_id:            serviceId,
        provider_code:         providerCode,
        primary_provider_code: providerCode,
        plans: selected.map((p) => ({
          name:                    p.name,
          variation_code:          p.plan_code,
          amount:                  p.amount,
          cost_price:              p.amount > 0 ? p.amount : null,
          selling_price:           p.amount > 0 ? parseFloat((p.amount * (1 + markup / 100)).toFixed(2)) : null,
          network_operator:        p.operator || null,
          plan_category:           p.category || null,
          duration_days:           p.duration_days ?? null,
          provider_variation_code: p.provider_plan_id,
        })),
      })
    },
    onSuccess: (result) => {
      toast.success(`Imported ${result.created} plan${result.created !== 1 ? 's' : ''}${result.skipped ? ` (${result.skipped} skipped — already existed)` : ''}`)
      onSaved()
      onClose()
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const filteredServices = services.filter((s) =>
    serviceType === 'electricity'
      ? s.service_type === 'electricity'
      : s.service_type === serviceType
  )
  const serviceOptions   = [{ value: '', label: 'Select a service…' }, ...filteredServices.map((s) => ({ value: s.id, label: s.name }))]
  const networkOptions   = [
    { value: 'mtn',     label: 'MTN'     },
    { value: 'airtel',  label: 'Airtel'  },
    { value: 'glo',     label: 'Glo'     },
    { value: '9mobile', label: '9mobile' },
  ]

  const allSelected = plans.length > 0 && plans.every((p) => selectedCodes.has(p.plan_code))
  const toggleAll   = () => setSelectedCodes(allSelected ? new Set() : new Set(plans.map((p) => p.plan_code)))
  const toggleOne   = (code: string) => setSelectedCodes((prev) => { const n = new Set(prev); n.has(code) ? n.delete(code) : n.add(code); return n })
  const changeType     = (t: 'data' | 'cable_tv' | 'electricity') => { setServiceType(t); setFetched(false); setPlans([]); setSelectedCodes(new Set()); setFetchError(''); setServiceId('') }
  const changeProvider = (code: string) => { setProviderCode(code); setFetched(false); setPlans([]); setSelectedCodes(new Set()); setFetchError('') }

  const providerLabel = IMPORT_PROVIDER_OPTIONS.find((p) => p.value === providerCode)?.label ?? providerCode

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Import Plans from ${providerLabel}`}
      subtitle="Fetch available plans and bulk-add them to a service"
      size="lg"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={importMutation.isPending}>Cancel</Button>
          <Button
            variant="primary" size="sm"
            onClick={() => importMutation.mutate()}
            disabled={!serviceId || selectedCodes.size === 0 || !fetched || !!fetchError || importMutation.isPending}
            title={
              !serviceId ? 'Select a service first' :
              !fetched ? 'Fetch plans first' :
              selectedCodes.size === 0 ? 'Select at least one plan' :
              undefined
            }
          >
            {importMutation.isPending ? 'Importing…' : `Import ${selectedCodes.size} Plan${selectedCodes.size !== 1 ? 's' : ''}`}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Provider selector */}
        <div className="flex items-center gap-2">
          <p className="text-xs font-medium text-ink-muted w-24 shrink-0">Provider</p>
          <div className="flex gap-2">
            {IMPORT_PROVIDER_OPTIONS.map((p) => (
              <button key={p.value} type="button" onClick={() => changeProvider(p.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border-2 transition-all ${providerCode === p.value ? 'border-accent bg-accent/10 text-accent' : 'border-border text-ink-muted hover:border-accent/40'}`}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Type selector */}
        <div className="flex items-center gap-2">
          <p className="text-xs font-medium text-ink-muted w-24 shrink-0">Service type</p>
          <div className="flex gap-2 flex-wrap">
            {([['data', 'Data'], ['cable_tv', 'Cable TV'], ['electricity', 'Electricity']] as const).map(([t, label]) => (
              <button key={t} type="button" onClick={() => changeType(t)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border-2 transition-all ${serviceType === t ? 'border-accent bg-accent/10 text-accent' : 'border-border text-ink-muted hover:border-accent/40'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {serviceType === 'data' && (
          <Select label="Network" value={network}
            onChange={(e) => { setNetwork(e.target.value); setFetched(false); setPlans([]); setSelectedCodes(new Set()) }}
            options={networkOptions} />
        )}

        {/* Target service + markup must be set before importing */}
        <div className="grid grid-cols-2 gap-3">
          <Select label="Add to Service" value={serviceId} onChange={(e) => setServiceId(e.target.value)} options={serviceOptions} />
          <Input label="Markup %" type="number" min={0} step={0.5} value={markupPct}
            onChange={(e) => setMarkupPct(e.target.value)}
            hint="Applied to cost price → selling price." />
        </div>

        <Button variant="secondary" size="sm"
          onClick={() => fetchMutation.mutate()}
          disabled={fetchMutation.isPending}
          icon={fetchMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}>
          {fetchMutation.isPending ? 'Fetching…' : 'Fetch Plans'}
        </Button>

        {fetchError && <p className="text-xs text-danger bg-danger/10 rounded-lg px-3 py-2">{fetchError}</p>}
        {fetched && !fetchError && plans.length === 0 && <p className="text-xs text-ink-muted">No plans returned.</p>}

        {plans.length > 0 && (
          <>
            <div className="max-h-56 overflow-y-auto border border-border rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-surface-2 sticky top-0 z-10">
                  <tr>
                    <th className="p-2 text-left w-8">
                      <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-3 w-3 accent-accent" />
                    </th>
                    <th className="p-2 text-left font-medium text-ink-muted">Name</th>
                    <th className="p-2 text-left font-medium text-ink-muted">Operator</th>
                    {(serviceType === 'data' || serviceType === 'electricity') && <th className="p-2 text-left font-medium text-ink-muted">Category</th>}
                    <th className="p-2 text-right font-medium text-ink-muted">Provider ID</th>
                    <th className="p-2 text-right font-medium text-ink-muted">Cost (₦)</th>
                  </tr>
                </thead>
                <tbody>
                  {plans.map((p) => (
                    <tr key={p.plan_code} className="border-t border-border hover:bg-surface-2/50">
                      <td className="p-2"><input type="checkbox" checked={selectedCodes.has(p.plan_code)} onChange={() => toggleOne(p.plan_code)} className="h-3 w-3 accent-accent" /></td>
                      <td className="p-2 font-medium text-ink">{p.name}</td>
                      <td className="p-2 text-ink-muted uppercase">{p.operator}</td>
                      {(serviceType === 'data' || serviceType === 'electricity') && <td className="p-2 text-ink-muted">{p.category ?? '—'}</td>}
                      <td className="p-2 text-right font-mono text-ink-faint">{p.provider_plan_id}</td>
                      <td className="p-2 text-right text-ink">{p.amount > 0 ? `₦${p.amount.toLocaleString()}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-ink-faint">Plans with the same variation code are skipped automatically.</p>
          </>
        )}
      </div>
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
  const [filterOverride, setFilterOverride] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [editItem, setEditItem] = useState<ServicePlan | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkTarget, setBulkTarget] = useState<boolean | null>(null)
  const [bulkClearOpen, setBulkClearOpen] = useState(false)
  const [bulkSetProviderOpen, setBulkSetProviderOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [deleteItem, setDeleteItem] = useState<ServicePlan | null>(null)
  const [categoryOrderOpen, setCategoryOrderOpen] = useState(false)
  const [planOrderOpen,     setPlanOrderOpen]     = useState(false)

  const { data: services = [] } = useQuery({
    queryKey: ['admin-services'],
    queryFn: () => catalogApi.listServices(),
  })

  const { data: providers = [] } = useQuery({
    queryKey: ['providers'],
    queryFn: providersApi.list,
  })

  const { data: routingRules = [] } = useQuery({
    queryKey: ['routing-rules'],
    queryFn: routingApi.list,
  })

  const routeMap = useMemo(() => {
    const map = new Map<string, RoutingRule>()
    for (const rule of routingRules) {
      if (rule.is_active) map.set(rule.service_type, rule)
    }
    return map
  }, [routingRules])

  const queryParams = {
    service_id: filterServiceId || undefined,
    service_type: filterServiceType || undefined,
    network_operator: filterOperator || undefined,
    plan_category: filterCategory || undefined,
    provider_code: filterProvider || undefined,
    search: search.trim() || undefined,
    is_active: filterActive === '' ? undefined : filterActive === 'true',
    has_provider_override: filterOverride === '' ? undefined : filterOverride === 'true',
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

  const bulkClearMutation = useMutation({
    mutationFn: (ids: string[]) => catalogApi.bulkClearOverride(ids),
    onSuccess: (_data, ids) => {
      qc.invalidateQueries({ queryKey: ['admin-service-plans'] })
      setSelectedIds(new Set())
      setBulkClearOpen(false)
      toast.success(`Provider override cleared on ${ids.length} plan${ids.length !== 1 ? 's' : ''}`)
    },
    onError: (err) => toast.error(errMsg(err, 'Failed to clear overrides')),
  })

  const bulkSetProviderMutation = useMutation({
    mutationFn: ({ ids, provider }: { ids: string[]; provider: string }) =>
      catalogApi.bulkSetProviderByIds(ids, provider),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['admin-service-plans'] })
      setSelectedIds(new Set())
      setBulkSetProviderOpen(false)
      toast.success(`Primary provider set to ${vars.provider} for ${vars.ids.length} plan${vars.ids.length !== 1 ? 's' : ''}`)
    },
    onError: (err) => toast.error(errMsg(err, 'Failed to set provider')),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => catalogApi.deleteServicePlan(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-service-plans'] })
      setDeleteItem(null)
      toast.success('Plan deleted')
    },
    onError: (err) => toast.error(errMsg(err, 'Failed to delete plan')),
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

  const operatorOptions = useMemo(() => {
    const seen = new Set<string>()
    const all = Object.values(SERVICE_TYPE_CONFIGS).flatMap((c) => c.operatorOptions)
    return [
      { value: '', label: 'All operators' },
      ...all.filter((o) => !seen.has(o.value) && seen.add(o.value)),
    ]
  }, [])

  const categoryOptions = useMemo(() => {
    const seen = new Set<string>()
    const all = Object.values(SERVICE_TYPE_CONFIGS).flatMap((c) => c.categoryOptions)
    return [
      { value: '', label: 'All categories' },
      ...all.filter((o) => !seen.has(o.value) && seen.add(o.value)),
    ]
  }, [])

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

  const hasFilters = !!(filterServiceId || filterServiceType || filterOperator || filterCategory || filterProvider || filterActive || filterOverride || search)

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
      header: 'Provider / Route',
      render: (p: ServicePlan) => {
        const rule = routeMap.get(p.service_type)
        const hasOverride = !!p.primary_provider_code
        const sourceLabel = hasOverride
          ? `Plan Override: ${p.primary_provider_code}`
          : rule
            ? `Service Route: ${rule.primary_provider_code}`
            : 'Priority routing'
        return (
          <div className="space-y-0.5">
            <Badge variant="neutral" className="font-mono text-xs">{p.provider_code}</Badge>
            <div className={`flex items-center gap-1 text-[10px] ${hasOverride ? 'text-amber-400' : 'text-ink-faint'}`}>
              {hasOverride && <AlertTriangle className="h-2.5 w-2.5 shrink-0" />}
              <span>{sourceLabel}</span>
              {p.fallback_provider_code && (
                <span className="text-ink-faint"> / {p.fallback_provider_code}</span>
              )}
            </div>
          </div>
        )
      },
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
          <Button
            variant="ghost"
            size="xs"
            icon={<Trash2 className="h-3.5 w-3.5 text-rose-400" />}
            onClick={(e) => { e.stopPropagation(); setDeleteItem(p) }}
            title="Delete"
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
            <Button variant="secondary" size="sm" icon={<ListOrdered className="h-3.5 w-3.5" />}
              onClick={() => setCategoryOrderOpen(true)}>Category Order</Button>
            <Button variant="secondary" size="sm" icon={<ListOrdered className="h-3.5 w-3.5" />}
              onClick={() => setPlanOrderOpen(true)}>Plan Order</Button>
            <Button variant="secondary" size="sm" icon={<Download className="h-3.5 w-3.5" />}
              onClick={() => setImportOpen(true)}>Import Plans</Button>
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
        <Select
          value={filterOverride}
          onChange={(e) => { setFilterOverride(e.target.value); resetPage() }}
          options={[
            { value: '', label: 'All routing' },
            { value: 'true', label: 'Has override' },
            { value: 'false', label: 'No override' },
          ]}
          className="w-36"
        />
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={() => {
            setSearch(''); setFilterServiceId(''); setFilterServiceType('')
            setFilterOperator(''); setFilterCategory(''); setFilterProvider('')
            setFilterActive(''); setFilterOverride(''); resetPage()
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
          <div className="flex gap-2 ml-auto flex-wrap">
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
              variant="secondary"
              size="sm"
              icon={<UserCheck className="h-3.5 w-3.5 text-blue-400" />}
              onClick={() => setBulkSetProviderOpen(true)}
              disabled={bulkSetProviderMutation.isPending}
            >
              Set Provider
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<XCircle className="h-3.5 w-3.5 text-amber-400" />}
              onClick={() => setBulkClearOpen(true)}
              disabled={bulkClearMutation.isPending}
            >
              Clear Override
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
      <BulkClearOverrideModal
        open={bulkClearOpen}
        onClose={() => setBulkClearOpen(false)}
        selectedIds={Array.from(selectedIds)}
        onConfirm={() => bulkClearMutation.mutate(Array.from(selectedIds))}
        isPending={bulkClearMutation.isPending}
      />
      <BulkSetProviderModal
        open={bulkSetProviderOpen}
        onClose={() => setBulkSetProviderOpen(false)}
        selectedIds={Array.from(selectedIds)}
        providers={providers}
        onConfirm={(providerCode) => bulkSetProviderMutation.mutate({ ids: Array.from(selectedIds), provider: providerCode })}
        isPending={bulkSetProviderMutation.isPending}
      />
      <ImportPlansModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        services={services}
        onSaved={handleSaved}
      />
      <CategoryOrderModal
        open={categoryOrderOpen}
        onClose={() => setCategoryOrderOpen(false)}
      />
      <PlanOrderModal
        open={planOrderOpen}
        onClose={() => setPlanOrderOpen(false)}
      />

      {/* Delete plan confirmation */}
      <Modal
        open={deleteItem !== null}
        onClose={() => setDeleteItem(null)}
        title="Delete plan?"
        subtitle={deleteItem?.name}
        size="sm"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setDeleteItem(null)} disabled={deleteMutation.isPending}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              icon={<Trash2 className="h-3.5 w-3.5" />}
              onClick={() => deleteItem && deleteMutation.mutate(deleteItem.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete Plan'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-muted">
          This permanently removes <span className="font-medium text-ink">{deleteItem?.name}</span> from the catalog.
          Any transactions using this plan will retain their history. This cannot be undone.
        </p>
      </Modal>
    </div>
  )
}
