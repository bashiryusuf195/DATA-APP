import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { routingApi } from '@/api/routing.api'
import { providersApi } from '@/api/providers.api'
import { catalogApi } from '@/api/catalog.api'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataTable } from '@/components/shared/DataTable'
import { BoolBadge } from '@/components/shared/StatusBadge'
import { ErrorMessage } from '@/components/shared/ErrorMessage'
import { Drawer } from '@/components/shared/Drawer'
import { Button, Badge, Modal, Select, Card } from '@/components/ui'
import { SkeletonTable } from '@/components/ui/Skeleton'
import { fmtDate } from '@/utils/format'
import type { RoutingRule, CreateRoutingRuleInput, CategoryProviderRow, BulkAssignProviderInput, ProviderRegistryRow } from '@/types'
import {
  Plus, Edit, ToggleLeft, ToggleRight, RefreshCw, GitBranch, Layers,
  Wifi, Phone, Zap, Tv, BookOpen, Fingerprint, Globe, Loader2, Check, AlertTriangle,
} from 'lucide-react'
import { ENDPOINTS } from '@/config/endpoints'
import toast from 'react-hot-toast'
import axios from 'axios'
import { cn } from '@/utils/cn'

// ── Constants ─────────────────────────────────────────────────────────────────

const SERVICE_TYPES = [
  'airtime', 'data', 'electricity', 'cable_tv', 'exam_pin', 'identity_verification',
]

const SERVICE_LABELS: Record<string, { label: string; icon: React.ReactNode; operatorLabel: string; categoryLabel: string }> = {
  data:                  { label: 'Data API',         icon: <Wifi className="h-4 w-4" />,        operatorLabel: 'Network',           categoryLabel: 'Package Type' },
  airtime:               { label: 'Airtime API',      icon: <Phone className="h-4 w-4" />,       operatorLabel: 'Network',           categoryLabel: 'Airtime Type' },
  electricity:           { label: 'Electricity API',  icon: <Zap className="h-4 w-4" />,         operatorLabel: 'DISCO',             categoryLabel: 'Meter Type'   },
  cable_tv:              { label: 'Cable TV API',     icon: <Tv className="h-4 w-4" />,          operatorLabel: 'Biller',            categoryLabel: 'Package'      },
  exam_pin:              { label: 'Exam PIN API',     icon: <BookOpen className="h-4 w-4" />,    operatorLabel: 'Exam Body',         categoryLabel: 'PIN Type'     },
  identity_verification: { label: 'Identity API',     icon: <Fingerprint className="h-4 w-4" />, operatorLabel: 'Verification Type', categoryLabel: 'Tier'         },
}

const OPERATOR_DISPLAY: Record<string, string> = {
  mtn: 'MTN', airtel: 'Airtel', glo: 'Glo', '9mobile': '9mobile',
  dstv: 'DStv', gotv: 'GOtv', startimes: 'StarTimes',
  ekedc: 'EKEDC', ikedc: 'IKEDC', aedc: 'AEDC', phed: 'PHED', kedco: 'KEDCO',
  waec: 'WAEC', neco: 'NECO', jamb: 'JAMB', nin: 'NIN', bvn: 'BVN',
}

function displayOp(code: string): string {
  return OPERATOR_DISPLAY[code.toLowerCase()] ?? code.toUpperCase()
}

function displayCat(category: string | null): string {
  if (!category) return '—'
  const map: Record<string, string> = {
    sme: 'SME', corporate: 'Corporate', gifting: 'Gifting', direct: 'Direct', vtu: 'VTU',
    share_sell: 'Share & Sell', recharge_card: 'Recharge Card',
    prepaid: 'Prepaid', postpaid: 'Postpaid',
    compact: 'Compact', premium: 'Premium', yanga: 'Yanga', jolli: 'Jolli', max: 'Max',
    basic: 'Basic', classic: 'Classic',
    result_checker: 'Result Checker', registration: 'Registration PIN',
    token: 'Token', epin: 'ePIN',
  }
  return map[category.toLowerCase()] ?? category.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function errMsg(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data
    if (data?.details && typeof data.details === 'object') {
      const fields = Object.entries(data.details as Record<string, string[]>)
        .map(([f, msgs]) => `${f}: ${msgs.join(', ')}`)
        .join('; ')
      if (fields) return `${data.message ?? fallback} — ${fields}`
    }
    return data?.message ?? err.message ?? fallback
  }
  return fallback
}

// ── Service Routing tab ────────────────────────────────────────────────────────

const blankForm = (): CreateRoutingRuleInput => ({
  service_type: '',
  primary_provider_code: '',
  fallback_provider_code: '',
  is_active: true,
})

function ServiceRoutingTab() {
  const qc = useQueryClient()
  const [modal, setModal] = useState<'create' | { rule: RoutingRule } | null>(null)
  const [form, setForm] = useState<CreateRoutingRuleInput>(blankForm())
  const [filterService, setFilterService] = useState('')
  const [selected, setSelected] = useState<RoutingRule | null>(null)

  const { data: rules = [], isLoading, error, refetch } = useQuery({
    queryKey: ['routing-rules'],
    queryFn: routingApi.list,
  })

  const { data: overridePlansResult } = useQuery({
    queryKey: ['service-plans-with-overrides-count'],
    queryFn: () => catalogApi.listServicePlans({ has_provider_override: true, limit: 1 }),
    staleTime: 30_000,
  })
  const overrideCount = overridePlansResult?.meta.total ?? 0

  // Shares the ['providers-registry'] cache with ApiIntegrations — same endpoint, same data.
  const { data: providers = [] } = useQuery({
    queryKey: ['providers-registry'],
    queryFn: providersApi.listRegistry,
  })

  // Build provider dropdown options filtered by the currently-selected service type
  // so only relevant providers appear. Falls back to all providers if none support
  // the service (prevents an empty dropdown when service is selected).
  // Inactive providers are included but labelled so admins can plan ahead.
  const makeProviderOptions = (serviceType?: string): Array<{ value: string; label: string }> => {
    const supporting = serviceType
      ? providers.filter((p: ProviderRegistryRow) => p.supported_services.includes(serviceType))
      : providers
    const list = supporting.length > 0 ? supporting : providers
    return list.map((p: ProviderRegistryRow) => ({
      value: p.provider_code,
      label: `${p.name || p.provider_code}${!p.is_active ? ' [inactive]' : ''}`,
    }))
  }

  // All providers for table display (name lookup by code)
  const providerNameByCode = Object.fromEntries(
    providers.map((p: ProviderRegistryRow) => [p.provider_code, p.name])
  )

  const createMutation = useMutation({
    mutationFn: (body: CreateRoutingRuleInput) => routingApi.create(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['routing-rules'] })
      toast.success('Routing rule created')
      setModal(null)
    },
    onError: (err) => toast.error(errMsg(err, 'Failed to create rule')),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<CreateRoutingRuleInput> }) =>
      routingApi.update(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['routing-rules'] })
      toast.success('Rule updated')
      setModal(null)
    },
    onError: (err) => toast.error(errMsg(err, 'Update failed')),
  })

  const openCreate = () => { setForm(blankForm()); setModal('create') }
  const openEdit   = (rule: RoutingRule) => {
    setForm({
      service_type:           rule.service_type,
      primary_provider_code:  rule.primary_provider_code,
      fallback_provider_code: rule.fallback_provider_code ?? '',
      is_active:              rule.is_active,
    })
    setModal({ rule })
  }
  const handleSubmit = () => {
    if (modal === 'create') createMutation.mutate(form)
    else if (modal && 'rule' in modal) updateMutation.mutate({ id: modal.rule.id, body: form })
  }

  const filtered = filterService ? rules.filter((r) => r.service_type === filterService) : rules

  if (error) return <ErrorMessage error={error} onRetry={() => void refetch()} endpoint={ENDPOINTS.routingRules.path} />

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-48">
            <Select
              value={filterService}
              onChange={(e) => setFilterService(e.target.value)}
              placeholder="All service types"
              options={SERVICE_TYPES.map((s) => ({ value: s, label: SERVICE_LABELS[s]?.label ?? s }))}
            />
          </div>
          <Button variant="secondary" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />}
            onClick={() => void refetch()}>Refresh</Button>
        </div>
        <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={openCreate}>New rule</Button>
      </div>

      {overrideCount > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 mb-4">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-400 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-300">
            <strong>{overrideCount}</strong> plan{overrideCount !== 1 ? 's have' : ' has'} a plan-level provider override
            and will bypass these routing rules. Manage in <strong>Service Plans</strong>.
          </p>
        </div>
      )}
      <p className="text-xs text-ink-faint mb-4">
        Service-type routing rules define which provider handles all requests for a given service type by default.
        For finer-grained per-operator or per-category provider assignment, use the <strong>Category Routing</strong> tab.
      </p>

      <Card padding="none">
        {isLoading ? (
          <div className="p-5"><SkeletonTable rows={4} /></div>
        ) : (
          <DataTable
            data={filtered}
            rowKey={(r) => r.id}
            onRowClick={setSelected}
            emptyMessage="No service-type routing rules configured yet."
            columns={[
              {
                key: 'service',
                header: 'Service API',
                render: (r) => {
                  const cfg = SERVICE_LABELS[r.service_type]
                  return (
                    <div className="flex items-center gap-2">
                      <span className="text-accent">{cfg?.icon ?? <Globe className="h-4 w-4" />}</span>
                      <div>
                        <span className="text-sm font-medium text-ink">{cfg?.label ?? r.service_type}</span>
                        <p className="text-[10px] text-ink-faint font-mono">{r.service_type}</p>
                      </div>
                    </div>
                  )
                },
              },
              {
                key: 'primary',
                header: 'Primary Provider',
                render: (r) => {
                  const providerRow = providers.find((p: ProviderRegistryRow) => p.provider_code === r.primary_provider_code)
                  const inactive = providerRow && !providerRow.is_active
                  return (
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-sm text-ink">{r.primary_provider_code}</span>
                        {inactive && (
                          <span title="Provider is disabled — routing rule will fail to execute">
                            <AlertTriangle className="h-3 w-3 text-amber-400" />
                          </span>
                        )}
                      </div>
                      {providerNameByCode[r.primary_provider_code] && (
                        <p className={`text-[10px] ${inactive ? 'text-amber-400' : 'text-ink-faint'}`}>
                          {providerNameByCode[r.primary_provider_code]}{inactive ? ' — disabled' : ''}
                        </p>
                      )}
                    </div>
                  )
                },
              },
              {
                key: 'fallback',
                header: 'Fallback Provider',
                render: (r) =>
                  r.fallback_provider_code ? (
                    <div>
                      <span className="font-mono text-sm text-ink-muted">{r.fallback_provider_code}</span>
                      {providerNameByCode[r.fallback_provider_code] && (
                        <p className="text-[10px] text-ink-faint">{providerNameByCode[r.fallback_provider_code]}</p>
                      )}
                    </div>
                  ) : <span className="text-ink-faint text-sm">—</span>,
              },
              {
                key: 'active',
                header: 'Status',
                render: (r) => <BoolBadge value={r.is_active} trueLabel="Active" falseLabel="Inactive" />,
              },
              {
                key: 'updated',
                header: 'Updated',
                render: (r) => <span className="text-xs text-ink-faint">{fmtDate(r.updated_at)}</span>,
              },
              {
                key: 'actions',
                header: '',
                align: 'right',
                render: (r) => (
                  <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="xs"
                      icon={r.is_active
                        ? <ToggleRight className="h-3.5 w-3.5 text-emerald-400" />
                        : <ToggleLeft className="h-3.5 w-3.5 text-ink-faint" />}
                      onClick={() => updateMutation.mutate({ id: r.id, body: { is_active: !r.is_active } })} />
                    <Button variant="ghost" size="xs" icon={<Edit className="h-3.5 w-3.5" />}
                      onClick={() => openEdit(r)} />
                  </div>
                ),
              },
            ]}
          />
        )}
      </Card>

      {/* Create / Edit modal */}
      <Modal
        open={modal !== null}
        onClose={() => setModal(null)}
        title={modal === 'create' ? 'Create Routing Rule' : 'Edit Routing Rule'}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button>
            <Button
              onClick={handleSubmit}
              loading={createMutation.isPending || updateMutation.isPending}
              disabled={!form.service_type || !form.primary_provider_code}
            >
              {modal === 'create' ? 'Create' : 'Save'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Select
            label="Service API"
            value={form.service_type}
            onChange={(e) => setForm((f) => ({ ...f, service_type: e.target.value }))}
            options={SERVICE_TYPES.map((s) => ({ value: s, label: SERVICE_LABELS[s]?.label ?? s }))}
            placeholder="Select service"
          />
          <Select
            label="Primary Provider"
            value={form.primary_provider_code}
            onChange={(e) => setForm((f) => ({ ...f, primary_provider_code: e.target.value }))}
            options={makeProviderOptions(form.service_type)}
            placeholder="Select primary provider"
          />
          <Select
            label="Fallback Provider (optional)"
            value={form.fallback_provider_code ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, fallback_provider_code: e.target.value || undefined }))}
            options={makeProviderOptions(form.service_type)}
            placeholder="None"
          />
        </div>
      </Modal>

      {/* Detail drawer */}
      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title="Routing Rule"
        subtitle={selected ? (SERVICE_LABELS[selected.service_type]?.label ?? selected.service_type) : ''}
      >
        {selected && (
          <div className="space-y-4 text-sm">
            <DetailRow label="Service API" value={
              <div className="flex items-center gap-1.5 justify-end">
                <span className="text-accent">{SERVICE_LABELS[selected.service_type]?.icon}</span>
                <span className="font-medium">{SERVICE_LABELS[selected.service_type]?.label ?? selected.service_type}</span>
              </div>
            } />
            <DetailRow label="Primary Provider" value={
              <div className="text-right">
                <span className="font-mono text-sm">{selected.primary_provider_code}</span>
                {providerNameByCode[selected.primary_provider_code] && (
                  <p className="text-xs text-ink-faint">{providerNameByCode[selected.primary_provider_code]}</p>
                )}
              </div>
            } />
            <DetailRow label="Fallback Provider" value={
              selected.fallback_provider_code ? (
                <div className="text-right">
                  <span className="font-mono text-sm">{selected.fallback_provider_code}</span>
                </div>
              ) : <span className="text-ink-faint">None</span>
            } />
            <DetailRow label="Status" value={<BoolBadge value={selected.is_active} trueLabel="Active" falseLabel="Inactive" />} />
            <DetailRow label="Updated" value={fmtDate(selected.updated_at)} />
            <div className="border-t border-border pt-3 flex gap-2">
              <Button size="sm" variant="secondary" icon={<Edit className="h-3.5 w-3.5" />}
                onClick={() => { setSelected(null); openEdit(selected) }}>Edit</Button>
              <Button size="sm" variant="ghost"
                icon={selected.is_active
                  ? <ToggleRight className="h-3.5 w-3.5 text-emerald-400" />
                  : <ToggleLeft className="h-3.5 w-3.5 text-ink-faint" />}
                onClick={() => {
                  updateMutation.mutate({ id: selected.id, body: { is_active: !selected.is_active } })
                  setSelected(null)
                }}>
                {selected.is_active ? 'Deactivate' : 'Activate'}
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </>
  )
}

// ── Category Routing tab ───────────────────────────────────────────────────────

interface AssignModalProps {
  open: boolean
  row: CategoryProviderRow | null
  onClose: () => void
  providers: Array<{ value: string; label: string }>
  onSave: (body: BulkAssignProviderInput) => void
  isPending: boolean
}

function AssignProviderModal({ open, row, onClose, providers, onSave, isPending }: AssignModalProps) {
  const [primary, setPrimary] = useState('')
  const [fallback, setFallback] = useState('')

  // Pre-fill on open
  useMemo(() => {
    if (open && row) {
      setPrimary(row.primary_provider_code ?? '')
      setFallback(row.fallback_provider_code ?? '')
    }
  }, [open, row])

  if (!row) return null

  const cfg = SERVICE_LABELS[row.service_type]
  const opLabel = cfg?.operatorLabel ?? 'Operator'
  const catLabel = cfg?.categoryLabel ?? 'Category'
  const scopeLabel = row.plan_category
    ? `${displayOp(row.network_operator ?? '')} — ${displayCat(row.plan_category)}`
    : displayOp(row.network_operator ?? '')

  function handleSave() {
    if (!primary || !row) return
    onSave({
      service_type: row.service_type,
      network_operator: row.network_operator,
      plan_category: row.plan_category,
      primary_provider_code: primary,
      fallback_provider_code: fallback || null,
    })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Assign Provider"
      subtitle={`${cfg?.label ?? row.service_type} · ${scopeLabel}`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={isPending || !primary}
            icon={isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}>
            {isPending ? 'Updating…' : `Update ${row.plan_count} plan${row.plan_count !== 1 ? 's' : ''}`}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-ink-muted space-y-0.5">
          <p><span className="text-ink-faint">{opLabel}:</span> <strong>{displayOp(row.network_operator ?? '')}</strong></p>
          {row.plan_category && <p><span className="text-ink-faint">{catLabel}:</span> <strong>{displayCat(row.plan_category)}</strong></p>}
          <p><span className="text-ink-faint">Plans affected:</span> <strong>{row.plan_count}</strong></p>
        </div>
        <Select
          label="Primary Provider"
          value={primary}
          onChange={(e) => setPrimary(e.target.value)}
          options={[{ value: '', label: 'Select primary provider…' }, ...providers]}
        />
        <Select
          label="Fallback Provider (optional)"
          value={fallback}
          onChange={(e) => setFallback(e.target.value)}
          options={[{ value: '', label: 'None' }, ...providers]}
        />
        <p className="text-xs text-ink-faint">
          This will update the provider assignment for all {row.plan_count} plan{row.plan_count !== 1 ? 's' : ''} matching this group.
        </p>
      </div>
    </Modal>
  )
}

function CategoryRoutingTab() {
  const qc = useQueryClient()
  const [filterService, setFilterService] = useState('')
  const [assignRow, setAssignRow] = useState<CategoryProviderRow | null>(null)

  const { data: categoryRows = [], isLoading, refetch } = useQuery({
    queryKey: ['category-providers'],
    queryFn: catalogApi.getCategoryProviders,
  })

  // Shares the ['providers-registry'] cache with ServiceRoutingTab and ApiIntegrations.
  const { data: providers = [] } = useQuery({
    queryKey: ['providers-registry'],
    queryFn: providersApi.listRegistry,
  })

  const providerOptions = providers.map((p: ProviderRegistryRow) => ({
    value: p.provider_code,
    label: `${p.name || p.provider_code}${!p.is_active ? ' [inactive]' : ''}`,
  }))
  const providerNameByCode = Object.fromEntries(
    providers.map((p: ProviderRegistryRow) => [p.provider_code, p.name])
  )

  const assignMutation = useMutation({
    mutationFn: (body: BulkAssignProviderInput) => catalogApi.bulkAssignProvider(body),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['category-providers'] })
      toast.success(`Provider updated for ${data.updated} plan${data.updated !== 1 ? 's' : ''}`)
      setAssignRow(null)
    },
    onError: (err) => toast.error(errMsg(err, 'Failed to update provider')),
  })

  const filtered = filterService
    ? categoryRows.filter((r) => r.service_type === filterService)
    : categoryRows

  // Group by (service_type, network_operator) for display
  type Group = { service_type: string; network_operator: string; rows: CategoryProviderRow[] }
  const grouped: Group[] = useMemo(() => {
    const map = new Map<string, Group>()
    for (const row of filtered) {
      const key = `${row.service_type}::${row.network_operator}`
      const g = map.get(key) ?? { service_type: row.service_type, network_operator: row.network_operator ?? '', rows: [] }
      g.rows.push(row)
      map.set(key, g)
    }
    return Array.from(map.values())
  }, [filtered])

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-52">
            <Select
              value={filterService}
              onChange={(e) => setFilterService(e.target.value)}
              placeholder="All service APIs"
              options={SERVICE_TYPES.map((s) => ({ value: s, label: SERVICE_LABELS[s]?.label ?? s }))}
            />
          </div>
          <Button variant="secondary" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />}
            onClick={() => void refetch()}>Refresh</Button>
        </div>
      </div>

      <p className="text-xs text-ink-faint mb-4">
        Assign a specific provider to a group of plans sharing the same {' '}
        <span className="text-ink">operator/biller + category</span>.
        This sets <code className="font-mono text-[10px] bg-surface-2 px-1 rounded">primary_provider_code</code> on every plan in the group.
        Per-plan overrides remain possible from Service Plans.
      </p>

      {isLoading ? (
        <Card><SkeletonTable rows={6} /></Card>
      ) : grouped.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-ink-faint">
            <Layers className="h-8 w-8 opacity-30" />
            <p className="text-sm">No operator groups found{filterService ? ` for ${SERVICE_LABELS[filterService]?.label}` : ''}.</p>
            <p className="text-xs">Assign operators and categories to plans in Service Plans to see them here.</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {grouped.map((group) => {
            const cfg = SERVICE_LABELS[group.service_type]
            return (
              <div key={`${group.service_type}::${group.network_operator}`}
                className="rounded-xl border border-border bg-surface-1 overflow-hidden">
                {/* Group header */}
                <div className="flex items-center gap-2.5 px-4 py-2.5 bg-surface-2 border-b border-border">
                  <span className="text-accent">{cfg?.icon ?? <Globe className="h-4 w-4" />}</span>
                  <span className="text-sm font-semibold text-ink">{displayOp(group.network_operator)}</span>
                  <Badge variant="accent" className="text-[10px]">{cfg?.label ?? group.service_type}</Badge>
                  <span className="text-xs text-ink-faint">{cfg?.operatorLabel}</span>
                </div>
                {/* Category rows */}
                <div className="divide-y divide-border">
                  {group.rows.map((row) => (
                    <div key={`${row.network_operator}::${row.plan_category}`}
                      className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <div className="flex items-center gap-3 min-w-0">
                        <div>
                          <span className="text-sm text-ink">
                            {row.plan_category ? displayCat(row.plan_category) : `All ${displayOp(group.network_operator)}`}
                          </span>
                          <div className="text-[10px] text-ink-faint">
                            {row.plan_count} plan{row.plan_count !== 1 ? 's' : ''}
                            {!row.plan_category && ` · ${cfg?.categoryLabel?.toLowerCase() ?? 'category'}-level default`}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {row.primary_provider_code ? (
                          <div className="text-right">
                            <span className="text-xs font-mono text-ink">{row.primary_provider_code}</span>
                            {providerNameByCode[row.primary_provider_code] && (
                              <p className="text-[10px] text-ink-faint">{providerNameByCode[row.primary_provider_code]}</p>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-ink-faint italic">No override set</span>
                        )}
                        {row.fallback_provider_code && (
                          <div className="text-right">
                            <span className="text-[10px] text-ink-faint">↳ {row.fallback_provider_code}</span>
                          </div>
                        )}
                        <button
                          onClick={() => setAssignRow(row)}
                          className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs text-ink-muted hover:bg-surface-2 transition-colors"
                        >
                          <Edit className="h-3 w-3" /> Assign
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <AssignProviderModal
        open={!!assignRow}
        row={assignRow}
        onClose={() => setAssignRow(null)}
        providers={providerOptions}
        onSave={(body) => assignMutation.mutate(body)}
        isPending={assignMutation.isPending}
      />
    </>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function RoutingRulesPage() {
  const [tab, setTab] = useState<'service' | 'category'>('service')

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="API Routing"
        subtitle="Configure which provider handles each service type and operator/category group"
      />

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border">
        {([
          { value: 'service',  label: 'Service Routing',  icon: <GitBranch className="h-3.5 w-3.5" /> },
          { value: 'category', label: 'Category Routing', icon: <Layers    className="h-3.5 w-3.5" /> },
        ] as const).map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={cn(
              'inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === t.value
                ? 'border-accent text-accent'
                : 'border-transparent text-ink-muted hover:text-ink'
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'service'  && <ServiceRoutingTab />}
      {tab === 'category' && <CategoryRoutingTab />}
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-xs text-ink-faint w-36 shrink-0">{label}</span>
      <span className="text-sm text-ink text-right">{value}</span>
    </div>
  )
}
