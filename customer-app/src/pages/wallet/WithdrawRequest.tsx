import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, BadgeCheck, AlertCircle, Banknote } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import toast from 'react-hot-toast'
import { walletApi } from '@/api/wallet.api'
import { AmountInput } from '@/components/shared/AmountInput'
import { NumPadInput } from '@/components/shared/NumPadInput'
import { cn } from '@/utils/cn'

const NIGERIAN_BANKS = [
  'Access Bank',
  'Citibank Nigeria',
  'Ecobank Nigeria',
  'Fidelity Bank',
  'First Bank of Nigeria',
  'First City Monument Bank (FCMB)',
  'Globus Bank',
  'Guaranty Trust Bank (GTBank)',
  'Heritage Bank',
  'Keystone Bank',
  'Kuda Bank',
  'Moniepoint MFB',
  'Opay (OPay Digital Services)',
  'PalmPay',
  'Polaris Bank',
  'Premium Trust Bank',
  'Providus Bank',
  'Stanbic IBTC Bank',
  'Standard Chartered Bank',
  'Sterling Bank',
  'SunTrust Bank',
  'Titan Trust Bank',
  'Union Bank of Nigeria',
  'United Bank for Africa (UBA)',
  'Unity Bank',
  'VFD Microfinance Bank',
  'Wema Bank',
  'Zenith Bank',
  '9Payment Service Bank (9PSB)',
  'Other',
]

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-ink-muted mb-1.5">{label}</label>
      {children}
    </div>
  )
}

export function WithdrawRequestPage() {
  const navigate = useNavigate()

  const [accountNumber, setAccountNumber] = useState('')
  const [bankName,      setBankName]      = useState('')
  const [amount,        setAmount]        = useState('')
  const [description,   setDescription]  = useState('')
  const [ticketRef,     setTicketRef]    = useState<string | null>(null)

  const [errors, setErrors] = useState<Record<string, string>>({})

  const submit = useMutation({
    mutationFn: walletApi.submitRefundRequest,
    onSuccess: (data) => {
      setTicketRef(data.reference)
    },
    onError: (err) => {
      const msg = isAxiosError(err)
        ? (err.response?.data?.error ?? err.response?.data?.message ?? 'Something went wrong.')
        : 'Something went wrong.'
      toast.error(msg)
    },
  })

  const validate = (): boolean => {
    const e: Record<string, string> = {}
    if (!/^\d{10}$/.test(accountNumber)) e.accountNumber = 'Enter a valid 10-digit account number'
    if (!bankName)                         e.bankName      = 'Select your bank'
    const amt = parseFloat(amount)
    if (!amt || amt <= 0)                  e.amount        = 'Enter the amount to refund'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = () => {
    if (!validate()) return
    submit.mutate({
      account_number: accountNumber,
      bank_name:      bankName,
      amount:         parseFloat(amount),
      description:    description.trim() || undefined,
    })
  }

  // ── Success screen ────────────────────────────────────────────────────────────
  if (ticketRef) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
        <div className="h-16 w-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mb-4">
          <BadgeCheck className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
        </div>
        <h2 className="text-xl font-black text-ink mb-2">Request Submitted</h2>
        <p className="text-sm text-ink-muted leading-relaxed max-w-[280px] mb-4">
          Our team has received your refund request and will review it within 1–3 business days.
        </p>
        <div className="bg-surface-2 rounded-2xl px-5 py-3 mb-6">
          <p className="text-xs text-ink-faint mb-0.5">Ticket Reference</p>
          <p className="font-mono font-bold text-ink tracking-wider">{ticketRef}</p>
        </div>
        <p className="text-xs text-ink-faint mb-6 max-w-[260px]">
          Save this reference to follow up with support if needed.
        </p>
        <button
          onClick={() => navigate('/wallet')}
          className="px-8 py-2.5 rounded-2xl bg-brand-600 text-white text-sm font-bold shadow-brand hover:bg-brand-700 transition-colors"
        >
          Back to Wallet
        </button>
      </div>
    )
  }

  // ── Form ─────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5 pt-1 pb-8 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-xl hover:bg-surface-2 transition-colors"
          aria-label="Go back"
        >
          <ArrowLeft className="h-5 w-5 text-ink-muted" />
        </button>
        <h1 className="text-xl font-bold text-ink">Refund Request</h1>
      </div>

      {/* Info banner */}
      <div className="flex gap-3 p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
        <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-0.5">
            Accidentally funded your wallet?
          </p>
          <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
            Enter the bank account details you want the money sent back to. Our team will review and process your refund within 1–3 business days. You may be contacted for verification.
          </p>
        </div>
      </div>

      {/* Form card */}
      <div className="bg-surface-1 rounded-3xl shadow-card border border-border p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Banknote className="h-4 w-4 text-brand-600" />
          <p className="text-sm font-bold text-ink">Bank Account Details</p>
        </div>

        <Field label="Account Number">
          <NumPadInput
            value={accountNumber}
            onChange={(v) => setAccountNumber(v.replace(/\D/g, '').slice(0, 10))}
            placeholder="0000000000"
            maxLength={10}
            error={errors.accountNumber}
          />
        </Field>

        <Field label="Bank Name">
          <select
            value={bankName}
            onChange={(e) => setBankName(e.target.value)}
            className={cn(
              'w-full px-4 py-3 rounded-2xl border bg-surface-2 text-ink text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 transition-all appearance-none',
              errors.bankName ? 'border-danger ring-2 ring-danger/20' : 'border-border',
              !bankName && 'text-ink-faint'
            )}
          >
            <option value="" disabled>Select your bank…</option>
            {NIGERIAN_BANKS.map((bank) => (
              <option key={bank} value={bank}>{bank}</option>
            ))}
          </select>
          {errors.bankName && (
            <p className="text-xs text-danger mt-1">{errors.bankName}</p>
          )}
        </Field>

        <Field label="Amount to Refund (₦)">
          <AmountInput value={amount} onChange={setAmount} error={errors.amount} />
        </Field>

        <Field label="Additional Note (optional)">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Any extra details to help our team process your request…"
            className="w-full px-4 py-3 rounded-2xl border border-border bg-surface-2 text-ink text-sm placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-brand-500 transition-all resize-none"
          />
        </Field>
      </div>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={submit.isPending}
        className={cn(
          'w-full py-3.5 rounded-2xl text-white text-sm font-bold transition-all flex items-center justify-center gap-2',
          submit.isPending
            ? 'bg-brand-400 cursor-not-allowed'
            : 'bg-brand-600 hover:bg-brand-700 shadow-brand active:scale-[0.98]'
        )}
      >
        {submit.isPending ? (
          <>
            <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            Submitting…
          </>
        ) : (
          'Submit Refund Request'
        )}
      </button>

      <p className="text-center text-xs text-ink-faint leading-relaxed px-4">
        Refunds are processed manually by our team. Only wallet credits from your own bank transfer are eligible. Service purchase refunds are handled separately via the transaction page.
      </p>
    </div>
  )
}
