import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { providersApi } from '@/api/providers.api'
import type {
  ProviderRegistryRow,
  CreateProviderInput,
  UpdateProviderRegistryInput,
  UpsertProviderCredentialsInput,
  ProviderAuthType,
} from '@/types'
import {
  Zap, Plus, Edit2, Key, Activity, CheckCircle2, XCircle,
  AlertTriangle, ChevronDown, ChevronUp, Wifi, WifiOff,
  RefreshCw, X, Shield, Globe, Info, Loader2,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { cn } from '@/utils/cn'

// ── Auth type configuration ───────────────────────────────────────────────────

interface AuthTypeConfig {
  value: ProviderAuthType
  label: string
  description: string
  requiredFields: readonly string[]
  shownFields: readonly string[]
  fieldLabels?: Partial<Record<string, string>>
}

const AUTH_TYPES: AuthTypeConfig[] = [
  {
    value:          'api_key',
    label:          'API Key Only',
    description:    'Single API key passed in a header or query param',
    requiredFields: ['api_key'],
    shownFields:    ['base_url', 'api_key'],
  },
  {
    value:          'api_key_secret',
    label:          'API Key + Secret',
    description:    'API key for identity, secret key for signing requests',
    requiredFields: ['api_key', 'secret_key'],
    shownFields:    ['base_url', 'api_key', 'secret_key'],
  },
  {
    value:          'bearer_token',
    label:          'Bearer Token',
    description:    'Authorization: Bearer <token> header',
    requiredFields: ['bearer_token'],
    shownFields:    ['base_url', 'bearer_token'],
  },
  {
    value:          'username_password',
    label:          'Username + Password',
    description:    'HTTP Basic Auth or login-based credentials',
    requiredFields: ['username', 'password'],
    shownFields:    ['base_url', 'username', 'password'],
  },
  {
    value:          'custom_headers',
    label:          'Custom Headers',
    description:    'Arbitrary request headers as a JSON object',
    requiredFields: ['custom_headers'],
    shownFields:    ['base_url', 'custom_headers'],
  },
  {
    value:          'none',
    label:          'No Auth / Manual',
    description:    'No credentials needed or handled outside this system',
    requiredFields: [],
    shownFields:    ['base_url'],
  },
  {
    value:          'advanced',
    label:          'Mixed / Advanced',
    description:    'Combination of multiple methods — fill whichever fields apply',
    requiredFields: [],
    shownFields:    ['base_url', 'api_key', 'secret_key', 'bearer_token', 'username', 'password', 'custom_headers'],
  },
  {
    value:          'userid_apikey',
    label:          'UserID + APIKey',
    description:    'Clubkonnect authentication — UserID (username field) and APIKey (api_key field) are both required',
    requiredFields: ['username', 'api_key'],
    shownFields:    ['base_url', 'username', 'api_key'],
    fieldLabels:    { username: 'UserID', api_key: 'APIKey' },
  },
]

const AUTH_TYPE_MAP = Object.fromEntries(
  AUTH_TYPES.map((t) => [t.value, t])
) as Record<ProviderAuthType, AuthTypeConfig>

// ── Service constants ─────────────────────────────────────────────────────────

const ALL_SERVICE_TYPES = [
  'airtime', 'data', 'electricity', 'cable_tv',
  'exam_pin', 'identity_verification', 'wallet_funding',
] as const

const SERVICE_LABELS: Record<string, string> = {
  airtime:               'Airtime',
  data:                  'Data',
  electricity:           'Electricity',
  cable_tv:              'Cable TV',
  exam_pin:              'Exam PIN',
  identity_verification: 'Identity Verification',
  wallet_funding:        'Wallet Funding',
}

// ── Shared UI helpers ─────────────────────────────────────────────────────────

function Badge({
  active,
  onClick,
  loading = false,
}: {
  active: boolean
  onClick?: () => void
  loading?: boolean
}) {
  const icon = loading
    ? <Loader2 className="h-3 w-3 animate-spin" />
    : active
      ? <CheckCircle2 className="h-3 w-3" />
      : <XCircle className="h-3 w-3" />

  const label = active ? 'Active' : 'Disabled'

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        title={active ? 'Click to disable provider' : 'Click to enable provider'}
        className={cn(
          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors',
          active
            ? 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/20'
            : 'bg-surface-2 text-ink-faint hover:bg-surface-3',
          loading && 'cursor-wait opacity-60',
        )}
      >
        {icon} {label}
      </button>
    )
  }

  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold',
      active ? 'bg-emerald-500/15 text-emerald-400' : 'bg-surface-2 text-ink-faint',
    )}>
      {icon} {label}
    </span>
  )
}

function HealthDot({ status }: { status: string }) {
  const color =
    status === 'healthy'   ? 'bg-green-500' :
    status === 'degraded'  ? 'bg-yellow-500' :
    status === 'unhealthy' ? 'bg-red-500' :
                             'bg-zinc-400'
  return <span className={cn('inline-block h-2 w-2 rounded-full', color)} title={status} />
}

function CredentialFlag({ label, present }: { label: string; present: boolean }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium',
      present ? 'bg-accent/10 text-accent' : 'bg-surface-2 text-ink-faint line-through'
    )}>
      {label}
    </span>
  )
}

function ConfiguredBadge({ configured }: { configured: boolean }) {
  return configured ? (
    <span className="ml-1 text-[10px] text-green-600 font-medium">✓ Configured</span>
  ) : (
    <span className="ml-1 text-[10px] text-zinc-400">Not configured</span>
  )
}

// ── Shared credential field component ────────────────────────────────────────

function CredField({
  label, value, onChange, placeholder, type = 'text',
  configured, isRequired, hint,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  configured?: boolean
  isRequired?: boolean
  hint?: string
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs font-medium text-ink-muted">
          {label}{isRequired ? ' *' : ''}
        </label>
        {configured !== undefined && <ConfiguredBadge configured={configured} />}
      </div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={configured ? 'Paste new value to replace existing' : (placeholder ?? '')}
        className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-accent font-mono"
      />
      {hint && <p className="mt-0.5 text-[10px] text-ink-faint truncate">{hint}</p>}
    </div>
  )
}

// ── Credential section (reused in both ProviderFormModal and CredentialsModal) ─

interface CredSectionProps {
  /** Existing provider row — used to show has_* flags in edit mode. Null in create mode. */
  existing: ProviderRegistryRow | null
  authType: ProviderAuthType
  setAuthType: (v: ProviderAuthType) => void
  baseUrl: string;      setBaseUrl: (v: string) => void
  apiKey: string;       setApiKey: (v: string) => void
  secretKey: string;    setSecretKey: (v: string) => void
  bearerToken: string;  setBearerToken: (v: string) => void
  username: string;     setUsername: (v: string) => void
  password: string;     setPassword: (v: string) => void
  webhookSecret: string; setWebhookSecret: (v: string) => void
  customHeaders: string; setCustomHeaders: (v: string) => void
  customHeadersError: string; setCustomHeadersError: (v: string) => void
  isLive: boolean;      setIsLive: (v: boolean) => void
}

function CredSection({
  existing,
  authType, setAuthType,
  baseUrl, setBaseUrl,
  apiKey, setApiKey,
  secretKey, setSecretKey,
  bearerToken, setBearerToken,
  username, setUsername,
  password, setPassword,
  webhookSecret, setWebhookSecret,
  customHeaders, setCustomHeaders,
  customHeadersError, setCustomHeadersError,
  isLive, setIsLive,
}: CredSectionProps) {
  const config = AUTH_TYPE_MAP[authType]
  const shown    = config.shownFields
  const required = config.requiredFields

  const hasField = (field: string): boolean => {
    if (!existing?.has_credentials) return false
    switch (field) {
      case 'api_key':        return existing.has_api_key
      case 'secret_key':     return existing.has_secret_key
      case 'username':       return existing.has_username
      case 'password':       return existing.has_password
      case 'bearer_token':   return existing.has_bearer_token
      case 'webhook_secret': return existing.has_webhook_secret
      case 'custom_headers': return existing.has_custom_headers
      default:               return false
    }
  }

  return (
    <div className="space-y-3">
      {/* Helper */}
      <div className="flex gap-2 p-3 bg-accent/5 border border-accent/20 rounded-lg text-xs text-accent">
        <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <span>
          Only fill the credentials required by this provider.
          {existing?.has_credentials
            ? ' Leave fields blank to keep existing values. Secrets are never displayed.'
            : ' You can also configure credentials later.'}
        </span>
      </div>

      {/* Auth Type */}
      <div>
        <label className="block text-xs font-medium text-ink-muted mb-1">Authentication Type</label>
        <select
          value={authType}
          onChange={(e) => setAuthType(e.target.value as ProviderAuthType)}
          className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-accent"
        >
          {AUTH_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <p className="mt-0.5 text-[11px] text-ink-faint">{config.description}</p>
      </div>

      {/* Base URL — shown for all types */}
      <CredField
        label="Base URL"
        value={baseUrl}
        onChange={setBaseUrl}
        placeholder="https://api.provider.com/v1"
        type="url"
        configured={existing ? !!existing.base_url : undefined}
        hint={existing?.base_url ? `Current: ${existing.base_url}` : undefined}
      />

      {/* API Key */}
      {shown.includes('api_key') && (
        <CredField
          label={config.fieldLabels?.api_key ?? 'API Key'}
          value={apiKey}
          onChange={setApiKey}
          placeholder={config.fieldLabels?.api_key ? `Your ${config.fieldLabels.api_key}` : 'Your API key'}
          configured={existing ? hasField('api_key') : undefined}
          isRequired={required.includes('api_key') && !hasField('api_key')}
        />
      )}

      {/* Secret Key */}
      {shown.includes('secret_key') && (
        <CredField
          label="Secret Key"
          value={secretKey}
          onChange={setSecretKey}
          placeholder="Your secret key"
          configured={existing ? hasField('secret_key') : undefined}
          isRequired={required.includes('secret_key') && !hasField('secret_key')}
        />
      )}

      {/* Bearer Token */}
      {shown.includes('bearer_token') && (
        <CredField
          label="Bearer Token"
          value={bearerToken}
          onChange={setBearerToken}
          placeholder="Bearer token value"
          configured={existing ? hasField('bearer_token') : undefined}
          isRequired={required.includes('bearer_token') && !hasField('bearer_token')}
        />
      )}

      {/* Username / UserID */}
      {shown.includes('username') && (
        <CredField
          label={config.fieldLabels?.username ?? 'Username'}
          value={username}
          onChange={setUsername}
          placeholder={config.fieldLabels?.username ?? 'Username'}
          configured={existing ? hasField('username') : undefined}
          isRequired={required.includes('username') && !hasField('username')}
        />
      )}

      {/* Password */}
      {shown.includes('password') && (
        <CredField
          label="Password"
          value={password}
          onChange={setPassword}
          placeholder="Password"
          type="password"
          configured={existing ? hasField('password') : undefined}
          isRequired={required.includes('password') && !hasField('password')}
        />
      )}

      {/* Custom Headers */}
      {shown.includes('custom_headers') && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-medium text-ink-muted">
              Custom Headers (JSON){required.includes('custom_headers') && !hasField('custom_headers') ? ' *' : ''}
            </label>
            {existing && <ConfiguredBadge configured={hasField('custom_headers')} />}
          </div>
          <textarea
            value={customHeaders}
            onChange={(e) => { setCustomHeaders(e.target.value); setCustomHeadersError('') }}
            rows={3}
            placeholder={'{"X-Api-Key": "your-key", "X-Custom-Header": "value"}'}
            className={cn(
              'w-full rounded-lg border bg-surface-2 px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 font-mono resize-none',
              customHeadersError ? 'border-red-300 focus:ring-red-400' : 'border-border focus:ring-accent'
            )}
          />
          {customHeadersError
            ? <p className="mt-0.5 text-[11px] text-red-600">{customHeadersError}</p>
            : <p className="mt-0.5 text-[10px] text-ink-faint">JSON object of header name → value. Values are stored encrypted.</p>
          }
        </div>
      )}

      {/* Webhook Secret — always optional */}
      <div className="pt-1 border-t border-border">
        <p className="text-[10px] font-semibold text-ink-faint uppercase tracking-widest mb-2">Webhook (Optional)</p>
        <CredField
          label="Webhook Secret"
          value={webhookSecret}
          onChange={setWebhookSecret}
          placeholder="For verifying inbound webhooks from this provider"
          configured={existing ? hasField('webhook_secret') : undefined}
        />
      </div>

      {/* Live mode */}
      <div className="flex items-center gap-2">
        <input
          id="form-is-live"
          type="checkbox"
          checked={isLive}
          onChange={(e) => setIsLive(e.target.checked)}
          className="rounded border-border"
        />
        <label htmlFor="form-is-live" className="text-sm text-ink cursor-pointer">
          Live mode
          <span className="ml-1 text-[11px] text-ink-faint">(uncheck for sandbox / test)</span>
        </label>
      </div>
    </div>
  )
}

// ── Provider Form Modal (profile + credentials combined) ──────────────────────

interface ProviderFormModalProps {
  mode: 'create' | 'edit'
  initial?: ProviderRegistryRow
  onClose: () => void
  onSave: (
    providerData: CreateProviderInput | UpdateProviderRegistryInput,
    credData: UpsertProviderCredentialsInput | null
  ) => void
  saving: boolean
}

function ProviderFormModal({ mode, initial, onClose, onSave, saving }: ProviderFormModalProps) {
  // ── Provider profile state ────────────────────────────────────────────────
  const [code, setCode]         = useState(initial?.provider_code ?? '')
  const [name, setName]         = useState(initial?.name ?? '')
  const [priority, setPriority] = useState(String(initial?.priority ?? 10))
  const [services, setServices] = useState<string[]>(initial?.supported_services ?? [])
  const [notes, setNotes]       = useState(initial?.notes ?? '')
  const [isActive, setIsActive] = useState(initial?.is_active ?? true)

  // ── Credential state ──────────────────────────────────────────────────────
  const [authType, setAuthType]           = useState<ProviderAuthType>(
    initial?.provider_code === 'clubkonnect'
      ? 'userid_apikey'
      : ((initial?.auth_type ?? 'api_key') as ProviderAuthType)
  )
  const [baseUrl, setBaseUrl]             = useState('')
  const [apiKey, setApiKey]               = useState('')
  const [secretKey, setSecretKey]         = useState('')
  const [bearerToken, setBearerToken]     = useState('')
  const [username, setUsername]           = useState('')
  const [password, setPassword]           = useState('')
  const [webhookSecret, setWebhookSecret] = useState('')
  const [customHeaders, setCustomHeaders] = useState('')
  const [customHeadersError, setCustomHeadersError] = useState('')
  const [isLive, setIsLive]               = useState(initial?.is_live ?? false)

  const [formError, setFormError] = useState('')

  // Auto-select the correct auth type when provider code matches a known provider
  useEffect(() => {
    if (mode === 'create' && code === 'clubkonnect') setAuthType('userid_apikey')
  }, [mode, code])

  function toggleService(svc: string) {
    setServices((prev) =>
      prev.includes(svc) ? prev.filter((s) => s !== svc) : [...prev, svc]
    )
  }

  function buildCredData(): UpsertProviderCredentialsInput | null {
    const config  = AUTH_TYPE_MAP[authType]
    const required = config.requiredFields

    // Validate custom_headers JSON
    if (config.shownFields.includes('custom_headers') && customHeaders.trim()) {
      try {
        const parsed = JSON.parse(customHeaders.trim())
        if (typeof parsed !== 'object' || Array.isArray(parsed)) {
          setCustomHeadersError('Must be a JSON object, e.g. {"X-Api-Key": "value"}')
          return undefined as unknown as null // signal validation failure
        }
      } catch {
        setCustomHeadersError('Invalid JSON — must be a valid JSON object')
        return undefined as unknown as null
      }
    }

    // Check required fields that aren't already configured
    const hasField = (field: string) => {
      if (!initial?.has_credentials) return false
      switch (field) {
        case 'api_key':        return initial.has_api_key
        case 'secret_key':     return initial.has_secret_key
        case 'username':       return initial.has_username
        case 'password':       return initial.has_password
        case 'bearer_token':   return initial.has_bearer_token
        case 'webhook_secret': return initial.has_webhook_secret
        case 'custom_headers': return initial.has_custom_headers
        default:               return false
      }
    }
    const fieldValue = (field: string) => {
      switch (field) {
        case 'api_key':        return apiKey
        case 'secret_key':     return secretKey
        case 'username':       return username
        case 'password':       return password
        case 'bearer_token':   return bearerToken
        case 'webhook_secret': return webhookSecret
        case 'custom_headers': return customHeaders
        default:               return ''
      }
    }
    const missingRequired = required.filter(
      (field) => !hasField(field) && !fieldValue(field).trim()
    )
    if (missingRequired.length > 0) {
      const labels: Record<string, string> = {
        api_key:        config.fieldLabels?.api_key    ?? 'API Key',
        secret_key:     'Secret Key',
        bearer_token:   'Bearer Token',
        username:       config.fieldLabels?.username   ?? 'Username',
        password:       'Password',
        custom_headers: 'Custom Headers',
      }
      setFormError(
        `Credentials required for ${config.label}: ${missingRequired.map((f) => labels[f] ?? f).join(', ')}`
      )
      return undefined as unknown as null
    }

    // Build the payload — only include fields with values
    const anyCredFilled = [baseUrl, apiKey, secretKey, bearerToken, username, password, webhookSecret, customHeaders]
      .some((v) => v.trim())

    // In edit mode, always send auth_type even if no fields changed
    if (!anyCredFilled && mode === 'edit') {
      return { auth_type: authType, is_live: isLive }
    }
    if (!anyCredFilled) return null

    const body: UpsertProviderCredentialsInput = { auth_type: authType, is_live: isLive }
    if (baseUrl.trim())        body.base_url        = baseUrl.trim()
    if (apiKey.trim())         body.api_key          = apiKey.trim()
    if (secretKey.trim())      body.secret_key       = secretKey.trim()
    if (bearerToken.trim())    body.bearer_token     = bearerToken.trim()
    if (username.trim())       body.username         = username.trim()
    if (password.trim())       body.password         = password.trim()
    if (webhookSecret.trim())  body.webhook_secret   = webhookSecret.trim()
    if (customHeaders.trim())  body.custom_headers   = customHeaders.trim()
    return body
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    setCustomHeadersError('')

    const credData = buildCredData()
    // buildCredData returns undefined-as-null on validation failure
    if (credData === (undefined as unknown as null) && (customHeadersError || formError)) return

    const providerData: UpdateProviderRegistryInput = {
      name:               name.trim() || undefined,
      is_active:          isActive,
      priority:           parseInt(priority, 10) || 10,
      supported_services: services,
      notes:              notes.trim() || null,
    }
    if (mode === 'create') {
      onSave({ ...providerData, provider_code: code.trim().toLowerCase() } as CreateProviderInput, credData)
    } else {
      onSave(providerData, credData)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-surface-1 rounded-xl shadow-xl w-full max-w-lg border border-border overflow-y-auto max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h2 className="text-sm font-semibold text-ink">
            {mode === 'create' ? 'Register New Provider' : `Edit ${initial?.name}`}
          </h2>
          <button onClick={onClose} className="text-ink-faint hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* ── Provider Profile ───────────────────────────────────────────── */}
          <p className="text-[10px] font-semibold text-ink-faint uppercase tracking-widest">Provider Profile</p>

          {mode === 'create' && (
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">Provider Code *</label>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. vtpass, smeplug"
                required
                className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <p className="mt-0.5 text-[10px] text-ink-faint">Lowercase, no spaces. Cannot be changed after creation.</p>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Display Name *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. VTPass"
              required
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">Priority</label>
              <input
                type="number"
                min={1}
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <p className="mt-0.5 text-[10px] text-ink-faint">Lower = higher priority</p>
            </div>
            <div className="flex flex-col justify-end pb-0.5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="rounded border-border"
                />
                <span className="text-sm text-ink">Active</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-muted mb-2">Supported Services</label>
            <div className="flex flex-wrap gap-2">
              {ALL_SERVICE_TYPES.map((svc) => (
                <button
                  key={svc}
                  type="button"
                  onClick={() => toggleService(svc)}
                  className={cn(
                    'rounded-full px-3 py-1 text-[11px] font-medium border transition-colors',
                    services.includes(svc)
                      ? 'bg-accent text-white border-accent'
                      : 'border-border text-ink-muted hover:border-accent hover:text-accent'
                  )}
                >
                  {SERVICE_LABELS[svc] ?? svc}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Internal notes (rate limits, contact, SLA…)"
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-accent resize-none"
            />
          </div>

          {/* ── API Credentials ────────────────────────────────────────────── */}
          <div className="border-t border-border pt-4">
            <p className="text-[10px] font-semibold text-ink-faint uppercase tracking-widest mb-3">API Credentials</p>
            <CredSection
              existing={initial ?? null}
              authType={authType}        setAuthType={setAuthType}
              baseUrl={baseUrl}          setBaseUrl={setBaseUrl}
              apiKey={apiKey}            setApiKey={setApiKey}
              secretKey={secretKey}      setSecretKey={setSecretKey}
              bearerToken={bearerToken}  setBearerToken={setBearerToken}
              username={username}        setUsername={setUsername}
              password={password}        setPassword={setPassword}
              webhookSecret={webhookSecret} setWebhookSecret={setWebhookSecret}
              customHeaders={customHeaders} setCustomHeaders={setCustomHeaders}
              customHeadersError={customHeadersError} setCustomHeadersError={setCustomHeadersError}
              isLive={isLive}            setIsLive={setIsLive}
            />
          </div>

          {formError && (
            <p className="rounded-lg bg-rose-500/10 border border-rose-500/20 px-3 py-2 text-xs text-rose-400">{formError}</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-ink-muted hover:text-ink border border-border">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg px-4 py-2 text-sm font-medium bg-accent text-white hover:bg-accent/90 disabled:opacity-50"
            >
              {saving ? 'Saving…' : mode === 'create' ? 'Register Provider' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Standalone Credentials Modal (credentials-only update from card) ──────────

interface CredentialsModalProps {
  provider: ProviderRegistryRow
  onClose: () => void
  onSave: (data: UpsertProviderCredentialsInput) => void
  saving: boolean
}

function CredentialsModal({ provider, onClose, onSave, saving }: CredentialsModalProps) {
  const [authType, setAuthType]           = useState<ProviderAuthType>(
    provider.provider_code === 'clubkonnect'
      ? 'userid_apikey'
      : ((provider.auth_type ?? 'api_key') as ProviderAuthType)
  )
  const [baseUrl, setBaseUrl]             = useState('')
  const [apiKey, setApiKey]               = useState('')
  const [secretKey, setSecretKey]         = useState('')
  const [bearerToken, setBearerToken]     = useState('')
  const [username, setUsername]           = useState('')
  const [password, setPassword]           = useState('')
  const [webhookSecret, setWebhookSecret] = useState('')
  const [customHeaders, setCustomHeaders] = useState('')
  const [customHeadersError, setCustomHeadersError] = useState('')
  const [isLive, setIsLive]               = useState(provider.is_live ?? false)
  const [formError, setFormError]         = useState('')

  useEffect(() => { setFormError('') }, [authType])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    setCustomHeadersError('')

    const config  = AUTH_TYPE_MAP[authType]
    const required = config.requiredFields

    if (config.shownFields.includes('custom_headers') && customHeaders.trim()) {
      try {
        const parsed = JSON.parse(customHeaders.trim())
        if (typeof parsed !== 'object' || Array.isArray(parsed)) {
          setCustomHeadersError('Must be a JSON object, e.g. {"X-Api-Key": "value"}')
          return
        }
      } catch {
        setCustomHeadersError('Invalid JSON — must be a valid JSON object')
        return
      }
    }

    const hasField = (field: string) => {
      switch (field) {
        case 'api_key':        return provider.has_api_key
        case 'secret_key':     return provider.has_secret_key
        case 'username':       return provider.has_username
        case 'password':       return provider.has_password
        case 'bearer_token':   return provider.has_bearer_token
        case 'webhook_secret': return provider.has_webhook_secret
        case 'custom_headers': return provider.has_custom_headers
        default:               return false
      }
    }
    const fieldValue = (field: string) => {
      switch (field) { case 'api_key': return apiKey; case 'secret_key': return secretKey
        case 'username': return username; case 'password': return password
        case 'bearer_token': return bearerToken; case 'webhook_secret': return webhookSecret
        case 'custom_headers': return customHeaders; default: return '' }
    }
    const missingRequired = required.filter((f) => !hasField(f) && !fieldValue(f).trim())
    if (missingRequired.length > 0) {
      const labels: Record<string, string> = {
        api_key:        config.fieldLabels?.api_key  ?? 'API Key',
        secret_key:     'Secret Key',
        bearer_token:   'Bearer Token',
        username:       config.fieldLabels?.username ?? 'Username',
        password:       'Password',
        custom_headers: 'Custom Headers',
      }
      setFormError(`Required for ${config.label}: ${missingRequired.map((f) => labels[f] ?? f).join(', ')}`)
      return
    }

    const body: UpsertProviderCredentialsInput = { auth_type: authType, is_live: isLive }
    if (baseUrl.trim())        body.base_url        = baseUrl.trim()
    if (apiKey.trim())         body.api_key          = apiKey.trim()
    if (secretKey.trim())      body.secret_key       = secretKey.trim()
    if (bearerToken.trim())    body.bearer_token     = bearerToken.trim()
    if (username.trim())       body.username         = username.trim()
    if (password.trim())       body.password         = password.trim()
    if (webhookSecret.trim())  body.webhook_secret   = webhookSecret.trim()
    if (customHeaders.trim())  body.custom_headers   = customHeaders.trim()
    onSave(body)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-surface-1 rounded-xl shadow-xl w-full max-w-lg border border-border overflow-y-auto max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-ink">Update Credentials</h2>
            <p className="text-xs text-ink-faint mt-0.5">{provider.provider_code}</p>
          </div>
          <button onClick={onClose} className="text-ink-faint hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <CredSection
            existing={provider}
            authType={authType}        setAuthType={setAuthType}
            baseUrl={baseUrl}          setBaseUrl={setBaseUrl}
            apiKey={apiKey}            setApiKey={setApiKey}
            secretKey={secretKey}      setSecretKey={setSecretKey}
            bearerToken={bearerToken}  setBearerToken={setBearerToken}
            username={username}        setUsername={setUsername}
            password={password}        setPassword={setPassword}
            webhookSecret={webhookSecret} setWebhookSecret={setWebhookSecret}
            customHeaders={customHeaders} setCustomHeaders={setCustomHeaders}
            customHeadersError={customHeadersError} setCustomHeadersError={setCustomHeadersError}
            isLive={isLive}            setIsLive={setIsLive}
          />
          {formError && (
            <p className="rounded-lg bg-rose-500/10 border border-rose-500/20 px-3 py-2 text-xs text-rose-400">{formError}</p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-ink-muted hover:text-ink border border-border">
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="rounded-lg px-4 py-2 text-sm font-medium bg-accent text-white hover:bg-accent/90 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save Credentials'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Provider Card ─────────────────────────────────────────────────────────────

interface ProviderCardProps {
  provider: ProviderRegistryRow
  onEdit: (p: ProviderRegistryRow) => void
  onEditCreds: (p: ProviderRegistryRow) => void
  onHealthCheck: (code: string) => void
  checkingHealth: boolean
  onToggle: (p: ProviderRegistryRow) => void
  isToggling: boolean
}

function ProviderCard({ provider, onEdit, onEditCreds, onHealthCheck, checkingHealth, onToggle, isToggling }: ProviderCardProps) {
  const [expanded, setExpanded] = useState(false)

  const authConfig = provider.auth_type
    ? AUTH_TYPE_MAP[provider.auth_type as ProviderAuthType]
    : null

  const credentialFlags = useMemo((): Array<{ label: string; present: boolean }> => {
    if (!provider.has_credentials) return []
    const at = provider.auth_type ?? 'api_key'
    const cfg = AUTH_TYPE_MAP[at as ProviderAuthType]
    const shown = cfg?.shownFields ?? []
    const flags: Array<{ label: string; present: boolean }> = []
    const maybe = (field: string, defaultLabel: string) => {
      if (shown.includes(field) || at === 'advanced') {
        const label = cfg?.fieldLabels?.[field] ?? defaultLabel
        flags.push({ label, present: !!provider[`has_${field}` as keyof ProviderRegistryRow] })
      }
    }
    maybe('api_key',        'API Key')
    maybe('secret_key',     'Secret Key')
    maybe('bearer_token',   'Bearer Token')
    maybe('username',       'Username')
    maybe('password',       'Password')
    maybe('custom_headers', 'Custom Headers')
    if (provider.has_webhook_secret) flags.push({ label: 'Webhook Secret', present: true })
    return flags
  }, [provider])

  return (
    <div className={cn(
      'rounded-xl border border-border bg-surface-1 transition-shadow hover:shadow-sm',
      !provider.is_active && 'opacity-60'
    )}>
      <div className="flex items-start justify-between px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10">
            <Zap className="h-4 w-4 text-accent" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-ink truncate">{provider.name}</span>
              <HealthDot status={provider.health_status} />
              {provider.is_live !== null && (
                provider.is_live
                  ? <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/15 px-1.5 py-0.5 rounded">LIVE</span>
                  : <span className="text-[10px] font-semibold text-amber-400 bg-amber-500/15 px-1.5 py-0.5 rounded">SANDBOX</span>
              )}
            </div>
            <span className="text-xs text-ink-faint font-mono">{provider.provider_code}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          <Badge
            active={provider.is_active}
            onClick={() => onToggle(provider)}
            loading={isToggling}
          />
          <button
            onClick={() => setExpanded((x) => !x)}
            className="p-1 rounded text-ink-faint hover:text-ink hover:bg-surface-2"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {provider.supported_services.length > 0 && (
        <div className="px-4 pb-2 flex flex-wrap gap-1">
          {provider.supported_services.map((svc) => (
            <span key={svc} className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] text-ink-muted">
              {SERVICE_LABELS[svc] ?? svc}
            </span>
          ))}
        </div>
      )}

      {provider.has_credentials ? (
        <div className="px-4 pb-3 space-y-1">
          {authConfig && (
            <div className="flex items-center gap-1.5">
              <Key className="h-3 w-3 text-ink-faint" />
              <span className="text-[11px] text-ink-faint">{authConfig.label}</span>
            </div>
          )}
          {credentialFlags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {credentialFlags.map((f) => (
                <CredentialFlag key={f.label} label={f.label} present={f.present} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="px-4 pb-3">
          <span className="inline-flex items-center gap-1 text-[11px] text-amber-600">
            <AlertTriangle className="h-3 w-3" /> No credentials configured
          </span>
        </div>
      )}

      {expanded && (
        <div className="border-t border-border px-4 py-3 space-y-2">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <div><span className="text-ink-faint">Priority:</span> <span className="text-ink font-medium">{provider.priority}</span></div>
            <div><span className="text-ink-faint">Health:</span> <span className="text-ink font-medium capitalize">{provider.health_status}</span></div>
            {provider.base_url && (
              <div className="col-span-2">
                <span className="text-ink-faint">Base URL:</span>{' '}
                <span className="text-ink font-mono text-[11px] break-all">{provider.base_url}</span>
              </div>
            )}
          </div>
          {provider.notes && (
            <p className="text-xs text-ink-muted bg-surface-2 rounded-lg p-2">{provider.notes}</p>
          )}
        </div>
      )}

      <div className="flex items-center gap-1 px-4 py-2 border-t border-border">
        <button
          onClick={() => onEdit(provider)}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors"
        >
          <Edit2 className="h-3.5 w-3.5" /> Edit
        </button>
        <button
          onClick={() => onEditCreds(provider)}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors"
        >
          <Key className="h-3.5 w-3.5" /> Credentials
        </button>
        <button
          onClick={() => onHealthCheck(provider.provider_code)}
          disabled={checkingHealth}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors disabled:opacity-50 ml-auto"
        >
          <Activity className={cn('h-3.5 w-3.5', checkingHealth && 'animate-spin')} />
          {checkingHealth ? 'Checking…' : 'Health Check'}
        </button>
      </div>
    </div>
  )
}

// ── Stats Bar ─────────────────────────────────────────────────────────────────

function StatsBar({ providers }: { providers: ProviderRegistryRow[] }) {
  const active    = providers.filter((p) => p.is_active).length
  const healthy   = providers.filter((p) => p.health_status === 'healthy').length
  const withCreds = providers.filter((p) => p.has_credentials).length

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {[
        { label: 'Total Providers', value: providers.length, icon: <Zap className="h-4 w-4 text-accent" /> },
        { label: 'Active',          value: active,           icon: <CheckCircle2 className="h-4 w-4 text-green-500" /> },
        { label: 'Healthy',         value: healthy,          icon: <Activity className="h-4 w-4 text-blue-500" /> },
        { label: 'Credentials Set', value: withCreds,        icon: <Shield className="h-4 w-4 text-purple-500" /> },
      ].map(({ label, value, icon }) => (
        <div key={label} className="rounded-xl border border-border bg-surface-1 px-4 py-3 flex items-center gap-3">
          {icon}
          <div>
            <p className="text-lg font-bold text-ink">{value}</p>
            <p className="text-[11px] text-ink-faint">{label}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type ModalState =
  | { type: 'none' }
  | { type: 'create' }
  | { type: 'edit'; provider: ProviderRegistryRow }
  | { type: 'credentials'; provider: ProviderRegistryRow }

export function ApiIntegrationsPage() {
  const qc = useQueryClient()
  const [modal, setModal]               = useState<ModalState>({ type: 'none' })
  const [filter, setFilter]             = useState('')
  const [serviceFilter, setServiceFilter] = useState<string>('all')
  const [checkingCode, setCheckingCode] = useState<string | null>(null)
  const [healthResult, setHealthResult] = useState<{ code: string; healthy: boolean; message: string } | null>(null)

  const { data: providers = [], isLoading, error } = useQuery({
    queryKey: ['providers-registry'],
    queryFn:  providersApi.listRegistry,
  })

  const createMutation = useMutation({
    mutationFn: async ({
      providerData,
      credData,
    }: {
      providerData: CreateProviderInput
      credData: UpsertProviderCredentialsInput | null
    }) => {
      const created = await providersApi.createRegistry(providerData)
      if (credData) await providersApi.upsertCredentials(created.provider_code, credData)
      return created
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['providers-registry'] })
      setModal({ type: 'none' })
      toast.success('Provider registered')
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to register provider'
      toast.error(msg)
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({
      code,
      providerData,
      credData,
    }: {
      code: string
      providerData: UpdateProviderRegistryInput
      credData: UpsertProviderCredentialsInput | null
    }) => {
      const updated = await providersApi.updateRegistry(code, providerData)
      if (credData) await providersApi.upsertCredentials(code, credData)
      return updated
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['providers-registry'] })
      setModal({ type: 'none' })
      toast.success('Provider updated')
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to update provider'
      toast.error(msg)
    },
  })

  const credsMutation = useMutation({
    mutationFn: ({ code, body }: { code: string; body: UpsertProviderCredentialsInput }) =>
      providersApi.upsertCredentials(code, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['providers-registry'] })
      setModal({ type: 'none' })
      toast.success('Credentials saved')
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to save credentials'
      toast.error(msg)
    },
  })

  const toggleMutation = useMutation({
    mutationFn: ({ code, is_active }: { code: string; is_active: boolean }) =>
      providersApi.updateRegistry(code, { is_active }),
    onSuccess: (_, { is_active }) => {
      qc.invalidateQueries({ queryKey: ['providers-registry'] })
      toast.success(is_active ? 'Provider enabled' : 'Provider disabled')
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : 'Toggle failed'
      toast.error(msg)
    },
  })

  function handleToggle(provider: ProviderRegistryRow) {
    const enabling = !provider.is_active
    if (enabling && !provider.has_credentials) {
      toast.error(
        `Add API credentials for ${provider.name} before enabling it`,
        { duration: 4000 },
      )
      return
    }
    toggleMutation.mutate({ code: provider.provider_code, is_active: enabling })
  }

  async function handleHealthCheck(code: string) {
    setCheckingCode(code)
    setHealthResult(null)
    try {
      const result = await providersApi.triggerHealthCheck(code)
      setHealthResult({ code, healthy: result.healthy, message: result.message })
      qc.invalidateQueries({ queryKey: ['providers-registry'] })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Health check failed'
      setHealthResult({ code, healthy: false, message: msg })
    } finally {
      setCheckingCode(null)
    }
  }

  const filtered = useMemo(() => {
    let list = providers
    if (serviceFilter !== 'all') list = list.filter((p) => p.supported_services.includes(serviceFilter))
    if (filter.trim()) {
      const q = filter.toLowerCase()
      list = list.filter((p) => p.provider_code.includes(q) || p.name.toLowerCase().includes(q))
    }
    return list
  }, [providers, filter, serviceFilter])

  useEffect(() => {
    if (!healthResult) return
    const t = setTimeout(() => setHealthResult(null), 6000)
    return () => clearTimeout(t)
  }, [healthResult])

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink">API Integrations</h1>
          <p className="text-sm text-ink-faint mt-0.5">Central registry for all VTU service providers</p>
        </div>
        <button
          onClick={() => setModal({ type: 'create' })}
          className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90"
        >
          <Plus className="h-4 w-4" /> Register Provider
        </button>
      </div>

      {providers.length > 0 && <StatsBar providers={providers} />}

      {healthResult && (
        <div className={cn(
          'flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm border',
          healthResult.healthy
            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
            : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
        )}>
          {healthResult.healthy ? <Wifi className="h-4 w-4 shrink-0" /> : <WifiOff className="h-4 w-4 shrink-0" />}
          <span><strong>{healthResult.code}:</strong> {healthResult.message}</span>
          <button onClick={() => setHealthResult(null)} className="ml-auto"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search by name or code…"
          className="flex-1 rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <select
          value={serviceFilter}
          onChange={(e) => setServiceFilter(e.target.value)}
          className="rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-accent"
        >
          <option value="all">All Services</option>
          {ALL_SERVICE_TYPES.map((svc) => (
            <option key={svc} value={svc}>{SERVICE_LABELS[svc]}</option>
          ))}
        </select>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20 text-ink-faint text-sm">
          <RefreshCw className="h-5 w-5 animate-spin mr-2" /> Loading providers…
        </div>
      )}

      {!isLoading && error && (
        <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 px-4 py-3 text-sm text-rose-400">
          Failed to load providers. Check that the backend is running.
        </div>
      )}

      {!isLoading && !error && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Globe className="h-10 w-10 text-ink-faint mb-3" />
          <p className="text-sm font-medium text-ink">
            {providers.length === 0 ? 'No providers registered yet' : 'No providers match your filter'}
          </p>
          {providers.length === 0 && (
            <p className="text-xs text-ink-faint mt-1">Register your first VTU provider to get started.</p>
          )}
        </div>
      )}

      {!isLoading && !error && filtered.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((p) => (
            <ProviderCard
              key={p.provider_code}
              provider={p}
              onEdit={(pr) => setModal({ type: 'edit', provider: pr })}
              onEditCreds={(pr) => setModal({ type: 'credentials', provider: pr })}
              onHealthCheck={handleHealthCheck}
              checkingHealth={checkingCode === p.provider_code}
              onToggle={handleToggle}
              isToggling={toggleMutation.isPending && toggleMutation.variables?.code === p.provider_code}
            />
          ))}
        </div>
      )}

      {modal.type === 'create' && (
        <ProviderFormModal
          mode="create"
          onClose={() => setModal({ type: 'none' })}
          onSave={(providerData, credData) =>
            createMutation.mutate({ providerData: providerData as CreateProviderInput, credData })
          }
          saving={createMutation.isPending}
        />
      )}
      {modal.type === 'edit' && (
        <ProviderFormModal
          mode="edit"
          initial={modal.provider}
          onClose={() => setModal({ type: 'none' })}
          onSave={(providerData, credData) =>
            updateMutation.mutate({
              code: modal.provider.provider_code,
              providerData: providerData as UpdateProviderRegistryInput,
              credData,
            })
          }
          saving={updateMutation.isPending}
        />
      )}
      {modal.type === 'credentials' && (
        <CredentialsModal
          provider={modal.provider}
          onClose={() => setModal({ type: 'none' })}
          onSave={(data) => credsMutation.mutate({ code: modal.provider.provider_code, body: data })}
          saving={credsMutation.isPending}
        />
      )}
    </div>
  )
}
