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
import { fmtCurrency } from '@/utils/format'
import { ENDPOINTS } from '@/config/endpoints'
import type { ServicePlan, UpdateServicePlanInput } from '@/types'
import { RefreshCw, DollarSign, TrendingUp, TrendingDown, Edit } from 'lucide-react'

function errMsg(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) return err.response?.data?.error ?? err.message ?? fallback
  if (err instanceof Error) return err.message
  return fallback
}

function calcMarginPct(cost: string | null, selling: string | null): number | null {
  const c = parseFloat(cost ?? '0')
  const s = parseFloat(selling ?? '0')
  if (!c || !s || c <= 0) return null
  return ((s - c) / c) * 100
}

function MarginBadge({ cost, selling }: { cost: string | null; selling: string | null }) {
  const pct = calcMarginPct(cost, selling)
  if (pct === null) return <Badge variant="neutral">—</Badge>
  const label = `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`
  return (
    <div className="flex items-center gap-1">
      {pct >= 0
        ? <TrendingUp className="h-3 w-3 text-emerald-400" />
        : <TrendingDown className="h-3 w-3 text-rose-400" />}
      <Badge variant={pct >= 0 ? 'success' : 'danger'}>{label}</Badge>
    </div>
  )
}

// ── Inline price editor modal ─────────────────────────────────────────────────

interface PriceEditorProps {
  open: boolean
  onClose: () => void
  plan: ServicePlan | null
  onSaved: () => void
}

function PriceEditorModal({ open, onClose, plan, onSaved }: PriceEditorProps) {
  const [costPrice, setCostPrice] = useState('')
  const [sellingPrice, setSellingPrice] = useState('')

  useEffect(() => {
    if (open && plan) {
      setCostPrice(plan.cost_price ?? '')
      setSellingPrice(plan.selling_price ?? '')
    }
  }, [open, plan])

  const c = parseFloat(costPrice || '0')
  const s = parseFloat(sellingPrice || '0')
  const pct = c > 0 && s > 0 ? ((s - c) / c) * 100 : null
  const marginLabel = pct !== null
    ? `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}% margin`
    : 'Enter both prices to see margin'

  const mutation = useMutation({
    mutationFn: (body: UpdateServicePlanInput) => catalogApi.updateServicePlan(plan!.id, body),
    onSuccess: () => {
      toast.success('Pricing updated')
      onSaved()
      onClose()
      setCostPrice('')
      setSellingPrice('')
    },
    onError: (err) => toast.error(errMsg(err, 'Failed to update pricing')),
  })

  function handleClose() {
    setCostPrice('')
    setSellingPrice('')
    onClose()
  }

  function handleSave() {
    mutation.mutate({
      cost_price: costPrice !== '' ? parseFloat(costPrice) : null,
      selling_price: sellingPrice !== '' ? parseFloat(sellingPrice) : null,
    })
  }

  if (!plan) return null

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Edit Pricing"
      subtitle={plan.name}
      size="sm"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={handleClose} disabled={mutation.isPending}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={handleSave} disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Save Prices'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-border bg-surface-2 p-3 text-xs text-ink-muted space-y-1">
          <div>Provider: <span className="font-mono text-ink">{plan.provider_code}</span></div>
          <div>Base amount: <span className="font-medium text-ink">{fmtCurrency(plan.amount)}</span></div>
          <div>Variation: <span className="font-mono text-ink">{plan.variation_code}</span></div>
        </div>

        <Input
          label="Cost Price (₦)"
          type="number"
          min={0}
          step="0.01"
          value={costPrice}
          onChange={(e) => setCostPrice(e.target.value)}
          hint="What you pay the provider"
        />
        <Input
          label="Selling Price (₦)"
          type="number"
          min={0}
          step="0.01"
          value={sellingPrice}
          onChange={(e) => setSellingPrice(e.target.value)}
          hint="What users pay"
        />

        <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
          pct === null ? 'border-border text-ink-faint' :
          pct >= 0 ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-400' :
          'border-rose-500/30 bg-rose-500/5 text-rose-400'
        }`}>
          {pct !== null
            ? (pct >= 0 ? <TrendingUp className="h-4 w-4 shrink-0" /> : <TrendingDown className="h-4 w-4 shrink-0" />)
            : <DollarSign className="h-4 w-4 shrink-0" />}
          <span>{marginLabel}</span>
        </div>
      </div>
    </Modal>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function PricingPage() {
  const qc = useQueryClient()
  const [filterServiceId, setFilterServiceId] = useState('')
  const [filterProvider, setFilterProvider] = useState('')
  const [pricingFilter, setPricingFilter] = useState<'all' | 'priced' | 'unpriced'>('all')
  const [search, setSearch] = useState('')
  const [editPlan, setEditPlan] = useState<ServicePlan | null>(null)

  const { data: services = [] } = useQuery({
    queryKey: ['admin-services'],
    queryFn: () => catalogApi.listServices(),
  })

  const queryParams = {
    service_id: filterServiceId || undefined,
    provider_code: filterProvider || undefined,
    search: search.trim() || undefined,
    is_active: true,
  }

  const { data: allPlans = [], isLoading, error, refetch } = useQuery({
    queryKey: ['admin-service-plans-pricing', queryParams],
    queryFn: () => catalogApi.listServicePlans(queryParams),
  })

  const data = useMemo(() => {
    if (pricingFilter === 'priced') return allPlans.filter((p) => p.cost_price && p.selling_price)
    if (pricingFilter === 'unpriced') return allPlans.filter((p) => !p.cost_price || !p.selling_price)
    return allPlans
  }, [allPlans, pricingFilter])

  const providerCodes = useMemo(() => {
    const codes = new Set(allPlans.map((p) => p.provider_code))
    return [
      { value: '', label: 'All providers' },
      ...Array.from(codes).sort().map((c) => ({ value: c, label: c })),
    ]
  }, [allPlans])

  const serviceOptions = [
    { value: '', label: 'All services' },
    ...services.map((s) => ({ value: s.id, label: s.name })),
  ]

  const avgMargin = useMemo(() => {
    const priced = data.filter((p) => p.cost_price && p.selling_price)
    if (!priced.length) return null
    const sum = priced.reduce((acc, p) => {
      const m = calcMarginPct(p.cost_price, p.selling_price)
      return acc + (m ?? 0)
    }, 0)
    return sum / priced.length
  }, [data])

  const handleSaved = () => {
    qc.invalidateQueries({ queryKey: ['admin-service-plans-pricing'] })
    qc.invalidateQueries({ queryKey: ['admin-service-plans'] })
  }

  if (error) {
    return <ErrorMessage error={error} onRetry={() => void refetch()} endpoint={ENDPOINTS.adminServicePlans.path} />
  }

  const hasFilters = !!(filterServiceId || filterProvider || search || pricingFilter !== 'all')

  const columns = [
    {
      key: 'plan',
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
      header: 'Service / Provider',
      render: (p: ServicePlan) => (
        <div>
          <div className="text-sm text-ink">{p.service_name}</div>
          <Badge variant="neutral" className="font-mono text-[10px]">{p.provider_code}</Badge>
        </div>
      ),
    },
    {
      key: 'base',
      header: 'Base Amount',
      align: 'right' as const,
      render: (p: ServicePlan) => (
        <span className="text-sm text-ink-muted">{fmtCurrency(p.amount)}</span>
      ),
    },
    {
      key: 'cost',
      header: 'Cost Price',
      align: 'right' as const,
      render: (p: ServicePlan) => (
        <span className={`text-sm ${p.cost_price ? 'text-ink' : 'text-ink-faint italic'}`}>
          {p.cost_price ? fmtCurrency(p.cost_price) : 'Not set'}
        </span>
      ),
    },
    {
      key: 'selling',
      header: 'Selling Price',
      align: 'right' as const,
      render: (p: ServicePlan) => (
        <span className={`text-sm ${p.selling_price ? 'text-ink' : 'text-ink-faint italic'}`}>
          {p.selling_price ? fmtCurrency(p.selling_price) : 'Not set'}
        </span>
      ),
    },
    {
      key: 'margin',
      header: 'Margin',
      align: 'right' as const,
      render: (p: ServicePlan) => <MarginBadge cost={p.cost_price} selling={p.selling_price} />,
    },
    {
      key: 'actions',
      header: '',
      align: 'right' as const,
      render: (p: ServicePlan) => (
        <Button
          variant="ghost"
          size="xs"
          icon={<Edit className="h-3.5 w-3.5" />}
          onClick={(e) => { e.stopPropagation(); setEditPlan(p) }}
          title="Edit pricing"
        />
      ),
    },
  ]

  const unpriced = allPlans.filter((p) => !p.cost_price || !p.selling_price).length

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Pricing"
        subtitle="Service pricing, margins and fee configuration — active plans only"
        actions={
          <Button variant="secondary" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />}
            onClick={() => void refetch()}>
            Refresh
          </Button>
        }
      />

      {/* Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-3 flex flex-col gap-0.5">
          <span className="text-[11px] text-ink-faint uppercase tracking-wide">Active Plans</span>
          <span className="text-xl font-semibold text-ink">{allPlans.length}</span>
        </Card>
        <Card className="p-3 flex flex-col gap-0.5">
          <span className="text-[11px] text-ink-faint uppercase tracking-wide">Priced</span>
          <span className="text-xl font-semibold text-emerald-400">
            {allPlans.filter((p) => p.cost_price && p.selling_price).length}
          </span>
        </Card>
        <Card className="p-3 flex flex-col gap-0.5">
          <span className="text-[11px] text-ink-faint uppercase tracking-wide">Unpriced</span>
          <span className={`text-xl font-semibold ${unpriced > 0 ? 'text-amber-400' : 'text-ink'}`}>{unpriced}</span>
        </Card>
        <Card className="p-3 flex flex-col gap-0.5">
          <span className="text-[11px] text-ink-faint uppercase tracking-wide">Avg Margin</span>
          <span className={`text-xl font-semibold ${
            avgMargin === null ? 'text-ink-faint' :
            avgMargin >= 0 ? 'text-emerald-400' : 'text-rose-400'
          }`}>
            {avgMargin !== null ? `${avgMargin >= 0 ? '+' : ''}${avgMargin.toFixed(1)}%` : '—'}
          </span>
        </Card>
      </div>

      {unpriced > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-400">
          <TrendingDown className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{unpriced} plan{unpriced > 1 ? 's' : ''} without pricing set — transactions on these plans will use the base amount.</span>
        </div>
      )}

      <FilterBar>
        <div className="flex-1 min-w-[200px] max-w-sm">
          <Input
            placeholder="Search plan name or code…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          value={filterServiceId}
          onChange={(e) => setFilterServiceId(e.target.value)}
          options={serviceOptions}
          className="w-44"
        />
        <Select
          value={filterProvider}
          onChange={(e) => setFilterProvider(e.target.value)}
          options={providerCodes}
          className="w-40"
        />
        <Select
          value={pricingFilter}
          onChange={(e) => setPricingFilter(e.target.value as typeof pricingFilter)}
          options={[
            { value: 'all', label: 'All plans' },
            { value: 'priced', label: 'Priced only' },
            { value: 'unpriced', label: 'Unpriced only' },
          ]}
          className="w-36"
        />
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={() => {
            setSearch(''); setFilterServiceId(''); setFilterProvider(''); setPricingFilter('all')
          }}>
            Clear
          </Button>
        )}
      </FilterBar>

      <Card>
        {isLoading ? (
          <SkeletonTable rows={8} />
        ) : (
          <DataTable
            columns={columns}
            data={data}
            rowKey={(p) => p.id}
            onRowClick={(p) => setEditPlan(p)}
            emptyMessage={hasFilters ? 'No plans match the current filters.' : 'No active plans found.'}
          />
        )}
      </Card>

      <PriceEditorModal
        open={!!editPlan}
        onClose={() => setEditPlan(null)}
        plan={editPlan}
        onSaved={handleSaved}
      />
    </div>
  )
}
