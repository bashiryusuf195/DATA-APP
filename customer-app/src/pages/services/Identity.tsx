import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ShieldCheck, ArrowLeft, ChevronRight, ChevronLeft,
  CreditCard, Phone, FileText, Check,
} from 'lucide-react'
import { Button, Card } from '@/components/ui'
import { NumPadInput } from '@/components/shared/NumPadInput'
import { ConfirmModal }  from '@/components/shared/ConfirmModal'
import { PinEntryModal } from '@/components/shared/PinEntryModal'
import { ResultModal }   from '@/components/shared/ResultModal'
import { useServicePurchase } from '@/hooks/useServicePurchase'
import { useSecuritySettings } from '@/hooks/useSecuritySettings'
import { useWalletBalance } from '@/hooks/useWallet'
import { useServicePlans } from '@/hooks/useServices'
import { transactionsApi } from '@/api/transactions.api'
import { fmtCurrency } from '@/utils/format'
import type { IdentityVerificationInput, ServicePlan } from '@/types'
import { cn } from '@/utils/cn'

// ── Types ─────────────────────────────────────────────────────────────────────

type Category = 'nin' | 'bvn'
type Method   = 'number' | 'phone'
type Step     = 1 | 2 | 3 | 4 | 5

// ── Constants ─────────────────────────────────────────────────────────────────

const SLIP_DESCRIPTIONS: Record<string, string> = {
  'nin-information': 'Basic info — name, date of birth, gender',
  'nin-standard':    'Standard — NIN details, address',
  'nin-premium':     'Premium — full record with photo',
  'bvn-basic':       'Basic — name, date of birth, linked bank details',
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ProgressBar({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5 mb-6">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={cn(
            'h-1.5 flex-1 rounded-full transition-all duration-300',
            i + 1 <= step ? 'bg-brand-600' : 'bg-surface-elevated',
          )}
        />
      ))}
    </div>
  )
}

function OptionCard({
  label, description, icon, selected, onClick,
}: {
  label:       string
  description: string
  icon:        React.ReactNode
  selected:    boolean
  onClick:     () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition-all',
        selected
          ? 'border-brand-600 bg-brand-50 dark:bg-brand-950/30'
          : 'border-border hover:border-brand-300 bg-surface',
      )}
    >
      <div className={cn(
        'h-11 w-11 rounded-xl flex items-center justify-center shrink-0',
        selected ? 'bg-brand-600 text-white' : 'bg-surface-elevated text-ink-muted',
      )}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className={cn('text-sm font-semibold', selected ? 'text-brand-700' : 'text-ink')}>{label}</p>
        <p className="text-xs text-ink-muted mt-0.5">{description}</p>
      </div>
      {selected && <Check className="h-5 w-5 text-brand-600 shrink-0" />}
    </button>
  )
}

function PlanCard({
  plan, selected, onClick,
}: {
  plan:     ServicePlan
  selected: boolean
  onClick:  () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full flex items-center justify-between p-4 rounded-2xl border-2 text-left transition-all',
        selected
          ? 'border-brand-600 bg-brand-50 dark:bg-brand-950/30'
          : 'border-border hover:border-brand-300 bg-surface',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className={cn('text-sm font-semibold', selected ? 'text-brand-700' : 'text-ink')}>
            {plan.name}
          </p>
          {selected && <Check className="h-4 w-4 text-brand-600" />}
        </div>
        <p className="text-xs text-ink-muted mt-0.5">
          {SLIP_DESCRIPTIONS[plan.variation_code] ?? plan.description ?? ''}
        </p>
      </div>
      <p className="text-sm font-bold text-brand-600 shrink-0 ml-4">
        {fmtCurrency(plan.selling_price)}
      </p>
    </button>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function IdentityPage() {
  const navigate   = useNavigate()
  const [step, setStep]         = useState<Step>(1)
  const [category, setCategory] = useState<Category | null>(null)
  const [method, setMethod]     = useState<Method>('number')
  const [identifier, setIdentifier] = useState('')
  const [planId, setPlanId]     = useState('')
  const [consent, setConsent]   = useState(false)
  const [errors, setErrors]     = useState<Record<string, string>>({})

  const { data: balance }                        = useWalletBalance()
  const { data: plans, isLoading: plansLoading } = useServicePlans('identity_verification', true)
  const { biometricPurchaseEnabled }             = useSecuritySettings()
  const purchase = useServicePurchase<IdentityVerificationInput>(transactionsApi.verifyIdentity, { biometricPurchaseEnabled })

  const ninPlans = (plans ?? []).filter((p) => p.network_operator === 'nin' && p.selling_price > 0)
  const bvnPlans = (plans ?? []).filter((p) => p.network_operator === 'bvn' && p.selling_price > 0)

  const selectedPlan = (plans ?? []).find((p) => p.id === planId) ?? null
  const isBvn        = category === 'bvn'
  const isNin        = category === 'nin'

  // ── Navigation ────────────────────────────────────────────────────────────

  function goNext() {
    const errs: Record<string, string> = {}

    if (step === 1) {
      if (!category) { errs.category = 'Select a verification category'; setErrors(errs); return }
      // BVN has only one method — skip step 2
      if (isBvn) { setMethod('number'); setStep(3); return }
      setStep(2); setErrors({}); return
    }

    if (step === 2) {
      setStep(3); setErrors({}); return
    }

    if (step === 3) {
      if (isBvn || method === 'number') {
        if (!/^\d{10,11}$/.test(identifier.trim())) {
          errs.identifier = `Enter a valid 11-digit ${isBvn ? 'BVN' : 'NIN'} number`
          setErrors(errs); return
        }
      } else {
        // NIN by phone
        if (!/^(\+?234|0)[789]\d{8}$/.test(identifier.trim())) {
          errs.identifier = 'Enter a valid Nigerian phone number (e.g. 08012345678)'
          setErrors(errs); return
        }
      }
      // Auto-select single BVN plan
      if (isBvn && bvnPlans.length === 1 && !planId) setPlanId(bvnPlans[0].id)
      setStep(4); setErrors({}); return
    }

    if (step === 4) {
      if (!planId) { errs.plan = 'Select a verification type'; setErrors(errs); return }
      if (balance && selectedPlan && selectedPlan.selling_price > balance.balance) {
        errs.plan = 'Insufficient wallet balance'
        setErrors(errs); return
      }
      setStep(5); setErrors({}); return
    }
  }

  function goBack() {
    if (step === 3 && isBvn) { setStep(1); return }
    if (step > 1) setStep((s) => (s - 1) as Step)
  }

  function clearAndReset(newCategory: Category) {
    setCategory(newCategory)
    setMethod('number')
    setIdentifier('')
    setPlanId('')
    setConsent(false)
    setErrors({})
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  const handleSubmit = () => {
    if (!consent) { setErrors({ consent: 'You must confirm consent to proceed' }); return }
    if (!selectedPlan) return

    const byPhone = isNin && method === 'phone'
    purchase.requestConfirm({
      id_number:      byPhone ? undefined : identifier.trim() || undefined,
      phone:          byPhone ? identifier.trim() || undefined : undefined,
      amount:         selectedPlan.selling_price,
      variation_code: selectedPlan.variation_code,
      description:    `${selectedPlan.name} verification`,
    })
  }

  // ── Confirm modal rows ────────────────────────────────────────────────────

  const idLabel = isBvn ? 'BVN' : method === 'phone' ? 'Phone' : 'NIN'
  const maskedId = identifier.length >= 5
    ? `${identifier.slice(0, 3)}${'*'.repeat(Math.max(0, identifier.length - 5))}${identifier.slice(-2)}`
    : identifier

  const confirmRows = [
    { label: 'Service', value: selectedPlan?.name ?? '' },
    { label: 'Amount',  value: fmtCurrency(selectedPlan?.selling_price ?? 0) },
    { label: idLabel,   value: maskedId },
  ]

  // ── Render ────────────────────────────────────────────────────────────────

  const totalSteps = category === 'bvn' ? 4 : 5  // BVN skips method step

  return (
    <div className="space-y-4 pt-2 lg:max-w-2xl lg:mx-auto">
      <button
        onClick={() => (step === 1 ? navigate(-1) : goBack())}
        className="flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" />
        {step === 1 ? 'Services' : 'Back'}
      </button>

      <Card>
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="h-11 w-11 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 flex items-center justify-center shrink-0">
            <ShieldCheck className="h-6 w-6 text-indigo-600" />
          </div>
          <div>
            <p className="text-base font-bold text-ink">Identity Verification</p>
            {balance && (
              <p className="text-xs text-ink-muted">Balance: {fmtCurrency(balance.balance)}</p>
            )}
          </div>
        </div>

        <ProgressBar step={stepIndex(step, isBvn)} total={totalSteps} />

        {/* ── Step 1: Category ─────────────────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-ink mb-4">Select verification category</p>
            <OptionCard
              label="NIN Verification"
              description="Verify using National Identification Number"
              icon={<ShieldCheck className="h-5 w-5" />}
              selected={category === 'nin'}
              onClick={() => clearAndReset('nin')}
            />
            <OptionCard
              label="BVN Verification"
              description="Verify using Bank Verification Number"
              icon={<CreditCard className="h-5 w-5" />}
              selected={category === 'bvn'}
              onClick={() => clearAndReset('bvn')}
            />
            {errors.category && <p className="text-xs text-danger mt-1">{errors.category}</p>}
          </div>
        )}

        {/* ── Step 2: Method (NIN only) ─────────────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-ink mb-4">How would you like to verify?</p>
            <OptionCard
              label="NIN Number"
              description="Enter your 11-digit National Identification Number"
              icon={<FileText className="h-5 w-5" />}
              selected={method === 'number'}
              onClick={() => { setMethod('number'); setIdentifier('') }}
            />
            <OptionCard
              label="Phone Number"
              description="Use the phone number registered with NIMC"
              icon={<Phone className="h-5 w-5" />}
              selected={method === 'phone'}
              onClick={() => { setMethod('phone'); setIdentifier('') }}
            />
          </div>
        )}

        {/* ── Step 3: Identifier input ──────────────────────────────────────── */}
        {step === 3 && (
          <div>
            <p className="text-sm font-semibold text-ink mb-4">
              {isBvn
                ? 'Enter your BVN number'
                : method === 'phone'
                  ? 'Enter your registered phone number'
                  : 'Enter your NIN number'}
            </p>
            <NumPadInput
              label={isBvn ? 'BVN Number' : method === 'phone' ? 'Phone Number' : 'NIN Number'}
              value={identifier}
              onChange={(v) => { setIdentifier(v); setErrors({}) }}
              placeholder={method === 'phone' ? '08012345678' : '12345678901'}
              maxLength={11}
              hint={
                isBvn             ? '11-digit Bank Verification Number' :
                method === 'phone' ? 'Nigerian phone number (e.g. 08012345678)' :
                                    '11-digit National Identification Number'
              }
              error={errors.identifier}
            />
          </div>
        )}

        {/* ── Step 4: Slip / plan selection ─────────────────────────────────── */}
        {step === 4 && (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-ink mb-4">
              {isBvn ? 'Verification type' : 'Select report type'}
            </p>
            {plansLoading ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-16 rounded-2xl bg-surface-elevated animate-pulse" />
                ))}
              </div>
            ) : (
              (isNin ? ninPlans : bvnPlans).map((plan) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  selected={planId === plan.id}
                  onClick={() => { setPlanId(plan.id); setErrors({}) }}
                />
              ))
            )}
            {errors.plan && <p className="text-xs text-danger mt-1">{errors.plan}</p>}
          </div>
        )}

        {/* ── Step 5: Consent + review ──────────────────────────────────────── */}
        {step === 5 && (
          <div className="space-y-5">
            <p className="text-sm font-semibold text-ink">Review & confirm</p>

            {/* Summary card */}
            <div className="rounded-2xl bg-surface-elevated p-4 space-y-2.5">
              <SummaryRow label="Category"    value={category?.toUpperCase() ?? ''} />
              <SummaryRow label="Method"      value={method === 'phone' ? 'Phone number' : `${isBvn ? 'BVN' : 'NIN'} number`} />
              <SummaryRow label="Identifier"  value={maskedId} />
              <SummaryRow label="Report type" value={selectedPlan?.name ?? '—'} />
              <SummaryRow label="Amount"      value={fmtCurrency(selectedPlan?.selling_price ?? 0)} highlight />
            </div>

            {/* Consent checkbox */}
            <label className="flex items-start gap-3 cursor-pointer group">
              <div className="relative mt-0.5 shrink-0">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => { setConsent(e.target.checked); setErrors((p) => ({ ...p, consent: '' })) }}
                  className="sr-only"
                />
                <div className={cn(
                  'h-5 w-5 rounded border-2 flex items-center justify-center transition-all',
                  consent ? 'bg-brand-600 border-brand-600' : 'border-border bg-surface',
                )}>
                  {consent && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                </div>
              </div>
              <p className="text-sm text-ink-muted leading-relaxed">
                I confirm that I have the identity owner's consent to perform this
                verification, and I accept the terms of this service.
              </p>
            </label>
            {errors.consent && <p className="text-xs text-danger -mt-3">{errors.consent}</p>}
          </div>
        )}

        {/* ── Navigation buttons ─────────────────────────────────────────────── */}
        <div className="mt-6 flex gap-3">
          {step > 1 && (
            <Button variant="outline" onClick={goBack} icon={<ChevronLeft className="h-4 w-4" />}>
              Back
            </Button>
          )}

          {step < 5 ? (
            <Button
              fullWidth
              onClick={goNext}
              disabled={step === 1 && !category}
            >
              {step === 4 ? 'Review' : 'Continue'}
              <ChevronRight className="h-4 w-4 ml-1 inline" />
            </Button>
          ) : (
            <Button
              fullWidth
              onClick={handleSubmit}
              disabled={!consent}
              icon={<ShieldCheck className="h-4 w-4" />}
            >
              Proceed to Payment
            </Button>
          )}
        </div>
      </Card>

      <ConfirmModal
        open={purchase.phase === 'confirm'}
        rows={confirmRows}
        onConfirm={() => { void purchase.goToAuthorize() }}
        onCancel={purchase.cancel}
        confirmLabel={biometricPurchaseEnabled ? 'Confirm Purchase' : 'Enter PIN'}
      />
      <PinEntryModal
        open={purchase.phase === 'pin' || purchase.phase === 'submitting'}
        loading={purchase.phase === 'submitting'}
        error={purchase.pinError}
        biometricFallback={purchase.biometricFailed}
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function SummaryRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className={cn('text-sm font-medium', highlight ? 'text-brand-600 font-bold' : 'text-ink')}>
        {value}
      </p>
    </div>
  )
}

/** Maps the wizard step number to a visual progress step (BVN skips method step). */
function stepIndex(step: Step, isBvn: boolean): number {
  if (!isBvn) return step
  // BVN: step 1→1, step 3→2, step 4→3, step 5→4
  if (step === 1) return 1
  if (step === 3) return 2
  if (step === 4) return 3
  return 4
}
