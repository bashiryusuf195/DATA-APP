import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { Tv, ArrowLeft, CheckCircle2, Loader2 } from 'lucide-react'
import { Button, Input, Skeleton } from '@/components/ui'
import { ConfirmModal }  from '@/components/shared/ConfirmModal'
import { PinEntryModal } from '@/components/shared/PinEntryModal'
import { ResultModal }   from '@/components/shared/ResultModal'
import { useServicePurchase } from '@/hooks/useServicePurchase'
import { useWalletBalance } from '@/hooks/useWallet'
import { useServicePlans } from '@/hooks/useServices'
import { transactionsApi } from '@/api/transactions.api'
import { fmtCurrency } from '@/utils/format'
import type { CableTvPurchaseInput, CableVerifyResult } from '@/types'
import { cn } from '@/utils/cn'

const PROVIDER_LABELS: Record<string, string> = {
  dstv:      'DStv',
  gotv:      'GOtv',
  startimes: 'StarTimes',
  showmax:   'Showmax',
}
const fmtProvider = (code: string) => PROVIDER_LABELS[code] ?? code.toUpperCase()

export function CableTvPage() {
  const navigate = useNavigate()

  const [selectedBiller, setSelectedBiller] = useState('')
  const [smartcard,      setSmartcard]      = useState('')
  const [verifyResult,   setVerifyResult]   = useState<CableVerifyResult | null>(null)
  const [selectedPlanId, setSelectedPlanId] = useState('')
  const [phone,          setPhone]          = useState('')
  const [errors,         setErrors]         = useState<Record<string, string>>({})

  const { data: balance } = useWalletBalance()
  const { data: allPlans, isLoading: plansLoading } = useServicePlans('cable_tv', true)
  const purchase = useServicePurchase<CableTvPurchaseInput>(transactionsApi.buyCableTv)

  const billers = useMemo(() => {
    if (!allPlans) return []
    const seen = new Set<string>()
    return allPlans
      .filter((p) => p.network_operator && !seen.has(p.network_operator) && seen.add(p.network_operator!))
      .map((p) => p.network_operator as string)
  }, [allPlans])

  const billerPlans = useMemo(
    () => (allPlans ?? []).filter((p) => p.network_operator === selectedBiller),
    [allPlans, selectedBiller]
  )

  const selectedPlan = billerPlans.find((p) => p.id === selectedPlanId)

  const verifyMutation = useMutation({
    mutationFn: () =>
      transactionsApi.verifyCable({
        smartcard_number: smartcard.trim(),
        biller_code:      selectedBiller,
      }),
    onSuccess: (data) => {
      setVerifyResult(data)
      if (!data.success) {
        setErrors((e) => ({ ...e, smartcard: data.message || 'Decoder verification failed' }))
      } else {
        setErrors((e) => ({ ...e, smartcard: '' }))
      }
    },
    onError: (err: Error) => {
      setErrors((e) => ({ ...e, smartcard: err.message || 'Verification failed — please try again' }))
    },
  })

  const handleVerify = () => {
    if (!smartcard.trim()) { setErrors((e) => ({ ...e, smartcard: 'Enter your smartcard / IUC number' })); return }
    setVerifyResult(null)
    setSelectedPlanId('')
    verifyMutation.mutate()
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (!verifyResult?.success)     errs.smartcard = 'Verify your decoder first'
    if (!selectedPlanId)            errs.plan      = 'Select a package'
    if (selectedPlan && balance && selectedPlan.selling_price > balance.balance)
                                    errs.plan      = 'Insufficient balance'
    if (Object.keys(errs).length) { setErrors(errs); return }

    purchase.requestConfirm({
      smartcard_number:       smartcard.trim(),
      variation_code:         selectedPlan!.variation_code,
      phone:                  phone.trim() || undefined,
      verified_customer_name: verifyResult?.customer_name || undefined,
    })
  }

  const handleBillerChange = (code: string) => {
    setSelectedBiller(code)
    setSmartcard('')
    setVerifyResult(null)
    setSelectedPlanId('')
    setErrors({})
  }

  return (
    <div className="space-y-4 pt-2 pb-4 lg:max-w-2xl lg:mx-auto">
      {/* Back */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Services
      </button>

      {/* Page header */}
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-full bg-purple-100 border-2 border-purple-300/50 flex items-center justify-center shrink-0">
          <Tv className="h-6 w-6 text-purple-600" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-ink">Cable TV</h1>
          {balance && (
            <p className="text-xs text-ink-faint">Wallet: {fmtCurrency(balance.balance)}</p>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">

        {/* Step 1 — Provider */}
        <div className="bg-surface-1 rounded-3xl p-5 shadow-card">
          <p className="text-sm font-bold text-ink mb-3">Select Provider</p>
          {plansLoading ? (
            <div className="flex gap-2">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="flex-1 h-10 rounded-2xl" />)}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {billers.map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => handleBillerChange(code)}
                  className={cn(
                    'px-5 py-2.5 rounded-2xl text-xs font-bold border-2 transition-all',
                    selectedBiller === code
                      ? 'border-brand-600 bg-brand-600 text-white shadow-brand'
                      : 'border-border text-ink-muted bg-surface-0 hover:border-brand-400 hover:text-brand-600'
                  )}
                >
                  {fmtProvider(code)}
                </button>
              ))}
            </div>
          )}
          {errors.provider && <p className="mt-2 text-xs text-danger">{errors.provider}</p>}
        </div>

        {/* Step 2 — Smartcard + verify */}
        {selectedBiller && (
          <div className="bg-surface-1 rounded-3xl p-5 shadow-card space-y-3">
            <p className="text-sm font-bold text-ink">Decoder Details</p>

            <div className="flex gap-2 items-start">
              <div className="flex-1">
                <Input
                  label="Smartcard / IUC Number"
                  type="text"
                  inputMode="numeric"
                  value={smartcard}
                  onChange={(e) => {
                    setSmartcard(e.target.value)
                    setVerifyResult(null)
                    setSelectedPlanId('')
                    setErrors((err) => ({ ...err, smartcard: '' }))
                  }}
                  placeholder="Enter smartcard number"
                  error={errors.smartcard}
                />
              </div>
              {!verifyResult?.success && (
                <button
                  type="button"
                  onClick={handleVerify}
                  disabled={!smartcard.trim() || verifyMutation.isPending}
                  className="mt-6 shrink-0 h-10 px-4 rounded-2xl bg-brand-600 text-white text-xs font-bold shadow-brand hover:bg-brand-700 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  {verifyMutation.isPending
                    ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking</>
                    : 'Verify'}
                </button>
              )}
            </div>

            {verifyResult?.success && (
              <div className="flex items-start gap-3 rounded-2xl bg-brand-50 dark:bg-brand-900/30 border border-brand-200 dark:border-brand-700 px-4 py-3">
                <CheckCircle2 className="h-5 w-5 text-brand-600 dark:text-brand-400 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-semibold text-brand-700 dark:text-brand-300">Decoder Verified</p>
                  <p className="text-ink mt-0.5">{verifyResult.customer_name}</p>
                  {verifyResult.current_package && (
                    <p className="text-ink-faint text-xs mt-0.5">
                      Current: {verifyResult.current_package}
                      {verifyResult.due_date && ` · Due ${verifyResult.due_date}`}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 3 — Package selection */}
        {verifyResult?.success && (
          <div className="bg-surface-1 rounded-3xl p-5 shadow-card space-y-3">
            <p className="text-sm font-bold text-ink">Select Package</p>
            {billerPlans.length ? (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-0.5">
                {billerPlans.map((plan) => (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => { setSelectedPlanId(plan.id); setErrors((e) => ({ ...e, plan: '' })) }}
                    className={cn(
                      'w-full px-4 py-3 rounded-2xl border-2 flex items-center justify-between transition-all',
                      selectedPlanId === plan.id
                        ? 'border-brand-600 bg-brand-50 shadow-brand'
                        : 'border-border hover:border-brand-300 bg-surface-0'
                    )}
                  >
                    <div className="text-left">
                      <p className="text-sm font-semibold text-ink">{plan.name}</p>
                      {plan.plan_category && (
                        <p className="text-xs text-ink-faint capitalize mt-0.5">{plan.plan_category}</p>
                      )}
                    </div>
                    <p className={cn(
                      'text-sm font-bold shrink-0 ml-2',
                      selectedPlanId === plan.id ? 'text-brand-600' : 'text-ink-muted'
                    )}>
                      {fmtCurrency(plan.selling_price)}
                    </p>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink-muted text-center py-4">
                No packages found for {fmtProvider(selectedBiller)}.
              </p>
            )}
            {errors.plan && <p className="mt-1 text-xs text-danger">{errors.plan}</p>}
          </div>
        )}

        {/* Step 4 — Phone + Payment source + submit */}
        {verifyResult?.success && selectedPlanId && (
          <div className="bg-surface-1 rounded-3xl p-5 shadow-card space-y-4">
            <Input
              label="Phone Number (optional)"
              type="tel"
              inputMode="numeric"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 08012345678"
            />

            <div>
              <p className="text-xs text-ink-faint mb-3">Payment Source</p>
              <div className="flex items-center justify-between px-4 py-3 rounded-2xl bg-surface-0 border border-border">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-purple-100 flex items-center justify-center">
                    <Tv className="h-4 w-4 text-purple-600" />
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
          { label: 'Provider',  value: fmtProvider(selectedBiller) },
          { label: 'Customer',  value: verifyResult?.customer_name ?? '—' },
          { label: 'Smartcard', value: smartcard.trim() },
          { label: 'Package',   value: selectedPlan?.name ?? '—' },
          ...(phone.trim() ? [{ label: 'Phone', value: phone.trim() }] : []),
          { label: 'Amount',    value: fmtCurrency(selectedPlan?.selling_price ?? 0) },
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
