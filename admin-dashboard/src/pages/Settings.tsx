import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { settingsApi } from '@/api/settings.api'
import { PageHeader } from '@/components/shared/PageHeader'
import { ErrorMessage } from '@/components/shared/ErrorMessage'
import { Card, Badge, Button, Input, Skeleton } from '@/components/ui'
import { ENDPOINTS } from '@/config/endpoints'
import type { SettingEntry, SettingsByCategory, EnvironmentInfo } from '@/types'
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
  { key: 'general',      label: 'General',       icon: <Settings className="h-3.5 w-3.5" /> },
  { key: 'provider',     label: 'Provider',      icon: <Zap className="h-3.5 w-3.5" /> },
  { key: 'wallet',       label: 'Wallet',        icon: <Wallet className="h-3.5 w-3.5" /> },
  { key: 'security',     label: 'Security',      icon: <Shield className="h-3.5 w-3.5" /> },
  { key: 'notification', label: 'Notifications', icon: <Bell className="h-3.5 w-3.5" /> },
  { key: 'queue',        label: 'Queue',         icon: <ListChecks className="h-3.5 w-3.5" /> },
  { key: 'maintenance',  label: 'Maintenance',   icon: <Wrench className="h-3.5 w-3.5" /> },
  { key: 'environment',  label: 'Environment',   icon: <Server className="h-3.5 w-3.5" /> },
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

  const currentSettings = activeTab !== 'environment'
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
