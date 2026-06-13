import { useState, useCallback, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { settingsApi } from '@/api/settings.api'
import { authApi } from '@/api/auth.api'
import { adminPushApi } from '@/api/notifications.api'
import type { AdminPushPreferences } from '@/api/notifications.api'
import { useAuthStore } from '@/store/auth.store'
import { PageHeader } from '@/components/shared/PageHeader'
import { ErrorMessage } from '@/components/shared/ErrorMessage'
import { Card, Badge, Button, Input, Skeleton, Modal } from '@/components/ui'
import { ENDPOINTS } from '@/config/endpoints'
import type { SettingEntry, SettingsByCategory, EnvironmentInfo } from '@/types'
import type { TotpSetupData } from '@/api/auth.api'
import { requestFcmToken, isFirebaseConfigured, onForegroundMessage } from '@/lib/firebase'
import {
  Settings,
  Zap,
  Wallet,
  Shield,
  Bell,
  ListChecks,
  Wrench,
  Server,
  RefreshCw,
  CheckCircle,
  XCircle,
  Save,
  Lock,
  KeyRound,
  Eye,
  EyeOff,
  Smartphone,
  AlertTriangle,
  Copy,
  Check,
  LogOut,
  CreditCard,
  HeartHandshake,
  BellRing,
  BellOff,
  Send,
  Power,
} from 'lucide-react'

function errMsg(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const e = err as { response?: { data?: { error?: string } } }
    if (e.response?.data?.error) return String(e.response.data.error)
  }
  if (err instanceof Error) return err.message
  return fallback
}

// ── Tab config ────────────────────────────────────────────────────────────────

const TABS = [
  { key: 'general',      label: 'General',       icon: <Settings    className="h-3.5 w-3.5" /> },
  { key: 'provider',     label: 'Provider',      icon: <Zap         className="h-3.5 w-3.5" /> },
  { key: 'wallet',       label: 'Wallet',        icon: <Wallet      className="h-3.5 w-3.5" /> },
  { key: 'payment',      label: 'Payment',       icon: <CreditCard  className="h-3.5 w-3.5" /> },
  { key: 'security',     label: 'Security',      icon: <Shield      className="h-3.5 w-3.5" /> },
  { key: 'notification', label: 'Notifications', icon: <Bell        className="h-3.5 w-3.5" /> },
  { key: 'alerts',       label: 'Alerts',        icon: <BellRing    className="h-3.5 w-3.5" /> },
  { key: 'queue',        label: 'Queue',         icon: <ListChecks  className="h-3.5 w-3.5" /> },
  { key: 'maintenance',  label: 'Maintenance',   icon: <Wrench      className="h-3.5 w-3.5" /> },
  { key: 'environment',  label: 'Environment',   icon: <Server      className="h-3.5 w-3.5" /> },
  { key: 'support',      label: 'Support',       icon: <HeartHandshake className="h-3.5 w-3.5" /> },
  { key: 'account',      label: 'Account',       icon: <KeyRound    className="h-3.5 w-3.5" /> },
] as const

type TabKey = typeof TABS[number]['key']

// ── Single-field editor ───────────────────────────────────────────────────────

interface FieldEditorProps {
  setting: SettingEntry
  onSaved: () => void
}

function FieldEditor({ setting, onSaved }: FieldEditorProps) {
  const [draft, setDraft] = useState(setting.value ?? '')
  const [dirty, setDirty] = useState(false)

  const mutation = useMutation({
    mutationFn: () => settingsApi.update(setting.key, draft),
    onSuccess: () => {
      toast.success(`"${setting.label}" updated`)
      setDirty(false)
      onSaved()
    },
    onError: (err) => toast.error(errMsg(err, 'Failed to save setting')),
  })

  function handleChange(val: string) {
    setDraft(val)
    setDirty(val !== (setting.value ?? ''))
  }

  const inputId = `setting-${setting.key}`

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label htmlFor={inputId} className="block text-xs font-medium text-ink-muted">
          {setting.label}
        </label>
        <Badge variant="neutral" className="text-[10px]">{setting.value_type}</Badge>
      </div>

      {setting.is_secret ? (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-ink-faint text-sm">
          <Lock className="h-3.5 w-3.5 shrink-0" />
          <span className="italic">Secret — managed via environment variables</span>
        </div>
      ) : setting.value_type === 'boolean' ? (
        <div className="flex items-center gap-3">
          <button
            id={inputId}
            type="button"
            onClick={() => handleChange(draft === 'true' ? 'false' : 'true')}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-accent/50 ${
              draft === 'true' ? 'bg-accent' : 'bg-surface-3'
            }`}
            role="switch"
            aria-checked={draft === 'true'}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${
                draft === 'true' ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
          <span className="text-sm text-ink">{draft === 'true' ? 'Enabled' : 'Disabled'}</span>
        </div>
      ) : setting.value_type === 'json' ? (
        <textarea
          id={inputId}
          value={draft}
          onChange={(e) => handleChange(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-border bg-surface-2 text-ink text-sm font-mono px-3 py-2 placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-colors resize-y"
          spellCheck={false}
        />
      ) : (
        <Input
          id={inputId}
          type={setting.value_type === 'number' ? 'number' : 'text'}
          value={draft}
          onChange={(e) => handleChange(e.target.value)}
          min={setting.value_type === 'number' ? 0 : undefined}
        />
      )}

      {setting.description && (
        <p className="text-[11px] text-ink-faint">{setting.description}</p>
      )}

      {dirty && !setting.is_secret && (
        <div className="flex justify-end pt-1">
          <Button
            size="xs"
            variant="primary"
            icon={<Save className="h-3 w-3" />}
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      )}
    </div>
  )
}

// ── Category panel ────────────────────────────────────────────────────────────

interface CategoryPanelProps {
  settings: SettingEntry[]
  onSaved: () => void
}

function CategoryPanel({ settings, onSaved }: CategoryPanelProps) {
  if (!settings || settings.length === 0) {
    return (
      <Card className="p-6 text-center text-ink-faint text-sm">
        No settings in this category.
      </Card>
    )
  }

  return (
    <Card className="divide-y divide-border">
      {settings.map((s) => (
        <div key={s.key} className="p-4">
          <FieldEditor setting={s} onSaved={onSaved} />
        </div>
      ))}
    </Card>
  )
}

// ── Environment panel ─────────────────────────────────────────────────────────

function EnvironmentPanel() {
  const { data, isLoading, error, refetch } = useQuery<EnvironmentInfo>({
    queryKey: ['settings-environment'],
    queryFn: settingsApi.getEnvironment,
    refetchInterval: 30_000,
  })

  if (error) {
    return (
      <ErrorMessage
        error={error}
        onRetry={() => void refetch()}
        endpoint={ENDPOINTS.settingsEnvironment.path}
      />
    )
  }

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="p-4">
            <Skeleton className="h-4 w-24 mb-2" />
            <Skeleton className="h-6 w-32" />
          </Card>
        ))}
      </div>
    )
  }

  const rows: Array<{ label: string; value: string; ok?: boolean }> = [
    { label: 'Node Version',    value: data.node_version },
    { label: 'Environment',     value: data.env },
    { label: 'Uptime',          value: formatUptime(data.uptime_seconds) },
    { label: 'RSS Memory',      value: `${data.memory_mb.rss} MB` },
    { label: 'Heap Used',       value: `${data.memory_mb.heap_used} / ${data.memory_mb.heap_total} MB` },
    { label: 'Redis',           value: data.redis_healthy ? 'Connected' : 'Unreachable', ok: data.redis_healthy },
    { label: 'Database',        value: data.db_healthy ? 'Connected' : 'Unreachable',   ok: data.db_healthy },
  ]

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="secondary" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />}
          onClick={() => void refetch()}>
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {rows.map((r) => (
          <Card key={r.label} className="p-4 flex flex-col gap-1">
            <span className="text-[11px] font-medium text-ink-faint uppercase tracking-wide">
              {r.label}
            </span>
            <div className="flex items-center gap-1.5">
              {r.ok !== undefined ? (
                r.ok
                  ? <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
                  : <XCircle className="h-3.5 w-3.5 text-rose-400" />
              ) : null}
              <span className={`text-sm font-medium ${
                r.ok === false ? 'text-rose-400' : r.ok === true ? 'text-emerald-400' : 'text-ink'
              }`}>
                {r.value}
              </span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}

function formatUptime(secs: number): string {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function PasswordInput({
  label, value, onChange, autoComplete, placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  autoComplete?: string
  placeholder?: string
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-ink-muted">{label}</label>
      <div className="relative">
        <Input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          placeholder={placeholder ?? '••••••••'}
          className="pr-9"
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setShow((s) => !s)}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink"
        >
          {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setCopied(false), 2000)
    })
  }

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

// ── TOTP Setup Modal ──────────────────────────────────────────────────────────

function TotpSetupModal({
  data,
  onClose,
  onVerified,
}: {
  data:       TotpSetupData
  onClose:    () => void
  onVerified: () => void
}) {
  const [code,  setCode]  = useState('')
  const [error, setError] = useState('')

  const formattedSecret = data.secret.match(/.{1,4}/g)?.join(' ') ?? data.secret

  const verifyMutation = useMutation({
    mutationFn: () => authApi.verifyTotp(code.replace(/\s/g, '')),
    onSuccess: () => {
      toast.success('Two-factor authentication enabled')
      onVerified()
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Invalid code — try again'
      setError(msg)
    },
  })

  return (
    <Modal
      open
      onClose={onClose}
      title="Set Up Two-Factor Authentication"
      subtitle="Scan with an authenticator app or enter the key manually"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={code.replace(/\s/g,'').length !== 6 || verifyMutation.isPending}
            onClick={() => { setError(''); verifyMutation.mutate() }}
          >
            {verifyMutation.isPending ? 'Verifying…' : 'Verify & Enable'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {/* Step 1 — secret */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide">
            Step 1 — Add account to your authenticator app
          </p>
          <div className="flex items-center justify-between rounded-lg border border-border bg-surface-2 px-3 py-2">
            <code className="text-sm font-mono text-ink tracking-widest">{formattedSecret}</code>
            <CopyButton text={data.secret} />
          </div>
          <p className="text-[11px] text-ink-faint">
            Open Google Authenticator, Authy, or any TOTP app → Add account → Enter key manually → paste the secret above.
          </p>
        </div>

        {/* Step 2 — backup codes */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide">
              Step 2 — Save your backup codes
            </p>
            <CopyButton text={data.backup_codes.join('\n')} />
          </div>
          <div className="rounded-lg border border-amber-400/30 bg-amber-400/5 p-3">
            <div className="flex items-start gap-2 mb-2">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-[11px] text-amber-600 dark:text-amber-400">
                These codes are shown <strong>once only</strong>. Store them in a password manager or secure location. Each code can be used once to disable 2FA if you lose your device.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {data.backup_codes.map((c) => (
                <code key={c} className="block font-mono text-xs bg-surface-1 rounded px-2 py-1 text-ink text-center tracking-widest">
                  {c}
                </code>
              ))}
            </div>
          </div>
        </div>

        {/* Step 3 — verify */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide">
            Step 3 — Enter the 6-digit code from your app
          </p>
          <Input
            type="text"
            inputMode="numeric"
            maxLength={6}
            placeholder="000000"
            value={code}
            onChange={(e) => { setCode(e.target.value.replace(/\D/g,'')); setError('') }}
            className="text-center text-xl font-mono tracking-[0.4em]"
          />
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      </div>
    </Modal>
  )
}

// ── Disable TOTP Modal ────────────────────────────────────────────────────────

function DisableTotpModal({
  onClose,
  onDisabled,
}: {
  onClose:    () => void
  onDisabled: () => void
}) {
  const [password, setPassword] = useState('')
  const [code,     setCode]     = useState('')
  const [error,    setError]    = useState('')

  const disableMutation = useMutation({
    mutationFn: () => authApi.disableTotp({ current_password: password, totp_code: code.replace(/\s/g,'') }),
    onSuccess: () => {
      toast.success('Two-factor authentication disabled')
      onDisabled()
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to disable 2FA'
      setError(msg)
    },
  })

  const canSubmit = password.length >= 1 && code.replace(/\s/g,'').length >= 6 && !disableMutation.isPending

  return (
    <Modal
      open
      onClose={onClose}
      title="Disable Two-Factor Authentication"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            variant="danger"
            disabled={!canSubmit}
            onClick={() => { setError(''); disableMutation.mutate() }}
          >
            {disableMutation.isPending ? 'Disabling…' : 'Disable 2FA'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start gap-2 rounded-lg border border-red-400/30 bg-red-400/5 p-3">
          <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
          <p className="text-xs text-red-600 dark:text-red-400">
            Disabling 2FA reduces your account security. Anyone who gains access to your password will be able to log in.
          </p>
        </div>

        <PasswordInput
          label="Current password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
        />

        <div className="space-y-1">
          <label className="block text-xs font-medium text-ink-muted">
            TOTP code or backup code
          </label>
          <Input
            type="text"
            inputMode="numeric"
            placeholder="6-digit code or backup code"
            value={code}
            onChange={(e) => { setCode(e.target.value); setError('') }}
          />
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    </Modal>
  )
}

// ── Account Security Panel ────────────────────────────────────────────────────

function AccountSecurityPanel() {
  const navigate  = useNavigate()
  const clearAuth = useAuthStore((s) => s.clearAuth)
  const qc        = useQueryClient()

  // ── Change Password ───────────────────────────────────────────────────────
  const [currentPwd,  setCurrentPwd]  = useState('')
  const [newPwd,      setNewPwd]      = useState('')
  const [confirmPwd,  setConfirmPwd]  = useState('')
  const [pwdError,    setPwdError]    = useState('')
  const [pwdSuccess,  setPwdSuccess]  = useState(false)

  const pwdMutation = useMutation({
    mutationFn: () => authApi.changePassword({
      current_password: currentPwd,
      new_password:     newPwd,
      confirm_password: confirmPwd,
    }),
    onSuccess: () => {
      setPwdSuccess(true)
      setTimeout(() => {
        clearAuth()
        navigate('/login')
      }, 3000)
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to change password'
      setPwdError(msg)
    },
  })

  function validateAndSubmitPwd() {
    setPwdError('')
    if (!currentPwd) { setPwdError('Current password is required'); return }
    if (newPwd.length < 8) { setPwdError('New password must be at least 8 characters'); return }
    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(newPwd)) {
      setPwdError('New password must contain uppercase, lowercase, and a digit'); return
    }
    if (newPwd !== confirmPwd) { setPwdError('Passwords do not match'); return }
    pwdMutation.mutate()
  }

  // ── 2FA ────────────────────────────────────────────────────────────────────
  const [showSetupModal,   setShowSetupModal]   = useState(false)
  const [showDisableModal, setShowDisableModal] = useState(false)
  const [totpSetupData,    setTotpSetupData]    = useState<TotpSetupData | null>(null)

  const { data: secStatus, refetch: refetchStatus } = useQuery({
    queryKey: ['security-status'],
    queryFn:  authApi.getSecurityStatus,
  })

  const setupMutation = useMutation({
    mutationFn: authApi.setupTotp,
    onSuccess:  (data) => { setTotpSetupData(data); setShowSetupModal(true) },
    onError:    (err: unknown) => toast.error(err instanceof Error ? err.message : 'Setup failed'),
  })

  function handleVerified() {
    setShowSetupModal(false)
    setTotpSetupData(null)
    void refetchStatus()
    void qc.invalidateQueries({ queryKey: ['security-status'] })
  }

  function handleDisabled() {
    setShowDisableModal(false)
    void refetchStatus()
  }

  return (
    <div className="space-y-6">
      {/* Change Password */}
      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-ink-faint" />
          <h3 className="text-sm font-semibold text-ink">Change Password</h3>
        </div>

        {pwdSuccess ? (
          <div className="flex items-center gap-2 rounded-lg border border-green-400/30 bg-green-400/5 p-4">
            <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
            <div>
              <p className="text-sm font-medium text-green-600 dark:text-green-400">
                Password changed successfully.
              </p>
              <p className="text-xs text-ink-faint mt-0.5">
                All sessions have been revoked. Redirecting to login in 3 seconds…
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <PasswordInput
              label="Current password"
              value={currentPwd}
              onChange={setCurrentPwd}
              autoComplete="current-password"
            />
            <PasswordInput
              label="New password"
              value={newPwd}
              onChange={(v) => { setNewPwd(v); setPwdError('') }}
              autoComplete="new-password"
              placeholder="Min. 8 chars, upper/lower/digit"
            />
            <PasswordInput
              label="Confirm new password"
              value={confirmPwd}
              onChange={(v) => { setConfirmPwd(v); setPwdError('') }}
              autoComplete="new-password"
            />

            {pwdError && (
              <p className="text-xs text-red-500 flex items-center gap-1">
                <XCircle className="h-3.5 w-3.5 shrink-0" />
                {pwdError}
              </p>
            )}

            <p className="text-[11px] text-ink-faint">
              After changing your password all active sessions will be revoked and you will be logged out.
            </p>

            <div className="flex justify-end">
              <Button
                variant="primary"
                size="sm"
                icon={<LogOut className="h-3.5 w-3.5" />}
                disabled={pwdMutation.isPending || !currentPwd || !newPwd || !confirmPwd}
                onClick={validateAndSubmitPwd}
              >
                {pwdMutation.isPending ? 'Changing…' : 'Change Password'}
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Two-Factor Authentication */}
      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-ink-faint" />
            <h3 className="text-sm font-semibold text-ink">Two-Factor Authentication</h3>
          </div>
          {secStatus && (
            <Badge variant={secStatus.totp_enabled ? 'success' : 'neutral'}>
              {secStatus.totp_enabled ? 'Enabled' : secStatus.totp_setup_pending ? 'Setup pending' : 'Disabled'}
            </Badge>
          )}
        </div>

        <div className="text-xs text-ink-faint space-y-1">
          <p>
            TOTP-based two-factor authentication using any authenticator app (Google Authenticator, Authy, 1Password, etc.).
          </p>
          <div className="flex items-center gap-1.5 rounded-lg border border-amber-400/30 bg-amber-400/5 p-2.5 mt-2">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
            <span className="text-amber-600 dark:text-amber-400">
              <strong>Feature flag:</strong> 2FA enrollment is available. Login enforcement will be activated in a future release — enabling now registers your device for that rollout.
            </span>
          </div>
        </div>

        <div className="flex gap-2">
          {!secStatus?.totp_enabled ? (
            <Button
              variant="primary"
              size="sm"
              icon={<Smartphone className="h-3.5 w-3.5" />}
              disabled={setupMutation.isPending}
              onClick={() => setupMutation.mutate()}
            >
              {setupMutation.isPending
                ? 'Generating…'
                : secStatus?.totp_setup_pending
                  ? 'Resume Setup'
                  : 'Set Up 2FA'}
            </Button>
          ) : (
            <Button
              variant="danger"
              size="sm"
              onClick={() => setShowDisableModal(true)}
            >
              Disable 2FA
            </Button>
          )}
        </div>
      </Card>

      {/* Modals */}
      {showSetupModal && totpSetupData && (
        <TotpSetupModal
          data={totpSetupData}
          onClose={() => setShowSetupModal(false)}
          onVerified={handleVerified}
        />
      )}
      {showDisableModal && (
        <DisableTotpModal
          onClose={() => setShowDisableModal(false)}
          onDisabled={handleDisabled}
        />
      )}
    </div>
  )
}

// ── Admin Alerts Panel ────────────────────────────────────────────────────────

interface PrefToggleProps {
  label:       string
  description: string
  checked:     boolean
  onChange:    (v: boolean) => void
  disabled?:   boolean
}

function PrefToggle({ label, description, checked, onChange, disabled }: PrefToggleProps) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-border last:border-0">
      <div>
        <p className="text-sm font-medium text-ink">{label}</p>
        <p className="text-xs text-ink-faint mt-0.5">{description}</p>
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-accent/50 disabled:opacity-40 ${
          checked ? 'bg-accent' : 'bg-surface-3'
        }`}
        role="switch"
        aria-checked={checked}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
      </button>
    </div>
  )
}

function AdminAlertsPanel() {
  const qc = useQueryClient()

  const { data: prefs, isLoading, error } = useQuery<AdminPushPreferences>({
    queryKey: ['admin-push-prefs'],
    queryFn:  adminPushApi.getPreferences,
  })

  const { data: status, refetch: refetchStatus } = useQuery({
    queryKey: ['admin-push-status'],
    queryFn:  adminPushApi.getStatus,
  })

  const updateMutation = useMutation({
    mutationFn: adminPushApi.updatePreferences,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin-push-prefs'] })
      toast.success('Preferences saved')
    },
    onError: () => toast.error('Failed to save preferences'),
  })

  const testMutation = useMutation({
    mutationFn: adminPushApi.sendTest,
    onSuccess: (data) => {
      if (data.sent > 0) toast.success('Test notification sent!')
      else toast.error('Sent but no tokens registered — enable push first')
    },
    onError: () => toast.error('Test failed'),
  })

  const [registering, setRegistering] = useState(false)

  async function handleEnablePush() {
    if (!isFirebaseConfigured()) {
      toast.error('Firebase not configured — set VITE_FIREBASE_* env vars')
      return
    }
    setRegistering(true)
    try {
      const result = await requestFcmToken()
      if (!result.ok) {
        if (result.reason === 'permission_denied') toast.error('Notification permission denied')
        else if (result.reason === 'not_configured') toast.error('Firebase env vars not set')
        else toast.error(result.message ?? 'Failed to get push token')
        return
      }
      await adminPushApi.registerToken(result.token)
      await adminPushApi.updatePreferences({ push_enabled: true })
      await qc.invalidateQueries({ queryKey: ['admin-push-prefs'] })
      await refetchStatus()
      toast.success('Push notifications enabled!')
    } finally {
      setRegistering(false)
    }
  }

  // Listen for foreground push messages while this tab is open
  useEffect(() => {
    return onForegroundMessage((title, body) => {
      toast(`${title}: ${body}`, { icon: '🔔', duration: 6000 })
    })
  }, [])

  function toggle(key: keyof AdminPushPreferences) {
    if (!prefs) return
    updateMutation.mutate({ [key]: !prefs[key] })
  }

  if (error) return (
    <Card className="p-6 text-center text-sm text-rose-400">
      Failed to load alert preferences
    </Card>
  )

  if (isLoading || !prefs) return (
    <Card className="divide-y divide-border">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="p-4 space-y-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-64" />
        </div>
      ))}
    </Card>
  )

  const hasToken     = status?.has_active_token ?? false
  const fcmReady     = prefs.fcm_configured && isFirebaseConfigured()

  return (
    <div className="space-y-6">
      {/* Push registration */}
      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <BellRing className="h-4 w-4 text-ink-faint" />
          <h3 className="text-sm font-semibold text-ink">Browser Push Notifications</h3>
          <Badge variant={hasToken && prefs.push_enabled ? 'success' : 'neutral'} className="ml-auto">
            {hasToken && prefs.push_enabled ? 'Active' : 'Inactive'}
          </Badge>
        </div>

        {!prefs.fcm_configured && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-400/30 bg-amber-400/5 p-3">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Firebase is not configured on the backend. Set <code className="font-mono">FIREBASE_PROJECT_ID</code>, <code className="font-mono">FIREBASE_CLIENT_EMAIL</code>, and <code className="font-mono">FIREBASE_PRIVATE_KEY</code> in Railway env vars to enable push delivery.
            </p>
          </div>
        )}

        {!isFirebaseConfigured() && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-400/30 bg-amber-400/5 p-3">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Firebase web SDK not configured. Set <code className="font-mono">VITE_FIREBASE_API_KEY</code>, <code className="font-mono">VITE_FIREBASE_PROJECT_ID</code>, <code className="font-mono">VITE_FIREBASE_MESSAGING_SENDER_ID</code>, <code className="font-mono">VITE_FIREBASE_APP_ID</code>, and <code className="font-mono">VITE_FIREBASE_VAPID_KEY</code> in the admin dashboard env file.
            </p>
          </div>
        )}

        <p className="text-xs text-ink-faint">
          Register this browser to receive real-time push alerts for operational events — failed transactions, provider outages, new support tickets, and more.
        </p>

        <div className="flex gap-2 flex-wrap">
          {!hasToken || !prefs.push_enabled ? (
            <Button
              variant="primary"
              size="sm"
              icon={<BellRing className="h-3.5 w-3.5" />}
              disabled={registering || !fcmReady}
              onClick={() => void handleEnablePush()}
            >
              {registering ? 'Registering…' : 'Enable Push Notifications'}
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              icon={<BellOff className="h-3.5 w-3.5" />}
              onClick={() => updateMutation.mutate({ push_enabled: false })}
              disabled={updateMutation.isPending}
            >
              Disable Push
            </Button>
          )}

          <Button
            variant="secondary"
            size="sm"
            icon={<Send className="h-3.5 w-3.5" />}
            disabled={testMutation.isPending || !hasToken}
            onClick={() => testMutation.mutate()}
          >
            {testMutation.isPending ? 'Sending…' : 'Send Test'}
          </Button>
        </div>
      </Card>

      {/* Category toggles */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Bell className="h-4 w-4 text-ink-faint" />
          <h3 className="text-sm font-semibold text-ink">Alert Categories</h3>
        </div>
        <p className="text-xs text-ink-faint mb-4">
          Choose which operational events trigger a push notification to your device. These only affect your account.
        </p>

        <div>
          <PrefToggle
            label="Transaction Failures"
            description="Push when all providers fail for a customer transaction"
            checked={prefs.admin_transaction_failures}
            onChange={() => toggle('admin_transaction_failures')}
            disabled={updateMutation.isPending}
          />
          <PrefToggle
            label="Provider Alerts"
            description="Push when a provider's circuit breaker trips open"
            checked={prefs.admin_provider_alerts}
            onChange={() => toggle('admin_provider_alerts')}
            disabled={updateMutation.isPending}
          />
          <PrefToggle
            label="Support Messages"
            description="Push when a customer opens a new support ticket"
            checked={prefs.admin_support_messages}
            onChange={() => toggle('admin_support_messages')}
            disabled={updateMutation.isPending}
          />
          <PrefToggle
            label="Payment Alerts"
            description="Push for payment gateway failures and webhook errors"
            checked={prefs.admin_payment_alerts}
            onChange={() => toggle('admin_payment_alerts')}
            disabled={updateMutation.isPending}
          />
          <PrefToggle
            label="Security Events"
            description="Push for suspicious logins and security-related events"
            checked={prefs.admin_security_events}
            onChange={() => toggle('admin_security_events')}
            disabled={updateMutation.isPending}
          />
          <PrefToggle
            label="System Alerts"
            description="Push for critical system events and maintenance notices"
            checked={prefs.admin_system_alerts}
            onChange={() => toggle('admin_system_alerts')}
            disabled={updateMutation.isPending}
          />
        </div>
      </Card>
    </div>
  )
}

// ── Maintenance Mode Panel ────────────────────────────────────────────────────

function MaintenanceModePanel({ settings, onSaved }: CategoryPanelProps) {
  const setting   = settings.find((s) => s.key === 'maintenance_mode')
  const isOn      = setting?.value === 'true'
  const [armed, setArmed] = useState(false)

  const mutation = useMutation({
    mutationFn: (next: boolean) => settingsApi.update('maintenance_mode', next ? 'true' : 'false'),
    onSuccess: (_data, next) => {
      toast.success(next ? 'Maintenance mode enabled — customers are now blocked' : 'Maintenance mode disabled — service restored')
      setArmed(false)
      onSaved()
    },
    onError: () => { toast.error('Failed to update maintenance mode'); setArmed(false) },
  })

  if (!setting) {
    return (
      <Card className="p-6 text-center text-ink-faint text-sm">
        Maintenance setting not found. It will be created automatically on the next server restart.
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Status card */}
      <Card className={`p-6 border-2 transition-colors ${isOn ? 'border-red-500/40 bg-red-500/5' : 'border-emerald-500/20 bg-emerald-500/5'}`}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`h-12 w-12 rounded-full flex items-center justify-center ${isOn ? 'bg-red-500/15' : 'bg-emerald-500/15'}`}>
              <Power className={`h-6 w-6 ${isOn ? 'text-red-400' : 'text-emerald-400'}`} />
            </div>
            <div>
              <p className="text-base font-bold text-ink">
                {isOn ? 'Maintenance Mode ON' : 'Maintenance Mode OFF'}
              </p>
              <p className="text-xs text-ink-faint mt-0.5">
                {isOn
                  ? 'All customer API requests are returning 503. Admin and webhook routes are unaffected.'
                  : 'Service is running normally. Customers can access all features.'}
              </p>
            </div>
          </div>
          <Badge variant={isOn ? 'danger' : 'success'} className="shrink-0 text-sm px-3 py-1">
            {isOn ? 'ON' : 'OFF'}
          </Badge>
        </div>

        {setting.updated_by && (
          <p className="text-[11px] text-ink-faint mt-4 pt-4 border-t border-border">
            Last changed by {setting.updated_by} · {new Date(setting.updated_at).toLocaleString()}
          </p>
        )}
      </Card>

      {/* Action */}
      {isOn ? (
        <Card className="p-5 space-y-4">
          <div className="flex items-start gap-2 rounded-lg border border-emerald-400/30 bg-emerald-400/5 p-3">
            <CheckCircle className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              Disabling maintenance mode will immediately restore customer access.
            </p>
          </div>
          <Button
            variant="primary"
            icon={<Power className="h-4 w-4" />}
            disabled={mutation.isPending}
            onClick={() => mutation.mutate(false)}
          >
            {mutation.isPending ? 'Restoring…' : 'Disable Maintenance Mode'}
          </Button>
        </Card>
      ) : (
        <Card className="p-5 space-y-4">
          <div className="flex items-start gap-2 rounded-lg border border-red-400/30 bg-red-400/5 p-3">
            <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
            <div className="text-xs text-red-600 dark:text-red-400 space-y-1">
              <p className="font-semibold">Enabling maintenance mode will immediately block all customer requests.</p>
              <p>Webhooks (Paystack, providers) and admin routes remain active. Disable as soon as maintenance is complete.</p>
            </div>
          </div>

          {!armed ? (
            <Button
              variant="danger"
              icon={<Wrench className="h-4 w-4" />}
              onClick={() => setArmed(true)}
            >
              Enable Maintenance Mode
            </Button>
          ) : (
            <div className="flex items-center gap-3">
              <Button
                variant="danger"
                disabled={mutation.isPending}
                onClick={() => mutation.mutate(true)}
              >
                {mutation.isPending ? 'Enabling…' : 'Confirm — Block All Customers'}
              </Button>
              <button
                type="button"
                onClick={() => setArmed(false)}
                className="text-sm text-ink-muted hover:text-ink transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
        </Card>
      )}

      {/* Info */}
      <Card className="p-4 space-y-2">
        <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide">What stays active during maintenance</p>
        <ul className="text-xs text-ink-faint space-y-1 list-disc list-inside">
          <li>Admin dashboard — all admin routes remain accessible</li>
          <li>Paystack webhooks — wallet credits continue processing</li>
          <li>Provider webhooks — VTU callbacks are not blocked</li>
          <li>Public endpoints — /public/status so the app can detect maintenance</li>
        </ul>
      </Card>
    </div>
  )
}

// ── Skeleton loading ──────────────────────────────────────────────────────────

function SettingsSkeleton() {
  return (
    <Card className="divide-y divide-border">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="p-4 space-y-2">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-3 w-48" />
        </div>
      ))}
    </Card>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('general')
  const qc = useQueryClient()

  const { data: settingsData, isLoading, error, refetch } = useQuery<SettingsByCategory>({
    queryKey: ['admin-settings'],
    queryFn: settingsApi.list,
  })

  const handleSaved = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['admin-settings'] })
  }, [qc])

  const currentSettings = activeTab !== 'environment' && activeTab !== 'account' && activeTab !== 'alerts' && activeTab !== 'maintenance'
    ? (settingsData?.[activeTab] ?? [])
    : []

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Settings"
        subtitle="Platform configuration — changes take effect immediately"
        actions={
          <Button variant="secondary" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />}
            onClick={() => void refetch()}>
            Refresh
          </Button>
        }
      />

      {/* Tab bar */}
      <div className="flex flex-wrap gap-1 border-b border-border pb-0">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-t-lg border-b-2 transition-colors -mb-px ${
              activeTab === tab.key
                ? 'border-accent text-accent font-medium'
                : 'border-transparent text-ink-muted hover:text-ink hover:border-border'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'environment' ? (
          <EnvironmentPanel />
        ) : activeTab === 'account' ? (
          <AccountSecurityPanel />
        ) : activeTab === 'alerts' ? (
          <AdminAlertsPanel />
        ) : activeTab === 'maintenance' ? (
          isLoading ? <SettingsSkeleton /> : (
            <MaintenanceModePanel
              settings={settingsData?.['maintenance'] ?? []}
              onSaved={handleSaved}
            />
          )
        ) : error ? (
          <ErrorMessage
            error={error}
            onRetry={() => void refetch()}
            endpoint={ENDPOINTS.settings.path}
          />
        ) : isLoading ? (
          <SettingsSkeleton />
        ) : (
          <CategoryPanel settings={currentSettings} onSaved={handleSaved} />
        )}
      </div>
    </div>
  )
}
