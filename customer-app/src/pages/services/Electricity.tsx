import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Zap, ArrowLeft } from 'lucide-react'
import { Button, Input, Card, Skeleton } from '@/components/ui'
import { AmountInput } from '@/components/shared/AmountInput'
import { ConfirmModal } from '@/components/shared/ConfirmModal'
import { ResultModal } from '@/components/shared/ResultModal'
import { useServicePurchase } from '@/hooks/useServicePurchase'
import { useWalletBalance } from '@/hooks/useWallet'
import { useServicePlans } from '@/hooks/useServices'
import { transactionsApi } from '@/api/transactions.api'
import { fmtCurrency } from '@/utils/format'
import type { ElectricityPurchaseInput } from '@/types'
import { cn } from '@/utils/cn'

export function ElectricityPage() {
  const navigate = useNavigate()
  const [discoCode, setDiscoCode] = useState('')
  const [meter, setMeter]         = useState('')
  const [amount, setAmount]       = useState('')
  const [errors, setErrors]       = useState<Record<string, string>>({})

  const { data: balance } = useWalletBalance()
  const { data: allPlans, isLoading: plansLoading } = useServicePlans('electricity', true)
  const purchase = useServicePurchase<ElectricityPurchaseInput>(transactionsApi.buyElectricity)

  const discos = useMemo(() => {
    if (!allPlans) return []
    const seen = new Set<string>()
    return allPlans.filter((p) => {
      if (seen.has(p.variation_code)) return false
      seen.add(p.variation_code)
      return true
    })
  }, [allPlans])

  const selectedDisco = discos.find((d) => d.variation_code === discoCode)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (!discoCode)                 errs.disco  = 'Select a disco'
    if (!meter.trim())              errs.meter  = 'Enter your meter number'
    const amt = parseFloat(amount)
    if (!amt || amt < 1000)         errs.amount = 'Minimum is ₦1,000'
    if (balance && amt > balance.balance) errs.amount = 'Insufficient balance'
    if (Object.keys(errs).length) { setErrors(errs); return }
    purchase.requestConfirm({
      meter_number:   meter.trim(),
      amount:         amt,
      variation_code: discoCode,
      description:    `${selectedDisco?.name ?? discoCode} electricity — ${meter}`,
    })
  }

  return (
    <div className="space-y-4 pt-2">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Services
      </button>

      <Card>
        <div className="flex items-center gap-2.5 mb-5">
          <div className="h-10 w-10 rounded-xl bg-amber-50 flex items-center justify-center">
            <Zap className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <p className="text-base font-semibold text-ink">Pay Electricity</p>
            {balance && <p className="text-xs text-ink-muted">Balance: {fmtCurrency(balance.balance)}</p>}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <p className="text-sm font-medium text-ink mb-2">Select Disco</p>
            {plansLoading ? (
              <div className="grid grid-cols-2 gap-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-11 rounded-xl" />)}</div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {discos.map((disco) => (
                  <button key={disco.variation_code} type="button"
                    onClick={() => { setDiscoCode(disco.variation_code); setErrors((e) => ({ ...e, disco: '' })) }}
                    className={cn('py-2.5 px-3 rounded-xl text-xs font-medium border-2 transition-all text-left',
                      discoCode === disco.variation_code ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-border text-ink-muted hover:border-brand-300'
                    )}
                  >
                    {disco.name}
                  </button>
                ))}
              </div>
            )}
            {errors.disco && <p className="mt-1.5 text-xs text-danger">{errors.disco}</p>}
          </div>

          <Input label="Meter Number" type="text" inputMode="numeric" value={meter}
            onChange={(e) => { setMeter(e.target.value); setErrors((err) => ({ ...err, meter: '' })) }}
            placeholder="e.g. 12345678901" error={errors.meter}
          />

          <AmountInput value={amount} onChange={(v) => { setAmount(v); setErrors((err) => ({ ...err, amount: '' })) }}
            error={errors.amount} quickAmounts={[1000, 2000, 5000, 10000, 20000, 50000]}
          />

          <Button type="submit" fullWidth size="lg">Continue</Button>
        </form>
      </Card>

      <ConfirmModal
        open={purchase.phase === 'confirm' || purchase.phase === 'submitting'}
        rows={[
          { label: 'Disco',  value: selectedDisco?.name ?? discoCode },
          { label: 'Meter',  value: meter },
          { label: 'Amount', value: fmtCurrency(parseFloat(amount) || 0) },
        ]}
        onConfirm={purchase.confirm} onCancel={purchase.cancel} loading={purchase.isLoading}
      />

      <ResultModal open={purchase.phase === 'done'} transaction={purchase.result} isPolling={purchase.isPolling} onClose={purchase.reset} onRetry={purchase.reset} />
    </div>
  )
}
