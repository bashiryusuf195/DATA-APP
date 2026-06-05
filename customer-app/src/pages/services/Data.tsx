import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Wifi, Phone, ArrowLeft } from 'lucide-react'
import { Button, Input, Card, Skeleton } from '@/components/ui'
import { ConfirmModal }  from '@/components/shared/ConfirmModal'
import { PinEntryModal } from '@/components/shared/PinEntryModal'
import { ResultModal }   from '@/components/shared/ResultModal'
import { useServicePurchase } from '@/hooks/useServicePurchase'
import { useWalletBalance } from '@/hooks/useWallet'
import { useServicePlans } from '@/hooks/useServices'
import { transactionsApi } from '@/api/transactions.api'
import { fmtCurrency } from '@/utils/format'
import type { DataPurchaseInput } from '@/types'
import { cn } from '@/utils/cn'

// Known operator display config — unknown operators fall back to a neutral style
const NETWORK_META: Record<string, { label: string; activeClass: string }> = {
  mtn:      { label: 'MTN',     activeClass: 'border-yellow-400 bg-yellow-50 text-yellow-800' },
  airtel:   { label: 'Airtel',  activeClass: 'border-red-400   bg-red-50   text-red-800' },
  glo:      { label: 'Glo',     activeClass: 'border-green-400 bg-green-50  text-green-800' },
  '9mobile':{ label: '9mobile', activeClass: 'border-emerald-400 bg-emerald-50 text-emerald-800' },
}

function networkLabel(op: string) {
  return NETWORK_META[op]?.label ?? op
}
function networkActiveClass(op: string) {
  return NETWORK_META[op]?.activeClass ?? 'border-brand-600 bg-brand-50 text-brand-700'
}

// Formats DB category strings for display: 'sme' → 'SME', 'corporate' → 'Corporate'
const CATEGORY_UPPER = new Set(['sme', 'vtu', 'cg'])
function fmtCategory(cat: string): string {
  const lower = cat.toLowerCase()
  if (CATEGORY_UPPER.has(lower)) return lower.toUpperCase()
  return cat.charAt(0).toUpperCase() + cat.slice(1).toLowerCase()
}

export function DataPage() {
  const navigate = useNavigate()
  const [operator, setOperator] = useState('')
  const [category, setCategory] = useState('')
  const [planId, setPlanId]     = useState('')
  const [phone, setPhone]       = useState('')
  const [errors, setErrors]     = useState<Record<string, string>>({})

  const { data: balance } = useWalletBalance()
  const { data: allPlans, isLoading: plansLoading } = useServicePlans('data', true)
  const purchase = useServicePurchase<DataPurchaseInput>(transactionsApi.buyData)

  // Step 1: distinct network operators present in active plans, in DB order
  const networks = useMemo(() => {
    if (!allPlans) return []
    const seen = new Set<string>()
    return allPlans
      .filter(p => p.network_operator)
      .reduce<string[]>((acc, p) => {
        const op = p.network_operator!
        if (!seen.has(op)) { seen.add(op); acc.push(op) }
        return acc
      }, [])
  }, [allPlans])

  // Step 2: distinct plan_categories for the selected operator
  const categories = useMemo(() => {
    if (!allPlans || !operator) return []
    const seen = new Set<string>()
    return allPlans
      .filter(p => p.network_operator === operator && p.plan_category)
      .reduce<string[]>((acc, p) => {
        const cat = p.plan_category!
        if (!seen.has(cat)) { seen.add(cat); acc.push(cat) }
        return acc
      }, [])
  }, [allPlans, operator])

  // Step 3: plans for the selected operator + category
  const filteredPlans = useMemo(() => {
    if (!allPlans || !operator || !category) return []
    return allPlans.filter(
      p => p.network_operator === operator && p.plan_category === category
    )
  }, [allPlans, operator, category])

  const selectedPlan = filteredPlans.find(p => p.id === planId)

  const handleNetworkChange = (op: string) => {
    setOperator(op)
    setCategory('')
    setPlanId('')
    setErrors(e => ({ ...e, operator: '', category: '', plan: '' }))
  }

  const handleCategoryChange = (cat: string) => {
    setCategory(cat)
    setPlanId('')
    setErrors(e => ({ ...e, category: '', plan: '' }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (!operator)                                    errs.operator = 'Select a network'
    if (operator && !category)                        errs.category = 'Select a plan type'
    if (operator && category && !planId)              errs.plan     = 'Select a data plan'
    if (!phone.trim() || !/^0\d{10}$/.test(phone.trim())) errs.phone = 'Enter a valid 11-digit phone number'
    if (selectedPlan && balance && selectedPlan.selling_price > balance.balance) errs.plan = 'Insufficient balance'
    if (Object.keys(errs).length) { setErrors(errs); return }
    purchase.requestConfirm({
      phone:          phone.trim(),
      amount:         selectedPlan!.selling_price,
      variation_code: selectedPlan!.variation_code,
      description:    `${selectedPlan!.name} for ${phone}`,
      plan: {
        plan_id:        selectedPlan!.id,
        variation_code: selectedPlan!.variation_code,
        plan_name:      selectedPlan!.name,
        service_slug:   'data',
        service_name:   'Data',
      },
    })
  }

  return (
    <div className="space-y-4 pt-2 lg:max-w-2xl lg:mx-auto">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Services
      </button>

      <Card>
        {/* Header */}
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

          {/* ── Step 1: Network ── */}
          <div>
            <p className="text-sm font-medium text-ink mb-2">Select Network</p>
            {plansLoading ? (
              <div className="grid grid-cols-4 gap-2">
                {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-11 rounded-xl" />)}
              </div>
            ) : networks.length ? (
              <div className="grid grid-cols-4 gap-2">
                {networks.map(op => (
                  <button
                    key={op}
                    type="button"
                    onClick={() => handleNetworkChange(op)}
                    className={cn(
                      'py-2.5 rounded-xl text-xs font-semibold border-2 transition-all',
                      operator === op
                        ? networkActiveClass(op) + ' shadow-sm'
                        : 'border-border text-ink-muted hover:border-brand-300'
                    )}
                  >
                    {networkLabel(op)}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink-muted text-center py-3">No data networks available.</p>
            )}
            {errors.operator && <p className="mt-1.5 text-xs text-danger">{errors.operator}</p>}
          </div>

          {/* ── Step 2: Category (appears after network is chosen) ── */}
          {operator && (
            <div>
              <p className="text-sm font-medium text-ink mb-2">Plan Type</p>
              {categories.length ? (
                <div className="flex flex-wrap gap-2">
                  {categories.map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => handleCategoryChange(cat)}
                      className={cn(
                        'px-4 py-2 rounded-full text-xs font-semibold border-2 transition-all',
                        category === cat
                          ? 'border-brand-600 bg-brand-600 text-white shadow-sm'
                          : 'border-border text-ink-muted hover:border-brand-400 hover:text-ink'
                      )}
                    >
                      {fmtCategory(cat)}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-ink-muted py-1">
                  No plan types available for {networkLabel(operator)}.
                </p>
              )}
              {errors.category && <p className="mt-1.5 text-xs text-danger">{errors.category}</p>}
            </div>
          )}

          {/* ── Step 3: Plans (appears after category is chosen) ── */}
          {operator && category && (
            <div>
              <p className="text-sm font-medium text-ink mb-2">Select Plan</p>
              {filteredPlans.length ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-60 overflow-y-auto pr-0.5">
                  {filteredPlans.map(plan => (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => { setPlanId(plan.id); setErrors(e => ({ ...e, plan: '' })) }}
                      className={cn(
                        'p-3 rounded-xl border-2 text-left transition-all',
                        planId === plan.id
                          ? 'border-brand-600 bg-brand-50'
                          : 'border-border hover:border-brand-300'
                      )}
                    >
                      <p className="text-xs font-semibold text-ink leading-snug">{plan.name}</p>
                      <p className="text-sm font-bold text-brand-600 mt-1">{fmtCurrency(plan.selling_price)}</p>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-ink-muted text-center py-3">
                  No plans available for {networkLabel(operator)} {fmtCategory(category)}.
                </p>
              )}
              {errors.plan && <p className="mt-1.5 text-xs text-danger">{errors.plan}</p>}
            </div>
          )}

          {/* ── Phone number ── */}
          <Input
            label="Phone Number"
            type="tel"
            inputMode="numeric"
            value={phone}
            onChange={e => { setPhone(e.target.value); setErrors(err => ({ ...err, phone: '' })) }}
            placeholder="08012345678"
            maxLength={11}
            error={errors.phone}
            prefix={<Phone className="h-4 w-4" />}
          />

          <Button
            type="submit"
            fullWidth
            size="lg"
            disabled={!operator || !category || !planId || !phone}
          >
            Continue
          </Button>
        </form>
      </Card>

      <ConfirmModal
        open={purchase.phase === 'confirm'}
        rows={[
          { label: 'Network',   value: networkLabel(operator) },
          { label: 'Plan Type', value: fmtCategory(category) },
          { label: 'Plan',      value: selectedPlan?.name ?? '' },
          { label: 'Phone',     value: phone },
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
