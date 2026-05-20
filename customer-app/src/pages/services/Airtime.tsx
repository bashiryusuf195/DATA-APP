import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Phone, ArrowLeft } from 'lucide-react'
import { Button, Input, Card } from '@/components/ui'
import { AmountInput } from '@/components/shared/AmountInput'
import { ConfirmModal } from '@/components/shared/ConfirmModal'
import { ResultModal } from '@/components/shared/ResultModal'
import { useServicePurchase } from '@/hooks/useServicePurchase'
import { useWalletBalance } from '@/hooks/useWallet'
import { transactionsApi } from '@/api/transactions.api'
import { fmtCurrency } from '@/utils/format'
import type { AirtimePurchaseInput } from '@/types'

const OPERATORS = [
  { code: 'mtn',     label: 'MTN',    color: 'bg-yellow-50 border-yellow-200 text-yellow-800' },
  { code: 'airtel',  label: 'Airtel', color: 'bg-red-50 border-red-200 text-red-800' },
  { code: 'glo',     label: 'Glo',    color: 'bg-green-50 border-green-200 text-green-800' },
  { code: '9mobile', label: '9mobile',color: 'bg-emerald-50 border-emerald-200 text-emerald-800' },
]

export function AirtimePage() {
  const navigate = useNavigate()
  const [operator, setOperator] = useState('')
  const [phone, setPhone]       = useState('')
  const [amount, setAmount]     = useState('')
  const [errors, setErrors]     = useState<Record<string, string>>({})

  const { data: balance } = useWalletBalance()
  const purchase = useServicePurchase<AirtimePurchaseInput>(transactionsApi.buyAirtime)

  const validate = () => {
    const e: Record<string, string> = {}
    if (!operator)           e.operator = 'Select a network'
    if (!phone.trim() || !/^0\d{10}$/.test(phone.trim())) e.phone = 'Enter a valid 11-digit phone number'
    const amt = parseFloat(amount)
    if (!amt || amt < 50)    e.amount = 'Minimum is ₦50'
    if (amt > 50_000)        e.amount = 'Maximum is ₦50,000'
    if (balance && amt > balance.balance) e.amount = 'Insufficient wallet balance'
    return e
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    const amt = parseFloat(amount)
    purchase.requestConfirm({
      phone:          phone.trim(),
      amount:         amt,
      variation_code: `${operator}-airtime`,
      description:    `${OPERATORS.find((o) => o.code === operator)?.label ?? operator} Airtime — ${phone}`,
    })
  }

  return (
    <div className="space-y-4 pt-2">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Services
      </button>

      <Card>
        <div className="flex items-center gap-2.5 mb-5">
          <div className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center">
            <Phone className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-base font-semibold text-ink">Buy Airtime</p>
            {balance && <p className="text-xs text-ink-muted">Balance: {fmtCurrency(balance.balance)}</p>}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Operator */}
          <div>
            <p className="text-sm font-medium text-ink mb-2">Select Network</p>
            <div className="grid grid-cols-4 gap-2">
              {OPERATORS.map(({ code, label, color }) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => { setOperator(code); setErrors((e) => ({ ...e, operator: '' })) }}
                  className={`py-2.5 rounded-xl text-xs font-semibold border-2 transition-all ${
                    operator === code ? color + ' border-current shadow-sm' : 'border-border text-ink-muted hover:border-brand-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {errors.operator && <p className="mt-1.5 text-xs text-danger">{errors.operator}</p>}
          </div>

          <Input
            label="Phone Number"
            type="tel"
            inputMode="numeric"
            value={phone}
            onChange={(e) => { setPhone(e.target.value); setErrors((err) => ({ ...err, phone: '' })) }}
            placeholder="08012345678"
            maxLength={11}
            error={errors.phone}
            prefix={<Phone className="h-4 w-4" />}
          />

          <AmountInput
            value={amount}
            onChange={(v) => { setAmount(v); setErrors((err) => ({ ...err, amount: '' })) }}
            error={errors.amount}
            quickAmounts={[100, 200, 500, 1000, 2000, 5000]}
          />

          <Button type="submit" fullWidth size="lg">Continue</Button>
        </form>
      </Card>

      <ConfirmModal
        open={purchase.phase === 'confirm'}
        rows={[
          { label: 'Network',  value: OPERATORS.find((o) => o.code === operator)?.label ?? operator },
          { label: 'Phone',    value: phone },
          { label: 'Amount',   value: fmtCurrency(parseFloat(amount) || 0) },
        ]}
        onConfirm={purchase.confirm}
        onCancel={purchase.cancel}
        loading={purchase.phase === 'submitting'}
      />

      <ResultModal
        open={purchase.phase === 'done'}
        transaction={purchase.result}
        onClose={purchase.reset}
        onRetry={purchase.reset}
      />
    </div>
  )
}
