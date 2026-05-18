import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import axios from 'axios'
import { notificationsApi } from '@/api/notifications.api'
import { PageHeader } from '@/components/shared/PageHeader'
import { FilterBar } from '@/components/shared/FilterBar'
import { DataTable } from '@/components/shared/DataTable'
import { Pagination } from '@/components/shared/Pagination'
import { ErrorMessage } from '@/components/shared/ErrorMessage'
import { Button, Badge, Card, Input, Select, Modal } from '@/components/ui'
import { SkeletonTable } from '@/components/ui/Skeleton'
import { fmtRelative } from '@/utils/format'
import type { NotificationTemplate } from '@/types'
import { RefreshCw, Plus, Edit2, Mail, MessageSquare, Smartphone, Bell, Eye } from 'lucide-react'

function errMsg(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) return err.response?.data?.error ?? err.message ?? fallback
  if (err instanceof Error) return err.message
  return fallback
}

const CHANNEL_ICON: Record<string, React.ReactNode> = {
  email:  <Mail          className="h-3.5 w-3.5" />,
  sms:    <MessageSquare className="h-3.5 w-3.5" />,
  push:   <Smartphone    className="h-3.5 w-3.5" />,
  in_app: <Bell          className="h-3.5 w-3.5" />,
}

const NOTIFICATION_TYPES = [
  'transaction_success', 'transaction_failure', 'wallet_funded',
  'refund_completed',    'maintenance_announcement', 'marketing_broadcast',
  'security_alert',      'low_balance',              'account_update',
]

interface TemplateForm {
  name:              string
  type:              string
  notification_type: string
  subject:           string
  body:              string
  variables:         string
  is_active:         boolean
}

const BLANK: TemplateForm = {
  name: '', type: 'email', notification_type: '', subject: '', body: '', variables: '', is_active: true,
}

const VARIABLE_HINTS: Record<string, string[]> = {
  transaction_success:      ['{{user_name}}', '{{amount}}', '{{reference}}', '{{service}}'],
  transaction_failure:      ['{{user_name}}', '{{amount}}', '{{reference}}', '{{reason}}'],
  wallet_funded:            ['{{user_name}}', '{{amount}}', '{{balance}}'],
  refund_completed:         ['{{user_name}}', '{{amount}}', '{{reference}}'],
  security_alert:           ['{{user_name}}', '{{action}}', '{{timestamp}}', '{{ip}}'],
  maintenance_announcement: ['{{start_time}}', '{{end_time}}', '{{affected_services}}'],
  marketing_broadcast:      ['{{user_name}}', '{{offer}}'],
}

function TemplateModal({
  open, onClose, initial,
}: {
  open: boolean
  onClose: () => void
  initial: NotificationTemplate | null
}) {
  const qc       = useQueryClient()
  const isEdit   = !!initial
  const [form, setForm] = useState<TemplateForm>(
    initial
      ? {
          name:              initial.name,
          type:              initial.type,
          notification_type: initial.notification_type,
          subject:           initial.subject ?? '',
          body:              initial.body,
          variables:         (initial.variables ?? []).join(', '),
          is_active:         initial.is_active,
        }
      : BLANK,
  )
  const [previewVars, setPreviewVars] = useState<Record<string, string>>({})
  const [showPreview, setShowPreview] = useState(false)

  const hints = VARIABLE_HINTS[form.notification_type] ?? []

  function renderPreview(text: string) {
    return text.replace(/\{\{(\w+)\}\}/g, (_, k: string) => previewVars[k] ?? `[${k}]`)
  }

  const createMutation = useMutation({
    mutationFn: () =>
      notificationsApi.createTemplate({
        name:              form.name,
        type:              form.type,
        notification_type: form.notification_type,
        subject:           form.subject || null,
        body:              form.body,
        variables:         form.variables ? form.variables.split(',').map((v) => v.trim()).filter(Boolean) : [],
        is_active:         form.is_active,
      }),
    onSuccess: () => {
      toast.success('Template created')
      void qc.invalidateQueries({ queryKey: ['notification-templates'] })
      onClose()
    },
    onError: (err) => toast.error(errMsg(err, 'Failed to create template')),
  })

  const updateMutation = useMutation({
    mutationFn: () =>
      notificationsApi.updateTemplate(initial!.id, {
        name:              form.name,
        type:              form.type,
        notification_type: form.notification_type,
        subject:           form.subject || null,
        body:              form.body,
        variables:         form.variables ? form.variables.split(',').map((v) => v.trim()).filter(Boolean) : [],
        is_active:         form.is_active,
      }),
    onSuccess: () => {
      toast.success('Template updated')
      void qc.invalidateQueries({ queryKey: ['notification-templates'] })
      onClose()
    },
    onError: (err) => toast.error(errMsg(err, 'Failed to update template')),
  })

  const isPending = createMutation.isPending || updateMutation.isPending
  const set = (k: keyof TemplateForm, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }))

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit Template' : 'Create Template'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button
            variant="primary" size="sm" disabled={isPending || !form.name || !form.body || !form.notification_type}
            onClick={() => isEdit ? updateMutation.mutate() : createMutation.mutate()}
          >
            {isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Template'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1.5">Template Name *</label>
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. transaction-success-email" />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1.5">Channel *</label>
            <Select
              value={form.type}
              onChange={(e) => set('type', e.target.value)}
              options={[
                { value: 'email',  label: 'Email' },
                { value: 'sms',    label: 'SMS' },
                { value: 'push',   label: 'Push' },
                { value: 'in_app', label: 'In-App' },
              ]}
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1.5">Notification Type *</label>
          <Select
            value={form.notification_type}
            onChange={(e) => set('notification_type', e.target.value)}
            options={[
              { value: '', label: 'Select type…' },
              ...NOTIFICATION_TYPES.map((t) => ({ value: t, label: t.replace(/_/g, ' ') })),
            ]}
          />
        </div>

        {form.type === 'email' && (
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1.5">Subject</label>
            <Input value={form.subject} onChange={(e) => set('subject', e.target.value)} placeholder="Email subject line…" />
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-ink-muted">Body *</label>
            {hints.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {hints.map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => set('body', form.body + h)}
                    className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
                  >
                    {h}
                  </button>
                ))}
              </div>
            )}
          </div>
          <textarea
            value={form.body}
            onChange={(e) => set('body', e.target.value)}
            rows={5}
            placeholder="Message body. Use {{variable_name}} for dynamic values."
            className="w-full rounded-lg border border-border bg-surface-2 text-ink text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-colors resize-y font-mono"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1.5">Variables (comma-separated)</label>
          <Input
            value={form.variables}
            onChange={(e) => set('variables', e.target.value)}
            placeholder="user_name, amount, reference"
          />
          <p className="text-[11px] text-ink-faint mt-1">Document the variable names available for this template.</p>
        </div>

        {/* Preview section */}
        <div className="rounded-lg border border-border overflow-hidden">
          <button
            type="button"
            onClick={() => setShowPreview(!showPreview)}
            className="flex items-center gap-2 w-full px-4 py-2.5 bg-surface-2 text-sm font-medium text-ink hover:bg-surface-1 transition-colors"
          >
            <Eye className="h-3.5 w-3.5" />
            {showPreview ? 'Hide Preview' : 'Preview Template'}
          </button>
          {showPreview && (
            <div className="p-4 space-y-3">
              {form.variables && (
                <div className="grid grid-cols-2 gap-2">
                  {form.variables.split(',').map((v) => v.trim()).filter(Boolean).map((varName) => (
                    <div key={varName}>
                      <label className="block text-[10px] text-ink-faint mb-1">{varName}</label>
                      <input
                        type="text"
                        placeholder={`value for ${varName}`}
                        value={previewVars[varName] ?? ''}
                        onChange={(e) => setPreviewVars((p) => ({ ...p, [varName]: e.target.value }))}
                        className="w-full text-xs bg-surface-2 border border-border rounded px-2 py-1.5 text-ink focus:outline-none"
                      />
                    </div>
                  ))}
                </div>
              )}
              <div className="rounded-lg bg-surface-2 border border-border p-4">
                {form.type === 'email' && form.subject && (
                  <p className="text-sm font-semibold text-ink mb-2 pb-2 border-b border-border">
                    Subject: {renderPreview(form.subject)}
                  </p>
                )}
                <p className="text-sm text-ink whitespace-pre-wrap">{renderPreview(form.body)}</p>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="is_active"
            checked={form.is_active}
            onChange={(e) => set('is_active', e.target.checked)}
            className="rounded border-border"
          />
          <label htmlFor="is_active" className="text-sm text-ink-muted">Active (visible for use)</label>
        </div>
      </div>
    </Modal>
  )
}

export function NotificationTemplatesPage() {
  const [page,   setPage]   = useState(1)
  const [search, setSearch] = useState('')
  const [type,   setType]   = useState('')
  const [modal,  setModal]  = useState<{ open: boolean; editing: NotificationTemplate | null }>({ open: false, editing: null })
  const limit = 25

  const { data: raw, isLoading, error, refetch } = useQuery({
    queryKey: ['notification-templates', { search, type, page, limit }],
    queryFn:  () => notificationsApi.listTemplates({ search: search || undefined, type: type || undefined, page, limit }),
  })

  const templates = raw?.data  ?? []
  const total     = raw?.total ?? 0

  const columns = [
    {
      key: 'name',
      header: 'Name',
      render: (t: NotificationTemplate) => (
        <span className="text-sm font-medium text-ink">{t.name}</span>
      ),
    },
    {
      key: 'type',
      header: 'Channel',
      render: (t: NotificationTemplate) => (
        <div className="flex items-center gap-1.5 text-ink-faint">
          {CHANNEL_ICON[t.type]}
          <Badge variant="neutral" size="sm">{t.type}</Badge>
        </div>
      ),
    },
    {
      key: 'notification_type',
      header: 'Notification Type',
      render: (t: NotificationTemplate) => (
        <span className="text-xs font-mono text-ink-muted">{t.notification_type.replace(/_/g, ' ')}</span>
      ),
    },
    {
      key: 'variables',
      header: 'Variables',
      render: (t: NotificationTemplate) => (
        <div className="flex flex-wrap gap-1">
          {(t.variables ?? []).slice(0, 3).map((v) => (
            <span key={v} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-2 text-ink-faint">
              {`{{${v}}}`}
            </span>
          ))}
          {(t.variables ?? []).length > 3 && (
            <span className="text-[10px] text-ink-faint">+{(t.variables ?? []).length - 3}</span>
          )}
        </div>
      ),
    },
    {
      key: 'is_active',
      header: 'Status',
      render: (t: NotificationTemplate) => (
        <Badge variant={t.is_active ? 'success' : 'neutral'}>{t.is_active ? 'Active' : 'Inactive'}</Badge>
      ),
    },
    {
      key: 'updated_at',
      header: 'Updated',
      render: (t: NotificationTemplate) => (
        <span className="text-xs text-ink-faint">{fmtRelative(t.updated_at)}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (t: NotificationTemplate) => (
        <Button variant="ghost" size="sm" icon={<Edit2 className="h-3.5 w-3.5" />}
          onClick={() => setModal({ open: true, editing: t })}>
          Edit
        </Button>
      ),
    },
  ]

  if (error) return <ErrorMessage error={error} onRetry={() => void refetch()} endpoint="/admin/notification-templates" />

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Notification Templates"
        subtitle="Reusable message templates with variable substitution"
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />}
              onClick={() => void refetch()}>Refresh</Button>
            <Button variant="primary" size="sm" icon={<Plus className="h-3.5 w-3.5" />}
              onClick={() => setModal({ open: true, editing: null })}>New Template</Button>
          </div>
        }
      />

      <FilterBar>
        <div className="flex-1 min-w-[200px] max-w-sm">
          <Input placeholder="Search templates…" value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }} />
        </div>
        <Select
          value={type}
          onChange={(e) => { setType(e.target.value); setPage(1) }}
          options={[
            { value: '',        label: 'All channels' },
            { value: 'email',   label: 'Email' },
            { value: 'sms',     label: 'SMS' },
            { value: 'push',    label: 'Push' },
            { value: 'in_app',  label: 'In-App' },
          ]}
          className="w-36"
        />
        {(search || type) && (
          <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setType(''); setPage(1) }}>Clear</Button>
        )}
      </FilterBar>

      <Card>
        {isLoading ? (
          <SkeletonTable rows={6} />
        ) : (
          <>
            <DataTable
              columns={columns}
              data={templates}
              rowKey={(t) => t.id}
              emptyMessage="No templates yet. Create one to get started."
            />
            <div className="px-4 pb-2">
              <Pagination page={page} limit={limit} total={total} onPage={setPage} />
            </div>
          </>
        )}
      </Card>

      <TemplateModal
        open={modal.open}
        onClose={() => setModal({ open: false, editing: null })}
        initial={modal.editing}
      />
    </div>
  )
}
