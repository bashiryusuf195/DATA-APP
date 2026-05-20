import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  CreditCard, Plus, Star, ToggleLeft, ToggleRight,
  Pencil, CheckCircle, XCircle, AlertTriangle, Loader2,
  Eye, EyeOff, Zap,
} from 'lucide-react'
import { paymentGatewaysApi } from '@/api/payment-gateways.api'
import type {
  PaymentGateway,
  CreatePaymentGatewayInput,
  UpdatePaymentGatewayInput,
  ChargeType,
} from '@/types'
import { cn } from '@/utils/cn'

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtCharge(gw: PaymentGateway): string {
  if (gw.charge_type === 'flat') return `₦${Number(gw.charge_value).toFixed(2)} flat`
  if (gw.charge_type === 'percentage') return `${gw.charge_value}%`
  return 'No charge'
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
      active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
    )}>
      {active ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
      {active ? 'Active' : 'Inactive'}
    </span>
  )
}

function ModeBadge({ live }: { live: boolean }) {
  return (
    <span className={cn(
      'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
      live ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
    )}>
      {live ? 'Live' : 'Test'}
    </span>
  )
}

// ── GatewayModal ──────────────────────────────────────────────────────────────

interface GatewayModalProps {
  open: boolean
  gateway: PaymentGateway | null
  onClose: () => void
  onSave: (data: CreatePaymentGatewayInput | UpdatePaymentGatewayInput) => void
  saving: boolean
}

const BLANK_FORM: CreatePaymentGatewayInput = {
  code: '',
  name: '',
  is_active: false,
  is_live: false,
  base_url: '',
  public_key: '',
  secret_key: '',
  webhook_secret: '',
  charge_type: 'none',
  charge_value: 0,
  notes: '',
}

function GatewayModal({ open, gateway, onClose, onSave, saving }: GatewayModalProps) {
  const [form, setForm] = useState<CreatePaymentGatewayInput>(BLANK_FORM)
  const [showSecret, setShowSecret] = useState(false)
  const [showWebhookSecret, setShowWebhookSecret] = useState(false)

  useEffect(() => {
    if (open && gateway) {
      setForm({
        code: gateway.code,
        name: gateway.name,
        is_active: gateway.is_active,
        is_live: gateway.is_live,
        base_url: gateway.base_url ?? '',
        public_key: gateway.public_key ?? '',
        secret_key: '',        // never pre-fill secrets
        webhook_secret: '',
        charge_type: gateway.charge_type,
        charge_value: gateway.charge_value,
        notes: gateway.notes ?? '',
      })
    } else if (open && !gateway) {
      setForm(BLANK_FORM)
    }
    setShowSecret(false)
    setShowWebhookSecret(false)
  }, [open, gateway])

  if (!open) return null

  const isEdit = !!gateway
  const set = (k: keyof typeof form, v: unknown) => setForm((f) => ({ ...f, [k]: v }))

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const payload: Record<string, unknown> = { ...form }
    // Don't send empty strings for secret fields on edit — means "no change"
    if (isEdit && !form.secret_key) delete payload.secret_key
    if (isEdit && !form.webhook_secret) delete payload.webhook_secret
    if (!isEdit) {
      // code required on create
    } else {
      delete payload.code // code immutable after creation
    }
    onSave(payload as unknown as CreatePaymentGatewayInput)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-surface-1 rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-5 border-b border-border">
          <h2 className="text-base font-semibold text-ink">
            {isEdit ? `Edit ${gateway.name}` : 'Add Payment Gateway'}
          </h2>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {!isEdit && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-ink-muted mb-1">Code</label>
                <input
                  type="text"
                  placeholder="e.g. paystack"
                  value={form.code}
                  onChange={(e) => set('code', e.target.value.toLowerCase())}
                  required
                  className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-muted mb-1">Name</label>
                <input
                  type="text"
                  placeholder="e.g. Paystack"
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                  required
                  className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>
            </div>
          )}

          {isEdit && (
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                required
                className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Base URL</label>
            <input
              type="url"
              placeholder="https://api.example.com"
              value={form.base_url ?? ''}
              onChange={(e) => set('base_url', e.target.value || null)}
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Public Key</label>
            <input
              type="text"
              placeholder="pk_..."
              value={form.public_key ?? ''}
              onChange={(e) => set('public_key', e.target.value || null)}
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">
              Secret Key {isEdit && gateway?.has_secret_key && <span className="text-green-600">(currently set)</span>}
            </label>
            <div className="relative">
              <input
                type={showSecret ? 'text' : 'password'}
                placeholder={isEdit ? 'Leave blank to keep current' : 'sk_...'}
                value={form.secret_key ?? ''}
                onChange={(e) => set('secret_key', e.target.value)}
                className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 pr-10 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
              />
              <button
                type="button"
                onClick={() => setShowSecret((s) => !s)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink"
              >
                {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">
              Webhook Secret {isEdit && gateway?.has_webhook_secret && <span className="text-green-600">(currently set)</span>}
            </label>
            <div className="relative">
              <input
                type={showWebhookSecret ? 'text' : 'password'}
                placeholder={isEdit ? 'Leave blank to keep current' : 'whsec_...'}
                value={form.webhook_secret ?? ''}
                onChange={(e) => set('webhook_secret', e.target.value)}
                className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 pr-10 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
              />
              <button
                type="button"
                onClick={() => setShowWebhookSecret((s) => !s)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink"
              >
                {showWebhookSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-muted mb-2">Top-up Charge</label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-ink-faint mb-1">Type</label>
                <select
                  value={form.charge_type}
                  onChange={(e) => set('charge_type', e.target.value as ChargeType)}
                  className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <option value="none">No charge</option>
                  <option value="flat">Flat (₦)</option>
                  <option value="percentage">Percentage (%)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-ink-faint mb-1">
                  Value {form.charge_type === 'flat' ? '(₦)' : form.charge_type === 'percentage' ? '(%)' : ''}
                </label>
                <input
                  type="number"
                  min={0}
                  step={form.charge_type === 'percentage' ? '0.01' : '1'}
                  value={form.charge_value ?? 0}
                  onChange={(e) => set('charge_value', parseFloat(e.target.value) || 0)}
                  disabled={form.charge_type === 'none'}
                  className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-40"
                />
              </div>
            </div>
            {form.charge_type !== 'none' && (
              <p className="mt-1.5 text-xs text-ink-faint">
                Example: customer pays ₦1,000 →{' '}
                charge ₦{form.charge_type === 'flat'
                  ? Number(form.charge_value).toFixed(2)
                  : (1000 * Number(form.charge_value) / 100).toFixed(2)}{' '}
                → wallet credited ₦{form.charge_type === 'flat'
                  ? (1000 - Number(form.charge_value)).toFixed(2)
                  : (1000 - 1000 * Number(form.charge_value) / 100).toFixed(2)}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_active ?? false}
                onChange={(e) => set('is_active', e.target.checked)}
                className="rounded border-border"
              />
              <span className="text-sm text-ink">Active</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_live ?? false}
                onChange={(e) => set('is_live', e.target.checked)}
                className="rounded border-border"
              />
              <span className="text-sm text-ink">Live mode</span>
            </label>
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Notes</label>
            <textarea
              rows={2}
              value={form.notes ?? ''}
              onChange={(e) => set('notes', e.target.value || null)}
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent resize-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border px-4 py-2 text-sm text-ink-muted hover:bg-surface-2 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60 transition-colors"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isEdit ? 'Save Changes' : 'Add Gateway'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function PaymentGatewaysPage() {
  const queryClient = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<PaymentGateway | null>(null)

  const { data: gateways = [], isLoading } = useQuery({
    queryKey: ['payment-gateways'],
    queryFn: paymentGatewaysApi.list,
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['payment-gateways'] })

  const createMutation = useMutation({
    mutationFn: (body: CreatePaymentGatewayInput) => paymentGatewaysApi.create(body),
    onSuccess: () => { invalidate(); setModalOpen(false) },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdatePaymentGatewayInput }) =>
      paymentGatewaysApi.update(id, body),
    onSuccess: () => { invalidate(); setModalOpen(false); setEditing(null) },
  })

  const defaultMutation = useMutation({
    mutationFn: (id: string) => paymentGatewaysApi.setDefault(id),
    onSuccess: invalidate,
  })

  const enableMutation = useMutation({
    mutationFn: (id: string) => paymentGatewaysApi.enable(id),
    onSuccess: invalidate,
  })

  const disableMutation = useMutation({
    mutationFn: (id: string) => paymentGatewaysApi.disable(id),
    onSuccess: invalidate,
  })

  function openCreate() { setEditing(null); setModalOpen(true) }
  function openEdit(gw: PaymentGateway) { setEditing(gw); setModalOpen(true) }

  function handleSave(data: CreatePaymentGatewayInput | UpdatePaymentGatewayInput) {
    if (editing) {
      updateMutation.mutate({ id: editing.id, body: data as UpdatePaymentGatewayInput })
    } else {
      createMutation.mutate(data as CreatePaymentGatewayInput)
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending

  const activeCount  = gateways.filter((g) => g.is_active).length
  const defaultGw    = gateways.find((g) => g.is_default)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Payment Gateways</h1>
          <p className="text-sm text-ink-muted mt-0.5">
            Manage wallet top-up gateways and top-up charge configuration
          </p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Gateway
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-surface-1 p-4">
          <p className="text-xs text-ink-faint uppercase tracking-wide">Total Gateways</p>
          <p className="mt-1 text-2xl font-semibold text-ink">{gateways.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface-1 p-4">
          <p className="text-xs text-ink-faint uppercase tracking-wide">Active</p>
          <p className="mt-1 text-2xl font-semibold text-green-600">{activeCount}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface-1 p-4">
          <p className="text-xs text-ink-faint uppercase tracking-wide">Default Gateway</p>
          <p className="mt-1 text-sm font-semibold text-ink">{defaultGw?.name ?? '—'}</p>
        </div>
      </div>

      {/* Not supported warning */}
      {defaultGw && !defaultGw.is_supported && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            Default gateway <strong>{defaultGw.name}</strong> is configured but not yet implemented.
            Wallet top-ups will return 501 until a supported gateway is set as default.
          </span>
        </div>
      )}

      {/* Gateway cards */}
      {isLoading ? (
        <div className="flex items-center gap-2 py-12 justify-center text-ink-faint">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading gateways…</span>
        </div>
      ) : (
        <div className="space-y-3">
          {gateways.map((gw) => (
            <div
              key={gw.id}
              className={cn(
                'rounded-xl border bg-surface-1 p-5',
                gw.is_default ? 'border-accent/40' : 'border-border'
              )}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-surface-2 flex items-center justify-center shrink-0">
                    <CreditCard className="h-5 w-5 text-ink-muted" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-ink">{gw.name}</span>
                      {gw.is_default && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 text-accent px-2 py-0.5 text-xs font-medium">
                          <Star className="h-3 w-3" /> Default
                        </span>
                      )}
                      {!gw.is_supported && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 text-gray-500 px-2 py-0.5 text-xs">
                          Not implemented
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <StatusBadge active={gw.is_active} />
                      <ModeBadge live={gw.is_live} />
                      <span className="text-xs text-ink-faint font-mono">{gw.code}</span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                  {!gw.is_default && gw.is_active && (
                    <button
                      onClick={() => defaultMutation.mutate(gw.id)}
                      disabled={defaultMutation.isPending}
                      className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs text-ink-muted hover:bg-surface-2 transition-colors"
                      title="Set as default"
                    >
                      <Star className="h-3.5 w-3.5" /> Set Default
                    </button>
                  )}
                  {gw.is_active ? (
                    <button
                      onClick={() => disableMutation.mutate(gw.id)}
                      disabled={disableMutation.isPending || gw.is_default}
                      className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs text-ink-muted hover:bg-surface-2 disabled:opacity-40 transition-colors"
                      title={gw.is_default ? 'Cannot disable default gateway' : 'Disable'}
                    >
                      <ToggleLeft className="h-3.5 w-3.5" /> Disable
                    </button>
                  ) : (
                    <button
                      onClick={() => enableMutation.mutate(gw.id)}
                      disabled={enableMutation.isPending}
                      className="inline-flex items-center gap-1 rounded-lg border border-green-200 bg-green-50 px-2.5 py-1.5 text-xs text-green-700 hover:bg-green-100 transition-colors"
                    >
                      <ToggleRight className="h-3.5 w-3.5" /> Enable
                    </button>
                  )}
                  <button
                    onClick={() => openEdit(gw)}
                    className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs text-ink-muted hover:bg-surface-2 transition-colors"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </button>
                </div>
              </div>

              {/* Details row */}
              <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div>
                  <p className="text-ink-faint mb-0.5">Base URL</p>
                  <p className="text-ink font-mono truncate">{gw.base_url ?? '—'}</p>
                </div>
                <div>
                  <p className="text-ink-faint mb-0.5">Public Key</p>
                  <p className="text-ink font-mono truncate">
                    {gw.public_key ? `${gw.public_key.slice(0, 12)}…` : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-ink-faint mb-0.5">Secret Key</p>
                  <p className="text-ink">
                    {gw.has_secret_key ? (
                      <span className="text-green-600 flex items-center gap-1">
                        <CheckCircle className="h-3 w-3" /> Set
                      </span>
                    ) : (
                      <span className="text-amber-600 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" /> Not set
                      </span>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-ink-faint mb-0.5">Top-up Charge</p>
                  <p className="text-ink font-medium">{fmtCharge(gw)}</p>
                </div>
              </div>

              {gw.notes && (
                <p className="mt-3 text-xs text-ink-faint border-t border-border pt-2">{gw.notes}</p>
              )}
            </div>
          ))}

          {gateways.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <Zap className="h-10 w-10 text-ink-faint" />
              <p className="text-sm font-medium text-ink">No gateways yet</p>
              <p className="text-xs text-ink-faint">Add a payment gateway to enable wallet top-ups</p>
              <button
                onClick={openCreate}
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent/90 transition-colors"
              >
                <Plus className="h-4 w-4" /> Add Gateway
              </button>
            </div>
          )}
        </div>
      )}

      <GatewayModal
        open={modalOpen}
        gateway={editing}
        onClose={() => { setModalOpen(false); setEditing(null) }}
        onSave={handleSave}
        saving={isSaving}
      />
    </div>
  )
}
