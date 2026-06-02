import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import axios from 'axios'
import { notificationsApi } from '@/api/notifications.api'
import { announcementsApi } from '@/api/announcements.api'
import type { Announcement, AnnouncementInput } from '@/api/announcements.api'
import { PageHeader } from '@/components/shared/PageHeader'
import { ErrorMessage } from '@/components/shared/ErrorMessage'
import { Button, Badge, Card, Input, Select, Modal } from '@/components/ui'
import { SkeletonTable } from '@/components/ui/Skeleton'
import { DataTable } from '@/components/shared/DataTable'
import { Pagination } from '@/components/shared/Pagination'
import { fmtRelative } from '@/utils/format'
import type { NotificationJob, NotificationTemplate } from '@/types'
import {
  Send, Eye, Radio, Users, User, Mail,
  MessageSquare, Smartphone, Bell, RefreshCw, CheckCircle2, Trash2,
  Megaphone, TicketSlash, PenLine, Plus,
} from 'lucide-react'

function errMsg(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) return err.response?.data?.error ?? err.message ?? fallback
  if (err instanceof Error) return err.message
  return fallback
}

// ── Announcement form default ─────────────────────────────────────────────────

const BLANK_ANN: AnnouncementInput = {
  title: '', message: '', display_type: 'popup', priority: 0, status: 'active',
  start_at: null, end_at: null,
}

// ── Announcements section ─────────────────────────────────────────────────────

function AnnouncementsSection() {
  const qc = useQueryClient()
  const [formOpen,       setFormOpen]       = useState(false)
  const [editing,        setEditing]        = useState<Announcement | null>(null)
  const [confirmDelId,   setConfirmDelId]   = useState<string | null>(null)
  const [form,           setForm]           = useState<AnnouncementInput>(BLANK_ANN)
  const [annPage,        setAnnPage]        = useState(1)
  const ANN_LIMIT = 10

  const { data: annRaw, isLoading: annLoading } = useQuery({
    queryKey: ['announcements', annPage],
    queryFn:  () => announcementsApi.list({ page: annPage, limit: ANN_LIMIT }),
  })

  const createMut = useMutation({
    mutationFn: () => announcementsApi.create(form),
    onSuccess: () => {
      toast.success('Announcement created')
      void qc.invalidateQueries({ queryKey: ['announcements'] })
      closeForm()
    },
    onError: (err) => toast.error(errMsg(err, 'Failed to create announcement')),
  })

  const updateMut = useMutation({
    mutationFn: () => announcementsApi.update(editing!.id, form),
    onSuccess: () => {
      toast.success('Announcement updated')
      void qc.invalidateQueries({ queryKey: ['announcements'] })
      closeForm()
    },
    onError: (err) => toast.error(errMsg(err, 'Failed to update announcement')),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => announcementsApi.delete(id),
    onSuccess: () => {
      toast.success('Announcement deleted')
      setConfirmDelId(null)
      void qc.invalidateQueries({ queryKey: ['announcements'] })
    },
    onError: (err) => {
      toast.error(errMsg(err, 'Failed to delete announcement'))
      setConfirmDelId(null)
    },
  })

  const toggleMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'inactive' }) =>
      announcementsApi.update(id, { status }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['announcements'] }),
    onError:   (err) => toast.error(errMsg(err, 'Failed to update status')),
  })

  function openCreate() {
    setEditing(null)
    setForm(BLANK_ANN)
    setFormOpen(true)
  }

  function openEdit(a: Announcement) {
    setEditing(a)
    setForm({
      title:        a.title,
      message:      a.message,
      display_type: a.display_type,
      priority:     a.priority,
      status:       a.status,
      start_at:     a.start_at,
      end_at:       a.end_at,
    })
    setFormOpen(true)
  }

  function closeForm() {
    setFormOpen(false)
    setEditing(null)
    setForm(BLANK_ANN)
  }

  const setF = <K extends keyof AnnouncementInput>(k: K, v: AnnouncementInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  const anns      = annRaw?.data  ?? []
  const annTotal  = annRaw?.total ?? 0
  const annPages  = Math.max(1, Math.ceil(annTotal / ANN_LIMIT))

  const annColumns = [
    {
      key: 'display_type',
      header: 'Type',
      render: (a: Announcement) => (
        <div className="flex items-center gap-1.5">
          {a.display_type === 'popup'
            ? <Megaphone  className="h-3.5 w-3.5 text-ink-faint" />
            : <TicketSlash className="h-3.5 w-3.5 text-ink-faint" />}
          <Badge variant="neutral" size="sm">{a.display_type}</Badge>
        </div>
      ),
    },
    {
      key: 'title',
      header: 'Title',
      render: (a: Announcement) => (
        <span className="text-xs text-ink font-medium truncate max-w-[200px] block">{a.title}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (a: Announcement) => (
        <button
          onClick={() => toggleMut.mutate({ id: a.id, status: a.status === 'active' ? 'inactive' : 'active' })}
          className="focus:outline-none"
          title="Toggle status"
        >
          <Badge variant={a.status === 'active' ? 'success' : 'neutral'}>
            {a.status}
          </Badge>
        </button>
      ),
    },
    {
      key: 'priority',
      header: 'Priority',
      render: (a: Announcement) => (
        <span className="text-xs text-ink-muted tabular-nums">{a.priority}</span>
      ),
    },
    {
      key: 'schedule',
      header: 'Schedule',
      render: (a: Announcement) => (
        <span className="text-xs text-ink-faint whitespace-nowrap">
          {a.start_at ? fmtRelative(a.start_at) : '—'} → {a.end_at ? fmtRelative(a.end_at) : 'no end'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (a: Announcement) => (
        <div className="flex items-center gap-1">
          <button
            onClick={() => openEdit(a)}
            className="p-1.5 rounded text-ink-faint hover:text-accent hover:bg-accent-subtle transition-colors"
            title="Edit"
          >
            <PenLine className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setConfirmDelId(a.id)}
            className="p-1.5 rounded text-ink-faint hover:text-red-500 hover:bg-red-50 transition-colors"
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ),
    },
  ]

  const isPending = editing ? updateMut.isPending : createMut.isPending
  const canSave   = form.title.trim() && form.message.trim()

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-ink">Popup &amp; Ticker Announcements</h2>
          <p className="text-xs text-ink-faint mt-0.5">
            Popup modals and scrolling tickers shown on the customer dashboard.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          icon={<Plus className="h-3.5 w-3.5" />}
          onClick={openCreate}
        >
          New Announcement
        </Button>
      </div>

      <Card>
        {annLoading ? (
          <SkeletonTable rows={4} />
        ) : (
          <>
            <DataTable
              columns={annColumns}
              data={anns}
              rowKey={(a) => a.id}
              emptyMessage="No announcements yet. Create one to show a popup or ticker on the customer dashboard."
            />
            {annPages > 1 && (
              <div className="px-4 pb-2">
                <Pagination page={annPage} limit={ANN_LIMIT} total={annTotal} onPage={setAnnPage} />
              </div>
            )}
          </>
        )}
      </Card>

      {/* Create / Edit modal */}
      <Modal
        open={formOpen}
        onClose={closeForm}
        title={editing ? 'Edit Announcement' : 'New Announcement'}
        subtitle="Popup modals require user dismissal. Tickers scroll continuously."
        size="lg"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={closeForm} disabled={isPending}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => editing ? updateMut.mutate() : createMut.mutate()}
              disabled={isPending || !canSave}
            >
              {isPending ? 'Saving…' : editing ? 'Save Changes' : 'Create'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1.5">Display Type *</label>
              <Select
                value={form.display_type}
                onChange={(e) => setF('display_type', e.target.value as 'popup' | 'ticker')}
                options={[
                  { value: 'popup',  label: 'Popup — modal on dashboard' },
                  { value: 'ticker', label: 'Ticker — scrolling banner' },
                ]}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1.5">Status</label>
              <Select
                value={form.status ?? 'active'}
                onChange={(e) => setF('status', e.target.value as 'active' | 'inactive')}
                options={[
                  { value: 'active',   label: 'Active' },
                  { value: 'inactive', label: 'Inactive' },
                ]}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1.5">Title *</label>
            <Input
              value={form.title}
              onChange={(e) => setF('title', e.target.value)}
              placeholder="e.g. Scheduled Maintenance"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1.5">Message *</label>
            <textarea
              value={form.message}
              onChange={(e) => setF('message', e.target.value)}
              rows={4}
              placeholder="The message customers will see…"
              className="w-full rounded-lg border border-border bg-surface-2 text-ink text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-colors resize-y"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1.5">Priority (0–100)</label>
              <Input
                type="number"
                min={0}
                max={100}
                value={String(form.priority ?? 0)}
                onChange={(e) => setF('priority', Number(e.target.value))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1.5">Start (optional)</label>
              <input
                type="datetime-local"
                value={form.start_at ? form.start_at.slice(0, 16) : ''}
                onChange={(e) => setF('start_at', e.target.value ? new Date(e.target.value).toISOString() : null)}
                className="w-full text-sm bg-surface-2 border border-border rounded-lg px-2 py-1.5 text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1.5">End (optional)</label>
              <input
                type="datetime-local"
                value={form.end_at ? form.end_at.slice(0, 16) : ''}
                onChange={(e) => setF('end_at', e.target.value ? new Date(e.target.value).toISOString() : null)}
                className="w-full text-sm bg-surface-2 border border-border rounded-lg px-2 py-1.5 text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </div>
          </div>
        </div>
      </Modal>

      {/* Delete confirmation */}
      <Modal
        open={confirmDelId !== null}
        onClose={() => setConfirmDelId(null)}
        title="Delete announcement?"
        subtitle="This removes the announcement immediately. Customers will no longer see it."
        size="sm"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setConfirmDelId(null)} disabled={deleteMut.isPending}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              icon={<Trash2 className="h-3.5 w-3.5" />}
              onClick={() => confirmDelId && deleteMut.mutate(confirmDelId)}
              disabled={deleteMut.isPending}
            >
              {deleteMut.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-muted">Are you sure? This cannot be undone.</p>
      </Modal>
    </div>
  )
}

const NOTIFICATION_TYPES = [
  { value: 'transaction_success',      label: 'Transaction Success' },
  { value: 'transaction_failure',      label: 'Transaction Failure' },
  { value: 'wallet_funded',            label: 'Wallet Funded' },
  { value: 'refund_completed',         label: 'Refund Completed' },
  { value: 'maintenance_announcement', label: 'Maintenance Announcement' },
  { value: 'marketing_broadcast',      label: 'Marketing Broadcast' },
  { value: 'security_alert',           label: 'Security Alert' },
]

const CHANNEL_ICONS: Record<string, React.ReactNode> = {
  email:     <Mail          className="h-4 w-4" />,
  sms:       <MessageSquare className="h-4 w-4" />,
  push:      <Smartphone    className="h-4 w-4" />,
  in_app:    <Bell          className="h-4 w-4" />,
  broadcast: <Radio         className="h-4 w-4" />,
}

interface SendForm {
  type:              string
  notification_type: string
  recipient_type:    string
  recipient_id:      string
  recipient_email:   string
  subject:           string
  body:              string
  template_id:       string
  scheduled_at:      string
}

const BLANK: SendForm = {
  type: 'email', notification_type: '', recipient_type: 'all',
  recipient_id: '', recipient_email: '', subject: '', body: '',
  template_id: '', scheduled_at: '',
}

function SendModal({
  open, onClose, templates,
}: {
  open: boolean
  onClose: () => void
  templates: NotificationTemplate[]
}) {
  const qc = useQueryClient()
  const [form, setForm] = useState<SendForm>(BLANK)
  const [showPreview, setShowPreview] = useState(false)

  const set = (k: keyof SendForm, v: string) => setForm((f) => ({ ...f, [k]: v }))

  // Apply template when selected
  function applyTemplate(id: string) {
    const tmpl = templates.find((t) => t.id === id)
    if (!tmpl) { set('template_id', ''); return }
    setForm((f) => ({
      ...f,
      template_id:       id,
      type:              tmpl.type,
      notification_type: tmpl.notification_type,
      subject:           tmpl.subject ?? '',
      body:              tmpl.body,
    }))
  }

  const sendMutation = useMutation({
    mutationFn: () =>
      notificationsApi.sendNotification({
        type:              form.type,
        notification_type: form.notification_type,
        recipient_type:    form.recipient_type,
        recipient_id:      form.recipient_type === 'user' && form.recipient_id ? form.recipient_id : undefined,
        recipient_email:   form.recipient_type === 'user' && form.recipient_email ? form.recipient_email : undefined,
        subject:           form.subject || undefined,
        body:              form.body,
        template_id:       form.template_id || undefined,
        scheduled_at:      form.scheduled_at || undefined,
        idempotency_key:   `broadcast-${Date.now()}`,
      }),
    onSuccess: () => {
      toast.success('Notification queued for delivery')
      void qc.invalidateQueries({ queryKey: ['broadcast-jobs'] })
      setForm(BLANK)
      setShowPreview(false)
      onClose()
    },
    onError: (err) => toast.error(errMsg(err, 'Failed to send notification')),
  })

  const canSend =
    form.notification_type &&
    form.body &&
    (form.recipient_type !== 'user' || form.recipient_id || form.recipient_email)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Send Notification"
      subtitle="Send a message to users via any channel"
      size="lg"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={sendMutation.isPending}>Cancel</Button>
          {!showPreview ? (
            <Button
              variant="primary" size="sm" icon={<Eye className="h-3.5 w-3.5" />}
              onClick={() => setShowPreview(true)}
              disabled={!canSend}
            >
              Preview & Send
            </Button>
          ) : (
            <Button
              variant="primary" size="sm" icon={<Send className="h-3.5 w-3.5" />}
              onClick={() => sendMutation.mutate()}
              disabled={sendMutation.isPending || !canSend}
            >
              {sendMutation.isPending ? 'Sending…' : 'Confirm & Send'}
            </Button>
          )}
        </>
      }
    >
      {!showPreview ? (
        <div className="space-y-4">
          {/* Template selector */}
          {templates.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1.5">Load from Template</label>
              <Select
                value={form.template_id}
                onChange={(e) => applyTemplate(e.target.value)}
                options={[
                  { value: '', label: 'Custom message (no template)' },
                  ...templates.filter((t) => t.is_active).map((t) => ({ value: t.id, label: t.name })),
                ]}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            {/* Channel */}
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1.5">Channel *</label>
              <Select
                value={form.type}
                onChange={(e) => set('type', e.target.value)}
                options={[
                  { value: 'in_app',    label: 'In-App (customer inbox)' },
                  { value: 'broadcast', label: 'Broadcast — In-App to all' },
                  { value: 'email',     label: 'Email (not yet integrated)' },
                  { value: 'sms',       label: 'SMS (not yet integrated)' },
                  { value: 'push',      label: 'Push (not yet integrated)' },
                ]}
              />
              {(form.type === 'email' || form.type === 'sms' || form.type === 'push') && (
                <p className="mt-1.5 text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                  This channel logs the job but does not deliver to customers yet. Use <strong>In-App</strong> or <strong>Broadcast</strong> to reach the customer notification inbox.
                </p>
              )}
            </div>

            {/* Notification type */}
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1.5">Notification Type *</label>
              <Select
                value={form.notification_type}
                onChange={(e) => set('notification_type', e.target.value)}
                options={[{ value: '', label: 'Select type…' }, ...NOTIFICATION_TYPES]}
              />
            </div>
          </div>

          {/* Recipient */}
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1.5">Recipients *</label>
            <div className="flex gap-2 mb-3">
              {([
                { key: 'all',     label: 'All Users',     icon: <Users className="h-3.5 w-3.5" /> },
                { key: 'user',    label: 'Specific User', icon: <User  className="h-3.5 w-3.5" /> },
              ] as const).map(({ key, label, icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => set('recipient_type', key)}
                  className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border transition-colors ${
                    form.recipient_type === key
                      ? 'border-accent bg-accent-subtle text-accent font-medium'
                      : 'border-border text-ink-muted hover:text-ink'
                  }`}
                >
                  {icon}{label}
                </button>
              ))}
            </div>

            {form.recipient_type === 'user' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-ink-faint mb-1">User ID (UUID)</label>
                  <Input
                    value={form.recipient_id}
                    onChange={(e) => set('recipient_id', e.target.value)}
                    placeholder="user-uuid…"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-ink-faint mb-1">Or Email address</label>
                  <Input
                    value={form.recipient_email}
                    onChange={(e) => set('recipient_email', e.target.value)}
                    placeholder="user@example.com"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Subject (email) */}
          {(form.type === 'email' || form.type === 'broadcast') && (
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1.5">Subject</label>
              <Input value={form.subject} onChange={(e) => set('subject', e.target.value)} placeholder="Email subject…" />
            </div>
          )}

          {/* Body */}
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1.5">Message Body *</label>
            <textarea
              value={form.body}
              onChange={(e) => set('body', e.target.value)}
              rows={5}
              placeholder="Message body… Use {{variable_name}} for personalization."
              className="w-full rounded-lg border border-border bg-surface-2 text-ink text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-colors resize-y"
            />
          </div>

          {/* Schedule */}
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1.5">Schedule (optional)</label>
            <input
              type="datetime-local"
              value={form.scheduled_at}
              onChange={(e) => set('scheduled_at', e.target.value)}
              className="text-sm bg-surface-2 border border-border rounded-lg px-2 py-1.5 text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
            <p className="text-[11px] text-ink-faint mt-1">Leave blank to send immediately.</p>
          </div>
        </div>
      ) : (
        /* Preview */
        <div className="space-y-4">
          <div className="rounded-lg border border-accent/30 bg-accent-subtle/20 px-4 py-3 text-sm text-accent">
            Review the message below before sending. This action will enqueue the notification for delivery.
          </div>

          <div className="rounded-lg border border-border bg-surface-2 p-4 space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-ink-faint">{CHANNEL_ICONS[form.type]}</span>
              <div>
                <p className="text-xs text-ink-faint">Channel</p>
                <p className="text-sm font-medium text-ink capitalize">{form.type}</p>
              </div>
              <div className="ml-auto">
                <Badge variant={form.recipient_type === 'all' ? 'info' : 'neutral'}>
                  {form.recipient_type === 'all' ? 'Broadcast to all users' : `To: ${form.recipient_email || form.recipient_id}`}
                </Badge>
              </div>
            </div>
            {form.subject && (
              <div>
                <p className="text-xs text-ink-faint">Subject</p>
                <p className="text-sm text-ink font-medium">{form.subject}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-ink-faint mb-1">Message</p>
              <p className="text-sm text-ink whitespace-pre-wrap rounded bg-surface-1 p-3 border border-border">{form.body}</p>
            </div>
            {form.notification_type && (
              <div>
                <p className="text-xs text-ink-faint">Type</p>
                <p className="text-sm text-ink">{form.notification_type.replace(/_/g, ' ')}</p>
              </div>
            )}
            {form.scheduled_at && (
              <div>
                <p className="text-xs text-ink-faint">Scheduled for</p>
                <p className="text-sm text-ink">{new Date(form.scheduled_at).toLocaleString()}</p>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowPreview(false)}
            className="text-sm text-ink-muted hover:text-ink underline"
          >
            ← Edit message
          </button>
        </div>
      )}
    </Modal>
  )
}

export function BroadcastCenterPage() {
  const qc = useQueryClient()
  const [modalOpen, setModalOpen]           = useState(false)
  const [page, setPage]                     = useState(1)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const limit = 10

  const { data: jobsRaw, isLoading: jobsLoading, isFetching, error: jobsError, refetch } = useQuery({
    queryKey: ['broadcast-jobs', page],
    queryFn: () => notificationsApi.listJobs({ recipient_type: 'all', page, limit }),
    refetchInterval: 15_000,
  })

  const { data: tmplRaw } = useQuery({
    queryKey: ['notification-templates-all'],
    queryFn: () => notificationsApi.listTemplates({ limit: 100 }),
  })

  const deleteMutation = useMutation({
    mutationFn: (jobId: string) => notificationsApi.deleteJob(jobId),
    onSuccess: () => {
      toast.success('Broadcast job deleted')
      setConfirmDeleteId(null)
      void qc.invalidateQueries({ queryKey: ['broadcast-jobs'] })
    },
    onError: (err) => {
      toast.error(errMsg(err, 'Failed to delete job'))
      setConfirmDeleteId(null)
    },
  })

  const broadcasts  = jobsRaw?.data  ?? []
  const totalJobs   = jobsRaw?.total ?? 0
  const templates   = tmplRaw?.data  ?? []

  const columns = [
    {
      key: 'type',
      header: 'Channel',
      render: (j: NotificationJob) => (
        <div className="flex items-center gap-1.5 text-ink-faint">
          {CHANNEL_ICONS[j.type] ?? <Bell className="h-3.5 w-3.5" />}
          <Badge variant="neutral" size="sm">{j.type}</Badge>
        </div>
      ),
    },
    {
      key: 'notification_type',
      header: 'Type',
      render: (j: NotificationJob) => (
        <span className="text-xs font-mono text-ink-muted">{j.notification_type.replace(/_/g, ' ')}</span>
      ),
    },
    {
      key: 'body',
      header: 'Message',
      render: (j: NotificationJob) => (
        <p className="text-xs text-ink-muted truncate max-w-[280px]">{j.subject ?? j.body.slice(0, 80)}</p>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (j: NotificationJob) => {
        const map: Record<string, 'success' | 'danger' | 'info' | 'warning' | 'neutral'> = {
          sent: 'success', failed: 'danger', processing: 'info', pending: 'warning', cancelled: 'neutral',
        }
        return <Badge variant={map[j.status] ?? 'neutral'}>{j.status}</Badge>
      },
    },
    {
      key: 'created_at',
      header: 'Sent',
      render: (j: NotificationJob) => (
        <span className="text-xs text-ink-faint whitespace-nowrap">{fmtRelative(j.created_at)}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (j: NotificationJob) => (
        <button
          type="button"
          onClick={() => setConfirmDeleteId(j.id)}
          className="p-1.5 rounded text-ink-faint hover:text-red-500 hover:bg-red-50 transition-colors"
          title="Delete job"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      ),
    },
  ]

  if (jobsError) return <ErrorMessage error={jobsError} onRetry={() => void refetch()} endpoint="/admin/notification-jobs" />

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Broadcast Center"
        subtitle="Send system-wide messages and targeted notifications to users"
        actions={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={<RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />}
              onClick={() => {
                void refetch().catch(() => toast.error('Failed to refresh broadcasts'))
              }}
              disabled={isFetching}
            >
              {isFetching ? 'Refreshing…' : 'Refresh'}
            </Button>
            <Button variant="primary" size="sm" icon={<Send className="h-3.5 w-3.5" />}
              onClick={() => setModalOpen(true)}>
              Send Notification
            </Button>
          </div>
        }
      />

      {/* Channel cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: <Mail          className="h-5 w-5 text-blue-400"    />, label: 'Email',    desc: 'Rich HTML email delivery'   },
          { icon: <MessageSquare className="h-5 w-5 text-green-400"   />, label: 'SMS',      desc: 'Text message delivery'      },
          { icon: <Smartphone    className="h-5 w-5 text-purple-400"  />, label: 'Push',     desc: 'Mobile push notifications'  },
          { icon: <Bell          className="h-5 w-5 text-amber-400"   />, label: 'In-App',   desc: 'In-app notification centre' },
        ].map(({ icon, label, desc }) => (
          <Card key={label}>
            <div className="p-4 flex items-start gap-3">
              <div className="h-9 w-9 rounded-lg bg-surface-2 flex items-center justify-center shrink-0">{icon}</div>
              <div>
                <p className="text-sm font-medium text-ink">{label}</p>
                <p className="text-xs text-ink-faint mt-0.5">{desc}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Broadcast log */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-ink">Recent Broadcasts</h2>
          <div className="flex items-center gap-1.5 text-xs text-ink-faint">
            <CheckCircle2 className="h-3 w-3 text-emerald-400" />
            Showing broadcast jobs only · auto-refreshes every 15s
          </div>
        </div>

        <Card>
          {jobsLoading ? (
            <SkeletonTable rows={5} />
          ) : (
            <>
              <DataTable
                columns={columns}
                data={broadcasts}
                rowKey={(j) => j.id}
                emptyMessage="No broadcasts sent yet. Click 'Send Notification' to get started."
              />
              <div className="px-4 pb-2">
                <Pagination page={page} limit={limit} total={totalJobs} onPage={setPage} />
              </div>
            </>
          )}
        </Card>
      </div>

      <SendModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        templates={templates}
      />

      {/* ── Announcements (popup / ticker) ───────────────────────────────── */}
      <AnnouncementsSection />

      {/* Delete confirmation */}
      <Modal
        open={confirmDeleteId !== null}
        onClose={() => setConfirmDeleteId(null)}
        title="Delete broadcast job?"
        subtitle="This removes the job record from the queue log. Customer notifications already delivered are not affected."
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setConfirmDeleteId(null)}
              disabled={deleteMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              icon={<Trash2 className="h-3.5 w-3.5" />}
              onClick={() => confirmDeleteId && deleteMutation.mutate(confirmDeleteId)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-muted">
          Are you sure you want to delete this broadcast job? This action cannot be undone.
        </p>
      </Modal>
    </div>
  )
}
