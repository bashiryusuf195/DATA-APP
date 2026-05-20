import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import axios from 'axios'
import { providerWalletsApi } from '@/api/provider-wallets.api'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataTable } from '@/components/shared/DataTable'
import { ErrorMessage } from '@/components/shared/ErrorMessage'
import { Button, Badge, Modal, Input, Card } from '@/components/ui'
import { SkeletonTable } from '@/components/ui/Skeleton'
import {
  RefreshCw, Edit, Wallet, AlertTriangle, CheckCircle,
  RefreshCcw, ArrowUpCircle, Building2, Info,
} from 'lucide-react'
import type { ProviderWallet, UpdateProviderWalletInput, BalanceCheckStatus } from '@/types'

function errMsg(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) return err.response?.data?.error ?? err.message ?? fallback
  if (err instanceof Error) return err.message
  return fallback
}

function fmtBalance(balance: string | null, currency: string): string {
  if (balance === null) return '—'
  const n = parseFloat(balance)
  if (isNaN(n)) return '—'
  return `${currency} ${n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function statusVariant(status: BalanceCheckStatus): 'success' | 'danger' | 'warning' | 'neutral' {
  if (status === 'ok')      return 'success'
  if (status === 'low')     return 'danger'
  if (status === 'error')   return 'warning'
  return 'neutral'
}

function statusLabel(status: BalanceCheckStatus): string {
  if (status === 'ok')      return 'OK'
  if (status === 'low')     return 'Low Balance'
  if (status === 'error')   return 'Check Failed'
  return 'Unknown'
}

function isLow(pw: ProviderWallet): boolean {
  if (!pw.wallet_balance || !pw.low_balance_threshold) return false
  return parseFloat(pw.wallet_balance) < parseFloat(pw.low_balance_threshold)
}

function relativeTime(iso: string | null): string {
  if (!iso) return 'Never'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)   return 'Just now'
  if (mins < 60)  return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)   return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ── Edit Wallet Info Modal ────────────────────────────────────────────────────

interface EditModalProps {
  open: boolean
  provider: ProviderWallet | null
  onClose: () => void
  onSaved: () => void
}

function EditWalletModal({ open, provider, onClose, onSaved }: EditModalProps) {
  const qc = useQueryClient()
  const [form, setForm] = useState<UpdateProviderWalletInput>({})

  useEffect(() => {
    if (open && provider) {
      setForm({
        funding_bank_name:      provider.funding_bank_name ?? '',
        funding_account_number: provider.funding_account_number ?? '',
        funding_account_name:   provider.funding_account_name ?? '',
        low_balance_threshold:  provider.low_balance_threshold ? parseFloat(provider.low_balance_threshold) : null,
        notes:                  provider.notes ?? '',
      })
    }
  }, [open, provider])

  const mutation = useMutation({
    mutationFn: () =>
      providerWalletsApi.update(provider!.provider_code, {
        funding_bank_name:      form.funding_bank_name      || null,
        funding_account_number: form.funding_account_number || null,
        funding_account_name:   form.funding_account_name   || null,
        low_balance_threshold:  form.low_balance_threshold  ?? null,
        notes:                  form.notes                  || null,
      }),
    onSuccess: () => {
      toast.success('Wallet info updated')
      qc.invalidateQueries({ queryKey: ['provider-wallets'] })
      onSaved()
      onClose()
    },
    onError: (err) => toast.error(errMsg(err, 'Failed to update')),
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit Wallet Info"
      subtitle={provider ? `${provider.name} (${provider.provider_code})` : ''}
      size="md"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={mutation.isPending}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Save Changes'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start gap-2 rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2.5 text-xs text-blue-400">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>Funding account is for topping up the provider wallet. API credentials are managed separately under Providers.</span>
        </div>

        <p className="text-[11px] font-semibold text-ink-faint uppercase tracking-widest">Funding Account</p>
        <Input
          label="Bank Name"
          value={form.funding_bank_name ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, funding_bank_name: e.target.value }))}
          placeholder="e.g. Access Bank"
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Account Number"
            value={form.funding_account_number ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, funding_account_number: e.target.value }))}
            placeholder="0123456789"
          />
          <Input
            label="Account Name"
            value={form.funding_account_name ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, funding_account_name: e.target.value }))}
            placeholder="VTPass Nigeria Ltd"
          />
        </div>

        <p className="text-[11px] font-semibold text-ink-faint uppercase tracking-widest pt-1">Balance Threshold</p>
        <Input
          label="Low Balance Threshold (NGN)"
          type="number"
          min={0}
          step={100}
          value={form.low_balance_threshold !== null && form.low_balance_threshold !== undefined ? String(form.low_balance_threshold) : ''}
          onChange={(e) => setForm((f) => ({ ...f, low_balance_threshold: e.target.value ? parseFloat(e.target.value) : null }))}
          placeholder="e.g. 50000"
          hint="Alert fires when balance falls below this amount"
        />

        <p className="text-[11px] font-semibold text-ink-faint uppercase tracking-widest pt-1">Notes</p>
        <textarea
          value={form.notes ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          rows={3}
          placeholder="Internal notes about this provider's wallet…"
          className="w-full rounded-lg border border-border bg-surface-2 text-ink text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent resize-none"
        />
      </div>
    </Modal>
  )
}

// ── Manual Balance Update Modal ───────────────────────────────────────────────

interface ManualUpdateModalProps {
  open: boolean
  provider: ProviderWallet | null
  onClose: () => void
  onSaved: () => void
}

function ManualBalanceModal({ open, provider, onClose, onSaved }: ManualUpdateModalProps) {
  const qc = useQueryClient()
  const [balance, setBalance] = useState('')
  const [currency, setCurrency] = useState('NGN')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (open && provider) {
      setBalance(provider.wallet_balance ? parseFloat(provider.wallet_balance).toFixed(2) : '')
      setCurrency(provider.balance_currency)
    }
  }, [open, provider])

  const mutation = useMutation({
    mutationFn: () =>
      providerWalletsApi.manualUpdate(provider!.provider_code, {
        balance: parseFloat(balance),
        currency: currency || 'NGN',
        notes:   notes || null,
      }),
    onSuccess: () => {
      toast.success('Balance updated')
      qc.invalidateQueries({ queryKey: ['provider-wallets'] })
      onSaved()
      onClose()
      setBalance(''); setNotes('')
    },
    onError: (err) => toast.error(errMsg(err, 'Failed to update balance')),
  })

  const invalid = !balance || isNaN(parseFloat(balance)) || parseFloat(balance) < 0

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Manual Balance Update"
      subtitle={provider ? `${provider.name} (${provider.provider_code})` : ''}
      size="sm"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={mutation.isPending}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending || invalid}>
            {mutation.isPending ? 'Saving…' : 'Update Balance'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-xs text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>Use this when the provider does not support a balance API. Enter the balance you observed after logging into the provider's dashboard.</span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <Input
              label="Balance"
              type="number"
              min={0}
              step={0.01}
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
              placeholder="e.g. 250000.00"
            />
          </div>
          <Input
            label="Currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            placeholder="NGN"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1.5">Note (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="e.g. Topped up NGN 100,000 from GTBank"
            className="w-full rounded-lg border border-border bg-surface-2 text-ink text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent resize-none"
          />
        </div>
      </div>
    </Modal>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function ProviderWalletsPage() {
  const qc = useQueryClient()
  const [editProvider, setEditProvider] = useState<ProviderWallet | null>(null)
  const [manualProvider, setManualProvider] = useState<ProviderWallet | null>(null)
  const [checkingCode, setCheckingCode] = useState<string | null>(null)

  const { data: wallets = [], isLoading, error, refetch } = useQuery({
    queryKey: ['provider-wallets'],
    queryFn: () => providerWalletsApi.list(),
  })

  const checkMutation = useMutation({
    mutationFn: (code: string) => providerWalletsApi.checkBalance(code),
    onMutate: (code) => setCheckingCode(code),
    onSettled: () => setCheckingCode(null),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['provider-wallets'] })
      if (!result.supported) {
        toast(result.message, { icon: 'ℹ️' })
      } else if (result.status === 'low') {
        toast.error(`Low balance: ${result.currency} ${result.balance?.toLocaleString()}`)
      } else {
        toast.success(`Balance: ${result.currency} ${result.balance?.toLocaleString()}`)
      }
    },
    onError: (err) => toast.error(errMsg(err, 'Balance check failed')),
  })

  const lowCount   = wallets.filter((w) => isLow(w)).length
  const activeCount = wallets.filter((w) => w.is_active).length
  const noInfoCount = wallets.filter((w) => !w.id).length

  if (error) {
    return (
      <ErrorMessage
        error={error}
        onRetry={() => void refetch()}
        endpoint="/admin/provider-wallets"
      />
    )
  }

  const columns = [
    {
      key: 'provider',
      header: 'Provider',
      render: (w: ProviderWallet) => (
        <div className="flex items-center gap-2.5">
          <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${
            isLow(w) ? 'bg-rose-500/10' : w.is_active ? 'bg-accent/10' : 'bg-surface-3'
          }`}>
            <Wallet className={`h-4 w-4 ${isLow(w) ? 'text-rose-400' : w.is_active ? 'text-accent' : 'text-ink-faint'}`} />
          </div>
          <div>
            <div className="font-medium text-sm text-ink flex items-center gap-1.5">
              {w.name}
              {isLow(w) && (
                <span title="Balance below threshold"><AlertTriangle className="h-3.5 w-3.5 text-rose-400 shrink-0" /></span>
              )}
            </div>
            <div className="text-xs text-ink-faint font-mono">{w.provider_code}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (w: ProviderWallet) => (
        <div className="space-y-1">
          <Badge variant={w.is_active ? 'success' : 'neutral'} dot>
            {w.is_active ? 'Active' : 'Inactive'}
          </Badge>
          <div className="text-[10px] text-ink-faint capitalize">
            {w.supported_services.join(', ') || '—'}
          </div>
        </div>
      ),
    },
    {
      key: 'balance',
      header: 'Balance',
      render: (w: ProviderWallet) => {
        const low = isLow(w)
        return (
          <div>
            <div className={`text-sm font-semibold ${low ? 'text-rose-400' : 'text-ink'}`}>
              {fmtBalance(w.wallet_balance, w.balance_currency)}
            </div>
            {w.low_balance_threshold && (
              <div className="text-[10px] text-ink-faint">
                Threshold: {fmtBalance(w.low_balance_threshold, w.balance_currency)}
              </div>
            )}
          </div>
        )
      },
    },
    {
      key: 'check_status',
      header: 'Balance Status',
      render: (w: ProviderWallet) => (
        <div className="space-y-1">
          <Badge variant={statusVariant(w.balance_check_status)}>
            {statusLabel(w.balance_check_status)}
          </Badge>
          <div className="text-[10px] text-ink-faint">{relativeTime(w.last_balance_check_at)}</div>
        </div>
      ),
    },
    {
      key: 'funding',
      header: 'Funding Account',
      render: (w: ProviderWallet) => {
        if (!w.funding_bank_name && !w.funding_account_number) {
          return <span className="text-xs text-ink-faint italic">Not configured</span>
        }
        return (
          <div className="text-xs">
            <div className="flex items-center gap-1 text-ink">
              <Building2 className="h-3 w-3 text-ink-faint" />
              <span>{w.funding_bank_name ?? '—'}</span>
            </div>
            <div className="font-mono text-ink-muted">{w.funding_account_number ?? '—'}</div>
            {w.funding_account_name && (
              <div className="text-ink-faint truncate max-w-[140px]">{w.funding_account_name}</div>
            )}
          </div>
        )
      },
    },
    {
      key: 'actions',
      header: '',
      align: 'right' as const,
      render: (w: ProviderWallet) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="xs"
            icon={<RefreshCcw className={`h-3.5 w-3.5 ${checkingCode === w.provider_code ? 'animate-spin text-accent' : 'text-ink-muted'}`} />}
            onClick={() => checkMutation.mutate(w.provider_code)}
            disabled={!!checkingCode}
            title="Check live balance via provider API"
          >
            Check
          </Button>
          <Button
            variant="ghost"
            size="xs"
            icon={<ArrowUpCircle className="h-3.5 w-3.5 text-ink-muted" />}
            onClick={() => setManualProvider(w)}
            title="Enter balance manually"
          >
            Update
          </Button>
          <Button
            variant="ghost"
            size="xs"
            icon={<Edit className="h-3.5 w-3.5" />}
            onClick={() => setEditProvider(w)}
            title="Edit funding account & threshold"
          />
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Provider Wallets"
        subtitle="Monitor VTU provider balances and manage funding account details"
        actions={
          <Button variant="secondary" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />}
            onClick={() => void refetch()}>
            Refresh
          </Button>
        }
      />

      {/* Low balance banner */}
      {lowCount > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-500/5 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-rose-400 mt-0.5 shrink-0" />
          <p className="text-xs text-rose-300">
            <span className="font-semibold">{lowCount} provider{lowCount > 1 ? 's are' : ' is'} below their low balance threshold.</span>
            {' '}Please top up the highlighted providers to avoid service disruptions.
          </p>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Providers', value: wallets.length },
          { label: 'Active', value: activeCount },
          { label: 'Low Balance', value: lowCount, alert: lowCount > 0 },
          { label: 'Not Configured', value: noInfoCount, alert: noInfoCount > 0 },
        ].map(({ label, value, alert }) => (
          <Card key={label} className="p-3 flex flex-col gap-0.5">
            <span className="text-[11px] text-ink-faint uppercase tracking-wide">{label}</span>
            <span className={`text-xl font-semibold ${alert && value > 0 ? 'text-rose-400' : 'text-ink'}`}>
              {value}
            </span>
          </Card>
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs text-ink-faint">
        <span className="flex items-center gap-1.5">
          <CheckCircle className="h-3.5 w-3.5 text-emerald-400" /> Balance OK
        </span>
        <span className="flex items-center gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5 text-rose-400" /> Below threshold
        </span>
        <span className="flex items-center gap-1.5">
          <RefreshCcw className="h-3.5 w-3.5 text-ink-muted" /> Check — calls provider API live
        </span>
        <span className="flex items-center gap-1.5">
          <ArrowUpCircle className="h-3.5 w-3.5 text-ink-muted" /> Update — record balance manually
        </span>
      </div>

      {/* Table */}
      <Card>
        {isLoading ? (
          <SkeletonTable rows={5} />
        ) : wallets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-ink-faint">
            <Wallet className="h-10 w-10 opacity-30" />
            <p className="text-sm">No providers found. Add providers under the Providers page first.</p>
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={wallets}
            rowKey={(w) => w.provider_code}
          />
        )}
      </Card>

      {/* Detail cards for low-balance providers */}
      {lowCount > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-ink-faint uppercase tracking-widest">
            Low Balance — Funding Details
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {wallets.filter(isLow).map((w) => (
              <Card key={w.provider_code} className="p-4 border border-rose-500/30 bg-rose-500/5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm text-ink">{w.name}</span>
                  <Badge variant="danger">Low</Badge>
                </div>
                <div className="text-lg font-bold text-rose-400">
                  {fmtBalance(w.wallet_balance, w.balance_currency)}
                </div>
                <div className="text-xs text-ink-faint">
                  Threshold: {fmtBalance(w.low_balance_threshold, w.balance_currency)}
                </div>
                {w.funding_bank_name && (
                  <div className="pt-2 border-t border-border space-y-0.5">
                    <div className="flex items-center gap-1 text-xs text-ink-muted">
                      <Building2 className="h-3 w-3" /> {w.funding_bank_name}
                    </div>
                    <div className="text-xs font-mono text-ink">{w.funding_account_number}</div>
                    <div className="text-xs text-ink-faint">{w.funding_account_name}</div>
                  </div>
                )}
                {!w.funding_bank_name && (
                  <p className="text-xs text-ink-faint italic pt-1">No funding account configured.</p>
                )}
                <Button
                  variant="secondary"
                  size="xs"
                  className="w-full mt-1"
                  onClick={() => setEditProvider(w)}
                >
                  Configure Funding Account
                </Button>
              </Card>
            ))}
          </div>
        </div>
      )}

      <EditWalletModal
        open={!!editProvider}
        provider={editProvider}
        onClose={() => setEditProvider(null)}
        onSaved={() => setEditProvider(null)}
      />

      <ManualBalanceModal
        open={!!manualProvider}
        provider={manualProvider}
        onClose={() => setManualProvider(null)}
        onSaved={() => setManualProvider(null)}
      />
    </div>
  )
}
