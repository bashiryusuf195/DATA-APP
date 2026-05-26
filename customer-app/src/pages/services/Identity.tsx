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
import type { IdentityVerificationInput, ServicePlan } from '@/types'
import { cn } from '@/utils/cn'

// ── Helpers ───────────────────────────────────────────────────────────────────

const PLAN_DESCRIPTIONS: Record<string, string> = {
  'nin-information': 'Name, date of birth, gender',
  'nin-standard':    'NIN details + address + photo',
  'nin-premium':     'Full NIN record with downloadable PDF',
  'bvn-basic':       'Name, date of birth, linked bank details',
}

function isNin(plan: ServicePlan | undefined) {
  return plan?.network_operator === 'nin'
}

function isBvn(plan: ServicePlan | undefined) {
  return plan?.network_operator === 'bvn'
}

// ── PlanGroup ─────────────────────────────────────────────────────────────────

function PlanGroup({
  label, plans, selectedId, onSelect,
}: {
  label:      string
  plans:      ServicePlan[]
  selectedId: string
  onSelect:   (id: string) => void
}) {
  if (!plans.length) return null
  return (
    <div>
      <p className="text-xs font-semibold text-ink-faint uppercase tracking-wide mb-2">{label}</p>
      <div className="space-y-2">
        {plans.map((plan) => (
          <button
            key={plan.id}
            type="button"
            onClick={() => onSelect(plan.id)}
            className={cn(
              'w-full p-3 rounded-xl border-2 flex items-center justify-between transition-all text-left',
              selectedId === plan.id
                ? 'border-brand-600 bg-brand-50'
                : 'border-border hover:border-brand-300',
            )}
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">{plan.name}</p>
              {PLAN_DESCRIPTIONS[plan.variation_code] && (
                <p className="text-xs text-ink-muted mt-0.5">
                  {PLAN_DESCRIPTIONS[plan.variation_code]}
                </p>
              )}
            </div>
            <p className="text-sm font-bold text-brand-600 shrink-0 ml-3">
              {fmtCurrency(plan.selling_price)}
            </p>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function IdentityPage() {
  const navigate = useNavigate()

  const [planId,   setPlanId]   = useState('')
  const [idNumber, setIdNumber] = useState('')   // NIN or BVN number
  const [phone,    setPhone]    = useState('')   // NIN-by-phone alternative (NIN only)
  const [errors,   setErrors]   = useState<Record<string, string>>({})

  const { data: balance }                        = useWalletBalance()
  const { data: plans, isLoading: plansLoading } = useServicePlans('identity_verification', true)
  const purchase = useServicePurchase<IdentityVerificationInput>(transactionsApi.verifyIdentity)

  const selectedPlan = plans?.find((p) => p.id === planId)
  const ninPlans     = plans?.filter((p) => p.network_operator === 'nin') ?? []
  const bvnPlans     = plans?.filter((p) => p.network_operator === 'bvn') ?? []
  const otherPlans   = plans?.filter(
    (p) => p.network_operator !== 'nin' && p.network_operator !== 'bvn'
  ) ?? []

  function handleSelectPlan(id: string) {
    setPlanId(id)
    // Clear identifier fields when plan type changes to avoid cross-contamination.
    setIdNumber('')
    setPhone('')
    setErrors({})
  }

  function validate(): boolean {
    const errs: Record<string, string> = {}

    if (!planId) {
      errs.plan = 'Select a verification type'
    } else if (selectedPlan && balance && selectedPlan.selling_price > balance.balance) {
      errs.plan = 'Insufficient balance'
    }

    if (isBvn(selectedPlan)) {
      // BVN: must supply the 11-digit BVN number; phone lookup not supported.
      if (!idNumber || !/^\d{10,11}$/.test(idNumber)) {
        errs.id_number = 'Enter your valid 11-digit BVN number'
      }
    } else if (isNin(selectedPlan)) {
      // NIN: either the 11-digit NIN number or a registered phone number is required.
      const hasNin   = idNumber && /^\d{10,11}$/.test(idNumber)
      const hasPhone = phone && /^(\+?234|0)[789]\d{8}$/.test(phone)
      if (!hasNin && !hasPhone) {
        errs.id_number = 'Enter your NIN number or registered phone number'
      }
    }

    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate() || !selectedPlan) return

    purchase.requestConfirm({
      id_number:      idNumber || undefined,
      phone:          phone    || undefined,
      amount:         selectedPlan.selling_price,
      variation_code: selectedPlan.variation_code,
      description:    `${selectedPlan.name} verification`,
    })
  }

  // Labels adapt to selected plan type.
  const idFieldLabel = isBvn(selectedPlan)
    ? 'BVN Number'
    : isNin(selectedPlan)
    ? 'NIN Number'
    : 'NIN / BVN Number'

  const idFieldHint = isBvn(selectedPlan)
    ? '11-digit Bank Verification Number'
    : 'Your 11-digit National Identification Number'

  const idFieldPlaceholder = '12345678901'

  const confirmRows = [
    { label: 'Service', value: selectedPlan?.name ?? '' },
    { label: 'Amount',  value: fmtCurrency(selectedPlan?.selling_price ?? 0) },
    // Never show raw NIN/BVN in the confirm modal — show masked version.
    ...(idNumber ? [{ label: isBvn(selectedPlan) ? 'BVN' : 'NIN', value: `${idNumber.slice(0, 3)}****${idNumber.slice(-2)}` }] : []),
    ...(phone    ? [{ label: 'Phone', value: phone }] : []),
  ]

  return (
    <div className="space-y-4 pt-2">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" /> Services
      </button>

      <Card>
        <div className="flex items-center gap-2.5 mb-5">
          <div className="h-10 w-10 rounded-xl bg-indigo-50 flex items-center justify-center">
            <ShieldCheck className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <p className="text-base font-semibold text-ink">Identity Verification</p>
            {balance && (
              <p className="text-xs text-ink-muted">Balance: {fmtCurrency(balance.balance)}</p>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Plan selection */}
          <div>
            <p className="text-sm font-medium text-ink mb-3">Select Verification Type</p>
            {plansLoading ? (
              <div className="space-y-2">
                {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
              </div>
            ) : plans?.length ? (
              <div className="space-y-4">
                <PlanGroup label="NIN Verification" plans={ninPlans} selectedId={planId} onSelect={handleSelectPlan} />
                <PlanGroup label="BVN Verification" plans={bvnPlans} selectedId={planId} onSelect={handleSelectPlan} />
                <PlanGroup label="Other"             plans={otherPlans} selectedId={planId} onSelect={handleSelectPlan} />
              </div>
            ) : (
              <p className="text-sm text-ink-muted text-center py-4">No verification services available.</p>
            )}
            {errors.plan && <p className="mt-1.5 text-xs text-danger">{errors.plan}</p>}
          </div>

          {/* Identifier fields — only shown once a plan is selected */}
          {selectedPlan && (
            <>
              <Input
                label={idFieldLabel}
                type="text"
                inputMode="numeric"
                value={idNumber}
                onChange={(e) => { setIdNumber(e.target.value); setErrors((p) => ({ ...p, id_number: '' })) }}
                placeholder={idFieldPlaceholder}
                maxLength={11}
                hint={idFieldHint}
                error={errors.id_number}
              />

              {/* Phone alternative — NIN only; not shown for BVN */}
              {isNin(selectedPlan) && (
                <Input
                  label="Phone Number (alternative)"
                  type="tel"
                  inputMode="numeric"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="08012345678"
                  maxLength={11}
                  hint="If you don't have your NIN handy, enter the phone number registered with NIMC"
                />
              )}
            </>
          )}

          <Button type="submit" fullWidth size="lg" disabled={!planId}>
            Continue
          </Button>
        </form>
      </Card>

      <ConfirmModal
        open={purchase.phase === 'confirm' || purchase.phase === 'submitting'}
        rows={confirmRows}
        onConfirm={purchase.confirm}
        onCancel={purchase.cancel}
        loading={purchase.isLoading}
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
