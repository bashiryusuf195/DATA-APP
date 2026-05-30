import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { Zap, ArrowLeft, CheckCircle2, Loader2 } from 'lucide-react'
import { Button, Input, Skeleton } from '@/components/ui'
import { AmountInput } from '@/components/shared/AmountInput'
import { ConfirmModal }  from '@/components/shared/ConfirmModal'
import { PinEntryModal } from '@/components/shared/PinEntryModal'
import { ResultModal }   from '@/components/shared/ResultModal'
import { useServicePurchase } from '@/hooks/useServicePurchase'
import { useWalletBalance } from '@/hooks/useWallet'
import { useServicePlans } from '@/hooks/useServices'
import { transactionsApi } from '@/api/transactions.api'
import { fmtCurrency } from '@/utils/format'
import type { ElectricityPurchaseInput, MeterVerifyResult } from '@/types'
import { cn } from '@/utils/cn'

export function ElectricityPage() {
  const navigate = useNavigate()

  const [selectedVariationCode, setSelectedVariationCode] = useState('')
  const [meter,        setMeter]        = useState('')
  const [amount,       setAmount]       = useState('')
  const [phone,        setPhone]        = useState('')
  const [verifyResult, setVerifyResult] = useState<MeterVerifyResult | null>(null)
  const [errors,       setErrors]       = useState<Record<string, string>>({})

  const { data: balance } = useWalletBalance()
  const { data: allPlans, isLoading: plansLoading } = useServicePlans('electricity', true)
  const purchase = useServicePurchase<ElectricityPurchaseInput>(transactionsApi.buyElectricity)

  const selectedPlan = useMemo(
    () => allPlans?.find((p) => p.variation_code === selectedVariationCode) ?? null,
    [allPlans, selectedVariationCode],
  )

  const verifyMutation = useMutation({
    mutationFn: () =>
      transactionsApi.verifyMeter({
        meter_number:   meter.trim(),
        variation_code: selectedPlan!.variation_code,
      }),
    onSuccess: (data) => {
      setVerifyResult(data)
      if (!data.success) {
        setErrors((e) => ({ ...e, meter: data.message || 'Meter verification failed' }))
      } else {
        setErrors((e) => ({ ...e, meter: '' }))
      }
    },
    onError: (err: Error) => {
      setErrors((e) => ({ ...e, meter: err.message || 'Verification failed — please try again' }))
    },
  })

  const handleVerify = () => {
    if (!meter.trim()) { setErrors((e) => ({ ...e, meter: 'Enter your meter number' })); return }
    setVerifyResult(null)
    verifyMutation.mutate()
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (!verifyResult?.success) { errs.meter = 'Verify your meter first'; setErrors(errs); return }
    const amt = parseFloat(amount)
    if (!amt || amt < 1000)               errs.amount = 'Minimum is ₦1,000'
    if (balance && amt > balance.balance) errs.amount = 'Insufficient balance'
    if (Object.keys(errs).length) { setErrors(errs); return }

    purchase.requestConfirm({
      meter_number:           meter.trim(),
      amount:                 amt,
      variation_code:         selectedPlan!.variation_code,
      phone:                  phone.trim() || undefined,
      verified_customer_name: verifyResult.customer_name || undefined,
    })
  }

  const handlePlanChange = (variationCode: string) => {
    setSelectedVariationCode(variationCode)
    setMeter('')
    setVerifyResult(null)
    setErrors({})
  }

  return (
    <div className="space-y-4 pt-2 pb-4">
      {/* Back */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Services
      </button>

      {/* Page header */}
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-full bg-amber-100 border-2 border-amber-300/50 flex items-center justify-center shrink-0">
          <Zap className="h-6 w-6 text-amber-600" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-ink">Pay Electricity</h1>
          {balance && (
            <p className="text-xs text-ink-faint">Wallet: {fmtCurrency(balance.balance)}</p>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">

        {/* Step 1 — DISCO selector */}
        <div className="bg-surface-1 rounded-3xl p-5 shadow-card">
          <p className="text-sm font-bold text-ink mb-3">Select Distributor</p>
          {plansLoading ? (
            <div className="grid grid-cols-2 gap-2">
              {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-10 rounded-2xl" />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {(allPlans ?? []).map((p) => (
                <button
                  key={p.variation_code}
                  type="button"
                  onClick={() => handlePlanChange(p.variation_code)}
                  className={cn(
                    'py-2.5 px-3 rounded-2xl text-xs font-semibold border-2 transition-all text-center',
                    selectedVariationCode === p.variation_code
                      ? 'border-brand-600 bg-brand-600 text-white shadow-brand'
                      : 'border-border text-ink-muted bg-surface-0 hover:border-brand-400 hover:text-brand-600'
                  )}
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}
          {errors.plan && <p className="mt-2 text-xs text-danger">{errors.plan}</p>}
        </div>

        {/* Step 2 — Meter number + verify */}
        {selectedPlan && (
          <div className="bg-surface-1 rounded-3xl p-5 shadow-card space-y-3">
            <p className="text-sm font-bold text-ink">Meter Details</p>

            <div className="flex gap-2 items-start">
              <div className="flex-1">
                <Input
                  label="Meter Number"
                  type="text"
                  inputMode="numeric"
                  value={meter}
                  onChange={(e) => {
                    setMeter(e.target.value)
                    setVerifyResult(null)
                    setErrors((err) => ({ ...err, meter: '' }))
                  }}
                  placeholder="e.g. 12345678901"
                  error={errors.meter}
                />
              </div>
              {!verifyResult?.success && (
                <button
                  type="button"
                  onClick={handleVerify}
                  disabled={!meter.trim() || verifyMutation.isPending}
                  className="mt-6 shrink-0 h-10 px-4 rounded-2xl bg-brand-600 text-white text-xs font-bold shadow-brand hover:bg-brand-700 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  {verifyMutation.isPending
                    ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking</>
                    : 'Verify'}
                </button>
              )}
            </div>

            {verifyResult?.success && (
              <div className="flex items-start gap-3 rounded-2xl bg-brand-50 border border-brand-200 px-4 py-3">
                <CheckCircle2 className="h-5 w-5 text-brand-600 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-semibold text-brand-700">Meter Verified</p>
                  <p className="text-ink mt-0.5">{verifyResult.customer_name || 'Customer name unavailable'}</p>
                  {verifyResult.address && (
                    <p className="text-ink-faint text-xs mt-0.5">{verifyResult.address}</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 3 — Amount + phone */}
        {verifyResult?.success && (
          <div className="bg-surface-1 rounded-3xl p-5 shadow-card space-y-4">
            <p className="text-sm font-bold text-ink">Payment Details</p>

            <AmountInput
              value={amount}
              onChange={(v) => { setAmount(v); setErrors((err) => ({ ...err, amount: '' })) }}
              error={errors.amount}
              quickAmounts={[1000, 2000, 5000, 10000, 20000, 50000]}
            />

            <Input
              label="Phone Number (optional)"
              type="tel"
              inputMode="numeric"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 08012345678"
            />

            <div className="pt-1">
              <p className="text-xs text-ink-faint mb-3">Payment Source</p>
              <div className="flex items-center justify-between px-4 py-3 rounded-2xl bg-surface-0 border border-border">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-brand-100 flex items-center justify-center">
                    <Zap className="h-4 w-4 text-brand-600" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-ink">Wallet Balance</p>
                    <p className="text-[11px] text-ink-faint">{fmtCurrency(balance?.balance ?? 0)}</p>
                  </div>
                </div>
                <div className="h-4 w-4 rounded-full border-2 border-brand-600 flex items-center justify-center">
                  <div className="h-2 w-2 rounded-full bg-brand-600" />
                </div>
              </div>
            </div>

            <Button type="submit" fullWidth size="lg">
              Pay Now
            </Button>
          </div>
        )}
      </form>

      <ConfirmModal
        open={purchase.phase === 'confirm'}
        rows={[
          { label: 'Plan',     value: selectedPlan?.name ?? '—' },
          { label: 'Customer', value: verifyResult?.customer_name || 'Customer name unavailable' },
          { label: 'Meter',    value: meter.trim() },
          ...(phone.trim() ? [{ label: 'Phone', value: phone.trim() }] : []),
          { label: 'Amount',   value: fmtCurrency(parseFloat(amount) || 0) },
        ]}
        onConfirm={purchase.goToPin}
        onCancel={purchase.cancel}
        confirmLabel="Enter PIN"
      />

      <PinEntryModal
        open={purchase.phase === 'pin' || purchase.phase === 'submitting'}
        loading={purchase.phase === 'submitting'}
        error={purchase.pinError}
        onSubmit={purchase.confirmWithPin}
        onCancel={purchase.backToConfirm}
      />

      <ResultModal
        open={purchase.phase === 'done'}
        transaction={purchase.result}
        isPolling={purchase.isPolling}
        onClose={purchase.reset}
        onRetry={purchase.reset}
      />
    </div>
  )
}
