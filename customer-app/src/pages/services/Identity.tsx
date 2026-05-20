import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldCheck, ArrowLeft } from 'lucide-react'
import { Button, Input, Card, Skeleton } from '@/components/ui'
import { ConfirmModal } from '@/components/shared/ConfirmModal'
import { ResultModal } from '@/components/shared/ResultModal'
import { useServicePurchase } from '@/hooks/useServicePurchase'
import { useWalletBalance } from '@/hooks/useWallet'
import { useServicePlans } from '@/hooks/useServices'
import { transactionsApi } from '@/api/transactions.api'
import { fmtCurrency } from '@/utils/format'
import type { IdentityVerificationInput } from '@/types'
import { cn } from '@/utils/cn'

export function IdentityPage() {
  const navigate = useNavigate()
  const [phone, setPhone]   = useState('')
  const [planId, setPlanId] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const { data: balance } = useWalletBalance()
  const { data: plans, isLoading: plansLoading } = useServicePlans('identity_verification', true)
  const purchase = useServicePurchase<IdentityVerificationInput>(transactionsApi.verifyIdentity)

  const selectedPlan = plans?.find((p) => p.id === planId)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (!planId)        errs.plan  = 'Select a verification type'
    if (selectedPlan && balance && selectedPlan.selling_price > balance.balance) errs.plan = 'Insufficient balance'
    if (Object.keys(errs).length) { setErrors(errs); return }
    purchase.requestConfirm({
      phone:          phone || undefined,
      amount:         selectedPlan!.selling_price,
      variation_code: selectedPlan!.variation_code,
      description:    `${selectedPlan!.name} verification`,
    })
  }

  return (
    <div className="space-y-4 pt-2">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"><ArrowLeft className="h-4 w-4" /> Services</button>
      <Card>
        <div className="flex items-center gap-2.5 mb-5">
          <div className="h-10 w-10 rounded-xl bg-indigo-50 flex items-center justify-center"><ShieldCheck className="h-5 w-5 text-indigo-600" /></div>
          <div>
            <p className="text-base font-semibold text-ink">Identity Verification</p>
            {balance && <p className="text-xs text-ink-muted">Balance: {fmtCurrency(balance.balance)}</p>}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <p className="text-sm font-medium text-ink mb-2">Verification Type</p>
            {plansLoading ? (
              <div className="space-y-2">{[...Array(2)].map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
            ) : plans?.length ? (
              <div className="space-y-2">
                {plans.map((plan) => (
                  <button key={plan.id} type="button"
                    onClick={() => { setPlanId(plan.id); setErrors((e) => ({ ...e, plan: '' })) }}
                    className={cn('w-full p-3 rounded-xl border-2 flex items-center justify-between transition-all',
                      planId === plan.id ? 'border-brand-600 bg-brand-50' : 'border-border hover:border-brand-300'
                    )}
                  >
                    <div className="text-left">
                      <p className="text-sm font-medium text-ink">{plan.name}</p>
                      {plan.description && <p className="text-xs text-ink-muted mt-0.5">{plan.description}</p>}
                    </div>
                    <p className="text-sm font-bold text-brand-600 shrink-0 ml-2">{fmtCurrency(plan.selling_price)}</p>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink-muted text-center py-4">No verification services available.</p>
            )}
            {errors.plan && <p className="mt-1.5 text-xs text-danger">{errors.plan}</p>}
          </div>

          <Input label="Phone Number (optional)" type="tel" inputMode="numeric" value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="08012345678" maxLength={11}
            hint="Required for SMS delivery of verification result"
          />

          <Button type="submit" fullWidth size="lg" disabled={!planId}>Continue</Button>
        </form>
      </Card>

      <ConfirmModal open={purchase.phase === 'confirm'}
        rows={[
          { label: 'Service', value: selectedPlan?.name ?? '' },
          { label: 'Amount',  value: fmtCurrency(selectedPlan?.selling_price ?? 0) },
          ...(phone ? [{ label: 'Phone', value: phone }] : []),
        ]}
        onConfirm={purchase.confirm} onCancel={purchase.cancel} loading={purchase.phase === 'submitting'}
      />
      <ResultModal open={purchase.phase === 'done'} transaction={purchase.result} onClose={purchase.reset} onRetry={purchase.reset} />
    </div>
  )
}
