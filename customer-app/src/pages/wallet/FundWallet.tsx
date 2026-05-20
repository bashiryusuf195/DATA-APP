import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ExternalLink, CheckCircle2, AlertCircle, Clock } from 'lucide-react'
import { Button, Card } from '@/components/ui'
import { AmountInput } from '@/components/shared/AmountInput'
import { useWalletBalance, useInitializeFunding, useVerifyFunding } from '@/hooks/useWallet'
import { fmtCurrency } from '@/utils/format'
import toast from 'react-hot-toast'
import { isAxiosError } from 'axios'

type Phase = 'input' | 'redirect' | 'verifying' | 'success' | 'pending' | 'failed'

export function FundWalletPage() {
  const navigate = useNavigate()
  const [amount, setAmount]         = useState('')
  const [amountError, setAmountError] = useState('')
  const [phase, setPhase]           = useState<Phase>('input')
  const [reference, setReference]   = useState('')
  const [payUrl, setPayUrl]         = useState('')
  const [newBalance, setNewBalance] = useState<number | null>(null)

  const { data: balance } = useWalletBalance()
  const initFunding  = useInitializeFunding()
  const verifyFunding = useVerifyFunding()

  const handleInitialize = async () => {
    const amt = parseFloat(amount)
    if (!amt || amt < 100) { setAmountError('Minimum amount is ₦100.'); return }
    if (amt > 5_000_000)   { setAmountError('Maximum is ₦5,000,000.'); return }
    setAmountError('')
    try {
      const res = await initFunding.mutateAsync({ amount: amt, key: crypto.randomUUID() })
      setReference(res.reference)
      setPayUrl(res.authorization_url)
      setPhase('redirect')
    } catch (err) {
      toast.error(isAxiosError(err) ? (err.response?.data?.error ?? 'Could not initialize payment.') : 'Something went wrong.')
    }
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

  if (phase === 'success') {
    return (
      <div className="space-y-4 pt-2">
        <button onClick={() => navigate('/wallet')} className="flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
          <ArrowLeft className="h-4 w-4" /> Wallet
        </button>
        <Card>
          <div className="flex flex-col items-center text-center py-4">
            <div className="h-16 w-16 rounded-full bg-success-light flex items-center justify-center mb-4">
              <CheckCircle2 className="h-8 w-8 text-success" />
            </div>
            <p className="text-lg font-bold text-ink mb-1">Wallet Funded!</p>
            <p className="text-sm text-ink-muted mb-1">Your new balance</p>
            <p className="text-3xl font-bold text-ink mb-6">{fmtCurrency(newBalance ?? 0)}</p>
            <Button fullWidth onClick={() => navigate('/dashboard')}>Go to Dashboard</Button>
          </div>
        </Card>
      </div>
    )
  }

  if (phase === 'failed') {
    return (
      <div className="space-y-4 pt-2">
        <button onClick={() => navigate('/wallet')} className="flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
          <ArrowLeft className="h-4 w-4" /> Wallet
        </button>
        <Card>
          <div className="flex flex-col items-center text-center py-4">
            <div className="h-16 w-16 rounded-full bg-danger-light flex items-center justify-center mb-4">
              <AlertCircle className="h-8 w-8 text-danger" />
            </div>
            <p className="text-lg font-bold text-ink mb-1">Payment Failed</p>
            <p className="text-sm text-ink-muted mb-6">The payment could not be verified. If you were charged, please contact support.</p>
            <div className="flex gap-3 w-full">
              <Button variant="outline" fullWidth onClick={() => setPhase('input')}>Try Again</Button>
              <Button fullWidth onClick={() => navigate('/dashboard')}>Dashboard</Button>
            </div>
          </div>
        </Card>
      </div>
    )
  }

  if (phase === 'pending') {
    return (
      <div className="space-y-4 pt-2">
        <button onClick={() => navigate('/wallet')} className="flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
          <ArrowLeft className="h-4 w-4" /> Wallet
        </button>
        <Card>
          <div className="flex flex-col items-center text-center py-4">
            <div className="h-16 w-16 rounded-full bg-amber-100 flex items-center justify-center mb-4">
              <Clock className="h-8 w-8 text-amber-600" />
            </div>
            <p className="text-lg font-bold text-ink mb-1">Payment Confirmed</p>
            <p className="text-sm text-ink-muted mb-2">
              Your payment was received. Your wallet balance will be updated shortly.
            </p>
            <p className="text-xs text-ink-faint mb-6 font-mono bg-surface-2 px-3 py-1.5 rounded-lg">
              Ref: {reference}
            </p>
            <div className="flex gap-3 w-full">
              <Button variant="outline" fullWidth loading={verifyFunding.isPending} onClick={handleVerify}>
                Check again
              </Button>
              <Button fullWidth onClick={() => navigate('/wallet')}>View wallet</Button>
            </div>
          </div>
        </Card>
      </div>
    )
  }

  if (phase === 'redirect') {
    return (
      <div className="space-y-4 pt-2">
        <button onClick={() => setPhase('input')} className="flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <Card>
          <p className="text-base font-semibold text-ink mb-1">Complete Payment</p>
          <p className="text-sm text-ink-muted mb-5">
            Click the button below to complete your payment. After paying, return here and click "I've paid".
          </p>
          <a href={payUrl} target="_blank" rel="noopener noreferrer" className="block mb-3">
            <Button fullWidth icon={<ExternalLink className="h-4 w-4" />}>Open Payment Page</Button>
          </a>
          <Button variant="secondary" fullWidth loading={verifyFunding.isPending} onClick={handleVerify}>
            I've paid — Verify Payment
          </Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-4 pt-2">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>
      <Card>
        <p className="text-base font-semibold text-ink mb-1">Fund Wallet</p>
        {balance && (
          <p className="text-xs text-ink-muted mb-5">
            Current balance: <span className="font-semibold text-ink">{fmtCurrency(balance.balance)}</span>
          </p>
        )}
        <div className="space-y-5">
          <AmountInput value={amount} onChange={setAmount} error={amountError} />
          <Button fullWidth loading={initFunding.isPending} onClick={handleInitialize}>
            Proceed to Payment
          </Button>
        </div>
      </Card>
    </div>
  )
}
