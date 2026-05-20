import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import axios from 'axios'
import { availabilityApi } from '@/api/availability.api'
import { PageHeader } from '@/components/shared/PageHeader'
import { ErrorMessage } from '@/components/shared/ErrorMessage'
import { Button, Badge, Modal, Card, Select } from '@/components/ui'
import { SkeletonTable } from '@/components/ui/Skeleton'
import {
  ToggleLeft, ToggleRight, RefreshCw, AlertTriangle, ShieldOff,
  Globe, Wifi, Phone, Zap, Tv, BookOpen, Fingerprint, ChevronDown, ChevronUp,
} from 'lucide-react'
import type { GroupSummaryRow, ServiceType } from '@/types'
import { cn } from '@/utils/cn'

// ── Service config ─────────────────────────────────────────────────────────────

interface ServiceConfig {
  label: string
  operatorLabel: string
  categoryLabel: string
  icon: React.ReactNode
}

const SERVICE_CONFIG: Record<string, ServiceConfig> = {
  data: {
    label: 'Data',
    operatorLabel: 'Network',
    categoryLabel: 'Package Type',
    icon: <Wifi className="h-4 w-4" />,
  },
  airtime: {
    label: 'Airtime',
    operatorLabel: 'Network',
    categoryLabel: 'Airtime Type',
    icon: <Phone className="h-4 w-4" />,
  },
  electricity: {
    label: 'Electricity',
    operatorLabel: 'DISCO',
    categoryLabel: 'Meter Type',
    icon: <Zap className="h-4 w-4" />,
  },
  cable_tv: {
    label: 'Cable TV',
    operatorLabel: 'Biller',
    categoryLabel: 'Package',
    icon: <Tv className="h-4 w-4" />,
  },
  exam_pin: {
    label: 'Exam PIN',
    operatorLabel: 'Exam Body',
    categoryLabel: 'PIN Type',
    icon: <BookOpen className="h-4 w-4" />,
  },
  identity_verification: {
    label: 'Identity',
    operatorLabel: 'Verification Type',
    categoryLabel: 'Tier',
    icon: <Fingerprint className="h-4 w-4" />,
  },
}

const SERVICE_TABS = [
  { value: '', label: 'All' },
  { value: 'data', label: 'Data' },
  { value: 'airtime', label: 'Airtime' },
  { value: 'electricity', label: 'Electricity' },
  { value: 'cable_tv', label: 'Cable TV' },
  { value: 'exam_pin', label: 'Exam PIN' },
  { value: 'identity_verification', label: 'Identity' },
]

// Friendly display names for operator/biller codes
const OPERATOR_DISPLAY: Record<string, string> = {
  mtn: 'MTN', airtel: 'Airtel', glo: 'Glo', '9mobile': '9mobile',
  dstv: 'DStv', gotv: 'GOtv', startimes: 'StarTimes',
  ekedc: 'EKEDC', ikedc: 'IKEDC', aedc: 'AEDC', phed: 'PHED', kedco: 'KEDCO',
  waec: 'WAEC', neco: 'NECO', jamb: 'JAMB',
  nin: 'NIN', bvn: 'BVN',
}

function displayOperator(code: string): string {
  return OPERATOR_DISPLAY[code.toLowerCase()] ?? code.toUpperCase()
}

function displayCategory(category: string): string {
  const map: Record<string, string> = {
    sme: 'SME', corporate: 'Corporate', gifting: 'Gifting', direct: 'Direct',
    dnd: 'DND', social: 'Social', vtu: 'VTU',
    prepaid: 'Prepaid', postpaid: 'Postpaid',
    compact: 'Compact', premium: 'Premium', yanga: 'Yanga',
    jolli: 'Jolli', max: 'Max', basic: 'Basic', classic: 'Classic',
    result_checker: 'Result Checker', registration: 'Registration PIN',
    token: 'Token', epin: 'ePIN',
    nin_basic: 'NIN Basic', nin_premium: 'NIN Premium',
    bvn_basic: 'BVN Basic', bvn_premium: 'BVN Premium',
    recharge_card: 'Recharge Card', share_sell: 'Share & Sell',
  }
  return map[category.toLowerCase()] ?? category.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function errMsg(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) return err.response?.data?.error ?? err.message ?? fallback
  if (err instanceof Error) return err.message
  return fallback
}

// ── Data grouping ──────────────────────────────────────────────────────────────

interface OperatorCard {
  service_type: string
  network_operator: string
  overallRow: GroupSummaryRow   // plan_category === null
  categoryRows: GroupSummaryRow[]
}

function buildOperatorCards(rows: GroupSummaryRow[]): OperatorCard[] {
  const map = new Map<string, OperatorCard>()
  // First pass: collect operator-level rows
  for (const row of rows) {
    if (row.plan_category === null) {
      const key = `${row.service_type}::${row.network_operator}`
      map.set(key, { service_type: row.service_type, network_operator: row.network_operator, overallRow: row, categoryRows: [] })
    }
  }
  // Second pass: attach category rows
  for (const row of rows) {
    if (row.plan_category !== null) {
      const key = `${row.service_type}::${row.network_operator}`
      const card = map.get(key)
      if (card) {
        card.categoryRows.push(row)
      } else {
        // Category exists without operator-level row — synthesize a card
        const synthetic: GroupSummaryRow = {
          service_type: row.service_type,
          network_operator: row.network_operator,
          plan_category: null,
          plan_count: row.plan_count,
          active_plan_count: row.active_plan_count,
          is_active: true,
          reason: null,
          control_id: null,
        }
        map.set(key, { service_type: row.service_type, network_operator: row.network_operator, overallRow: synthetic, categoryRows: [row] })
      }
    }
  }
  return Array.from(map.values())
}

// ── Confirm toggle modal ───────────────────────────────────────────────────────

interface ConfirmToggleProps {
  open: boolean
  row: GroupSummaryRow | null
  onClose: () => void
  onConfirm: (reason: string) => void
  isPending: boolean
}

function ConfirmToggleModal({ open, row, onClose, onConfirm, isPending }: ConfirmToggleProps) {
  const [reason, setReason] = useState('')
  const targetActive = row ? !row.is_active : true
  const cfg = row ? SERVICE_CONFIG[row.service_type] : null
  const opLabel = cfg?.operatorLabel ?? 'Operator'
  const catLabel = cfg?.categoryLabel ?? 'Category'
  const scope = row?.plan_category ? catLabel : opLabel
  const label = row
    ? row.plan_category
      ? `${displayOperator(row.network_operator)} — ${displayCategory(row.plan_category)}`
      : `${displayOperator(row.network_operator)} (all ${row.service_type.replace('_', ' ')})`
    : ''

  function handleConfirm() { onConfirm(reason); setReason('') }
  function handleClose()   { setReason(''); onClose() }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={`${targetActive ? 'Enable' : 'Disable'} ${scope}`}
      subtitle={label}
      size="sm"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={handleClose} disabled={isPending}>Cancel</Button>
          <Button
            variant={targetActive ? 'primary' : 'danger'}
            size="sm"
            onClick={handleConfirm}
            disabled={isPending || (!targetActive && reason.trim().length < 3)}
          >
            {isPending ? 'Applying…' : (targetActive ? 'Enable' : 'Disable')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {!targetActive && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-xs text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              {row?.plan_category
                ? `Disabling this ${catLabel.toLowerCase()} will block all plans in this group immediately for customers.`
                : `Disabling this ${opLabel.toLowerCase()} blocks all plans under it, overriding any per-category settings.`}
            </span>
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1.5">
            Reason {!targetActive && <span className="text-rose-400">*</span>}
            {targetActive && <span className="text-ink-faint ml-1">(optional)</span>}
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder={targetActive ? 'e.g. Service restored' : 'e.g. Provider maintenance'}
            className="w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent resize-none"
          />
        </div>
      </div>
    </Modal>
  )
}

// ── Manual add control modal ───────────────────────────────────────────────────

const OPERATOR_OPTIONS = [
  { value: 'mtn', label: 'MTN' }, { value: 'airtel', label: 'Airtel' },
  { value: 'glo', label: 'Glo' }, { value: '9mobile', label: '9mobile' },
  { value: 'dstv', label: 'DStv' }, { value: 'gotv', label: 'GOtv' }, { value: 'startimes', label: 'StarTimes' },
  { value: 'ekedc', label: 'EKEDC' }, { value: 'ikedc', label: 'IKEDC' }, { value: 'aedc', label: 'AEDC' },
  { value: 'phed', label: 'PHED' }, { value: 'kedco', label: 'KEDCO' },
  { value: 'waec', label: 'WAEC' }, { value: 'neco', label: 'NECO' }, { value: 'jamb', label: 'JAMB' },
  { value: 'nin', label: 'NIN' }, { value: 'bvn', label: 'BVN' },
]

const CATEGORY_OPTIONS = [
  { value: 'sme', label: 'SME' }, { value: 'corporate', label: 'Corporate' },
  { value: 'gifting', label: 'Gifting' }, { value: 'direct', label: 'Direct' },
  { value: 'vtu', label: 'VTU' }, { value: 'share_sell', label: 'Share & Sell' },
  { value: 'recharge_card', label: 'Recharge Card' },
  { value: 'prepaid', label: 'Prepaid' }, { value: 'postpaid', label: 'Postpaid' },
  { value: 'compact', label: 'Compact' }, { value: 'premium', label: 'Premium' },
  { value: 'yanga', label: 'Yanga' }, { value: 'jolli', label: 'Jolli' },
  { value: 'max', label: 'Max' }, { value: 'basic', label: 'Basic' }, { value: 'classic', label: 'Classic' },
  { value: 'result_checker', label: 'Result Checker' }, { value: 'registration', label: 'Registration PIN' },
  { value: 'token', label: 'Token' }, { value: 'epin', label: 'ePIN' },
]

function AddControlModal({ open, onClose, serviceTypeFilter }: { open: boolean; onClose: () => void; serviceTypeFilter: string }) {
  const qc = useQueryClient()
  const [serviceType, setServiceType] = useState(serviceTypeFilter || 'data')
  const [operator, setOperator] = useState('')
  const [category, setCategory] = useState('')
  const [reason, setReason] = useState('')
  const cfg = SERVICE_CONFIG[serviceType]

  const mutation = useMutation({
    mutationFn: () => availabilityApi.toggleGroup({
      service_type: serviceType as ServiceType,
      network_operator: operator,
      plan_category: category || null,
      is_active: false,
      reason: reason || null,
    }),
    onSuccess: () => {
      toast.success('Group disabled')
      qc.invalidateQueries({ queryKey: ['service-availability-groups'] })
      onClose()
      setOperator(''); setCategory(''); setReason('')
    },
    onError: (err) => toast.error(errMsg(err, 'Failed to add control')),
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Disable Group"
      subtitle="Immediately block customer transactions for an operator or category"
      size="sm"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={mutation.isPending}>Cancel</Button>
          <Button variant="danger" size="sm" onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !operator.trim()}>
            {mutation.isPending ? 'Adding…' : 'Disable Group'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Select label="Service Type" value={serviceType} onChange={(e) => setServiceType(e.target.value)}
          options={SERVICE_TABS.filter((t) => t.value).map((t) => ({ value: t.value, label: t.label }))} />
        <Select label={cfg?.operatorLabel ?? 'Operator / Biller'} value={operator}
          onChange={(e) => setOperator(e.target.value)}
          options={[{ value: '', label: `Select ${cfg?.operatorLabel ?? 'operator'}…` }, ...OPERATOR_OPTIONS]} />
        <Select label={`${cfg?.categoryLabel ?? 'Category'} (optional — leave blank for all)`} value={category}
          onChange={(e) => setCategory(e.target.value)}
          options={[{ value: '', label: `All (${cfg?.operatorLabel ?? 'operator'}-level)` }, ...CATEGORY_OPTIONS]} />
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1.5">Reason <span className="text-rose-400">*</span></label>
          <input type="text" value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Scheduled maintenance"
            className="w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent" />
        </div>
      </div>
    </Modal>
  )
}

// ── Operator card ──────────────────────────────────────────────────────────────

interface RowControlProps {
  row: GroupSummaryRow
  parentDisabled: boolean
  onToggle: (row: GroupSummaryRow) => void
  isPending: boolean
}

function RowControl({ row, parentDisabled, onToggle, isPending }: RowControlProps) {
  const isBlocked = parentDisabled && row.plan_category !== null
  const effectivelyDisabled = !row.is_active || isBlocked

  return (
    <div className={cn(
      'flex items-center justify-between gap-3 py-2 px-3 rounded-lg',
      row.plan_category ? 'ml-4 bg-surface-2/40' : 'bg-surface-2',
    )}>
      <div className="flex items-center gap-2 min-w-0">
        {row.plan_category === null ? (
          <span className="text-sm font-medium text-ink">
            All {displayOperator(row.network_operator)}
          </span>
        ) : (
          <span className="text-sm text-ink-muted">{displayCategory(row.plan_category)}</span>
        )}
        <span className="text-xs text-ink-faint shrink-0">
          {row.plan_count} plan{row.plan_count !== 1 ? 's' : ''}
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {isBlocked && row.is_active && (
          <Badge variant="warning" className="text-[10px]">Blocked by parent</Badge>
        )}
        {!row.is_active && !isBlocked && (
          <div className="flex items-center gap-1">
            <Badge variant="danger" className="text-[10px]">Disabled</Badge>
            {row.reason && (
              <span className="text-[10px] text-ink-faint truncate max-w-[100px]" title={row.reason}>
                {row.reason}
              </span>
            )}
          </div>
        )}
        {effectivelyDisabled && !isBlocked ? (
          <button
            onClick={() => onToggle(row)}
            disabled={isPending}
            className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-40"
          >
            <ToggleLeft className="h-3.5 w-3.5" /> Enable
          </button>
        ) : (
          <button
            onClick={() => onToggle(row)}
            disabled={isPending || isBlocked}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-ink-muted hover:bg-surface-3 transition-colors disabled:opacity-40"
            title={isBlocked ? 'Enable parent operator first' : 'Disable'}
          >
            <ToggleRight className="h-3.5 w-3.5 text-emerald-400" /> Disable
          </button>
        )}
      </div>
    </div>
  )
}

interface OperatorCardProps {
  card: OperatorCard
  onToggle: (row: GroupSummaryRow) => void
  isPending: boolean
}

function OperatorCardView({ card, onToggle, isPending }: OperatorCardProps) {
  const [expanded, setExpanded] = useState(true)
  const cfg = SERVICE_CONFIG[card.service_type]
  const { overallRow, categoryRows } = card
  const operatorDisabled = !overallRow.is_active
  const disabledCategories = categoryRows.filter((r) => !r.is_active).length

  return (
    <div className={cn(
      'rounded-xl border bg-surface-1 overflow-hidden',
      operatorDisabled ? 'border-rose-500/30' : 'border-border'
    )}>
      {/* Card header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className={cn(
            'h-8 w-8 rounded-lg flex items-center justify-center shrink-0',
            operatorDisabled ? 'bg-rose-500/10 text-rose-400' : 'bg-accent/10 text-accent'
          )}>
            {cfg?.icon ?? <Globe className="h-4 w-4" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-ink">{displayOperator(card.network_operator)}</span>
              <Badge variant="neutral" className="text-[10px] capitalize">
                {cfg?.operatorLabel ?? 'Operator'}
              </Badge>
              {operatorDisabled && (
                <Badge variant="danger" className="text-[10px]">
                  <ShieldOff className="h-2.5 w-2.5 mr-0.5" /> Disabled
                </Badge>
              )}
              {!operatorDisabled && disabledCategories > 0 && (
                <Badge variant="warning" className="text-[10px]">
                  {disabledCategories} category{disabledCategories > 1 ? 's' : ''} blocked
                </Badge>
              )}
            </div>
            <p className="text-[11px] text-ink-faint mt-0.5">
              {overallRow.plan_count} total plan{overallRow.plan_count !== 1 ? 's' : ''}
              {categoryRows.length > 0 && ` · ${categoryRows.length} ${cfg?.categoryLabel?.toLowerCase() ?? 'category'} group${categoryRows.length > 1 ? 's' : ''}`}
            </p>
          </div>
        </div>
        <button
          onClick={() => setExpanded((e) => !e)}
          className="text-ink-faint hover:text-ink transition-colors"
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {/* Rows */}
      {expanded && (
        <div className="p-3 space-y-1.5">
          <RowControl row={overallRow} parentDisabled={false} onToggle={onToggle} isPending={isPending} />
          {categoryRows.map((cat) => (
            <RowControl
              key={cat.plan_category}
              row={cat}
              parentDisabled={operatorDisabled}
              onToggle={onToggle}
              isPending={isPending}
            />
          ))}
          {categoryRows.length === 0 && (
            <p className="text-xs text-ink-faint px-3 py-1 italic">
              No {cfg?.categoryLabel?.toLowerCase() ?? 'category'} groups found.
              Assign a {cfg?.categoryLabel?.toLowerCase() ?? 'category'} to plans in Service Plans to see them here.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Service section (used in "All" view) ──────────────────────────────────────

function ServiceSection({
  serviceType, cards, onToggle, isPending,
}: {
  serviceType: string
  cards: OperatorCard[]
  onToggle: (row: GroupSummaryRow) => void
  isPending: boolean
}) {
  const [collapsed, setCollapsed] = useState(false)
  const cfg = SERVICE_CONFIG[serviceType]
  const disabledCards = cards.filter((c) => !c.overallRow.is_active).length

  return (
    <div>
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="flex items-center gap-2 w-full text-left mb-3 group"
      >
        <div className="h-6 w-6 rounded-md bg-surface-2 flex items-center justify-center text-accent shrink-0">
          {cfg?.icon ?? <Globe className="h-3.5 w-3.5" />}
        </div>
        <span className="text-sm font-semibold text-ink">{cfg?.label ?? serviceType}</span>
        <Badge variant="neutral" className="text-[10px]">{cards.length} {cfg?.operatorLabel?.toLowerCase() ?? 'operator'}{cards.length !== 1 ? 's' : ''}</Badge>
        {disabledCards > 0 && <Badge variant="danger" className="text-[10px]">{disabledCards} disabled</Badge>}
        <div className="ml-auto text-ink-faint group-hover:text-ink transition-colors">
          {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
        </div>
      </button>
      {!collapsed && (
        <div className="grid gap-3 sm:grid-cols-1 lg:grid-cols-2">
          {cards.map((card) => (
            <OperatorCardView
              key={`${card.service_type}::${card.network_operator}`}
              card={card}
              onToggle={onToggle}
              isPending={isPending}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function ServiceAvailabilityPage() {
  const qc = useQueryClient()
  const [serviceTypeTab, setServiceTypeTab] = useState('')
  const [confirmRow, setConfirmRow] = useState<GroupSummaryRow | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  const { data: rows = [], isLoading, error, refetch } = useQuery({
    queryKey: ['service-availability-groups', serviceTypeTab],
    queryFn: () => availabilityApi.listGroups(serviceTypeTab ? { service_type: serviceTypeTab } : undefined),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ row, reason }: { row: GroupSummaryRow; reason: string }) =>
      availabilityApi.toggleGroup({
        service_type: row.service_type as ServiceType,
        network_operator: row.network_operator,
        plan_category: row.plan_category ?? null,
        is_active: !row.is_active,
        reason: reason || null,
      }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['service-availability-groups'] })
      const verb = !vars.row.is_active ? 'enabled' : 'disabled'
      const label = vars.row.plan_category
        ? `${displayOperator(vars.row.network_operator)} / ${displayCategory(vars.row.plan_category)}`
        : displayOperator(vars.row.network_operator)
      toast.success(`${label} ${verb}`)
      setConfirmRow(null)
    },
    onError: (err) => toast.error(errMsg(err, 'Failed to update')),
  })

  const allCards = useMemo(() => buildOperatorCards(rows), [rows])

  const stats = useMemo(() => {
    const operators = allCards.length
    const categories = allCards.reduce((s, c) => s + c.categoryRows.length, 0)
    const disabledOps = allCards.filter((c) => !c.overallRow.is_active).length
    const disabledCats = allCards.reduce((s, c) => s + c.categoryRows.filter((r) => !r.is_active).length, 0)
    return { operators, categories, disabledOps, disabledCats }
  }, [allCards])

  if (error) {
    return (
      <ErrorMessage
        error={error}
        onRetry={() => void refetch()}
        endpoint="/admin/service-availability/groups"
      />
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Service Availability"
        subtitle="Control which operators, billers, and categories are available to customers"
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />}
              onClick={() => void refetch()}>Refresh</Button>
            <Button variant="danger" size="sm" icon={<ShieldOff className="h-3.5 w-3.5" />}
              onClick={() => setAddOpen(true)}>
              Disable Group
            </Button>
          </div>
        }
      />

      {/* Info banner */}
      <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
        <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
        <p className="text-xs text-amber-300">
          Disabling an operator/biller immediately blocks all customer transactions for every plan under it.
          Disabling a category (e.g. MTN SME, AEDC Prepaid) only blocks plans with that exact combination.
          Individual plan toggles on the Service Plans page remain independent.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Operators / Billers', value: stats.operators },
          { label: 'Category Groups', value: stats.categories },
          { label: 'Disabled Operators', value: stats.disabledOps, alert: true },
          { label: 'Disabled Categories', value: stats.disabledCats, alert: true },
        ].map(({ label, value, alert }) => (
          <Card key={label} className="p-3 flex flex-col gap-0.5">
            <span className="text-[11px] text-ink-faint uppercase tracking-wide">{label}</span>
            <span className={cn('text-xl font-semibold', alert && value > 0 ? 'text-rose-400' : 'text-ink')}>
              {value}
            </span>
          </Card>
        ))}
      </div>

      {/* Service type tabs */}
      <div className="flex flex-wrap gap-1.5">
        {SERVICE_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setServiceTypeTab(tab.value)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
              serviceTypeTab === tab.value
                ? 'bg-accent text-white'
                : 'bg-surface-2 text-ink-muted hover:text-ink hover:bg-surface-3'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {isLoading ? (
        <Card><SkeletonTable rows={6} /></Card>
      ) : allCards.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-ink-faint">
            <Globe className="h-10 w-10 opacity-30" />
            <p className="text-sm font-medium text-ink">
              {serviceTypeTab
                ? `No ${SERVICE_CONFIG[serviceTypeTab]?.operatorLabel ?? 'operator'} groups for ${SERVICE_CONFIG[serviceTypeTab]?.label ?? serviceTypeTab}`
                : 'No operator groups found'}
            </p>
            <p className="text-xs text-center max-w-sm">
              {serviceTypeTab
                ? `Assign a ${SERVICE_CONFIG[serviceTypeTab]?.operatorLabel?.toLowerCase() ?? 'operator'} to plans under the ${SERVICE_CONFIG[serviceTypeTab]?.label ?? serviceTypeTab} service in Service Plans, then come back here to manage availability.`
                : 'Assign operators or billers to service plans in the Service Plans page to see them here.'}
            </p>
          </div>
        </Card>
      ) : serviceTypeTab ? (
        // Single service type: show cards in a 2-col grid
        <div className="grid gap-3 sm:grid-cols-1 lg:grid-cols-2">
          {allCards.map((card) => (
            <OperatorCardView
              key={`${card.service_type}::${card.network_operator}`}
              card={card}
              onToggle={setConfirmRow}
              isPending={toggleMutation.isPending}
            />
          ))}
        </div>
      ) : (
        // All services: group by service type with collapsible sections
        <div className="space-y-6">
          {(() => {
            const byType = new Map<string, OperatorCard[]>()
            for (const card of allCards) {
              const list = byType.get(card.service_type) ?? []
              list.push(card)
              byType.set(card.service_type, list)
            }
            return Array.from(byType.entries()).map(([st, cards]) => (
              <ServiceSection
                key={st}
                serviceType={st}
                cards={cards}
                onToggle={setConfirmRow}
                isPending={toggleMutation.isPending}
              />
            ))
          })()}
        </div>
      )}

      <ConfirmToggleModal
        open={!!confirmRow}
        row={confirmRow}
        onClose={() => setConfirmRow(null)}
        onConfirm={(reason) => { if (confirmRow) toggleMutation.mutate({ row: confirmRow, reason }) }}
        isPending={toggleMutation.isPending}
      />

      <AddControlModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        serviceTypeFilter={serviceTypeTab}
      />
    </div>
  )
}
