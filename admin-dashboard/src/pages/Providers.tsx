import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { providersApi } from '@/api/providers.api'
import { metricsApi } from '@/api/metrics.api'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataTable } from '@/components/shared/DataTable'
import { ProviderHealthBadge, CircuitBadge, BoolBadge } from '@/components/shared/StatusBadge'
import { ErrorMessage } from '@/components/shared/ErrorMessage'
import { Button, Badge, Modal, Input, Select, Card } from '@/components/ui'
import { SkeletonTable } from '@/components/ui/Skeleton'
import { fmtDate } from '@/utils/format'
import type { Provider, UpdateProviderInput, ProviderCircuitState } from '@/types'
import { RefreshCw, Edit, Activity, ShieldOff, ShieldCheck } from 'lucide-react'
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

export function ProvidersPage() {
  const qc = useQueryClient()
  const [editProvider, setEditProvider] = useState<Provider | null>(null)
  const [form, setForm] = useState<UpdateProviderInput>({})

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
    onError: (err) => {
      toast.error(axios.isAxiosError(err) ? err.response?.data?.message : 'Update failed')
    },
  })

  const healthCheckMutation = useMutation({
    mutationFn: (code: string) => providersApi.healthCheck(code),
    onSuccess: (_, code) => {
      qc.invalidateQueries({ queryKey: ['providers'] })
      toast.success(`Health check sent to ${code}`)
    },
    onError: () => toast.error('Health check failed'),
  })

  const resetCircuitMutation = useMutation({
    mutationFn: (code: string) => metricsApi.resetCircuit(code),
    onSuccess: (_, code) => {
      qc.invalidateQueries({ queryKey: ['health-metrics'] })
      toast.success(`Circuit reset for ${code}`)
    },
    onError: () => toast.error('Reset failed'),
  })

  const openEdit = (p: Provider) => {
    setForm({
      display_name:       p.display_name,
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
            columns={[
              {
                key: 'name',
                header: 'Provider',
                render: (p) => (
                  <div>
                    <p className="font-medium text-ink">{p.display_name}</p>
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
                    <div className="flex items-center gap-1.5">
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
        title={`Edit ${editProvider?.display_name ?? ''}`}
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
            value={form.display_name ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
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
    </div>
  )
}
