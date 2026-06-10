import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import axios from 'axios'
import { serviceStatusApi } from '@/api/service-status.api'
import type { ServiceStatusRow, ServiceStatusValue, UpdateServiceStatusInput } from '@/api/service-status.api'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button, Card } from '@/components/ui'
import { SkeletonTable } from '@/components/ui/Skeleton'
import { ErrorMessage } from '@/components/shared/ErrorMessage'
import {
  Phone, Wifi, Zap, Tv, ShieldCheck, Building2,
  CheckCircle2, Clock, RefreshCw, Save, Calendar,
} from 'lucide-react'

function errMsg(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) return err.response?.data?.error ?? err.message ?? fallback
  if (err instanceof Error) return err.message
  return fallback
}

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_OPTIONS: { value: ServiceStatusValue; label: string; dot: string; bg: string; text: string }[] = [
  { value: 'available',   label: 'Available',   dot: 'bg-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-950/40',  text: 'text-emerald-700 dark:text-emerald-400' },
  { value: 'delayed',     label: 'Delayed',     dot: 'bg-amber-500',   bg: 'bg-amber-50 dark:bg-amber-950/40',      text: 'text-amber-700 dark:text-amber-400'   },
  { value: 'maintenance', label: 'Maintenance', dot: 'bg-red-500',     bg: 'bg-red-50 dark:bg-red-950/40',          text: 'text-red-700 dark:text-red-400'       },
  { value: 'unavailable', label: 'Unavailable', dot: 'bg-slate-500',   bg: 'bg-slate-50 dark:bg-slate-900/40',      text: 'text-slate-600 dark:text-slate-400'   },
]

const STATUS_MAP = Object.fromEntries(STATUS_OPTIONS.map((s) => [s.value, s]))

// ── Service icon map ──────────────────────────────────────────────────────────

const SERVICE_ICON: Record<string, React.ReactNode> = {
  airtime_data: <Wifi       className="h-5 w-5" />,
  electricity:  <Zap        className="h-5 w-5" />,
  cable_tv:     <Tv         className="h-5 w-5" />,
  exam_pin:     <ShieldCheck className="h-5 w-5" />,
  identity:     <Building2  className="h-5 w-5" />,
}

const CATEGORY_COLOR: Record<string, string> = {
  airtime_data: 'text-blue-600  bg-blue-50  dark:bg-blue-950/40 dark:text-blue-400',
  electricity:  'text-amber-600 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-400',
  cable_tv:     'text-purple-600 bg-purple-50 dark:bg-purple-950/40 dark:text-purple-400',
  exam_pin:     'text-rose-600  bg-rose-50  dark:bg-rose-950/40 dark:text-rose-400',
  identity:     'text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 dark:text-indigo-400',
}

// ── Service card (one per service) ────────────────────────────────────────────

interface CardState {
  status:            ServiceStatusValue
  message:           string
  maintenance_start: string
  maintenance_end:   string
  dirty:             boolean
}

function toLocalDatetimeStr(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function localToIso(local: string): string | null {
  if (!local) return null
  return new Date(local).toISOString()
}

interface ServiceCardProps {
  row:      ServiceStatusRow
  onSaved:  (updated: ServiceStatusRow) => void
}

function ServiceCard({ row, onSaved }: ServiceCardProps) {
  const [state, setState] = useState<CardState>({
    status:            row.status,
    message:           row.message ?? '',
    maintenance_start: toLocalDatetimeStr(row.maintenance_start),
    maintenance_end:   toLocalDatetimeStr(row.maintenance_end),
    dirty:             false,
  })

  const updateMut = useMutation({
    mutationFn: () => {
      const body: UpdateServiceStatusInput = {
        status:  state.status,
        message: state.message.trim() || null,
        maintenance_start: localToIso(state.maintenance_start),
        maintenance_end:   localToIso(state.maintenance_end),
      }
      return serviceStatusApi.update(row.service_key, body)
    },
    onSuccess: (updated) => {
      toast.success(`${row.service_name} status updated`)
      setState((s) => ({ ...s, dirty: false }))
      onSaved(updated)
    },
    onError: (err) => toast.error(errMsg(err, 'Failed to update status')),
  })

  function set<K extends keyof CardState>(k: K, v: CardState[K]) {
    setState((s) => ({ ...s, [k]: v, dirty: true }))
  }

  const cfg    = STATUS_MAP[state.status]
  const iconCls = CATEGORY_COLOR[row.category] ?? 'text-ink-faint bg-surface-2'
  const showMaintenance = state.status === 'maintenance'

  return (
    <Card className="p-5 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${iconCls}`}>
          {SERVICE_ICON[row.category] ?? <Phone className="h-5 w-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-ink leading-none">{row.service_name}</p>
          <p className="text-[11px] text-ink-faint mt-0.5 capitalize">{row.category.replace('_', ' ')}</p>
        </div>
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${cfg.bg} ${cfg.text}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
          {cfg.label}
        </span>
      </div>

      {/* Status select */}
      <div>
        <label className="text-[11px] font-semibold text-ink-faint uppercase tracking-wider block mb-1.5">Status</label>
        <div className="grid grid-cols-2 gap-2">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => set('status', opt.value)}
              className={`
                flex items-center gap-2 px-3 py-2 rounded-xl border text-[12px] font-medium transition-all
                ${state.status === opt.value
                  ? `${opt.bg} ${opt.text} border-current ring-1 ring-current`
                  : 'bg-surface-1 text-ink-muted border-border hover:bg-surface-2'
                }
              `}
            >
              <span className={`h-2 w-2 rounded-full ${opt.dot} shrink-0`} />
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Message */}
      <div>
        <label className="text-[11px] font-semibold text-ink-faint uppercase tracking-wider block mb-1.5">
          Status Message <span className="normal-case font-normal">(optional)</span>
        </label>
        <textarea
          value={state.message}
          onChange={(e) => set('message', e.target.value)}
          placeholder="e.g. Experiencing slow response times from provider"
          rows={2}
          maxLength={500}
          className="w-full rounded-xl bg-surface-1 border border-border text-sm text-ink placeholder:text-ink-faint px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-accent/50"
        />
      </div>

      {/* Maintenance schedule — only shown when status = maintenance */}
      {showMaintenance && (
        <div className="rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/40 p-3 space-y-3">
          <p className="text-[11px] font-semibold text-red-700 dark:text-red-400 flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" /> Schedule Maintenance Window
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-semibold text-ink-faint uppercase tracking-wider block mb-1">Start</label>
              <input
                type="datetime-local"
                value={state.maintenance_start}
                onChange={(e) => set('maintenance_start', e.target.value)}
                className="w-full rounded-lg bg-surface-0 border border-border text-xs text-ink px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent/50"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-ink-faint uppercase tracking-wider block mb-1">End</label>
              <input
                type="datetime-local"
                value={state.maintenance_end}
                onChange={(e) => set('maintenance_end', e.target.value)}
                className="w-full rounded-lg bg-surface-0 border border-border text-xs text-ink px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent/50"
              />
            </div>
          </div>
        </div>
      )}

      {/* Save */}
      <Button
        size="sm"
        variant={state.dirty ? 'primary' : 'secondary'}
        disabled={!state.dirty || updateMut.isPending}
        onClick={() => updateMut.mutate()}
        className="w-full mt-auto"
      >
        {updateMut.isPending
          ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Saving…</>
          : state.dirty
            ? <><Save className="h-3.5 w-3.5" /> Save Changes</>
            : <><CheckCircle2 className="h-3.5 w-3.5" /> Saved</>
        }
      </Button>
    </Card>
  )
}

// ── Summary bar ───────────────────────────────────────────────────────────────

function SummaryBar({ rows }: { rows: ServiceStatusRow[] }) {
  const counts = {
    available:   rows.filter((r) => r.status === 'available').length,
    delayed:     rows.filter((r) => r.status === 'delayed').length,
    maintenance: rows.filter((r) => r.status === 'maintenance').length,
    unavailable: rows.filter((r) => r.status === 'unavailable').length,
  }
  const allHealthy = counts.available === rows.length

  return (
    <div className={`rounded-2xl border px-4 py-3 flex flex-wrap items-center gap-3 ${allHealthy ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/40' : 'bg-surface-1 border-border'}`}>
      {allHealthy ? (
        <span className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4" />
          All services operational — no customer-visible banner displayed
        </span>
      ) : (
        <>
          <span className="text-xs font-semibold text-ink-faint uppercase tracking-wider">Live status:</span>
          {counts.available   > 0 && <Pill dot="bg-emerald-500" text={`${counts.available} Available`}   cls="text-emerald-700 dark:text-emerald-400" />}
          {counts.delayed     > 0 && <Pill dot="bg-amber-500"   text={`${counts.delayed} Delayed`}       cls="text-amber-700 dark:text-amber-400"   />}
          {counts.maintenance > 0 && <Pill dot="bg-red-500"     text={`${counts.maintenance} Maintenance`} cls="text-red-700 dark:text-red-400"       />}
          {counts.unavailable > 0 && <Pill dot="bg-slate-500"   text={`${counts.unavailable} Unavailable`} cls="text-slate-600 dark:text-slate-400"  />}
          <span className="ml-auto text-[11px] text-ink-faint flex items-center gap-1">
            <Clock className="h-3 w-3" /> Banner shown to customers
          </span>
        </>
      )}
    </div>
  )
}

function Pill({ dot, text, cls }: { dot: string; text: string; cls: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${cls}`}>
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      {text}
    </span>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function ServiceStatusPage() {
  const qc = useQueryClient()

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['service-status-admin'],
    queryFn:  serviceStatusApi.list,
  })

  function onSaved(updated: ServiceStatusRow) {
    qc.setQueryData<ServiceStatusRow[]>(['service-status-admin'], (prev) =>
      prev?.map((r) => r.service_key === updated.service_key ? updated : r)
    )
  }

  const rows = data ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader
          title="Service Status"
          subtitle="Control what customers see about each service's availability"
        />
        <Button size="sm" variant="secondary" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {isLoading && <SkeletonTable rows={4} />}
      {error     && <ErrorMessage error={error} />}

      {!isLoading && rows.length > 0 && (
        <>
          <SummaryBar rows={rows} />

          {/* Network operators */}
          <div>
            <p className="text-xs font-bold text-ink-faint uppercase tracking-wider mb-3 flex items-center gap-2">
              <Wifi className="h-3.5 w-3.5" /> Mobile Networks
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {rows.filter((r) => r.category === 'airtime_data').map((row) => (
                <ServiceCard key={row.service_key} row={row} onSaved={onSaved} />
              ))}
            </div>
          </div>

          {/* Other services */}
          <div>
            <p className="text-xs font-bold text-ink-faint uppercase tracking-wider mb-3 flex items-center gap-2">
              <Zap className="h-3.5 w-3.5" /> Other Services
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {rows.filter((r) => r.category !== 'airtime_data').map((row) => (
                <ServiceCard key={row.service_key} row={row} onSaved={onSaved} />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
