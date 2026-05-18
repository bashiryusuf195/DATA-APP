import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import axios from 'axios'
import { formatDistanceToNow } from 'date-fns'
import { supportApi } from '@/api/support.api'
import { PageHeader } from '@/components/shared/PageHeader'
import { FilterBar } from '@/components/shared/FilterBar'
import { DataTable } from '@/components/shared/DataTable'
import { Drawer } from '@/components/shared/Drawer'
import { Pagination } from '@/components/shared/Pagination'
import { ErrorMessage } from '@/components/shared/ErrorMessage'
import { Button, Badge, Modal, Input, Select, Card } from '@/components/ui'
import { SkeletonTable } from '@/components/ui/Skeleton'
import { fmtDate } from '@/utils/format'
import type {
  SupportTicket, SupportMessage,
  TicketStatus, TicketPriority, TicketCategory,
  CreateTicketInput, UpdateTicketInput, AddMessageInput,
} from '@/types'
import {
  Plus, RefreshCw, MessageSquare, User, Hash,
  ChevronRight, Lock, Unlock, AlertCircle,
} from 'lucide-react'

function errMsg(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) return err.response?.data?.error ?? err.message ?? fallback
  if (err instanceof Error) return err.message
  return fallback
}

// ── Colour helpers ────────────────────────────────────────────────────────────

type BadgeVariant = 'success' | 'danger' | 'warning' | 'info' | 'neutral'

function statusVariant(s: TicketStatus): BadgeVariant {
  return s === 'open' ? 'info' : s === 'pending' ? 'warning' : s === 'resolved' ? 'success' : 'neutral'
}

function priorityVariant(p: TicketPriority): BadgeVariant {
  return p === 'urgent' ? 'danger' : p === 'high' ? 'warning' : p === 'medium' ? 'info' : 'neutral'
}

function categoryLabel(c: TicketCategory | null): string {
  if (!c) return '—'
  return c.charAt(0).toUpperCase() + c.slice(1)
}

// ── Create Ticket Modal ───────────────────────────────────────────────────────

function emptyTicket(lockedCategory?: TicketCategory): CreateTicketInput {
  return {
    subject: '', description: null, user_email: null, transaction_reference: null,
    status: 'open', priority: 'medium', category: lockedCategory ?? null,
    assigned_to: null, assigned_to_email: null,
  }
}

function CreateTicketModal({
  open, onClose, onSaved, lockedCategory,
}: { open: boolean; onClose: () => void; onSaved: () => void; lockedCategory?: TicketCategory }) {
  const [form, setForm] = useState<CreateTicketInput>(() => emptyTicket(lockedCategory))
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({})

  useEffect(() => {
    if (open) { setForm(emptyTicket(lockedCategory)); setErrors({}) }
  }, [open, lockedCategory])

  const mutation = useMutation({
    mutationFn: (body: CreateTicketInput) => supportApi.createTicket(body),
    onSuccess: () => { toast.success('Ticket created'); onSaved(); onClose() },
    onError: (err) => toast.error(errMsg(err, 'Failed to create ticket')),
  })

  function validate() {
    const e: typeof errors = {}
    if (!form.subject.trim()) e.subject = 'Subject is required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={lockedCategory === 'complaint' ? 'New Complaint' : 'New Support Ticket'}
      subtitle="Create a ticket on behalf of a user or for internal tracking"
      size="lg"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={mutation.isPending}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={() => { if (validate()) mutation.mutate(form) }} disabled={mutation.isPending}>
            {mutation.isPending ? 'Creating…' : lockedCategory === 'complaint' ? 'Create Complaint' : 'Create Ticket'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          label="Subject *"
          value={form.subject}
          onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
          placeholder="Brief description of the issue"
          error={errors.subject}
        />
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1.5">Description</label>
          <textarea
            value={form.description ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value || null }))}
            rows={3}
            className="w-full rounded-lg border border-border bg-surface-2 text-ink text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-colors resize-y"
            placeholder="Detailed description (optional)"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="User Email"
            type="email"
            value={form.user_email ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, user_email: e.target.value || null }))}
            placeholder="user@example.com"
          />
          <Input
            label="Transaction Reference"
            value={form.transaction_reference ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, transaction_reference: e.target.value || null }))}
            placeholder="e.g. TXN-20260518-XXXX"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Select
            label="Priority"
            value={form.priority ?? 'medium'}
            onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as TicketPriority }))}
            options={[
              { value: 'low', label: 'Low' },
              { value: 'medium', label: 'Medium' },
              { value: 'high', label: 'High' },
              { value: 'urgent', label: 'Urgent' },
            ]}
          />
          {lockedCategory ? (
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1.5">Category</label>
              <div className="flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border bg-surface-2/60">
                <Lock className="h-3 w-3 text-ink-faint shrink-0" />
                <span className="text-sm text-ink capitalize">{lockedCategory}</span>
              </div>
            </div>
          ) : (
            <Select
              label="Category"
              value={form.category ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, category: (e.target.value || null) as TicketCategory | null }))}
              options={[
                { value: '', label: 'None' },
                { value: 'complaint', label: 'Complaint' },
                { value: 'dispute', label: 'Dispute' },
                { value: 'inquiry', label: 'Inquiry' },
                { value: 'technical', label: 'Technical' },
                { value: 'billing', label: 'Billing' },
              ]}
            />
          )}
          <Select
            label="Status"
            value={form.status ?? 'open'}
            onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as TicketStatus }))}
            options={[
              { value: 'open', label: 'Open' },
              { value: 'pending', label: 'Pending' },
              { value: 'resolved', label: 'Resolved' },
              { value: 'closed', label: 'Closed' },
            ]}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Assign To (email)"
            value={form.assigned_to_email ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, assigned_to_email: e.target.value || null }))}
            placeholder="admin@example.com"
          />
        </div>
      </div>
    </Modal>
  )
}

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: SupportMessage }) {
  const isAdmin    = msg.sender_type === 'admin'
  const isSystem   = msg.sender_type === 'system'
  const isInternal = msg.is_internal

  return (
    <div className={`flex flex-col gap-1 ${isAdmin ? 'items-end' : 'items-start'}`}>
      <div className="flex items-center gap-1.5 text-[10px] text-ink-faint">
        {isInternal && <Lock className="h-3 w-3 text-amber-400" />}
        <span className="font-medium">
          {isSystem ? 'System' : msg.sender_email ?? msg.sender_type}
        </span>
        <span>·</span>
        <span>{formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}</span>
      </div>
      <div
        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
          isSystem
            ? 'bg-surface-3 text-ink-faint italic text-xs rounded-lg'
            : isInternal
            ? 'bg-amber-900/20 border border-amber-500/30 text-amber-200'
            : isAdmin
            ? 'bg-accent text-white'
            : 'bg-surface-2 text-ink border border-border'
        }`}
      >
        {msg.body}
      </div>
    </div>
  )
}

// ── Ticket Detail Drawer ──────────────────────────────────────────────────────

function TicketDrawer({
  ticketId, onClose,
}: { ticketId: string | null; onClose: () => void }) {
  const qc = useQueryClient()
  const open = !!ticketId

  const { data: ticket, isLoading } = useQuery({
    queryKey: ['support-ticket', ticketId],
    queryFn: () => supportApi.getTicket(ticketId!),
    enabled: !!ticketId,
  })

  const [replyBody, setReplyBody] = useState('')
  const [replyInternal, setReplyInternal] = useState(false)

  useEffect(() => {
    if (!open) { setReplyBody(''); setReplyInternal(false) }
  }, [open])

  const updateMutation = useMutation({
    mutationFn: (body: UpdateTicketInput) => supportApi.updateTicket(ticketId!, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['support-ticket', ticketId] })
      qc.invalidateQueries({ queryKey: ['support-tickets'] })
      toast.success('Ticket updated')
    },
    onError: (err) => toast.error(errMsg(err, 'Update failed')),
  })

  const messageMutation = useMutation({
    mutationFn: (body: AddMessageInput) => supportApi.addMessage(ticketId!, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['support-ticket', ticketId] })
      setReplyBody('')
      toast.success('Message sent')
    },
    onError: (err) => toast.error(errMsg(err, 'Failed to send message')),
  })

  function sendReply() {
    if (!replyBody.trim()) return
    messageMutation.mutate({
      sender_type: 'admin',
      body: replyBody.trim(),
      is_internal: replyInternal,
    })
  }

  const statusFlow: TicketStatus[] = ['open', 'pending', 'resolved', 'closed']

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={ticket?.reference ?? 'Loading…'}
      subtitle={ticket?.subject}
      width="lg"
    >
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 bg-surface-2 rounded-lg animate-pulse" />
          ))}
        </div>
      )}

      {ticket && (
        <div className="space-y-5">
          {/* Meta grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-surface-2 px-3 py-2">
              <p className="text-[10px] text-ink-faint uppercase tracking-wide mb-1">Status</p>
              <Badge variant={statusVariant(ticket.status)}>{ticket.status}</Badge>
            </div>
            <div className="rounded-lg bg-surface-2 px-3 py-2">
              <p className="text-[10px] text-ink-faint uppercase tracking-wide mb-1">Priority</p>
              <Badge variant={priorityVariant(ticket.priority)}>{ticket.priority}</Badge>
            </div>
            <div className="rounded-lg bg-surface-2 px-3 py-2">
              <p className="text-[10px] text-ink-faint uppercase tracking-wide mb-1">Category</p>
              <span className="text-sm text-ink">{categoryLabel(ticket.category)}</span>
            </div>
            <div className="rounded-lg bg-surface-2 px-3 py-2">
              <p className="text-[10px] text-ink-faint uppercase tracking-wide mb-1">Created</p>
              <span className="text-sm text-ink">{fmtDate(ticket.created_at)}</span>
            </div>
            {ticket.user_email && (
              <div className="col-span-2 rounded-lg bg-surface-2 px-3 py-2 flex items-center gap-2">
                <User className="h-3.5 w-3.5 text-ink-faint shrink-0" />
                <span className="text-sm text-ink truncate">{ticket.user_email}</span>
              </div>
            )}
            {ticket.transaction_reference && (
              <div className="col-span-2 rounded-lg bg-surface-2 px-3 py-2 flex items-center gap-2">
                <Hash className="h-3.5 w-3.5 text-ink-faint shrink-0" />
                <span className="text-sm font-mono text-ink truncate">{ticket.transaction_reference}</span>
              </div>
            )}
            {ticket.assigned_to_email && (
              <div className="col-span-2 rounded-lg bg-surface-2 px-3 py-2">
                <p className="text-[10px] text-ink-faint uppercase tracking-wide mb-1">Assigned To</p>
                <span className="text-sm text-ink">{ticket.assigned_to_email}</span>
              </div>
            )}
          </div>

          {/* Description */}
          {ticket.description && (
            <div className="rounded-lg bg-surface-2 px-3 py-2">
              <p className="text-[10px] text-ink-faint uppercase tracking-wide mb-1.5">Description</p>
              <p className="text-sm text-ink-muted whitespace-pre-wrap">{ticket.description}</p>
            </div>
          )}

          {/* Status actions */}
          <div>
            <p className="text-[10px] text-ink-faint uppercase tracking-wide mb-2">Move Status</p>
            <div className="flex flex-wrap gap-1.5">
              {statusFlow.filter((s) => s !== ticket.status).map((s) => (
                <Button
                  key={s}
                  variant="secondary"
                  size="xs"
                  onClick={() => updateMutation.mutate({ status: s })}
                  disabled={updateMutation.isPending}
                >
                  → {s}
                </Button>
              ))}
            </div>
          </div>

          {/* Priority actions */}
          <div>
            <p className="text-[10px] text-ink-faint uppercase tracking-wide mb-2">Set Priority</p>
            <div className="flex flex-wrap gap-1.5">
              {(['low', 'medium', 'high', 'urgent'] as TicketPriority[])
                .filter((p) => p !== ticket.priority)
                .map((p) => (
                  <Button
                    key={p}
                    variant="secondary"
                    size="xs"
                    onClick={() => updateMutation.mutate({ priority: p })}
                    disabled={updateMutation.isPending}
                  >
                    {p}
                  </Button>
                ))}
            </div>
          </div>

          {/* Resolution notes */}
          {(ticket.status === 'resolved' || ticket.status === 'closed') && (
            <div className="rounded-lg bg-surface-2 px-3 py-2">
              <p className="text-[10px] text-ink-faint uppercase tracking-wide mb-1.5">Resolution Notes</p>
              {ticket.resolution_notes ? (
                <p className="text-sm text-ink-muted whitespace-pre-wrap">{ticket.resolution_notes}</p>
              ) : (
                <p className="text-xs text-ink-faint italic">No resolution notes</p>
              )}
            </div>
          )}

          {/* Message timeline */}
          <div>
            <p className="text-[10px] text-ink-faint uppercase tracking-wide mb-3">
              Messages ({ticket.messages.length})
            </p>
            {ticket.messages.length === 0 ? (
              <div className="text-center py-6 text-sm text-ink-faint">No messages yet</div>
            ) : (
              <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                {ticket.messages.map((m) => (
                  <MessageBubble key={m.id} msg={m} />
                ))}
              </div>
            )}
          </div>

          {/* Reply box */}
          <div className="border-t border-border pt-4 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-ink-faint uppercase tracking-wide">Add Message</p>
              <button
                type="button"
                onClick={() => setReplyInternal((v) => !v)}
                className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md border transition-colors ${
                  replyInternal
                    ? 'border-amber-500/50 bg-amber-900/20 text-amber-300'
                    : 'border-border text-ink-faint hover:text-ink'
                }`}
              >
                {replyInternal ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                {replyInternal ? 'Internal note' : 'Visible to user'}
              </button>
            </div>
            <textarea
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
              rows={3}
              placeholder={replyInternal ? 'Internal note (not shown to user)…' : 'Reply to user…'}
              className={`w-full rounded-lg border bg-surface-2 text-ink text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-colors resize-none ${
                replyInternal ? 'border-amber-500/40' : 'border-border'
              }`}
            />
            <div className="flex justify-end">
              <Button
                variant="primary"
                size="sm"
                onClick={sendReply}
                disabled={!replyBody.trim() || messageMutation.isPending}
              >
                {messageMutation.isPending ? 'Sending…' : 'Send'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Drawer>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

interface TicketsPageProps {
  defaultCategory?: TicketCategory
}

export function TicketsPage({ defaultCategory }: TicketsPageProps = {}) {
  const qc = useQueryClient()
  const [search, setSearch]         = useState('')
  const [filterStatus, setStatus]   = useState('')
  const [filterPriority, setPrio]   = useState('')
  const [filterCategory, setCat]    = useState(defaultCategory ?? '')
  const [page, setPage]             = useState(1)
  const [createOpen, setCreateOpen] = useState(false)
  const [drawerTicket, setDrawer]   = useState<string | null>(null)

  // Reset page when filters change
  useEffect(() => { setPage(1) }, [search, filterStatus, filterPriority, filterCategory])

  const params = {
    search:   search.trim() || undefined,
    status:   filterStatus  || undefined,
    priority: filterPriority || undefined,
    category: filterCategory || undefined,
    page,
    limit: 25,
  }

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['support-tickets', params],
    queryFn: () => supportApi.listTickets(params),
  })

  const tickets = data?.data ?? []
  const total   = data?.total ?? 0

  if (error) {
    return (
      <ErrorMessage
        error={error}
        onRetry={() => void refetch()}
        endpoint="/admin/support/tickets"
      />
    )
  }

  const hasFilters = !!(search || filterStatus || filterPriority || filterCategory)

  const columns = [
    {
      key: 'ref',
      header: 'Reference',
      render: (t: SupportTicket) => (
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xs text-ink">{t.reference}</span>
          <ChevronRight className="h-3 w-3 text-ink-faint" />
        </div>
      ),
    },
    {
      key: 'subject',
      header: 'Subject',
      render: (t: SupportTicket) => (
        <div>
          <div className="text-sm font-medium text-ink max-w-[240px] truncate">{t.subject}</div>
          {t.user_email && (
            <div className="text-xs text-ink-faint truncate">{t.user_email}</div>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (t: SupportTicket) => (
        <Badge variant={statusVariant(t.status)}>{t.status}</Badge>
      ),
    },
    {
      key: 'priority',
      header: 'Priority',
      render: (t: SupportTicket) => (
        <Badge variant={priorityVariant(t.priority)}>{t.priority}</Badge>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      render: (t: SupportTicket) => (
        <span className="text-xs text-ink-muted">{categoryLabel(t.category)}</span>
      ),
    },
    {
      key: 'assigned',
      header: 'Assigned',
      render: (t: SupportTicket) => (
        <span className="text-xs text-ink-muted truncate max-w-[120px]">
          {t.assigned_to_email ?? <span className="text-ink-faint">Unassigned</span>}
        </span>
      ),
    },
    {
      key: 'msgs',
      header: '',
      render: (_t: SupportTicket) => (
        <div className="flex items-center gap-1 text-ink-faint">
          <MessageSquare className="h-3.5 w-3.5" />
        </div>
      ),
    },
    {
      key: 'created',
      header: 'Created',
      align: 'right' as const,
      render: (t: SupportTicket) => (
        <span className="text-xs text-ink-faint whitespace-nowrap">
          {formatDistanceToNow(new Date(t.created_at), { addSuffix: true })}
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title={defaultCategory === 'complaint' ? 'Complaints' : 'Support Tickets'}
        subtitle={
          defaultCategory === 'complaint'
            ? 'User complaints and resolution tracking'
            : 'All customer support tickets'
        }
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />}
              onClick={() => void refetch()}>Refresh</Button>
            <Button variant="primary" size="sm" icon={<Plus className="h-3.5 w-3.5" />}
              onClick={() => setCreateOpen(true)}>
              {defaultCategory === 'complaint' ? 'New Complaint' : 'New Ticket'}
            </Button>
          </div>
        }
      />

      <FilterBar>
        <div className="flex-1 min-w-[200px] max-w-sm">
          <Input
            placeholder="Search reference, subject, email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          value={filterStatus}
          onChange={(e) => setStatus(e.target.value)}
          options={[
            { value: '', label: 'All statuses' },
            { value: 'open',     label: 'Open' },
            { value: 'pending',  label: 'Pending' },
            { value: 'resolved', label: 'Resolved' },
            { value: 'closed',   label: 'Closed' },
          ]}
          className="w-36"
        />
        <Select
          value={filterPriority}
          onChange={(e) => setPrio(e.target.value)}
          options={[
            { value: '', label: 'All priorities' },
            { value: 'low',    label: 'Low' },
            { value: 'medium', label: 'Medium' },
            { value: 'high',   label: 'High' },
            { value: 'urgent', label: 'Urgent' },
          ]}
          className="w-36"
        />
        {!defaultCategory && (
          <Select
            value={filterCategory}
            onChange={(e) => setCat(e.target.value)}
            options={[
              { value: '', label: 'All categories' },
              { value: 'complaint',  label: 'Complaint' },
              { value: 'dispute',    label: 'Dispute' },
              { value: 'inquiry',    label: 'Inquiry' },
              { value: 'technical',  label: 'Technical' },
              { value: 'billing',    label: 'Billing' },
            ]}
            className="w-36"
          />
        )}
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={() => {
            setSearch(''); setStatus(''); setPrio('')
            if (!defaultCategory) setCat('')
          }}>
            Clear
          </Button>
        )}
      </FilterBar>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total',    value: total },
          { label: 'Open',     value: tickets.filter((t) => t.status === 'open').length },
          { label: 'Pending',  value: tickets.filter((t) => t.status === 'pending').length },
          { label: 'Urgent',   value: tickets.filter((t) => t.priority === 'urgent' || t.priority === 'high').length },
        ].map(({ label, value }) => (
          <Card key={label} className="p-3 flex flex-col gap-0.5">
            <span className="text-[11px] text-ink-faint uppercase tracking-wide">{label}</span>
            <span className="text-xl font-semibold text-ink">{value}</span>
          </Card>
        ))}
      </div>

      {/* Urgent banner */}
      {tickets.some((t) => t.priority === 'urgent' && t.status === 'open') && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-900/10 px-4 py-2.5">
          <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
          <span className="text-sm text-rose-300">
            {tickets.filter((t) => t.priority === 'urgent' && t.status === 'open').length} urgent open ticket(s) require immediate attention.
          </span>
        </div>
      )}

      <Card>
        {isLoading ? (
          <SkeletonTable rows={8} />
        ) : (
          <>
            <DataTable
              columns={columns}
              data={tickets}
              rowKey={(t) => t.id}
              onRowClick={(t) => setDrawer(t.id)}
              emptyMessage={hasFilters ? 'No tickets match the current filters.' : 'No support tickets found.'}
            />
            <div className="px-4 pb-2">
              <Pagination page={page} limit={25} total={total} onPage={setPage} />
            </div>
          </>
        )}
      </Card>

      <CreateTicketModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={() => qc.invalidateQueries({ queryKey: ['support-tickets'] })}
        lockedCategory={defaultCategory}
      />

      <TicketDrawer
        ticketId={drawerTicket}
        onClose={() => setDrawer(null)}
      />
    </div>
  )
}
