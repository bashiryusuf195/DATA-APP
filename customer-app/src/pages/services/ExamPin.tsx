import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, ArrowLeft } from 'lucide-react'
import { Button, Input, Card, Skeleton } from '@/components/ui'
import { ConfirmModal }  from '@/components/shared/ConfirmModal'
import { PinEntryModal } from '@/components/shared/PinEntryModal'
import { ResultModal }   from '@/components/shared/ResultModal'
import { useServicePurchase } from '@/hooks/useServicePurchase'
import { useWalletBalance } from '@/hooks/useWallet'
import { useServicePlans } from '@/hooks/useServices'
import { transactionsApi } from '@/api/transactions.api'
import { fmtCurrency } from '@/utils/format'
import type { ExamPinPurchaseInput } from '@/types'
import { cn } from '@/utils/cn'

export function ExamPinPage() {
  const navigate = useNavigate()
  const [phone, setPhone]   = useState('')
  const [planId, setPlanId] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const { data: balance } = useWalletBalance()
  const { data: plans, isLoading: plansLoading } = useServicePlans('exam_pin', true)
  const purchase = useServicePurchase<ExamPinPurchaseInput>(transactionsApi.buyExamPin)

  const selectedPlan = plans?.find((p) => p.id === planId)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (!planId)        errs.plan  = 'Select an exam type'
    if (!phone.trim() || !/^0\d{10}$/.test(phone.trim())) errs.phone = 'Enter a valid 11-digit phone number'
    if (selectedPlan && balance && selectedPlan.selling_price > balance.balance) errs.plan = 'Insufficient balance'
    if (Object.keys(errs).length) { setErrors(errs); return }
    purchase.requestConfirm({
      phone:          phone.trim(),
      amount:         selectedPlan!.selling_price,
      variation_code: selectedPlan!.variation_code,
      description:    `${selectedPlan!.name} PIN for ${phone}`,
      plan: { plan_id: selectedPlan!.id, variation_code: selectedPlan!.variation_code, plan_name: selectedPlan!.name, service_slug: 'exam_pin', service_name: 'Exam PIN' },
    })
  }

  return (
    <div className="space-y-4 pt-2">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"><ArrowLeft className="h-4 w-4" /> Services</button>
      <Card>
        <div className="flex items-center gap-2.5 mb-5">
          <div className="h-10 w-10 rounded-xl bg-rose-50 flex items-center justify-center"><FileText className="h-5 w-5 text-rose-600" /></div>
          <div>
            <p className="text-base font-semibold text-ink">Exam PIN</p>
            {balance && <p className="text-xs text-ink-muted">Balance: {fmtCurrency(balance.balance)}</p>}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <p className="text-sm font-medium text-ink mb-2">Select Exam Type</p>
            {plansLoading ? (
              <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
            ) : plans?.length ? (
              <div className="space-y-2">
                {plans.map((plan) => (
                  <button key={plan.id} type="button"
                    onClick={() => { setPlanId(plan.id); setErrors((e) => ({ ...e, plan: '' })) }}
                    className={cn('w-full p-3 rounded-xl border-2 flex items-center justify-between transition-all',
                      planId === plan.id ? 'border-brand-600 bg-brand-50' : 'border-border hover:border-brand-300'
                    )}
                  >
                    <p className="text-sm text-ink text-left">{plan.name}</p>
                    <p className="text-sm font-bold text-brand-600 shrink-0 ml-2">{fmtCurrency(plan.selling_price)}</p>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink-muted text-center py-4">No exam plans available at this time.</p>
            )}
            {errors.plan && <p className="mt-1.5 text-xs text-danger">{errors.plan}</p>}
          </div>

          <Input label="Phone Number" type="tel" inputMode="numeric" value={phone}
            onChange={(e) => { setPhone(e.target.value); setErrors((err) => ({ ...err, phone: '' })) }}
            placeholder="08012345678" maxLength={11} error={errors.phone}
          />

          <Button type="submit" fullWidth size="lg">Continue</Button>
        </form>
      </Card>

      <ConfirmModal
        open={purchase.phase === 'confirm'}
        rows={[
          { label: 'Exam',   value: selectedPlan?.name ?? '' },
          { label: 'Phone',  value: phone },
          { label: 'Amount', value: fmtCurrency(selectedPlan?.selling_price ?? 0) },
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
      <ResultModal open={purchase.phase === 'done'} transaction={purchase.result} isPolling={purchase.isPolling} onClose={purchase.reset} onRetry={purchase.reset} />
    </div>
  )
}
