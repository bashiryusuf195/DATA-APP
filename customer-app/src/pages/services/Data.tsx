import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Wifi, ArrowLeft } from 'lucide-react'
import { Button, Input, Card, Skeleton } from '@/components/ui'
import { ConfirmModal } from '@/components/shared/ConfirmModal'
import { ResultModal } from '@/components/shared/ResultModal'
import { useServicePurchase } from '@/hooks/useServicePurchase'
import { useWalletBalance } from '@/hooks/useWallet'
import { useServicePlans } from '@/hooks/useServices'
import { transactionsApi } from '@/api/transactions.api'
import { fmtCurrency } from '@/utils/format'
import type { DataPurchaseInput } from '@/types'
import { cn } from '@/utils/cn'

const OPERATORS = [
  { code: 'mtn',     label: 'MTN' },
  { code: 'airtel',  label: 'Airtel' },
  { code: 'glo',     label: 'Glo' },
  { code: '9mobile', label: '9mobile' },
]

export function DataPage() {
  const navigate = useNavigate()
  const [operator, setOperator] = useState('')
  const [phone, setPhone]       = useState('')
  const [planId, setPlanId]     = useState('')
  const [errors, setErrors]     = useState<Record<string, string>>({})

  const { data: balance } = useWalletBalance()
  const { data: allPlans, isLoading: plansLoading } = useServicePlans('data', true)
  const purchase = useServicePurchase<DataPurchaseInput>(transactionsApi.buyData)

  const filteredPlans = useMemo(() => {
    if (!allPlans || !operator) return []
    return allPlans.filter((p) => (p.network_operator ?? '').toLowerCase().includes(operator))
  }, [allPlans, operator])

  const selectedPlan = filteredPlans.find((p) => p.id === planId)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (!operator)           errs.operator = 'Select a network'
    if (!phone.trim() || !/^0\d{10}$/.test(phone.trim())) errs.phone = 'Enter a valid 11-digit phone number'
    if (!planId)             errs.plan = 'Select a data plan'
    if (selectedPlan && balance && selectedPlan.selling_price > balance.balance) errs.plan = 'Insufficient balance'
    if (Object.keys(errs).length) { setErrors(errs); return }
    purchase.requestConfirm({
      phone:          phone.trim(),
      amount:         selectedPlan!.selling_price,
      variation_code: selectedPlan!.variation_code,
      description:    `${selectedPlan!.name} for ${phone}`,
      plan: { plan_id: selectedPlan!.id, variation_code: selectedPlan!.variation_code, plan_name: selectedPlan!.name, service_slug: 'data', service_name: 'Data' },
    })
  }

  return (
    <div className="space-y-4 pt-2">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Services
      </button>

      <Card>
        <div className="flex items-center gap-2.5 mb-5">
          <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center">
            <Wifi className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <p className="text-base font-semibold text-ink">Buy Data</p>
            {balance && <p className="text-xs text-ink-muted">Balance: {fmtCurrency(balance.balance)}</p>}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Operator */}
          <div>
            <p className="text-sm font-medium text-ink mb-2">Select Network</p>
            <div className="grid grid-cols-4 gap-2">
              {OPERATORS.map(({ code, label }) => (
                <button key={code} type="button"
                  onClick={() => { setOperator(code); setPlanId(''); setErrors((e) => ({ ...e, operator: '' })) }}
                  className={cn('py-2.5 rounded-xl text-xs font-semibold border-2 transition-all',
                    operator === code ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-border text-ink-muted hover:border-brand-300'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {errors.operator && <p className="mt-1.5 text-xs text-danger">{errors.operator}</p>}
          </div>

          <Input label="Phone Number" type="tel" inputMode="numeric" value={phone}
            onChange={(e) => { setPhone(e.target.value); setErrors((err) => ({ ...err, phone: '' })) }}
            placeholder="08012345678" maxLength={11} error={errors.phone} prefix={<Wifi className="h-4 w-4" />}
          />

          {/* Plans */}
          {operator && (
            <div>
              <p className="text-sm font-medium text-ink mb-2">Select Plan</p>
              {plansLoading ? (
                <div className="grid grid-cols-2 gap-2">
                  {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
                </div>
              ) : filteredPlans.length ? (
                <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                  {filteredPlans.map((plan) => (
                    <button key={plan.id} type="button"
                      onClick={() => { setPlanId(plan.id); setErrors((e) => ({ ...e, plan: '' })) }}
                      className={cn('p-3 rounded-xl border-2 text-left transition-all',
                        planId === plan.id ? 'border-brand-600 bg-brand-50' : 'border-border hover:border-brand-300'
                      )}
                    >
                      <p className="text-xs font-semibold text-ink">{plan.name}</p>
                      <p className="text-sm font-bold text-brand-600 mt-0.5">{fmtCurrency(plan.selling_price)}</p>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-ink-muted text-center py-4">No plans available for this network.</p>
              )}
              {errors.plan && <p className="mt-1.5 text-xs text-danger">{errors.plan}</p>}
            </div>
          )}

          <Button type="submit" fullWidth size="lg" disabled={!operator || !phone || !planId}>Continue</Button>
        </form>
      </Card>

      <ConfirmModal
        open={purchase.phase === 'confirm'}
        rows={[
          { label: 'Network', value: OPERATORS.find((o) => o.code === operator)?.label ?? operator },
          { label: 'Phone',   value: phone },
          { label: 'Plan',    value: selectedPlan?.name ?? '' },
          { label: 'Amount',  value: fmtCurrency(selectedPlan?.selling_price ?? 0) },
        ]}
        onConfirm={purchase.confirm}
        onCancel={purchase.cancel}
        loading={purchase.phase === 'submitting'}
      />

      <ResultModal open={purchase.phase === 'done'} transaction={purchase.result} onClose={purchase.reset} onRetry={purchase.reset} />
    </div>
  )
}
