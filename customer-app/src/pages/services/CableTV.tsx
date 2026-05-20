import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Tv, ArrowLeft } from 'lucide-react'
import { Button, Input, Card, Skeleton } from '@/components/ui'
import { ConfirmModal } from '@/components/shared/ConfirmModal'
import { ResultModal } from '@/components/shared/ResultModal'
import { useServicePurchase } from '@/hooks/useServicePurchase'
import { useWalletBalance } from '@/hooks/useWallet'
import { useServicePlans } from '@/hooks/useServices'
import { transactionsApi } from '@/api/transactions.api'
import { fmtCurrency } from '@/utils/format'
import type { CableTvPurchaseInput } from '@/types'
import { cn } from '@/utils/cn'

const PROVIDERS = [
  { code: 'dstv',      label: 'DSTV' },
  { code: 'gotv',      label: 'GOtv' },
  { code: 'startimes', label: 'StarTimes' },
]

export function CableTvPage() {
  const navigate = useNavigate()
  const [provider, setProvider]     = useState('')
  const [smartcard, setSmartcard]   = useState('')
  const [planId, setPlanId]         = useState('')
  const [errors, setErrors]         = useState<Record<string, string>>({})

  const { data: balance } = useWalletBalance()
  const { data: allPlans, isLoading: plansLoading } = useServicePlans('cable_tv', true)
  const purchase = useServicePurchase<CableTvPurchaseInput>(transactionsApi.buyCableTv)

  const filteredPlans = useMemo(() => {
    if (!allPlans || !provider) return []
    return allPlans.filter((p) => (p.network_operator ?? '').toLowerCase().includes(provider))
  }, [allPlans, provider])

  const selectedPlan = filteredPlans.find((p) => p.id === planId)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (!provider)       errs.provider   = 'Select a provider'
    if (!smartcard.trim()) errs.smartcard = 'Enter your smartcard/IUC number'
    if (!planId)         errs.plan       = 'Select a package'
    if (selectedPlan && balance && selectedPlan.selling_price > balance.balance) errs.plan = 'Insufficient balance'
    if (Object.keys(errs).length) { setErrors(errs); return }
    purchase.requestConfirm({
      smartcard_number: smartcard.trim(),
      amount:           selectedPlan!.selling_price,
      variation_code:   selectedPlan!.variation_code,
      description:      `${selectedPlan!.name} for ${smartcard}`,
      plan: { plan_id: selectedPlan!.id, variation_code: selectedPlan!.variation_code, plan_name: selectedPlan!.name, service_slug: 'cable_tv', service_name: 'Cable TV' },
    })
  }

  return (
    <div className="space-y-4 pt-2">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"><ArrowLeft className="h-4 w-4" /> Services</button>
      <Card>
        <div className="flex items-center gap-2.5 mb-5">
          <div className="h-10 w-10 rounded-xl bg-purple-50 flex items-center justify-center"><Tv className="h-5 w-5 text-purple-600" /></div>
          <div>
            <p className="text-base font-semibold text-ink">Cable TV</p>
            {balance && <p className="text-xs text-ink-muted">Balance: {fmtCurrency(balance.balance)}</p>}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <p className="text-sm font-medium text-ink mb-2">Select Provider</p>
            <div className="flex gap-2">
              {PROVIDERS.map(({ code, label }) => (
                <button key={code} type="button"
                  onClick={() => { setProvider(code); setPlanId(''); setErrors((e) => ({ ...e, provider: '' })) }}
                  className={cn('flex-1 py-2.5 rounded-xl text-xs font-semibold border-2 transition-all',
                    provider === code ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-border text-ink-muted hover:border-brand-300'
                  )}
                >{label}</button>
              ))}
            </div>
            {errors.provider && <p className="mt-1.5 text-xs text-danger">{errors.provider}</p>}
          </div>

          <Input label="Smartcard / IUC Number" type="text" inputMode="numeric" value={smartcard}
            onChange={(e) => { setSmartcard(e.target.value); setErrors((err) => ({ ...err, smartcard: '' })) }}
            placeholder="Enter smartcard number" error={errors.smartcard}
          />

          {provider && (
            <div>
              <p className="text-sm font-medium text-ink mb-2">Select Package</p>
              {plansLoading ? (
                <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
              ) : filteredPlans.length ? (
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {filteredPlans.map((plan) => (
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
                <p className="text-sm text-ink-muted text-center py-4">No packages available.</p>
              )}
              {errors.plan && <p className="mt-1.5 text-xs text-danger">{errors.plan}</p>}
            </div>
          )}

          <Button type="submit" fullWidth size="lg">Continue</Button>
        </form>
      </Card>

      <ConfirmModal open={purchase.phase === 'confirm' || purchase.phase === 'submitting'}
        rows={[
          { label: 'Provider',   value: PROVIDERS.find((p) => p.code === provider)?.label ?? provider },
          { label: 'Smartcard',  value: smartcard },
          { label: 'Package',    value: selectedPlan?.name ?? '' },
          { label: 'Amount',     value: fmtCurrency(selectedPlan?.selling_price ?? 0) },
        ]}
        onConfirm={purchase.confirm} onCancel={purchase.cancel} loading={purchase.isLoading}
      />
      <ResultModal open={purchase.phase === 'done'} transaction={purchase.result} isPolling={purchase.isPolling} onClose={purchase.reset} onRetry={purchase.reset} />
    </div>
  )
}
