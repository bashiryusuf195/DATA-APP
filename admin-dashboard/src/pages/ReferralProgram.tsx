import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { referralApi } from '@/api/referral.api'
import type { ReferralSettings, ReferralReward } from '@/types'
import { ErrorMessage } from '@/components/shared/ErrorMessage'
import { Gift, Users, DollarSign, Clock, ChevronLeft, ChevronRight } from 'lucide-react'

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

// ── Summary card ──────────────────────────────────────────────────────────────

function SummaryCard({
  label, value, icon, className = '',
}: {
  label: string
  value: string | number
  icon: React.ReactNode
  className?: string
}) {
  return (
    <div className={`rounded-xl border border-border bg-surface-1 p-5 flex items-start gap-4 ${className}`}>
      <div className="rounded-lg bg-accent/10 p-2.5 text-accent shrink-0">{icon}</div>
      <div>
        <p className="text-xs text-ink-faint font-medium uppercase tracking-wide">{label}</p>
        <p className="text-xl font-semibold text-ink mt-0.5">{value}</p>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function ReferralProgramPage() {
  const qc = useQueryClient()
  const [page, setPage]       = useState(1)
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
      // Zod validation errors include field-level details in error.response.data.details.
      // The axios interceptor only surfaces .message, so we pull details separately.
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

      {/* Settings panel */}
      {!loadingSettings && settings && (
        <SettingsPanel
          settings={settings}
          saving={updateMutation.isPending}
          onSave={(patch) => updateMutation.mutate(patch)}
        />
      )}

      {/* Rewards table */}
      <div className="rounded-xl border border-border bg-surface-1 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-ink">Reward History</h2>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
            className="text-xs border border-border rounded-lg px-2 py-1.5 bg-surface-1 text-ink"
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
                <th className="px-4 py-3 text-left">Referrer</th>
                <th className="px-4 py-3 text-left">Referred User</th>
                <th className="px-4 py-3 text-left">Trigger</th>
                <th className="px-4 py-3 text-right">Referrer Amt</th>
                <th className="px-4 py-3 text-right">Referred Amt</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loadingRewards ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-ink-faint">Loading…</td>
                </tr>
              ) : !rewardsRes?.data.length ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-ink-faint">No rewards found.</td>
                </tr>
              ) : (
                rewardsRes.data.map((r: ReferralReward) => (
                  <tr key={r.id} className="hover:bg-surface-2/50 transition-colors">
                    <td className="px-4 py-3 text-ink">{r.referrer_email ?? r.referrer_id.slice(0, 8)}</td>
                    <td className="px-4 py-3 text-ink">{r.referred_email  ?? r.referred_id.slice(0, 8)}</td>
                    <td className="px-4 py-3">
                      <span className="capitalize text-ink-muted">{r.trigger_type.replace(/_/g, ' ')}</span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtNgn(r.referrer_amount)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtNgn(r.referred_amount)}</td>
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

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-border">
            <span className="text-xs text-ink-faint">
              Page {page} of {totalPages} ({rewardsRes?.total ?? 0} total)
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded border border-border text-ink-faint hover:text-ink disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-1.5 rounded border border-border text-ink-faint hover:text-ink disabled:opacity-40"
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
  // The pg driver returns NUMERIC columns as strings ("500.00", "1000.00").
  // Coerce to JS numbers here so Zod's z.number() validators always pass.
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

  const isPercentage  = form.reward_type    === 'percentage'
  const showReferred  = form.reward_recipient === 'both'
  const isMilestone   = form.reward_mode     === 'milestone'

  return (
    <div className="rounded-xl border border-border bg-surface-1 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <h2 className="text-sm font-semibold text-ink">Program Configuration</h2>
        {/* Enable / disable toggle */}
        <button
          onClick={() => {
            const next = !form.is_enabled
            set('is_enabled', next)
            onSave({ is_enabled: next })
          }}
          disabled={saving}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
            form.is_enabled ? 'bg-accent' : 'bg-border'
          } ${saving ? 'opacity-60 cursor-not-allowed' : ''}`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              form.is_enabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      <div className="p-5 space-y-5">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {/* Reward Trigger */}
          <Field label="Reward Trigger">
            <select
              value={form.reward_trigger}
              onChange={(e) => set('reward_trigger', e.target.value as ReferralSettings['reward_trigger'])}
              className="field-input"
            >
              <option value="signup">On Signup</option>
              <option value="first_funding">First Wallet Funding</option>
              <option value="first_purchase">First VTU Purchase</option>
            </select>
          </Field>

          {/* Reward Mode */}
          <Field label="Reward Mode" hint="How rewards are paid out">
            <select
              value={form.reward_mode ?? 'per_referral'}
              onChange={(e) => {
                const mode = e.target.value as ReferralSettings['reward_mode']
                set('reward_mode', mode)
                if (mode === 'per_referral') set('required_referral_count', null)
              }}
              className="field-input"
            >
              <option value="per_referral">Per Referral — credit immediately per qualifying referral</option>
              <option value="milestone">Milestone — pay once after N referrals qualify</option>
            </select>
          </Field>

          {/* Required Referral Count — milestone mode only */}
          {isMilestone && (
            <Field
              label="Required Referral Count"
              hint="Referrals needed to trigger milestone payout"
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
                className="field-input"
              />
            </Field>
          )}

          {/* Reward Type */}
          <Field label="Reward Type">
            <select
              value={form.reward_type}
              onChange={(e) => set('reward_type', e.target.value as ReferralSettings['reward_type'])}
              className="field-input"
            >
              <option value="fixed">Fixed Amount (₦)</option>
              <option value="percentage">Percentage of Transaction (%)</option>
            </select>
          </Field>

          {/* Reward Value */}
          <Field label={isPercentage ? 'Reward Percentage (%)' : 'Reward Amount (₦)'}>
            <input
              type="number"
              min={0}
              step={isPercentage ? 0.01 : 1}
              value={form.reward_value ?? ''}
              onChange={(e) => set('reward_value', Number(e.target.value))}
              className="field-input"
            />
          </Field>

          {/* Min Amount (funding / purchase triggers) */}
          <Field label="Minimum Transaction Amount (₦)" hint="Optional">
            <input
              type="number"
              min={0}
              value={form.min_amount ?? ''}
              onChange={(e) =>
                set('min_amount', e.target.value === '' ? null : Number(e.target.value))
              }
              placeholder="No minimum"
              className="field-input"
            />
          </Field>

          {/* Max Reward Cap */}
          <Field label="Maximum Reward Cap (₦)" hint="Optional">
            <input
              type="number"
              min={0}
              value={form.max_reward_cap ?? ''}
              onChange={(e) =>
                set('max_reward_cap', e.target.value === '' ? null : Number(e.target.value))
              }
              placeholder="No cap"
              className="field-input"
            />
          </Field>

          {/* Reward Recipient */}
          <Field label="Reward Recipient">
            <select
              value={form.reward_recipient}
              onChange={(e) => set('reward_recipient', e.target.value as ReferralSettings['reward_recipient'])}
              className="field-input"
            >
              <option value="referrer">Referrer only</option>
              <option value="both">Referrer + New User</option>
            </select>
          </Field>

          {/* Referred reward value (shown only when recipient = 'both') */}
          {showReferred && (
            <Field label="New User Bonus (₦)" hint="One-time signup bonus for the referred user">
              <input
                type="number"
                min={0}
                value={form.referred_reward_value ?? ''}
                onChange={(e) =>
                  set('referred_reward_value', e.target.value === '' ? null : Number(e.target.value))
                }
                placeholder="0"
                className="field-input"
              />
            </Field>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <button
            onClick={() => onSave(form)}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-accent text-white hover:bg-accent/90 disabled:opacity-60 transition-colors"
          >
            {saving ? 'Saving…' : 'Save Configuration'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({
  label, hint, children,
}: {
  label:    string
  hint?:    string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-ink-muted">
        {label}
        {hint && <span className="ml-1 text-ink-faint font-normal">({hint})</span>}
      </label>
      {children}
    </div>
  )
}
