import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import axios from 'axios'
import { walletOpsApi, type WalletAdjustResult } from '@/api/walletOps.api'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button, Card, Input } from '@/components/ui'
import { fmtCurrency } from '@/utils/format'
import {
  AlertTriangle, CheckCircle2, ArrowUpCircle, ArrowDownCircle,
  User, Wallet, Hash, FileText,
} from 'lucide-react'

function errMsg(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) return err.response?.data?.error ?? err.response?.data?.message ?? err.message ?? fallback
  if (err instanceof Error) return err.message
  return fallback
}

type Operation = 'credit' | 'debit'

// ── Result card ───────────────────────────────────────────────────────────────

function ResultCard({ result }: { result: WalletAdjustResult }) {
  const isCredit = result.operation === 'credit'
  return (
    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
        <p className="text-sm font-semibold text-emerald-400">
          {isCredit ? 'Credit applied successfully' : 'Debit applied successfully'}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
        <div>
          <p className="text-ink-faint">User</p>
          <p className="text-ink font-medium">{result.user.email}</p>
          {result.user.full_name && (
            <p className="text-ink-muted">{result.user.full_name}</p>
          )}
        </div>
        <div>
          <p className="text-ink-faint">Amount</p>
          <p className={`font-semibold ${isCredit ? 'text-emerald-400' : 'text-rose-400'}`}>
            {isCredit ? '+' : '-'}{fmtCurrency(result.amount)}
          </p>
        </div>
        <div>
          <p className="text-ink-faint">Balance before</p>
          <p className="text-ink font-medium">{fmtCurrency(result.balance_before)}</p>
        </div>
        <div>
          <p className="text-ink-faint">Balance after</p>
          <p className="text-ink font-medium">{fmtCurrency(result.balance_after)}</p>
        </div>
        <div className="col-span-2">
          <p className="text-ink-faint">Reference</p>
          <p className="text-ink font-mono">{result.reference}</p>
        </div>
        <div className="col-span-2">
          <p className="text-ink-faint">Journal batch</p>
          <p className="text-ink font-mono text-[11px] break-all">{result.journal_batch_id}</p>
        </div>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function ManualWalletOpsPage() {
  const [operation, setOperation] = useState<Operation>('credit')
  const [identifier, setIdentifier] = useState('')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [lastResult, setLastResult] = useState<WalletAdjustResult | null>(null)
  const [formError, setFormError] = useState('')

  const mutation = useMutation({
    mutationFn: () => {
      const parsed = parseFloat(amount)
      if (!identifier.trim()) throw new Error('Identifier is required.')
      if (isNaN(parsed) || parsed <= 0) throw new Error('Amount must be a positive number.')
      if (!reason.trim() || reason.trim().length < 5) throw new Error('Reason must be at least 5 characters.')

      return walletOpsApi[operation]({
        identifier: identifier.trim(),
        amount:     parsed,
        reason:     reason.trim(),
      })
    },
    onSuccess: (data) => {
      setLastResult(data)
      setFormError('')
      setIdentifier('')
      setAmount('')
      setReason('')
      toast.success(
        data.operation === 'credit'
          ? `₦${data.amount.toLocaleString()} credited to ${data.user.email}`
          : `₦${data.amount.toLocaleString()} debited from ${data.user.email}`
      )
    },
    onError: (err) => {
      setFormError(errMsg(err, 'Operation failed. Please try again.'))
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    setLastResult(null)
    mutation.mutate()
  }

  const isCredit = operation === 'credit'

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Manual Wallet Adjustment"
        subtitle="Credit or debit a user wallet directly"
      />

      {/* Warning banner */}
      <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
        <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
        <p className="text-xs text-amber-300">
          Manual wallet adjustments affect real balances and are fully audited. Every operation is
          recorded in the audit log with your admin ID, the target user, amount, and reason.
          This action cannot be undone without another manual operation.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Form */}
        <Card>
          <h2 className="text-sm font-semibold text-ink mb-5">Adjustment Details</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Operation selector */}
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-2">Operation</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => { setOperation('credit'); setLastResult(null) }}
                  className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                    isCredit
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                      : 'border-border text-ink-muted hover:border-border hover:text-ink'
                  }`}
                >
                  <ArrowUpCircle className="h-4 w-4" />
                  Credit
                </button>
                <button
                  type="button"
                  onClick={() => { setOperation('debit'); setLastResult(null) }}
                  className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                    !isCredit
                      ? 'border-rose-500/40 bg-rose-500/10 text-rose-400'
                      : 'border-border text-ink-muted hover:border-border hover:text-ink'
                  }`}
                >
                  <ArrowDownCircle className="h-4 w-4" />
                  Debit
                </button>
              </div>
            </div>

            {/* User identifier */}
            <Input
              label="User Identifier"
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="Email, phone, username, or user ID"
              prefix={<User className="h-4 w-4" />}
              autoComplete="off"
            />

            {/* Amount */}
            <Input
              label="Amount (₦)"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              prefix={<Wallet className="h-4 w-4" />}
              min="0.01"
              step="0.01"
            />

            {/* Reason */}
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1.5">
                Reason <span className="text-ink-faint">(required, min 5 chars)</span>
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Compensation for failed transaction ref TXN-20260518-ABC123"
                rows={3}
                className="w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent resize-none"
              />
            </div>

            {/* Inline form error */}
            {formError && (
              <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 px-3 py-2.5">
                <p className="text-xs text-rose-400">{formError}</p>
              </div>
            )}

            <Button
              type="submit"
              loading={mutation.isPending}
              className={`w-full ${!isCredit ? 'bg-rose-600 hover:bg-rose-700 focus:ring-rose-500' : ''}`}
            >
              {isCredit ? 'Apply Credit' : 'Apply Debit'}
            </Button>
          </form>
        </Card>

        {/* Result / info panel */}
        <div className="space-y-4">
          {lastResult ? (
            <ResultCard result={lastResult} />
          ) : (
            <Card>
              <h2 className="text-sm font-semibold text-ink mb-4">How this works</h2>
              <ul className="space-y-3 text-xs text-ink-muted">
                <li className="flex items-start gap-2">
                  <User className="h-3.5 w-3.5 text-ink-faint mt-0.5 shrink-0" />
                  Enter the user's email, phone number, username, or UUID to look them up.
                </li>
                <li className="flex items-start gap-2">
                  <Wallet className="h-3.5 w-3.5 text-ink-faint mt-0.5 shrink-0" />
                  The amount is applied to the user's default wallet using a double-entry ledger — both sides are recorded.
                </li>
                <li className="flex items-start gap-2">
                  <Hash className="h-3.5 w-3.5 text-ink-faint mt-0.5 shrink-0" />
                  A unique reference is generated for every operation and linked to a transaction record.
                </li>
                <li className="flex items-start gap-2">
                  <FileText className="h-3.5 w-3.5 text-ink-faint mt-0.5 shrink-0" />
                  Your admin ID, the reason, and the full balance change are written to the compliance audit log.
                </li>
                <li className="flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-400 mt-0.5 shrink-0" />
                  Debit operations will fail if the user has insufficient balance.
                </li>
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
