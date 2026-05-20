import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SlidersHorizontal, ArrowLeft, Lock, Bell } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Button, Card, Input } from '@/components/ui'
import { authApi } from '@/api/auth.api'
import { notificationsApi } from '@/api/notifications.api'
import type { NotificationPreferences } from '@/types'

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-border last:border-0">
      <div>
        <p className="text-sm font-medium text-ink">{label}</p>
        {hint && <p className="text-xs text-ink-muted mt-0.5">{hint}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
          checked ? 'bg-brand-600' : 'bg-surface-2 border border-border'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  )
}

export function SettingsPage() {
  const navigate = useNavigate()
  const qc       = useQueryClient()

  // ── Change password ────────────────────────────────────────────────────────
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' })
  const [pwErrors, setPwErrors] = useState<Record<string, string>>({})

  const changePwMutation = useMutation({
    mutationFn: authApi.changePassword,
    onSuccess: () => {
      toast.success('Password updated')
      setPw({ current: '', next: '', confirm: '' })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const handleChangePw = (e: React.FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (!pw.current)             errs.current = 'Enter current password'
    if (pw.next.length < 8)      errs.next    = 'At least 8 characters'
    if (pw.next !== pw.confirm)  errs.confirm = 'Passwords do not match'
    if (Object.keys(errs).length) { setPwErrors(errs); return }
    changePwMutation.mutate({
      current_password: pw.current,
      new_password:     pw.next,
      confirm_password: pw.confirm,
    })
  }

  // ── Notification prefs ─────────────────────────────────────────────────────
  const { data: prefs, isLoading: prefsLoading } = useQuery({
    queryKey: ['notification-prefs'],
    queryFn:  notificationsApi.getPreferences,
    staleTime: 60_000,
  })

  const updatePrefsMutation = useMutation({
    mutationFn: (p: Partial<NotificationPreferences>) => notificationsApi.updatePreferences(p),
    onSuccess: (updated) => {
      qc.setQueryData(['notification-prefs'], updated)
      toast.success('Preferences saved')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const toggle = (key: keyof NotificationPreferences) => {
    if (!prefs) return
    updatePrefsMutation.mutate({ [key]: !prefs[key] })
  }

  return (
    <div className="space-y-4 pt-2">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <Card>
        <div className="flex items-center gap-2.5 mb-5">
          <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center">
            <SlidersHorizontal className="h-5 w-5 text-slate-600" />
          </div>
          <p className="text-base font-semibold text-ink">Settings</p>
        </div>

        {/* Change password */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Lock className="h-4 w-4 text-ink-muted" />
            <p className="text-sm font-semibold text-ink">Change Password</p>
          </div>
          <form onSubmit={handleChangePw} className="space-y-4">
            <Input
              label="Current password"
              type="password"
              value={pw.current}
              onChange={(e) => { setPw((p) => ({ ...p, current: e.target.value })); setPwErrors((x) => ({ ...x, current: '' })) }}
              error={pwErrors.current}
              autoComplete="current-password"
            />
            <Input
              label="New password"
              type="password"
              value={pw.next}
              onChange={(e) => { setPw((p) => ({ ...p, next: e.target.value })); setPwErrors((x) => ({ ...x, next: '' })) }}
              error={pwErrors.next}
              autoComplete="new-password"
            />
            <Input
              label="Confirm new password"
              type="password"
              value={pw.confirm}
              onChange={(e) => { setPw((p) => ({ ...p, confirm: e.target.value })); setPwErrors((x) => ({ ...x, confirm: '' })) }}
              error={pwErrors.confirm}
              autoComplete="new-password"
            />
            <Button
              type="submit"
              fullWidth
              loading={changePwMutation.isPending}
            >
              Update password
            </Button>
          </form>
        </div>

        {/* Notification preferences */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Bell className="h-4 w-4 text-ink-muted" />
            <p className="text-sm font-semibold text-ink">Notification Preferences</p>
          </div>

          {prefsLoading ? (
            <p className="text-sm text-ink-muted">Loading…</p>
          ) : prefs ? (
            <div>
              <ToggleRow
                label="Email notifications"
                hint="Transaction receipts and alerts"
                checked={prefs.email}
                onChange={() => toggle('email')}
              />
              <ToggleRow
                label="SMS notifications"
                hint="Sent to your registered phone number"
                checked={prefs.sms}
                onChange={() => toggle('sms')}
              />
              <ToggleRow
                label="In-app notifications"
                hint="Shown in the notifications feed"
                checked={prefs.in_app}
                onChange={() => toggle('in_app')}
              />
              <ToggleRow
                label="Push notifications"
                checked={prefs.push}
                onChange={() => toggle('push')}
              />
            </div>
          ) : (
            <p className="text-sm text-ink-muted">Unable to load preferences.</p>
          )}
        </div>
      </Card>
    </div>
  )
}
