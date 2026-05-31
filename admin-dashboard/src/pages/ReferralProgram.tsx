import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { referralApi } from '@/api/referral.api'
import type { ReferralSettings, ReferralReward } from '@/types'
import { ErrorMessage } from '@/components/shared/ErrorMessage'
import {
  Gift, Users, DollarSign, Clock,
  ChevronLeft, ChevronRight,
  Zap, Trophy, ShieldCheck, BarChart3, Sparkles, RotateCcw, Target, Loader2,
} from 'lucide-react'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtNgn(v: number) {
  return `₦${v.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtDate(d: string) {
  return new Date(d).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })
}

const STATUS_BADGE: Record<string, string> = {
  completed:  'bg-green-100 text-green-700',
  processing: 'bg-yellow-100 text-yellow-700',
  failed:     'bg-red-100 text-red-700',
}

// Shared input / select class — proper height, border, focus ring
const INPUT = [
  'w-full h-10 px-3 rounded-lg',
  'border border-border bg-surface-2 text-ink text-sm placeholder:text-ink-faint',
  'focus:outline-none focus:border-accent',
  'focus:shadow-[0_0_0_3px_var(--accent-subtle)]',
  'transition-all',
].join(' ')

const SELECT = INPUT + ' cursor-pointer'

// ── Summary card ──────────────────────────────────────────────────────────────

function SummaryCard({
  label, value, icon, className = '',
}: {
  label: string; value: string | number; icon: React.ReactNode; className?: string
}) {
  return (
    <div className={`rounded-xl border border-border bg-surface-1 p-5 flex items-start gap-4 ${className}`}>
      <div className="rounded-lg bg-accent-subtle p-2.5 text-accent shrink-0">{icon}</div>
      <div>
        <p className="text-xs text-ink-faint font-medium uppercase tracking-wide">{label}</p>
        <p className="text-xl font-semibold text-ink mt-0.5">{value}</p>
      </div>
    </div>
  )
}

// ── Section card ──────────────────────────────────────────────────────────────

function SectionCard({
  icon, title, description, action, children,
}: {
  icon:        React.ReactNode
  title:       string
  description: string
  action?:     React.ReactNode
  children:    React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-1 overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-surface-2/40">
        <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-accent-subtle text-accent shrink-0">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          <p className="text-xs text-ink-muted mt-0.5">{description}</p>
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

// ── Field ─────────────────────────────────────────────────────────────────────

function Field({
  label, optional, description, children,
}: {
  label:        string
  optional?:    boolean
  description?: string
  children:     React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <label className="block text-xs font-semibold text-ink-muted uppercase tracking-wide">
          {label}
        </label>
        {optional && (
          <span className="inline-flex items-center rounded-full bg-surface-3 px-1.5 py-0.5 text-[10px] font-medium text-ink-faint leading-none">
            optional
          </span>
        )}
      </div>
      {children}
      {description && (
        <p className="text-[11px] text-ink-faint leading-relaxed">{description}</p>
      )}
    </div>
  )
}

// ── Mode card (reward mode visual selector) ───────────────────────────────────

function ModeCard({
  value, current, label, description, icon, onClick,
}: {
  value:       string
  current:     string
  label:       string
  description: string
  icon:        React.ReactNode
  onClick:     () => void
}) {
  const active = value === current
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'flex items-start gap-3 p-3.5 rounded-lg border-2 text-left w-full transition-all',
        active
          ? 'border-accent bg-accent-subtle shadow-sm'
          : 'border-border bg-surface-2 hover:border-border-strong',
      ].join(' ')}
    >
      <div className={[
        'flex items-center justify-center h-8 w-8 rounded-lg shrink-0 mt-0.5 transition-colors',
        active ? 'bg-accent text-white' : 'bg-surface-3 text-ink-muted',
      ].join(' ')}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className={`text-sm font-semibold leading-tight ${active ? 'text-ink' : 'text-ink-muted'}`}>
            {label}
          </p>
          {active && (
            <span className="inline-flex items-center rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold text-white uppercase tracking-wider leading-none">
              selected
            </span>
          )}
        </div>
        <p className="text-xs text-ink-faint mt-1 leading-relaxed">{description}</p>
      </div>
    </button>
  )
}

// ── Preview box ───────────────────────────────────────────────────────────────

function buildPreviewText(form: Partial<ReferralSettings>): string {
  const amount = form.reward_type === 'percentage'
    ? `${form.reward_value ?? 0}% of the transaction`
    : fmtNgn(form.reward_value ?? 0)

  const triggerMap: Record<string, string> = {
    signup:          'sign up',
    first_funding:   'fund their wallet',
    first_purchase:  'make their first VTU purchase',
  }
  const trigger = triggerMap[form.reward_trigger ?? 'signup'] ?? 'sign up'
  const minTxt  = form.min_amount ? ` with at least ${fmtNgn(form.min_amount)}` : ''
  const capTxt  = form.max_reward_cap ? `, capped at ${fmtNgn(form.max_reward_cap)} total` : ''

  let main: string
  if (form.reward_mode === 'milestone') {
    const n = form.required_referral_count ?? 'N'
    main = `Once ${n} referred user${Number(n) === 1 ? '' : 's'} ${trigger}${minTxt}, the referrer earns ${amount}${capTxt}.`
  } else {
    main = `The referrer earns ${amount} each time a referred user ${trigger}${minTxt}${capTxt}.`
  }

  if (form.reward_recipient === 'both' && form.referred_reward_value) {
    main += ` The new user also receives a ${fmtNgn(form.referred_reward_value)} welcome bonus.`
  }

  return main
}

function PreviewBox({ form }: { form: Partial<ReferralSettings> }) {
  return (
    <div className="rounded-xl border border-accent/30 overflow-hidden">
      <div className="flex items-center gap-2.5 px-4 py-2.5 bg-accent-subtle border-b border-accent/20">
        <Sparkles className="h-3.5 w-3.5 text-accent shrink-0" />
        <p className="text-xs font-semibold text-accent uppercase tracking-wider">Reward Preview</p>
      </div>
      <div className="px-4 py-3 bg-surface-1">
        <p className="text-sm text-ink leading-relaxed">{buildPreviewText(form)}</p>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function ReferralProgramPage() {
  const qc = useQueryClient()
  const [page, setPage]             = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const LIMIT = 20

  const { data: settings, isLoading: loadingSettings, error: settingsErr } =
    useQuery({ queryKey: ['referral-settings'], queryFn: referralApi.getSettings })

  const { data: summary, isLoading: loadingSummary } =
    useQuery({ queryKey: ['referral-summary'], queryFn: referralApi.getSummary })

  const { data: rewardsRes, isLoading: loadingRewards } = useQuery({
    queryKey: ['referral-rewards', page, statusFilter],
    queryFn:  () => referralApi.listRewards({ page, limit: LIMIT, status: statusFilter || undefined }),
  })

  const updateMutation = useMutation({
    mutationFn: referralApi.updateSettings,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['referral-settings'] })
      toast.success('Referral settings saved')
    },
    onError: (err: Error) => {
      const details = (err as Record<string, unknown>).response as
        | { data?: { details?: Record<string, string[]> } }
        | undefined
      const fieldErrors = details?.data?.details
      if (fieldErrors && Object.keys(fieldErrors).length > 0) {
        const lines = Object.entries(fieldErrors)
          .map(([field, msgs]) => `${field}: ${msgs[0]}`)
          .join('  ·  ')
        toast.error(`Validation: ${lines}`, { duration: 6000 })
      } else {
        toast.error(err.message ?? 'Failed to save referral settings')
      }
    },
  })

  if (settingsErr) return <ErrorMessage error={settingsErr} />

  const totalPages = rewardsRes ? Math.max(1, Math.ceil(rewardsRes.total / LIMIT)) : 1

  return (
    <div className="space-y-6 p-6">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-semibold text-ink">Referral Program</h1>
        <p className="text-sm text-ink-faint mt-0.5">
          Configure how users earn rewards for referring new signups.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SummaryCard
          label="Total Referrals"
          value={loadingSummary ? '—' : (summary?.total_referrals ?? 0)}
          icon={<Users className="h-5 w-5" />}
        />
        <SummaryCard
          label="Active Referrers"
          value={loadingSummary ? '—' : (summary?.active_referrers ?? 0)}
          icon={<Gift className="h-5 w-5" />}
        />
        <SummaryCard
          label="Rewards Paid"
          value={loadingSummary ? '—' : fmtNgn(summary?.total_rewards_paid ?? 0)}
          icon={<DollarSign className="h-5 w-5" />}
        />
        <SummaryCard
          label="Pending Rewards"
          value={loadingSummary ? '—' : fmtNgn(summary?.pending_rewards ?? 0)}
          icon={<Clock className="h-5 w-5" />}
        />
      </div>

      {/* Configuration panel */}
      {!loadingSettings && settings && (
        <SettingsPanel
          settings={settings}
          saving={updateMutation.isPending}
          onSave={(patch) => updateMutation.mutate(patch)}
        />
      )}

      {/* Reward History table */}
      <div className="rounded-xl border border-border bg-surface-1 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-ink">Reward History</h2>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
            className="text-xs border border-border rounded-lg px-2.5 py-1.5 bg-surface-2 text-ink focus:outline-none focus:border-accent transition-colors"
          >
            <option value="">All statuses</option>
            <option value="completed">Completed</option>
            <option value="processing">Processing</option>
            <option value="failed">Failed</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-xs text-ink-faint uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Referrer</th>
                <th className="px-4 py-3 text-left font-semibold">Referred User</th>
                <th className="px-4 py-3 text-left font-semibold">Trigger</th>
                <th className="px-4 py-3 text-right font-semibold">Referrer Amt</th>
                <th className="px-4 py-3 text-right font-semibold">Referred Amt</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
                <th className="px-4 py-3 text-left font-semibold">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loadingRewards ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-ink-faint">Loading…</td>
                </tr>
              ) : !rewardsRes?.data.length ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-ink-faint">No rewards found.</td>
                </tr>
              ) : (
                rewardsRes.data.map((r: ReferralReward) => (
                  <tr key={r.id} className="hover:bg-surface-2/50 transition-colors">
                    <td className="px-4 py-3 text-ink">{r.referrer_email ?? r.referrer_id.slice(0, 8)}</td>
                    <td className="px-4 py-3 text-ink">{r.referred_email  ?? r.referred_id.slice(0, 8)}</td>
                    <td className="px-4 py-3">
                      <span className="capitalize text-ink-muted">{r.trigger_type.replace(/_/g, ' ')}</span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink">{fmtNgn(r.referrer_amount)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink">{fmtNgn(r.referred_amount)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[r.status] ?? 'bg-surface-2 text-ink-faint'}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-ink-faint whitespace-nowrap">{fmtDate(r.created_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-border">
            <span className="text-xs text-ink-faint">
              Page {page} of {totalPages} ({rewardsRes?.total ?? 0} total)
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded border border-border text-ink-faint hover:text-ink disabled:opacity-40 transition-colors"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-1.5 rounded border border-border text-ink-faint hover:text-ink disabled:opacity-40 transition-colors"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Payload sanitization ──────────────────────────────────────────────────────
// The pg driver returns NUMERIC columns as strings ("1000.00").
// HTML number inputs may also carry empty-string values when a field is blank.
// This function coerces every numeric field to a proper JS number (or null)
// so Zod's z.number() validators never see a string.

function sanitizePayload(f: Partial<ReferralSettings>): Partial<ReferralSettings> {
  // Converts any value to a finite number. Falls back to 0 for null/undefined/NaN.
  const forceNum = (v: unknown): number => {
    if (typeof v === 'number' && isFinite(v)) return v
    const n = parseFloat(String(v ?? ''))
    return isFinite(n) ? n : 0
  }

  // Converts any value to a finite number, or null for blank/null/undefined/NaN.
  // Handles pg NUMERIC strings ("10000.00"), empty inputs (""), and null equally.
  const forceNullNum = (v: unknown): number | null => {
    if (v === null || v === undefined) return null
    if (typeof v === 'string' && v.trim() === '') return null
    if (typeof v === 'number') return isFinite(v) ? v : null
    const n = parseFloat(String(v))
    return isFinite(n) ? n : null
  }

  return {
    ...f,
    reward_value:            forceNum(f.reward_value),
    min_amount:              forceNullNum(f.min_amount),
    max_reward_cap:          forceNullNum(f.max_reward_cap),
    referred_reward_value:   forceNullNum(f.referred_reward_value),
    required_referral_count: forceNullNum(f.required_referral_count),
  }
}

// ── Settings panel ────────────────────────────────────────────────────────────

function SettingsPanel({
  settings,
  saving,
  onSave,
}: {
  settings: ReferralSettings
  saving:   boolean
  onSave:   (patch: Partial<ReferralSettings>) => void
}) {
  const toNum = (v: unknown): number => {
    const n = Number(v)
    return isNaN(n) ? 0 : n
  }
  const toNullNum = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null
    const n = Number(v)
    return isNaN(n) ? null : n
  }

  const [form, setForm] = useState<Partial<ReferralSettings>>({
    is_enabled:              settings.is_enabled,
    reward_trigger:          settings.reward_trigger,
    reward_type:             settings.reward_type,
    reward_value:            toNum(settings.reward_value),
    min_amount:              toNullNum(settings.min_amount),
    max_reward_cap:          toNullNum(settings.max_reward_cap),
    reward_recipient:        settings.reward_recipient,
    referred_reward_value:   toNullNum(settings.referred_reward_value),
    reward_mode:             settings.reward_mode ?? 'per_referral',
    required_referral_count: settings.required_referral_count ?? null,
  })

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }))

  const isPercentage = form.reward_type      === 'percentage'
  const showReferred = form.reward_recipient  === 'both'
  const isMilestone  = form.reward_mode       === 'milestone'

  return (
    <div className="space-y-4">

      {/* ── 1. Program Status ────────────────────────────────────────────────── */}
      <SectionCard
        icon={<ShieldCheck className="h-4 w-4" />}
        title="Program Status"
        description="Enable or disable the referral program for all users"
        action={
          <div className="flex items-center gap-2.5">
            <span className={`text-xs font-semibold ${form.is_enabled ? 'text-accent' : 'text-ink-faint'}`}>
              {form.is_enabled ? 'Active' : 'Inactive'}
            </span>
            <button
              onClick={() => {
                const next = !form.is_enabled
                set('is_enabled', next)
                onSave({ is_enabled: next })
              }}
              disabled={saving}
              className={[
                'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none',
                form.is_enabled ? 'bg-accent' : 'bg-border',
                saving ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer',
              ].join(' ')}
            >
              <span className={[
                'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
                form.is_enabled ? 'translate-x-6' : 'translate-x-1',
              ].join(' ')} />
            </button>
          </div>
        }
      >
        <div className={[
          'flex items-center gap-3 rounded-lg px-4 py-3 border',
          form.is_enabled
            ? 'bg-green-500/5 border-green-500/20'
            : 'bg-surface-2 border-border',
        ].join(' ')}>
          <div className={[
            'h-2 w-2 rounded-full shrink-0',
            form.is_enabled ? 'bg-green-500 animate-pulse' : 'bg-ink-faint',
          ].join(' ')} />
          <p className={`text-xs font-medium leading-relaxed ${form.is_enabled ? 'text-green-600' : 'text-ink-faint'}`}>
            {form.is_enabled
              ? 'The referral program is live. Users can share their referral codes and earn rewards.'
              : 'The referral program is paused. No new rewards will be created until re-enabled.'}
          </p>
        </div>
      </SectionCard>

      {/* ── 2. Reward Rules + Qualification Requirements (responsive 2-col) ─── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

        {/* Reward Rules */}
        <SectionCard
          icon={<Zap className="h-4 w-4" />}
          title="Reward Rules"
          description="What action triggers a payout and how much is earned"
        >
          <div className="space-y-4">
            <Field
              label="Reward Trigger"
              description="The qualifying action a referred user must complete to trigger a payout."
            >
              <select
                value={form.reward_trigger}
                onChange={(e) => set('reward_trigger', e.target.value as ReferralSettings['reward_trigger'])}
                className={SELECT}
              >
                <option value="signup">On Signup</option>
                <option value="first_funding">First Wallet Funding</option>
                <option value="first_purchase">First VTU Purchase</option>
              </select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Reward Type"
                description="Fixed ₦ or % of transaction."
              >
                <select
                  value={form.reward_type}
                  onChange={(e) => set('reward_type', e.target.value as ReferralSettings['reward_type'])}
                  className={SELECT}
                >
                  <option value="fixed">Fixed Amount (₦)</option>
                  <option value="percentage">Percentage (%)</option>
                </select>
              </Field>

              <Field
                label={isPercentage ? 'Percentage (%)' : 'Amount (₦)'}
                description={isPercentage ? '% of the qualifying transaction.' : 'Exact ₦ per qualifying referral.'}
              >
                <input
                  type="number"
                  min={0}
                  step={isPercentage ? 0.01 : 1}
                  value={form.reward_value ?? ''}
                  onChange={(e) => set('reward_value', Number(e.target.value))}
                  className={INPUT}
                />
              </Field>
            </div>
          </div>
        </SectionCard>

        {/* Qualification Requirements */}
        <SectionCard
          icon={<Trophy className="h-4 w-4" />}
          title="Qualification Requirements"
          description="How and when a referral qualifies for a payout"
        >
          <div className="space-y-4">
            <Field label="Reward Mode">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <ModeCard
                  value="per_referral"
                  current={form.reward_mode ?? 'per_referral'}
                  label="Per Referral"
                  description="Credit immediately for each qualifying referral"
                  icon={<RotateCcw className="h-3.5 w-3.5" />}
                  onClick={() => {
                    set('reward_mode', 'per_referral')
                    set('required_referral_count', null)
                  }}
                />
                <ModeCard
                  value="milestone"
                  current={form.reward_mode ?? 'per_referral'}
                  label="Milestone"
                  description="Pay once after N referrals qualify"
                  icon={<Target className="h-3.5 w-3.5" />}
                  onClick={() => set('reward_mode', 'milestone')}
                />
              </div>
            </Field>

            {isMilestone && (
              <Field
                label="Required Referral Count"
                description="How many referrals must qualify before the milestone reward is paid."
              >
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={form.required_referral_count ?? ''}
                  onChange={(e) =>
                    set(
                      'required_referral_count',
                      e.target.value === '' ? null : Math.max(1, Math.floor(Number(e.target.value))),
                    )
                  }
                  placeholder="e.g. 5"
                  className={INPUT}
                />
              </Field>
            )}

            <Field
              label="Minimum Transaction Amount (₦)"
              optional
              description="Referred user's transaction must meet this threshold to qualify."
            >
              <input
                type="number"
                min={0}
                value={form.min_amount ?? ''}
                onChange={(e) =>
                  set('min_amount', e.target.value === '' ? null : Number(e.target.value))
                }
                placeholder="No minimum"
                className={INPUT}
              />
            </Field>
          </div>
        </SectionCard>
      </div>

      {/* ── 3. Reward Limits ─────────────────────────────────────────────────── */}
      <SectionCard
        icon={<BarChart3 className="h-4 w-4" />}
        title="Reward Limits"
        description="Cap total payouts and configure who receives a reward"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field
            label="Maximum Reward Cap (₦)"
            optional
            description="A referrer's total earnings across all referrals will never exceed this."
          >
            <input
              type="number"
              min={0}
              value={form.max_reward_cap ?? ''}
              onChange={(e) =>
                set('max_reward_cap', e.target.value === '' ? null : Number(e.target.value))
              }
              placeholder="No cap"
              className={INPUT}
            />
          </Field>

          <Field
            label="Reward Recipient"
            description="Whether only the referrer earns, or both parties receive a reward."
          >
            <select
              value={form.reward_recipient}
              onChange={(e) => set('reward_recipient', e.target.value as ReferralSettings['reward_recipient'])}
              className={SELECT}
            >
              <option value="referrer">Referrer only</option>
              <option value="both">Referrer + New User</option>
            </select>
          </Field>

          {showReferred && (
            <Field
              label="New User Bonus (₦)"
              optional
              description="One-time welcome bonus credited to the referred user on qualifying."
            >
              <input
                type="number"
                min={0}
                value={form.referred_reward_value ?? ''}
                onChange={(e) =>
                  set('referred_reward_value', e.target.value === '' ? null : Number(e.target.value))
                }
                placeholder="0"
                className={INPUT}
              />
            </Field>
          )}
        </div>
      </SectionCard>

      {/* ── 4. Reward Preview ─────────────────────────────────────────────────── */}
      <PreviewBox form={form} />

      {/* ── Save ──────────────────────────────────────────────────────────────── */}
      <div className="flex justify-end">
        <button
          onClick={() => {
            console.log('[REFERRAL-SAVE-RAW-FORM]', JSON.stringify(form, null, 2))
            const payload = sanitizePayload(form)
            console.log('[REFERRAL-SAVE-PAYLOAD]', JSON.stringify(payload, null, 2))
            onSave(payload)
          }}
          disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg bg-accent text-white hover:bg-accent/90 disabled:opacity-60 transition-colors shadow-sm"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving…
            </>
          ) : (
            'Save Configuration'
          )}
        </button>
      </div>
    </div>
  )
}
