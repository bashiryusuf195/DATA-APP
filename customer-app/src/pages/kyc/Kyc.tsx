import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, ShieldCheck, ShieldAlert, Clock,
  CheckCircle2, XCircle, AlertCircle, ChevronRight,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { Button, Card, Input, Skeleton } from '@/components/ui'
import { useKycStatus, useSubmitNin, useSubmitBvn } from '@/hooks/useKyc'
import { fmtDateTime } from '@/utils/format'
import { cn } from '@/utils/cn'
import type { KycLevel, KycVerificationStatus } from '@/types'

// ── Constants ────────────────────────────────────────────────────────────────

const TIERS: {
  level: KycLevel
  num:   number
  title: string
  limit: string
  what:  string
  doc:   string
}[] = [
  {
    level: 'none',
    num:   0,
    title: 'Unverified',
    limit: '₦50,000 / day',
    what:  'Basic account — limited transactions',
    doc:   '',
  },
  {
    level: 'tier_1',
    num:   1,
    title: 'Tier 1 — NIN Verified',
    limit: '₦200,000 / day',
    what:  'Identity confirmed via National ID Number',
    doc:   'NIN (11-digit National ID Number)',
  },
  {
    level: 'tier_2',
    num:   2,
    title: 'Tier 2 — BVN Verified',
    limit: '₦500,000 / day',
    what:  'Financial identity confirmed via Bank Verification Number',
    doc:   'BVN (11-digit Bank Verification Number)',
  },
  {
    level: 'tier_3',
    num:   3,
    title: 'Tier 3 — Fully Verified',
    limit: '₦2,000,000 / day',
    what:  'Full KYC — highest transaction limits',
    doc:   'Completed by our compliance team',
  },
]

const LEVEL_NUM: Record<KycLevel, number> = {
  none: 0, tier_1: 1, tier_2: 2, tier_3: 3,
}

const STATUS_ICON: Record<KycVerificationStatus, JSX.Element> = {
  pending:       <Clock        className="h-4 w-4 text-amber-500" />,
  in_progress:   <Clock        className="h-4 w-4 text-blue-500" />,
  verified:      <CheckCircle2 className="h-4 w-4 text-success" />,
  failed:        <XCircle      className="h-4 w-4 text-danger" />,
  expired:       <XCircle      className="h-4 w-4 text-ink-muted" />,
  manual_review: <AlertCircle  className="h-4 w-4 text-amber-500" />,
}

const STATUS_LABEL: Record<KycVerificationStatus, string> = {
  pending:       'Pending review',
  in_progress:   'Under review',
  verified:      'Verified',
  failed:        'Failed',
  expired:       'Expired',
  manual_review: 'Manual review',
}

// ── Sub-components ────────────────────────────────────────────────────────────

function VerificationForm({
  type,
  label,
  placeholder,
  regex,
  errorMsg,
  onSubmit,
  loading,
  disabled,
  disabledReason,
}: {
  type:           'nin' | 'bvn'
  label:          string
  placeholder:    string
  regex:          RegExp
  errorMsg:       string
  onSubmit:       (value: string) => void
  loading:        boolean
  disabled:       boolean
  disabledReason?: string
}) {
  const [value, setValue]   = useState('')
  const [error, setError]   = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!regex.test(value.trim())) { setError(errorMsg); return }
    onSubmit(value.trim())
  }

  if (disabled && disabledReason) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-xl bg-surface-2 text-xs text-ink-muted">
        <AlertCircle className="h-4 w-4 shrink-0" />
        {disabledReason}
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <Input
        label={label}
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(e) => { setValue(e.target.value); setError('') }}
        placeholder={placeholder}
        maxLength={11}
        error={error}
        disabled={disabled}
      />
      <Button type="submit" fullWidth loading={loading} disabled={disabled}>
        Submit {type.toUpperCase()} for Verification
      </Button>
    </form>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function KycPage() {
  const navigate = useNavigate()
  const { data: kyc, isLoading } = useKycStatus()
  const submitNin = useSubmitNin()
  const submitBvn = useSubmitBvn()

  const currentLevelNum = LEVEL_NUM[kyc?.kyc_level ?? 'none']

  const latestNin = kyc?.verifications.find((v) => v.verification_type === 'nin')
  const latestBvn = kyc?.verifications.find((v) => v.verification_type === 'bvn')

  const ninPending = latestNin?.status === 'pending' || latestNin?.status === 'in_progress'
  const bvnPending = latestBvn?.status === 'pending' || latestBvn?.status === 'in_progress'

  const handleNin = (nin: string) => {
    submitNin.mutate(nin, {
      onSuccess: () => toast.success('NIN submitted. Our team will review within 24 hours.'),
      onError:   (err: Error) => toast.error(err.message),
    })
  }

  const handleBvn = (bvn: string) => {
    submitBvn.mutate(bvn, {
      onSuccess: () => toast.success('BVN submitted. Our team will review within 24 hours.'),
      onError:   (err: Error) => toast.error(err.message),
    })
  }

  return (
    <div className="space-y-4 pt-2">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      {/* Header */}
      <Card>
        <div className="flex items-center gap-2.5 mb-1">
          <div className="h-10 w-10 rounded-xl bg-brand-50 flex items-center justify-center">
            <ShieldCheck className="h-5 w-5 text-brand-600" />
          </div>
          <div>
            <p className="text-base font-semibold text-ink">KYC Verification</p>
            <p className="text-xs text-ink-muted">Verify your identity to unlock higher limits</p>
          </div>
        </div>
      </Card>

      {/* Level progress */}
      <Card>
        <p className="text-sm font-semibold text-ink mb-4">Verification Progress</p>
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
          </div>
        ) : (
          <div className="space-y-2">
            {TIERS.map((tier) => {
              const isComplete = currentLevelNum >= tier.num
              const isCurrent  = currentLevelNum === tier.num
              return (
                <div
                  key={tier.level}
                  className={cn(
                    'flex items-center gap-3 p-3 rounded-xl border-2 transition-all',
                    isComplete && tier.num > 0
                      ? 'border-success bg-emerald-50/50'
                      : isCurrent
                        ? 'border-brand-400 bg-brand-50'
                        : 'border-border bg-surface-1 opacity-60',
                  )}
                >
                  <div className={cn(
                    'h-9 w-9 rounded-full flex items-center justify-center shrink-0 text-xs font-bold',
                    isComplete && tier.num > 0
                      ? 'bg-success text-white'
                      : isCurrent && tier.num > 0
                        ? 'bg-brand-600 text-white'
                        : 'bg-surface-2 text-ink-muted',
                  )}>
                    {isComplete && tier.num > 0
                      ? <CheckCircle2 className="h-5 w-5" />
                      : tier.num === 0
                        ? <ShieldAlert className="h-4 w-4 text-ink-muted" />
                        : tier.num
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      'text-sm font-medium',
                      isComplete && tier.num > 0 ? 'text-emerald-800' : 'text-ink',
                    )}>
                      {tier.title}
                    </p>
                    <p className="text-xs text-ink-muted mt-0.5">{tier.what}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={cn(
                      'text-xs font-semibold',
                      isComplete && tier.num > 0 ? 'text-success' : 'text-brand-600',
                    )}>
                      {tier.limit}
                    </p>
                    {isCurrent && (
                      <span className="text-[10px] text-brand-500 font-medium">Current</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* Transaction limit messaging */}
      {!isLoading && kyc && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-2xl bg-amber-50 border border-amber-200">
          <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-900">
              Current limit: {TIERS[currentLevelNum].limit}
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              {currentLevelNum < 3
                ? `Complete Tier ${currentLevelNum + 1} verification to increase your daily transaction limit.`
                : 'You have the highest transaction limits. No further action needed.'}
            </p>
          </div>
        </div>
      )}

      {/* NIN submission — needed for Tier 1 */}
      {!isLoading && kyc && currentLevelNum < 1 && (
        <Card>
          <div className="flex items-center gap-2 mb-4">
            {latestNin ? STATUS_ICON[latestNin.status] : <ShieldAlert className="h-4 w-4 text-ink-muted" />}
            <p className="text-sm font-semibold text-ink">Step 1 — NIN Verification</p>
          </div>

          {latestNin && (
            <div className="flex items-center gap-2 mb-4 p-2.5 rounded-lg bg-surface-2">
              {STATUS_ICON[latestNin.status]}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-ink">{STATUS_LABEL[latestNin.status]}</p>
                <p className="text-xs text-ink-muted">{fmtDateTime(latestNin.created_at)}</p>
                {latestNin.failure_reason && (
                  <p className="text-xs text-danger mt-0.5">{latestNin.failure_reason}</p>
                )}
              </div>
            </div>
          )}

          <p className="text-xs text-ink-muted mb-3">
            Your NIN is an 11-digit number on your National ID card or slip.
            It is stored securely and used only for identity verification.
          </p>

          <VerificationForm
            type="nin"
            label="National Identification Number (NIN)"
            placeholder="12345678901"
            regex={/^\d{11}$/}
            errorMsg="NIN must be exactly 11 digits"
            onSubmit={handleNin}
            loading={submitNin.isPending}
            disabled={ninPending || kyc.nin_verified}
            disabledReason={
              kyc.nin_verified
                ? 'Your NIN has been verified.'
                : ninPending
                  ? 'Your NIN is currently under review. Please wait for our team to complete the verification.'
                  : undefined
            }
          />
        </Card>
      )}

      {/* BVN submission — show whenever BVN is not yet verified (required for Squad transfer account + Tier 2) */}
      {!isLoading && kyc && !kyc.bvn_verified && currentLevelNum < 2 && (
        <Card>
          <div className="flex items-center gap-2 mb-4">
            {latestBvn ? STATUS_ICON[latestBvn.status] : <ShieldAlert className="h-4 w-4 text-ink-muted" />}
            <p className="text-sm font-semibold text-ink">
              {currentLevelNum >= 1 ? 'Step 2 — BVN Verification' : 'BVN Verification'}
            </p>
          </div>

          {/* Explain why BVN is needed when user hasn't reached Tier 1 yet */}
          {currentLevelNum < 1 && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 mb-4">
              <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">
                Your BVN is needed to activate your <strong>Squad transfer account</strong> for wallet funding.
                It will also count towards Tier 2 verification once your NIN is verified.
              </p>
            </div>
          )}

          {latestBvn && (
            <div className="flex items-center gap-2 mb-4 p-2.5 rounded-lg bg-surface-2">
              {STATUS_ICON[latestBvn.status]}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-ink">{STATUS_LABEL[latestBvn.status]}</p>
                <p className="text-xs text-ink-muted">{fmtDateTime(latestBvn.created_at)}</p>
                {latestBvn.failure_reason && (
                  <p className="text-xs text-danger mt-0.5">{latestBvn.failure_reason}</p>
                )}
              </div>
            </div>
          )}

          <p className="text-xs text-ink-muted mb-3">
            Your BVN is an 11-digit number tied to your bank accounts in Nigeria.
            Dial <strong>*565*0#</strong> on any registered number to retrieve it.
            It is stored securely and used only for identity and account verification.
          </p>

          <VerificationForm
            type="bvn"
            label="Bank Verification Number (BVN)"
            placeholder="12345678901"
            regex={/^\d{11}$/}
            errorMsg="BVN must be exactly 11 digits"
            onSubmit={handleBvn}
            loading={submitBvn.isPending}
            disabled={bvnPending || kyc.bvn_verified}
            disabledReason={
              kyc.bvn_verified
                ? 'Your BVN has been verified.'
                : bvnPending
                  ? 'Your BVN is currently under review. Please wait for our team to complete the verification.'
                  : undefined
            }
          />
        </Card>
      )}

      {/* Tier 3 — awaiting admin full review */}
      {!isLoading && kyc && currentLevelNum === 2 && (
        <Card>
          <div className="flex items-center gap-3 py-2">
            <div className="h-10 w-10 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
              <ChevronRight className="h-5 w-5 text-brand-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-ink">Tier 3 — Full Verification</p>
              <p className="text-xs text-ink-muted mt-0.5">
                Tier 3 is completed by our compliance team. Contact support if you require higher limits.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Fully verified */}
      {!isLoading && kyc?.kyc_level === 'tier_3' && (
        <Card>
          <div className="flex flex-col items-center py-4 gap-2 text-center">
            <div className="h-14 w-14 rounded-full bg-emerald-100 flex items-center justify-center">
              <ShieldCheck className="h-7 w-7 text-success" />
            </div>
            <p className="text-base font-semibold text-ink">Fully Verified</p>
            <p className="text-sm text-ink-muted">
              Your account is fully verified. You have access to the highest transaction limits.
            </p>
          </div>
        </Card>
      )}

      {/* Past verifications */}
      {!isLoading && kyc && kyc.verifications.length > 0 && (
        <Card>
          <p className="text-sm font-semibold text-ink mb-3">Verification History</p>
          <div className="space-y-2">
            {kyc.verifications.map((v) => (
              <div key={v.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-surface-2">
                {STATUS_ICON[v.status]}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-ink uppercase tracking-wide">
                    {v.verification_type}
                  </p>
                  <p className="text-xs text-ink-muted">{fmtDateTime(v.created_at)}</p>
                </div>
                <span className={cn(
                  'text-xs px-2 py-0.5 rounded-full font-medium',
                  v.status === 'verified'
                    ? 'bg-emerald-100 text-emerald-700'
                    : v.status === 'failed' || v.status === 'expired'
                      ? 'bg-red-100 text-red-700'
                      : 'bg-amber-100 text-amber-700',
                )}>
                  {STATUS_LABEL[v.status]}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
