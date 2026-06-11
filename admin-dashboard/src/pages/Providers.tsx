import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { providersApi } from '@/api/providers.api'
import { metricsApi } from '@/api/metrics.api'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataTable } from '@/components/shared/DataTable'
import { ProviderHealthBadge, CircuitBadge, BoolBadge } from '@/components/shared/StatusBadge'
import { ErrorMessage } from '@/components/shared/ErrorMessage'
import { Drawer } from '@/components/shared/Drawer'
import { Button, Badge, Modal, Input, Select, Card } from '@/components/ui'
import { SkeletonTable } from '@/components/ui/Skeleton'
import { fmtDate, fmtPercent } from '@/utils/format'
import type { Provider, UpdateProviderInput, ProviderCircuitState } from '@/types'
import { RefreshCw, Edit, Activity, ShieldOff, ShieldCheck, KeyRound, CheckCircle2, XCircle } from 'lucide-react'
import { ENDPOINTS } from '@/config/endpoints'
import toast from 'react-hot-toast'
import axios from 'axios'

const SERVICE_OPTIONS = [
  { value: 'airtime', label: 'Airtime' },
  { value: 'data', label: 'Data' },
  { value: 'electricity', label: 'Electricity' },
  { value: 'cable_tv', label: 'Cable TV' },
  { value: 'exam_pin', label: 'Exam PIN' },
]

function errMsg(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) return err.response?.data?.message ?? err.message ?? fallback
  return fallback
}

export function ProvidersPage() {
  const qc = useQueryClient()
  const [editProvider, setEditProvider] = useState<Provider | null>(null)
  const [selected, setSelected] = useState<Provider | null>(null)
  const [form, setForm] = useState<UpdateProviderInput>({})
  const [diagResult, setDiagResult] = useState<{
    valid: boolean
    message: string
    details?: { userId_length?: number; apiKey_length?: number; baseUrl?: string; balance?: number; raw_status?: string; http_status?: number }
  } | null>(null)

  const [healthResult, setHealthResult] = useState<{
    healthy: boolean
    latency_ms?: number
    message: string
  } | null>(null)

  // Reset per-provider results whenever the selected provider changes
  useEffect(() => { setDiagResult(null); setHealthResult(null) }, [selected])

  const { data: providers = [], isLoading, error, refetch } = useQuery({
    queryKey: ['providers'],
    queryFn: providersApi.list,
  })

  const { data: metrics = [] } = useQuery({
    queryKey: ['health-metrics'],
    queryFn: metricsApi.list,
  })

  const metricsByCode: Record<string, ProviderCircuitState> = {}
  for (const m of metrics) metricsByCode[m.provider_code] = m

  const updateMutation = useMutation({
    mutationFn: ({ code, body }: { code: string; body: UpdateProviderInput }) =>
      providersApi.update(code, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['providers'] })
      toast.success('Provider updated')
      setEditProvider(null)
    },
    onError: (err) => toast.error(errMsg(err, 'Update failed')),
  })

  const healthCheckMutation = useMutation({
    mutationFn: (code: string) => providersApi.triggerHealthCheck(code),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['providers'] })
      // Store result for the drawer panel
      setHealthResult({
        healthy:    result.healthy,
        latency_ms: result.latency_ms,
        message:    result.message,
      })
      if (result.healthy) {
        toast.success(`${result.message}`)
      } else {
        toast.error(`Health check failed: ${result.message}`)
      }
    },
    onError: (err) => toast.error(errMsg(err, 'Health check failed')),
  })

  const resetCircuitMutation = useMutation({
    mutationFn: (code: string) => metricsApi.resetCircuit(code),
    onSuccess: (_, code) => {
      qc.invalidateQueries({ queryKey: ['health-metrics'] })
      toast.success(`Circuit reset for ${code}`)
    },
    onError: () => toast.error('Reset failed'),
  })

  const credentialDiagnosticMutation = useMutation({
    mutationFn: (code: string) => providersApi.credentialDiagnostic(code),
    onSuccess: (data) => setDiagResult(data),
    onError:   (err)  => setDiagResult({ valid: false, message: errMsg(err, 'Diagnostic failed') }),
  })

  const openEdit = (p: Provider) => {
    setForm({
      name:               p.name,
      is_active:          p.is_active,
      health_status:      p.health_status,
      priority:           p.priority,
      supported_services: p.supported_services,
    })
    setEditProvider(p)
  }

  if (error) return <ErrorMessage error={error} onRetry={() => void refetch()} endpoint={ENDPOINTS.providers.path} />

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Providers"
        subtitle="Manage VTU provider integrations and priorities"
        actions={
          <Button
            variant="secondary"
            size="sm"
            icon={<RefreshCw className="h-3.5 w-3.5" />}
            onClick={() => void refetch()}
          >
            Refresh
          </Button>
        }
      />

      <Card padding="none">
        {isLoading ? (
          <div className="p-5"><SkeletonTable rows={4} /></div>
        ) : (
          <DataTable
            data={providers}
            rowKey={(p) => p.id}
            onRowClick={setSelected}
            emptyMessage="No providers configured yet."
            columns={[
              {
                key: 'name',
                header: 'Provider',
                render: (p) => (
                  <div>
                    <p className="font-medium text-ink">{p.name}</p>
                    <p className="text-xs text-ink-faint font-mono">{p.provider_code}</p>
                  </div>
                ),
              },
              {
                key: 'active',
                header: 'Active',
                render: (p) => <BoolBadge value={p.is_active} trueLabel="Active" falseLabel="Inactive" />,
              },
              {
                key: 'health',
                header: 'Health',
                render: (p) => <ProviderHealthBadge status={p.health_status} />,
              },
              {
                key: 'circuit',
                header: 'Circuit',
                render: (p) => {
                  const m = metricsByCode[p.provider_code]
                  return m ? <CircuitBadge open={m.circuit_open} /> : <Badge variant="neutral">—</Badge>
                },
              },
              {
                key: 'priority',
                header: 'Priority',
                align: 'center',
                render: (p) => (
                  <span className="text-ink font-mono font-semibold">{p.priority}</span>
                ),
              },
              {
                key: 'services',
                header: 'Services',
                render: (p) => (
                  <div className="flex flex-wrap gap-1">
                    {(p.supported_services ?? []).slice(0, 3).map((s) => (
                      <Badge key={s} variant="neutral" size="sm">
                        {s}
                      </Badge>
                    ))}
                    {(p.supported_services ?? []).length > 3 && (
                      <Badge variant="neutral" size="sm">
                        +{p.supported_services.length - 3}
                      </Badge>
                    )}
                  </div>
                ),
              },
              {
                key: 'updated',
                header: 'Updated',
                render: (p) => <span className="text-xs text-ink-faint">{fmtDate(p.updated_at)}</span>,
              },
              {
                key: 'actions',
                header: '',
                align: 'right',
                render: (p) => {
                  const m = metricsByCode[p.provider_code]
                  return (
                    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      {m?.circuit_open && (
                        <Button
                          variant="ghost"
                          size="xs"
                          icon={<ShieldCheck className="h-3.5 w-3.5" />}
                          onClick={() => resetCircuitMutation.mutate(p.provider_code)}
                          loading={resetCircuitMutation.isPending}
                        >
                          Reset
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="xs"
                        icon={<Activity className="h-3.5 w-3.5" />}
                        onClick={() => healthCheckMutation.mutate(p.provider_code)}
                        loading={healthCheckMutation.isPending}
                      />
                      <Button
                        variant="ghost"
                        size="xs"
                        icon={<Edit className="h-3.5 w-3.5" />}
                        onClick={() => openEdit(p)}
                      />
                      <Button
                        variant="ghost"
                        size="xs"
                        icon={
                          p.is_active
                            ? <ShieldOff className="h-3.5 w-3.5 text-rose-400" />
                            : <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                        }
                        onClick={() =>
                          updateMutation.mutate({ code: p.provider_code, body: { is_active: !p.is_active } })
                        }
                      />
                    </div>
                  )
                },
              },
            ]}
          />
        )}
      </Card>

      {/* Edit modal */}
      <Modal
        open={!!editProvider}
        onClose={() => setEditProvider(null)}
        title={`Edit ${editProvider?.name ?? ''}`}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditProvider(null)}>Cancel</Button>
            <Button
              loading={updateMutation.isPending}
              onClick={() =>
                editProvider && updateMutation.mutate({ code: editProvider.provider_code, body: form })
              }
            >
              Save changes
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Display Name"
            value={form.name ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <Input
            label="Priority"
            type="number"
            min={1}
            value={form.priority ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, priority: Number(e.target.value) }))}
          />
          <Select
            label="Health Status"
            value={form.health_status ?? ''}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                health_status: e.target.value as Provider['health_status'],
              }))
            }
            options={[
              { value: 'healthy', label: 'Healthy' },
              { value: 'degraded', label: 'Degraded' },
              { value: 'unhealthy', label: 'Unhealthy' },
            ]}
          />
          <div>
            <p className="text-xs font-medium text-ink-muted mb-2">Supported Services</p>
            <div className="flex flex-wrap gap-2">
              {SERVICE_OPTIONS.map((s) => {
                const active = (form.supported_services ?? []).includes(s.value)
                return (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        supported_services: active
                          ? (f.supported_services ?? []).filter((x) => x !== s.value)
                          : [...(f.supported_services ?? []), s.value],
                      }))
                    }
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      active
                        ? 'bg-accent-subtle text-accent border-accent/30'
                        : 'border-border text-ink-muted hover:border-border-strong'
                    }`}
                  >
                    {s.label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </Modal>

      {/* Detail drawer */}
      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title="Provider Detail"
        subtitle={selected?.name ?? ''}
      >
        {selected && (() => {
          const m = metricsByCode[selected.provider_code]
          const total = m ? m.success_count + m.failure_count : 0
          return (
            <div className="space-y-4 text-sm">
              <Row label="Code"        value={<span className="font-mono text-xs">{selected.provider_code}</span>} />
              <Row label="Display Name" value={selected.name} />
              <Row label="Status"      value={<BoolBadge value={selected.is_active} trueLabel="Active" falseLabel="Inactive" />} />
              <Row label="Health"      value={<ProviderHealthBadge status={selected.health_status} />} />
              <Row label="Priority"    value={<span className="font-mono font-semibold">{selected.priority}</span>} />
              <Row label="Services"    value={
                <div className="flex flex-wrap gap-1 justify-end">
                  {(selected.supported_services ?? []).map((s) => (
                    <Badge key={s} variant="neutral" size="sm">{s}</Badge>
                  ))}
                </div>
              } />
              <Row label="Created"     value={fmtDate(selected.created_at)} />
              <Row label="Updated"     value={fmtDate(selected.updated_at)} />

              {m && (
                <>
                  <div className="border-t border-border my-2" />
                  <p className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-2">Circuit Metrics</p>
                  <Row label="Circuit"          value={<CircuitBadge open={m.circuit_open} />} />
                  <Row label="Success Rate"     value={fmtPercent(m.success_count, total)} />
                  <Row label="Successes"        value={<span className="text-emerald-400 font-semibold">{m.success_count}</span>} />
                  <Row label="Failures"         value={<span className="text-rose-400 font-semibold">{m.failure_count}</span>} />
                  <Row label="Consecutive Fail" value={<span className="text-amber-400 font-semibold">{m.consecutive_failures}</span>} />
                  {m.last_success_at && <Row label="Last Success" value={fmtDate(m.last_success_at)} />}
                  {m.last_failure_at && <Row label="Last Failure" value={fmtDate(m.last_failure_at)} />}
                </>
              )}

              {/* Health check — available for all providers */}
              <div className="border-t border-border pt-3 space-y-3">
                <p className="text-xs font-semibold text-ink-muted uppercase tracking-wider">Health Check</p>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Activity className="h-3.5 w-3.5" />}
                  loading={healthCheckMutation.isPending}
                  onClick={() => healthCheckMutation.mutate(selected.provider_code)}
                >
                  Run Health Check
                </Button>
                {healthResult && (
                  <div className={`rounded-lg border p-3 ${
                    healthResult.healthy
                      ? 'bg-emerald-500/10 border-emerald-500/20'
                      : 'bg-rose-500/10 border-rose-500/20'
                  }`}>
                    <div className="flex items-start gap-2">
                      {healthResult.healthy
                        ? <CheckCircle2 className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
                        : <XCircle className="h-4 w-4 text-rose-400 mt-0.5 shrink-0" />}
                      <p className={`text-xs font-medium ${healthResult.healthy ? 'text-emerald-300' : 'text-rose-300'}`}>
                        {healthResult.message}
                      </p>
                    </div>
                    {healthResult.latency_ms !== undefined && healthResult.healthy && (
                      <p className="text-[11px] text-ink-faint mt-1 pl-6">{healthResult.latency_ms} ms</p>
                    )}
                  </div>
                )}
              </div>

              {/* Provider credential diagnostic — Clubkonnect and VTPass */}
              {(selected.provider_code === 'clubkonnect' || selected.provider_code === 'vtpass') && (
                <div className="border-t border-border pt-3 space-y-3">
                  <p className="text-xs font-semibold text-ink-muted uppercase tracking-wider">Credential Diagnostic</p>
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<KeyRound className="h-3.5 w-3.5" />}
                    loading={credentialDiagnosticMutation.isPending}
                    onClick={() => credentialDiagnosticMutation.mutate(selected.provider_code)}
                  >
                    Test Credentials
                  </Button>
                  {diagResult && (
                    <div className={`rounded-lg border p-3 ${
                      diagResult.valid
                        ? 'bg-emerald-500/10 border-emerald-500/20'
                        : 'bg-rose-500/10 border-rose-500/20'
                    }`}>
                      <div className="flex items-start gap-2">
                        {diagResult.valid
                          ? <CheckCircle2 className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
                          : <XCircle className="h-4 w-4 text-rose-400 mt-0.5 shrink-0" />}
                        <p className={`text-xs font-medium ${diagResult.valid ? 'text-emerald-300' : 'text-rose-300'}`}>
                          {diagResult.message}
                        </p>
                      </div>
                      {diagResult.details && (
                        <div className="mt-2 space-y-1 pl-6">
                          {diagResult.details.userId_length !== undefined && (
                            <p className="text-[11px] text-ink-faint">UserID length: {diagResult.details.userId_length} chars</p>
                          )}
                          {diagResult.details.apiKey_length !== undefined && (
                            <p className="text-[11px] text-ink-faint">API key length: {diagResult.details.apiKey_length} chars (prefix: {(diagResult.details as Record<string, unknown>).apiKey_prefix as string})</p>
                          )}
                          {diagResult.details.baseUrl && (
                            <p className="text-[11px] text-ink-faint font-mono">{diagResult.details.baseUrl}</p>
                          )}
                          {diagResult.details.http_status !== undefined && diagResult.details.http_status !== 200 && (
                            <p className="text-[11px] text-rose-400">HTTP {diagResult.details.http_status}</p>
                          )}
                          {diagResult.details.raw_status && (
                            <p className="text-[11px] text-ink-faint font-mono">{diagResult.details.raw_status}</p>
                          )}
                          {(diagResult.details as Record<string, unknown>).raw_response && (
                            <p className="text-[11px] text-amber-300 font-mono break-all">
                              {String((diagResult.details as Record<string, unknown>).raw_response)}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="border-t border-border pt-3 flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Edit className="h-3.5 w-3.5" />}
                  onClick={() => { setSelected(null); openEdit(selected) }}
                >
                  Edit
                </Button>
                {m?.circuit_open && (
                  <Button
                    size="sm"
                    variant="danger"
                    icon={<ShieldCheck className="h-3.5 w-3.5" />}
                    loading={resetCircuitMutation.isPending}
                    onClick={() => resetCircuitMutation.mutate(selected.provider_code)}
                  >
                    Reset Circuit
                  </Button>
                )}
              </div>
            </div>
          )
        })()}
      </Drawer>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-xs text-ink-faint w-32 shrink-0">{label}</span>
      <span className="text-sm text-ink text-right">{value}</span>
    </div>
  )
}
