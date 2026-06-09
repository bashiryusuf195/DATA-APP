import { useState } from 'react'
import { ChevronDown, ChevronUp, AlertTriangle, Clock, WifiOff } from 'lucide-react'
import { useServiceStatus } from '@/hooks/useServiceStatus'
import type { ServiceStatusRow, ServiceStatusValue } from '@/api/service-status.api'
import { cn } from '@/utils/cn'

// ── Status display config ─────────────────────────────────────────────────────

const STATUS_CFG: Record<ServiceStatusValue, { dot: string; label: string; bannerBg: string; bannerBorder: string }> = {
  available:   { dot: 'bg-emerald-500', label: 'Available',   bannerBg: '',                                                          bannerBorder: '' },
  delayed:     { dot: 'bg-amber-500',   label: 'Delayed',     bannerBg: 'bg-amber-50 dark:bg-amber-950/50',                          bannerBorder: 'border-amber-200 dark:border-amber-800/50' },
  maintenance: { dot: 'bg-red-500',     label: 'Maintenance', bannerBg: 'bg-red-50 dark:bg-red-950/50',                              bannerBorder: 'border-red-200 dark:border-red-800/50' },
  unavailable: { dot: 'bg-slate-500',   label: 'Unavailable', bannerBg: 'bg-slate-100 dark:bg-slate-900/60',                         bannerBorder: 'border-slate-200 dark:border-slate-700/50' },
}

// Pick the "worst" status to determine overall banner colour
const STATUS_SEVERITY: Record<ServiceStatusValue, number> = {
  available: 0, delayed: 1, maintenance: 2, unavailable: 3,
}

function worstStatus(rows: ServiceStatusRow[]): ServiceStatusValue {
  return rows.reduce<ServiceStatusValue>((acc, r) => {
    return STATUS_SEVERITY[r.status] > STATUS_SEVERITY[acc] ? r.status : acc
  }, 'available')
}

function formatMaintenanceTime(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ── Pill for each affected service ───────────────────────────────────────────

function ServicePill({ row }: { row: ServiceStatusRow }) {
  const cfg = STATUS_CFG[row.status]
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 bg-white/60 dark:bg-black/20 border border-black/5 dark:border-white/10 text-[11px] font-semibold text-ink">
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot} ${row.status === 'delayed' ? 'animate-pulse' : ''}`} />
      {row.service_name}
      <span className="text-ink-faint font-normal">·</span>
      <span className="font-normal text-ink-muted">{cfg.label}</span>
    </span>
  )
}

// ── Detail row (expanded view) ────────────────────────────────────────────────

function DetailRow({ row }: { row: ServiceStatusRow }) {
  const cfg = STATUS_CFG[row.status]
  const start = formatMaintenanceTime(row.maintenance_start)
  const end   = formatMaintenanceTime(row.maintenance_end)

  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-black/5 dark:border-white/10 last:border-0">
      <span className={`mt-1 h-2 w-2 rounded-full ${cfg.dot} shrink-0`} />
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-semibold text-ink leading-none">{row.service_name}</p>
        {row.message && (
          <p className="text-[11px] text-ink-muted mt-0.5">{row.message}</p>
        )}
        {row.status === 'maintenance' && start && (
          <p className="text-[10px] text-ink-faint mt-1 flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {start}{end ? ` – ${end}` : ''}
          </p>
        )}
      </div>
      <span className="text-[11px] font-medium text-ink-faint shrink-0">{cfg.label}</span>
    </div>
  )
}

// ── Main banner ───────────────────────────────────────────────────────────────

export function ServiceStatusBanner() {
  const { data } = useServiceStatus()
  const [expanded, setExpanded] = useState(false)

  if (!data) return null

  const affected = data.filter((r) => r.status !== 'available')
  if (affected.length === 0) return null

  const worst     = worstStatus(affected)
  const cfg       = STATUS_CFG[worst]
  const hasDelayed     = affected.some((r) => r.status === 'delayed')
  const hasMaintenance = affected.some((r) => r.status === 'maintenance')
  const hasUnavailable = affected.some((r) => r.status === 'unavailable')

  let Icon = AlertTriangle
  let headline = 'Service disruption'
  if (hasMaintenance && !hasUnavailable) { Icon = WifiOff; headline = 'Scheduled maintenance' }
  else if (hasDelayed && !hasMaintenance && !hasUnavailable) { Icon = Clock; headline = 'Service delays' }

  return (
    <div className={cn(
      'rounded-2xl border overflow-hidden',
      cfg.bannerBg,
      cfg.bannerBorder || 'border-border',
    )}>
      {/* Collapsed header — always visible */}
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
      >
        <Icon className="h-4 w-4 shrink-0 text-ink-muted" />
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-bold text-ink leading-none mb-1">{headline}</p>
          <div className="flex flex-wrap gap-1.5">
            {affected.map((r) => <ServicePill key={r.service_key} row={r} />)}
          </div>
        </div>
        <div className="shrink-0 text-ink-faint">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="px-4 pb-4">
          <div className="rounded-xl bg-white/40 dark:bg-black/20 px-3 py-1">
            {affected.map((r) => <DetailRow key={r.service_key} row={r} />)}
          </div>
          <p className="text-[10px] text-ink-faint mt-2 text-center">
            We are working to restore full service. Thank you for your patience.
          </p>
        </div>
      )}
    </div>
  )
}
