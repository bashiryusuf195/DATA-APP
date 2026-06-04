import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, ExternalLink, CheckCircle2, AlertCircle, Clock,
  Building2, CreditCard, Copy, CheckCheck, Landmark,
} from 'lucide-react'
import type { TransferAccount } from '@/types'
import { Button } from '@/components/ui'
import { AmountInput } from '@/components/shared/AmountInput'
import { useWalletBalance, useInitializeFunding, useVerifyFunding, useDedicatedAccount, useSquadAccount } from '@/hooks/useWallet'
import { fmtCurrency } from '@/utils/format'
import toast from 'react-hot-toast'
import { isAxiosError } from 'axios'

type Phase = 'input' | 'transfer_details' | 'redirect' | 'verifying' | 'success' | 'pending' | 'failed'
type Method = 'card' | 'bank'

export function FundWalletPage() {
  const navigate = useNavigate()
  const [method, setMethod]           = useState<Method>('bank')
  const [amount, setAmount]           = useState('')
  const [amountError, setAmountError] = useState('')
  const [phase, setPhase]             = useState<Phase>('input')
  const [reference, setReference]     = useState('')
  const [payUrl, setPayUrl]           = useState('')
  const [newBalance, setNewBalance]   = useState<number | null>(null)
  const [copied, setCopied]                     = useState(false)
  const [copiedSquad, setCopiedSquad]           = useState(false)
  const [copiedTransfer, setCopiedTransfer]     = useState(false)
  const [transferAccount, setTransferAccount]   = useState<TransferAccount | null>(null)
  const [transferAmount, setTransferAmount]     = useState<number | null>(null)

  const { data: balance }  = useWalletBalance()
  const { data: dva, isLoading: dvaLoading }     = useDedicatedAccount()
  const { data: squadData, isLoading: squadLoading } = useSquadAccount()
  const initFunding        = useInitializeFunding()
  const verifyFunding      = useVerifyFunding()

  const squadAccount = squadData?.account ?? null
  const squadProfileIncomplete = squadData?.profileIncomplete ?? false

  const handleCopy = () => {
    if (!dva?.account_number) return
    navigator.clipboard.writeText(dva.account_number).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
      toast.success('Account number copied!')
    })
  }

  const handleCopySquad = () => {
    if (!squadAccount?.virtual_account_number) return
    navigator.clipboard.writeText(squadAccount.virtual_account_number).then(() => {
      setCopied(false)
      setCopiedSquad(true)
      setTimeout(() => setCopiedSquad(false), 2500)
      toast.success('Account number copied!')
    })
  }

  const handleInitialize = async (payMethod: 'bank_transfer' | 'card' = 'card') => {
    const amt = parseFloat(amount)
    if (!amt || amt < 100) { setAmountError('Minimum amount is ₦100.'); return }
    if (amt > 5_000_000)   { setAmountError('Maximum is ₦5,000,000.'); return }
    setAmountError('')
    try {
      const res = await initFunding.mutateAsync({ amount: amt, key: crypto.randomUUID(), method: payMethod })
      setReference(res.reference)
      if (res.transfer_account) {
        // In-app bank transfer — show account details without redirect
        setTransferAccount(res.transfer_account)
        setTransferAmount(amt)
        setPhase('transfer_details')
      } else {
        // Card / USSD / Squad — redirect to checkout
        setPayUrl(res.authorization_url ?? '')
        setPhase('redirect')
      }
    } catch (err) {
      toast.error(isAxiosError(err) ? (err.response?.data?.error ?? 'Could not initialize payment.') : 'Something went wrong.')
    }
  }

  const handleCopyTransfer = () => {
    if (!transferAccount?.account_number) return
    navigator.clipboard.writeText(transferAccount.account_number).then(() => {
      setCopiedTransfer(true)
      setTimeout(() => setCopiedTransfer(false), 2500)
      toast.success('Account number copied!')
    })
  }

  const handleVerify = async () => {
    if (!reference) return
    setPhase('verifying')
    try {
      const res = await verifyFunding.mutateAsync(reference)
      if (res.status === 'success') {
        setNewBalance(res.new_balance)
        setPhase('success')
      } else if (res.status === 'pending') {
        setPhase('pending')
      } else {
        setPhase('failed')
      }
    } catch {
      setPhase('failed')
    }
  }

  // ── Result screens ──────────────────────────────────────────────────────────

  if (phase === 'success') {
    return (
      <div className="space-y-4 pt-2">
        <button onClick={() => navigate('/wallet')} className="flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
          <ArrowLeft className="h-4 w-4" /> Wallet
        </button>
        <div className="bg-surface-1 rounded-3xl p-6 shadow-card flex flex-col items-center text-center">
          <div className="h-16 w-16 rounded-full bg-teal-100 flex items-center justify-center mb-4">
            <CheckCircle2 className="h-8 w-8 text-teal-600" />
          </div>
          <p className="text-lg font-bold text-ink mb-1">Wallet Funded!</p>
          <p className="text-sm text-ink-muted mb-1">Your new balance</p>
          <p className="text-3xl font-bold text-ink mb-6">{fmtCurrency(newBalance ?? 0)}</p>
          <Button fullWidth onClick={() => navigate('/dashboard')}>Go to Dashboard</Button>
        </div>
      </div>
    )
  }

  if (phase === 'failed') {
    return (
      <div className="space-y-4 pt-2">
        <button onClick={() => navigate('/wallet')} className="flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
          <ArrowLeft className="h-4 w-4" /> Wallet
        </button>
        <div className="bg-surface-1 rounded-3xl p-6 shadow-card flex flex-col items-center text-center">
          <div className="h-16 w-16 rounded-full bg-danger/10 flex items-center justify-center mb-4">
            <AlertCircle className="h-8 w-8 text-danger" />
          </div>
          <p className="text-lg font-bold text-ink mb-1">Payment Failed</p>
          <p className="text-sm text-ink-muted mb-6">The payment could not be verified. If you were charged, please contact support.</p>
          <div className="flex gap-3 w-full">
            <Button variant="outline" fullWidth onClick={() => setPhase('input')}>Try Again</Button>
            <Button fullWidth onClick={() => navigate('/dashboard')}>Dashboard</Button>
          </div>
        </div>
      </div>
    )
  }

  if (phase === 'pending') {
    return (
      <div className="space-y-4 pt-2">
        <button onClick={() => navigate('/wallet')} className="flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
          <ArrowLeft className="h-4 w-4" /> Wallet
        </button>
        <div className="bg-surface-1 rounded-3xl p-6 shadow-card flex flex-col items-center text-center">
          <div className="h-16 w-16 rounded-full bg-amber-100 flex items-center justify-center mb-4">
            <Clock className="h-8 w-8 text-amber-600" />
          </div>
          <p className="text-lg font-bold text-ink mb-1">Payment Confirmed</p>
          <p className="text-sm text-ink-muted mb-2">Your payment was received. Your wallet balance will update shortly.</p>
          <p className="text-xs text-ink-faint mb-6 font-mono bg-surface-0 px-3 py-1.5 rounded-xl">
            Ref: {reference}
          </p>
          <div className="flex gap-3 w-full">
            <Button variant="outline" fullWidth loading={verifyFunding.isPending} onClick={handleVerify}>Check again</Button>
            <Button fullWidth onClick={() => navigate('/wallet')}>View wallet</Button>
          </div>
        </div>
      </div>
    )
  }

  if (phase === 'transfer_details' && transferAccount) {
    return (
      <div className="space-y-4 pt-2">
        <button
          onClick={() => { setPhase('input'); setTransferAccount(null); setTransferAmount(null) }}
          className="flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div className="bg-surface-1 rounded-3xl p-5 shadow-card space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-brand-50 flex items-center justify-center shrink-0">
              <Landmark className="h-5 w-5 text-brand-600" />
            </div>
            <div>
              <p className="text-base font-bold text-ink">Transfer Details</p>
              <p className="text-xs text-ink-faint">Send exactly this amount to credit your wallet</p>
            </div>
          </div>

          <div className="space-y-3 text-sm">
            <div className="flex justify-between items-center py-2.5 border-b border-border">
              <span className="text-ink-faint">Amount to Transfer</span>
              <span className="font-bold text-lg text-ink">{fmtCurrency(transferAmount ?? 0)}</span>
            </div>
            <div className="flex justify-between items-center py-2.5 border-b border-border">
              <span className="text-ink-faint">Bank</span>
              <span className="font-semibold text-ink">{transferAccount.bank_name}</span>
            </div>
            <div className="flex justify-between items-center py-2.5 border-b border-border">
              <span className="text-ink-faint">Account Name</span>
              <span className="font-semibold text-ink">{transferAccount.account_name}</span>
            </div>
            <div className="flex justify-between items-center py-2.5">
              <span className="text-ink-faint">Account Number</span>
              <button onClick={handleCopyTransfer} className="flex items-center gap-2 group">
                <span className="font-mono font-bold text-xl tracking-widest text-ink group-hover:text-brand-600 transition-colors">
                  {transferAccount.account_number}
                </span>
                {copiedTransfer
                  ? <CheckCheck className="h-4 w-4 text-success" />
                  : <Copy className="h-4 w-4 text-ink-faint group-hover:text-brand-600 transition-colors" />}
              </button>
            </div>
          </div>

          {transferAccount.display_text && (
            <div className="bg-surface-0 rounded-2xl px-4 py-3">
              <p className="text-xs text-ink-muted leading-relaxed">{transferAccount.display_text}</p>
            </div>
          )}
        </div>

        <button
          onClick={handleCopyTransfer}
          className="w-full py-3.5 rounded-2xl bg-brand-600 text-white text-sm font-bold shadow-brand hover:bg-brand-700 transition-colors flex items-center justify-center gap-2"
        >
          {copiedTransfer ? <><CheckCheck className="h-4 w-4" /> Copied!</> : <><Copy className="h-4 w-4" /> Copy Account Number</>}
        </button>

        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
          <p className="text-xs text-amber-700 font-semibold mb-1">How it works</p>
          <ul className="text-xs text-amber-600 space-y-1 list-disc list-inside">
            <li>Transfer <strong>{fmtCurrency(transferAmount ?? 0)}</strong> from your bank app to the account above</li>
            <li>Your wallet will be credited automatically once the transfer is confirmed</li>
            <li>This account is for this transaction only — do not reuse it</li>
          </ul>
        </div>

        <Button variant="secondary" fullWidth loading={verifyFunding.isPending} onClick={handleVerify}>
          I&apos;ve transferred — Check Status
        </Button>
      </div>
    )
  }

  if (phase === 'redirect') {
    return (
      <div className="space-y-4 pt-2">
        <button onClick={() => setPhase('input')} className="flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div className="bg-surface-1 rounded-3xl p-5 shadow-card space-y-4">
          <p className="text-base font-bold text-ink">Complete Payment</p>
          <p className="text-sm text-ink-muted">
            Click the button below to open the payment page. After paying, return here and click "I've paid".
          </p>
          <a href={payUrl} target="_blank" rel="noopener noreferrer" className="block">
            <Button fullWidth icon={<ExternalLink className="h-4 w-4" />}>Open Payment Page</Button>
          </a>
          <Button variant="secondary" fullWidth loading={verifyFunding.isPending} onClick={handleVerify}>
            I've paid — Verify Payment
          </Button>
        </div>
      </div>
    )
  }

  // ── Main input screen ───────────────────────────────────────────────────────

  return (
    <div className="space-y-4 pt-2 pb-4">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-ink">Add Money</h1>
        {balance && (
          <p className="text-xs text-ink-faint">
            Balance: <span className="font-semibold text-ink">{fmtCurrency(balance.balance)}</span>
          </p>
        )}
      </div>

      {/* Method tabs */}
      <div className="flex gap-2 p-1 bg-surface-0 rounded-2xl">
        <button
          onClick={() => setMethod('bank')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${
            method === 'bank'
              ? 'bg-surface-1 text-brand-600 shadow-card'
              : 'text-ink-muted hover:text-ink'
          }`}
        >
          <Building2 className="h-4 w-4" /> Bank Transfer
        </button>
        <button
          onClick={() => setMethod('card')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${
            method === 'card'
              ? 'bg-surface-1 text-brand-600 shadow-card'
              : 'text-ink-muted hover:text-ink'
          }`}
        >
          <CreditCard className="h-4 w-4" /> Card / USSD
        </button>
      </div>

      {/* Bank Transfer */}
      {method === 'bank' && (
        <div className="space-y-3">

          {/* ── One-time transfer (amount-specific temporary account) ── */}
          <div className="bg-surface-1 rounded-3xl p-5 shadow-card space-y-4">
            <div>
              <p className="text-sm font-bold text-ink mb-0.5">Quick Bank Transfer</p>
              <p className="text-xs text-ink-faint">Enter an amount to get a one-time transfer account. Wallet credited automatically.</p>
            </div>
            <AmountInput value={amount} onChange={setAmount} error={amountError} />
            <Button fullWidth loading={initFunding.isPending} onClick={() => handleInitialize('bank_transfer')}>
              Get Transfer Account
            </Button>
          </div>

          <div className="flex items-center gap-3 px-1">
            <div className="flex-1 h-px bg-border" />
            <p className="text-xs text-ink-faint font-medium">or use your permanent accounts</p>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Paystack Dedicated Account */}
          <div className="bg-surface-1 rounded-3xl p-5 shadow-card">
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-bold text-ink">Paystack Transfer Account</p>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">Paystack</span>
            </div>
            <p className="text-xs text-ink-faint mb-4">Wallet credited automatically within seconds.</p>

            {dvaLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex justify-between">
                    <div className="h-4 w-24 bg-surface-2 rounded animate-pulse" />
                    <div className="h-4 w-32 bg-surface-2 rounded animate-pulse" />
                  </div>
                ))}
              </div>
            ) : dva ? (
              <div className="space-y-3 text-sm">
                <div className="flex justify-between items-center py-2 border-b border-border">
                  <span className="text-ink-faint">Bank</span>
                  <span className="font-semibold text-ink">{dva.bank_name}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-border">
                  <span className="text-ink-faint">Account Name</span>
                  <span className="font-semibold text-ink">{dva.account_name}</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-ink-faint">Account Number</span>
                  <button onClick={handleCopy} className="flex items-center gap-2 group">
                    <span className="font-mono font-bold text-lg tracking-widest text-ink group-hover:text-brand-600 transition-colors">
                      {dva.account_number}
                    </span>
                    {copied
                      ? <CheckCheck className="h-4 w-4 text-success" />
                      : <Copy className="h-4 w-4 text-ink-faint group-hover:text-brand-600 transition-colors" />}
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-ink-muted text-center py-4">
                Complete your profile (name &amp; phone) to activate your dedicated bank account.
              </p>
            )}
          </div>

          {dva && (
            <button
              onClick={handleCopy}
              className="w-full py-3.5 rounded-2xl bg-brand-600 text-white text-sm font-bold shadow-brand hover:bg-brand-700 transition-colors flex items-center justify-center gap-2"
            >
              {copied ? <><CheckCheck className="h-4 w-4" /> Copied!</> : <><Copy className="h-4 w-4" /> Copy Paystack Account Number</>}
            </button>
          )}

          {/* Squad Transfer Account */}
          <div className="bg-surface-1 rounded-3xl p-5 shadow-card">
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-bold text-ink">Squad Transfer Account</p>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200">Squad</span>
            </div>
            <p className="text-xs text-ink-faint mb-4">Wallet credited automatically within seconds.</p>

            {squadLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex justify-between">
                    <div className="h-4 w-24 bg-surface-2 rounded animate-pulse" />
                    <div className="h-4 w-32 bg-surface-2 rounded animate-pulse" />
                  </div>
                ))}
              </div>
            ) : squadAccount ? (
              <div className="space-y-3 text-sm">
                <div className="flex justify-between items-center py-2 border-b border-border">
                  <span className="text-ink-faint">Bank</span>
                  <span className="font-semibold text-ink">{squadAccount.bank_name}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-border">
                  <span className="text-ink-faint">Account Name</span>
                  <span className="font-semibold text-ink">{squadAccount.account_name}</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-ink-faint">Account Number</span>
                  <button onClick={handleCopySquad} className="flex items-center gap-2 group">
                    <span className="font-mono font-bold text-lg tracking-widest text-ink group-hover:text-violet-600 transition-colors">
                      {squadAccount.virtual_account_number}
                    </span>
                    {copiedSquad
                      ? <CheckCheck className="h-4 w-4 text-success" />
                      : <Copy className="h-4 w-4 text-ink-faint group-hover:text-violet-600 transition-colors" />}
                  </button>
                </div>
              </div>
            ) : squadProfileIncomplete ? (
              <div className="text-center py-4 space-y-2">
                <p className="text-sm text-ink-muted">
                  Your Squad account needs a complete profile to activate.
                </p>
                <Link to="/profile/edit" className="text-sm font-semibold text-violet-600 hover:underline">
                  Complete Profile →
                </Link>
              </div>
            ) : (
              <p className="text-sm text-ink-muted text-center py-4">
                Squad transfer account is temporarily unavailable.
              </p>
            )}
          </div>

          {squadAccount && (
            <button
              onClick={handleCopySquad}
              className="w-full py-3.5 rounded-2xl bg-violet-600 text-white text-sm font-bold hover:bg-violet-700 transition-colors flex items-center justify-center gap-2"
            >
              {copiedSquad ? <><CheckCheck className="h-4 w-4" /> Copied!</> : <><Copy className="h-4 w-4" /> Copy Squad Account Number</>}
            </button>
          )}

          <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
            <p className="text-xs text-amber-700 font-semibold mb-1">How permanent accounts work</p>
            <ul className="text-xs text-amber-600 space-y-1 list-disc list-inside">
              <li>Transfer any amount — your wallet is credited automatically</li>
              <li>These account numbers are yours permanently</li>
              <li>Use "Quick Bank Transfer" above to fund a specific exact amount</li>
            </ul>
          </div>
        </div>
      )}

      {/* Card / USSD */}
      {method === 'card' && (
        <div className="bg-surface-1 rounded-3xl p-5 shadow-card space-y-5">
          <p className="text-sm text-ink-muted">Enter the amount you want to add. You'll be redirected to Paystack to complete payment.</p>
          <AmountInput value={amount} onChange={setAmount} error={amountError} />
          <Button fullWidth loading={initFunding.isPending} onClick={() => handleInitialize('card')}>
            Proceed to Payment
          </Button>
        </div>
      )}
    </div>
  )
}
