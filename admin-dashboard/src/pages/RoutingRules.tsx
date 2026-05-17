import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { routingApi } from '@/api/routing.api'
import { providersApi } from '@/api/providers.api'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataTable } from '@/components/shared/DataTable'
import { BoolBadge } from '@/components/shared/StatusBadge'
import { ErrorMessage } from '@/components/shared/ErrorMessage'
import { Drawer } from '@/components/shared/Drawer'
import { Button, Badge, Modal, Select, Card } from '@/components/ui'
import { SkeletonTable } from '@/components/ui/Skeleton'
import { fmtDate } from '@/utils/format'
import type { RoutingRule, CreateRoutingRuleInput } from '@/types'
import { Plus, Edit, ToggleLeft, ToggleRight, RefreshCw } from 'lucide-react'
import { ENDPOINTS } from '@/config/endpoints'
import toast from 'react-hot-toast'
import axios from 'axios'

const SERVICE_TYPES = [
  'airtime', 'data', 'electricity', 'cable_tv', 'exam_pin', 'identity_verification',
]

const blankForm = (): CreateRoutingRuleInput => ({
  service_type: '',
  primary_provider_code: '',
  fallback_provider_code: '',
  is_active: true,
})

function errMsg(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) return err.response?.data?.message ?? err.message ?? fallback
  return fallback
}

export function RoutingRulesPage() {
  const qc = useQueryClient()
  const [modal, setModal] = useState<'create' | { rule: RoutingRule } | null>(null)
  const [form, setForm] = useState<CreateRoutingRuleInput>(blankForm())
  const [filterService, setFilterService] = useState('')
  const [selected, setSelected] = useState<RoutingRule | null>(null)

  const { data: rules = [], isLoading, error, refetch } = useQuery({
    queryKey: ['routing-rules'],
    queryFn: routingApi.list,
  })

  const { data: providers = [] } = useQuery({
    queryKey: ['providers'],
    queryFn: providersApi.list,
  })

  const providerOptions = providers
    .filter((p) => p.is_active)
    .map((p) => ({ value: p.provider_code, label: p.display_name }))

  const providerNameByCode = Object.fromEntries(providers.map((p) => [p.provider_code, p.display_name]))

  const createMutation = useMutation({
    mutationFn: (body: CreateRoutingRuleInput) => routingApi.create(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['routing-rules'] })
      toast.success('Routing rule created')
      setModal(null)
    },
    onError: (err) => toast.error(errMsg(err, 'Failed to create rule')),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<CreateRoutingRuleInput> }) =>
      routingApi.update(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['routing-rules'] })
      toast.success('Rule updated')
      setModal(null)
    },
    onError: (err) => toast.error(errMsg(err, 'Update failed')),
  })

  const openCreate = () => { setForm(blankForm()); setModal('create') }
  const openEdit = (rule: RoutingRule) => {
    setForm({
      service_type:           rule.service_type,
      primary_provider_code:  rule.primary_provider_code,
      fallback_provider_code: rule.fallback_provider_code ?? '',
      is_active:              rule.is_active,
    })
    setModal({ rule })
  }

  const handleSubmit = () => {
    if (modal === 'create') {
      createMutation.mutate(form)
    } else if (modal && 'rule' in modal) {
      updateMutation.mutate({ id: modal.rule.id, body: form })
    }
  }

  const filtered = filterService
    ? rules.filter((r) => r.service_type === filterService)
    : rules

  if (error) return <ErrorMessage error={error} onRetry={() => void refetch()} endpoint={ENDPOINTS.routingRules.path} />

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Routing Rules"
        subtitle="Control which provider handles each service type"
        actions={
          <>
            <Button variant="secondary" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />}
              onClick={() => void refetch()}>Refresh</Button>
            <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={openCreate}>
              New rule
            </Button>
          </>
        }
      />

      {/* Filter */}
      <div className="w-48">
        <Select
          value={filterService}
          onChange={(e) => setFilterService(e.target.value)}
          placeholder="All services"
          options={SERVICE_TYPES.map((s) => ({ value: s, label: s }))}
        />
      </div>

      <Card padding="none">
        {isLoading ? (
          <div className="p-5"><SkeletonTable rows={4} /></div>
        ) : (
          <DataTable
            data={filtered}
            rowKey={(r) => r.id}
            onRowClick={setSelected}
            emptyMessage="No routing rules configured yet."
            columns={[
              {
                key: 'service',
                header: 'Service Type',
                render: (r) => <Badge variant="accent">{r.service_type}</Badge>,
              },
              {
                key: 'primary',
                header: 'Primary Provider',
                render: (r) => (
                  <span className="font-mono text-sm text-ink">{r.primary_provider_code}</span>
                ),
              },
              {
                key: 'fallback',
                header: 'Fallback Provider',
                render: (r) =>
                  r.fallback_provider_code ? (
                    <span className="font-mono text-sm text-ink-muted">
                      {r.fallback_provider_code}
                    </span>
                  ) : (
                    <span className="text-ink-faint text-sm">—</span>
                  ),
              },
              {
                key: 'active',
                header: 'Status',
                render: (r) => <BoolBadge value={r.is_active} trueLabel="Active" falseLabel="Inactive" />,
              },
              {
                key: 'updated',
                header: 'Updated',
                render: (r) => <span className="text-xs text-ink-faint">{fmtDate(r.updated_at)}</span>,
              },
              {
                key: 'actions',
                header: '',
                align: 'right',
                render: (r) => (
                  <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="xs"
                      icon={
                        r.is_active
                          ? <ToggleRight className="h-3.5 w-3.5 text-emerald-400" />
                          : <ToggleLeft className="h-3.5 w-3.5 text-ink-faint" />
                      }
                      onClick={() => updateMutation.mutate({ id: r.id, body: { is_active: !r.is_active } })}
                    />
                    <Button
                      variant="ghost"
                      size="xs"
                      icon={<Edit className="h-3.5 w-3.5" />}
                      onClick={() => openEdit(r)}
                    />
                  </div>
                ),
              },
            ]}
          />
        )}
      </Card>

      {/* Create / Edit modal */}
      <Modal
        open={modal !== null}
        onClose={() => setModal(null)}
        title={modal === 'create' ? 'Create Routing Rule' : 'Edit Routing Rule'}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button>
            <Button
              onClick={handleSubmit}
              loading={createMutation.isPending || updateMutation.isPending}
              disabled={!form.service_type || !form.primary_provider_code}
            >
              {modal === 'create' ? 'Create' : 'Save'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Select
            label="Service Type"
            value={form.service_type}
            onChange={(e) => setForm((f) => ({ ...f, service_type: e.target.value }))}
            options={SERVICE_TYPES.map((s) => ({ value: s, label: s }))}
            placeholder="Select service"
          />
          <Select
            label="Primary Provider"
            value={form.primary_provider_code}
            onChange={(e) => setForm((f) => ({ ...f, primary_provider_code: e.target.value }))}
            options={providerOptions}
            placeholder="Select primary"
          />
          <Select
            label="Fallback Provider (optional)"
            value={form.fallback_provider_code ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, fallback_provider_code: e.target.value || undefined }))}
            options={providerOptions}
            placeholder="None"
          />
        </div>
      </Modal>

      {/* Detail drawer */}
      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title="Routing Rule Detail"
        subtitle={selected ? `${selected.service_type} routing` : ''}
      >
        {selected && (
          <div className="space-y-4 text-sm">
            <Row label="Service Type"      value={<Badge variant="accent">{selected.service_type}</Badge>} />
            <Row label="Primary Provider"  value={
              <div className="text-right">
                <span className="font-mono text-sm">{selected.primary_provider_code}</span>
                {providerNameByCode[selected.primary_provider_code] && (
                  <p className="text-xs text-ink-faint">{providerNameByCode[selected.primary_provider_code]}</p>
                )}
              </div>
            } />
            <Row label="Fallback Provider" value={
              selected.fallback_provider_code ? (
                <div className="text-right">
                  <span className="font-mono text-sm">{selected.fallback_provider_code}</span>
                  {providerNameByCode[selected.fallback_provider_code] && (
                    <p className="text-xs text-ink-faint">{providerNameByCode[selected.fallback_provider_code]}</p>
                  )}
                </div>
              ) : <span className="text-ink-faint">None</span>
            } />
            <Row label="Status"            value={<BoolBadge value={selected.is_active} trueLabel="Active" falseLabel="Inactive" />} />
            <Row label="Created"           value={fmtDate(selected.created_at)} />
            <Row label="Updated"           value={fmtDate(selected.updated_at)} />

            <div className="border-t border-border pt-3 flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                icon={<Edit className="h-3.5 w-3.5" />}
                onClick={() => { setSelected(null); openEdit(selected) }}
              >
                Edit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={
                  selected.is_active
                    ? <ToggleRight className="h-3.5 w-3.5 text-emerald-400" />
                    : <ToggleLeft className="h-3.5 w-3.5 text-ink-faint" />
                }
                onClick={() => {
                  updateMutation.mutate({ id: selected.id, body: { is_active: !selected.is_active } })
                  setSelected(null)
                }}
              >
                {selected.is_active ? 'Deactivate' : 'Activate'}
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-xs text-ink-faint w-36 shrink-0">{label}</span>
      <span className="text-sm text-ink text-right">{value}</span>
    </div>
  )
}
