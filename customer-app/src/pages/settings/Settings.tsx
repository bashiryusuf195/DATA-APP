import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SlidersHorizontal, ArrowLeft, Lock, Bell, ShieldCheck, KeyRound, AlertCircle } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Button, Card, Input } from '@/components/ui'
import { authApi } from '@/api/auth.api'
import { pinApi } from '@/api/pin.api'
import { notificationsApi } from '@/api/notifications.api'
import { PinSetupModal } from '@/components/shared/PinSetupModal'
import { useAuthStore } from '@/store/auth.store'
import type { NotificationPreferences } from '@/types'

type PinSection = null | 'setup' | 'change' | 'reset-request' | 'reset-confirm'

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
  const navigate  = useNavigate()
  const qc        = useQueryClient()
  const user      = useAuthStore((s) => s.user)
  const setUser   = useAuthStore((s) => s.setUser)

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

  // ── Transaction PIN ────────────────────────────────────────────────────────
  const [pinSection, setPinSection] = useState<PinSection>(null)
  const [pinErr, setPinErr]         = useState<string | null>(null)

  // Change PIN form state
  const [changePinFields, setChangePinFields] = useState({ current: '', next: '', confirm: '' })

  // Reset PIN form state
  const [resetPassword, setResetPassword] = useState('')
  const [resetToken, setResetToken]       = useState('')
  const [newPinAfterReset, setNewPinAfterReset] = useState('')

  const pinStatus = useQuery({
    queryKey: ['pin-status'],
    queryFn:  pinApi.status,
    staleTime: 30_000,
  })
  const pinSet = pinStatus.data?.pin_set ?? user?.has_transaction_pin ?? false

  const changePinMutation = useMutation({
    mutationFn: () => pinApi.change(changePinFields.current, changePinFields.next),
    onSuccess: () => {
      toast.success('Transaction PIN updated')
      setPinSection(null)
      setChangePinFields({ current: '', next: '', confirm: '' })
      qc.invalidateQueries({ queryKey: ['pin-status'] })
      if (user) setUser({ ...user, has_transaction_pin: true })
    },
    onError: (e: Error) => setPinErr(e.message),
  })

  const resetRequestMutation = useMutation({
    mutationFn: () => pinApi.resetRequest(resetPassword),
    onSuccess: (data) => {
      // In production the token arrives by email. Dev returns it in the response.
      if (data.reset_token) setResetToken(data.reset_token)
      setPinSection('reset-confirm')
      setPinErr(null)
      toast('Reset code sent. Check your email.', { icon: '📧' })
    },
    onError: (e: Error) => setPinErr(e.message),
  })

  const resetConfirmMutation = useMutation({
    mutationFn: () => pinApi.resetConfirm(resetToken, newPinAfterReset),
    onSuccess: () => {
      toast.success('Transaction PIN reset successfully')
      setPinSection(null)
      setResetPassword('')
      setResetToken('')
      setNewPinAfterReset('')
      qc.invalidateQueries({ queryKey: ['pin-status'] })
      if (user) setUser({ ...user, has_transaction_pin: true })
    },
    onError: (e: Error) => setPinErr(e.message),
  })

  const handleChangePin = (e: React.FormEvent) => {
    e.preventDefault()
    setPinErr(null)
    if (!/^\d{4}$|^\d{6}$/.test(changePinFields.next)) {
      setPinErr('New PIN must be exactly 4 or 6 digits.'); return
    }
    if (changePinFields.next !== changePinFields.confirm) {
      setPinErr('PINs do not match.'); return
    }
    changePinMutation.mutate()
  }

  const handleResetRequest = (e: React.FormEvent) => {
    e.preventDefault()
    if (!resetPassword) { setPinErr('Enter your current password.'); return }
    setPinErr(null)
    resetRequestMutation.mutate()
  }

  const handleResetConfirm = (e: React.FormEvent) => {
    e.preventDefault()
    if (!resetToken) { setPinErr('Enter the reset code.'); return }
    if (!/^\d{4}$|^\d{6}$/.test(newPinAfterReset)) {
      setPinErr('New PIN must be exactly 4 or 6 digits.'); return
    }
    setPinErr(null)
    resetConfirmMutation.mutate()
  }

  const openPinSection = (s: PinSection) => { setPinErr(null); setPinSection(s) }

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

        {/* ── Transaction PIN ───────────────────────────────────────────────── */}
        <div className="mb-6 pb-6 border-b border-border">
          <div className="flex items-center gap-2 mb-4">
            <ShieldCheck className="h-4 w-4 text-ink-muted" />
            <p className="text-sm font-semibold text-ink">Transaction PIN</p>
            <span className={`ml-auto text-xs font-medium px-2 py-0.5 rounded-full ${
              pinSet ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'
            }`}>
              {pinSet ? 'Active' : 'Not set'}
            </span>
          </div>

          {pinSection === null && (
            <div className="space-y-2">
              {!pinSet ? (
                <Button
                  fullWidth
                  variant="primary"
                  icon={<KeyRound className="h-4 w-4" />}
                  onClick={() => openPinSection('setup')}
                >
                  Set Transaction PIN
                </Button>
              ) : (
                <>
                  <Button
                    fullWidth
                    variant="outline"
                    icon={<KeyRound className="h-4 w-4" />}
                    onClick={() => openPinSection('change')}
                  >
                    Change Transaction PIN
                  </Button>
                  <Button
                    fullWidth
                    variant="ghost"
                    onClick={() => openPinSection('reset-request')}
                  >
                    Forgot / Reset PIN
                  </Button>
                </>
              )}
            </div>
          )}

          {/* Change PIN form */}
          {pinSection === 'change' && (
            <form onSubmit={handleChangePin} className="space-y-4">
              <Input
                label="Current PIN"
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={changePinFields.current}
                onChange={(e) => { setChangePinFields((p) => ({ ...p, current: e.target.value.replace(/\D/g, '').slice(0, 6) })); setPinErr(null) }}
                placeholder="••••"
                className="text-center tracking-widest"
              />
              <Input
                label="New PIN"
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={changePinFields.next}
                onChange={(e) => { setChangePinFields((p) => ({ ...p, next: e.target.value.replace(/\D/g, '').slice(0, 6) })); setPinErr(null) }}
                placeholder="••••"
                className="text-center tracking-widest"
              />
              <Input
                label="Confirm New PIN"
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={changePinFields.confirm}
                onChange={(e) => { setChangePinFields((p) => ({ ...p, confirm: e.target.value.replace(/\D/g, '').slice(0, 6) })); setPinErr(null) }}
                placeholder="••••"
                className="text-center tracking-widest"
              />
              {pinErr && <InlineError msg={pinErr} />}
              <div className="flex gap-2">
                <Button variant="outline" type="button" onClick={() => openPinSection(null)}>Cancel</Button>
                <Button type="submit" fullWidth loading={changePinMutation.isPending}>Update PIN</Button>
              </div>
            </form>
          )}

          {/* Reset request form */}
          {pinSection === 'reset-request' && (
            <form onSubmit={handleResetRequest} className="space-y-4">
              <p className="text-xs text-ink-muted">Enter your account password to request a PIN reset code.</p>
              <Input
                label="Account Password"
                type="password"
                value={resetPassword}
                onChange={(e) => { setResetPassword(e.target.value); setPinErr(null) }}
                autoComplete="current-password"
              />
              {pinErr && <InlineError msg={pinErr} />}
              <div className="flex gap-2">
                <Button variant="outline" type="button" onClick={() => openPinSection(null)}>Cancel</Button>
                <Button type="submit" fullWidth loading={resetRequestMutation.isPending}>Send Reset Code</Button>
              </div>
            </form>
          )}

          {/* Reset confirm form */}
          {pinSection === 'reset-confirm' && (
            <form onSubmit={handleResetConfirm} className="space-y-4">
              <p className="text-xs text-ink-muted">Enter the 6-digit code sent to your email and your new PIN.</p>
              <Input
                label="Reset Code"
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={resetToken}
                onChange={(e) => { setResetToken(e.target.value.replace(/\D/g, '').slice(0, 6)); setPinErr(null) }}
                placeholder="123456"
              />
              <Input
                label="New PIN"
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={newPinAfterReset}
                onChange={(e) => { setNewPinAfterReset(e.target.value.replace(/\D/g, '').slice(0, 6)); setPinErr(null) }}
                placeholder="••••"
                className="text-center tracking-widest"
              />
              {pinErr && <InlineError msg={pinErr} />}
              <div className="flex gap-2">
                <Button variant="outline" type="button" onClick={() => openPinSection(null)}>Cancel</Button>
                <Button type="submit" fullWidth loading={resetConfirmMutation.isPending}>Reset PIN</Button>
              </div>
            </form>
          )}
        </div>

        {/* ── Change password ───────────────────────────────────────────────── */}
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

        {/* ── Notification preferences ──────────────────────────────────────── */}
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

      {/* PIN setup modal (opened from Settings) */}
      {pinSection === 'setup' && (
        <PinSetupModal
          onSuccess={() => {
            setPinSection(null)
            qc.invalidateQueries({ queryKey: ['pin-status'] })
            if (user) setUser({ ...user, has_transaction_pin: true })
            toast.success('Transaction PIN set successfully')
          }}
          onDismiss={() => setPinSection(null)}
        />
      )}
    </div>
  )
}

function InlineError({ msg }: { msg: string }) {
  return (
    <div className="flex items-start gap-2 rounded-xl bg-danger/10 border border-danger/20 px-3 py-2.5">
      <AlertCircle className="h-4 w-4 text-danger shrink-0 mt-0.5" />
      <p className="text-xs text-danger">{msg}</p>
    </div>
  )
}
