import { Link } from 'react-router-dom'
import { Shield, ShieldCheck, ShieldAlert, Clock } from 'lucide-react'
import { useKycStatus } from '@/hooks/useKyc'
import { Skeleton } from '@/components/ui'
import type { KycStatus } from '@/types'
import { cn } from '@/utils/cn'

// ── Status derivation ─────────────────────────────────────────

type Status = 'verified' | 'under_review' | 'action_required' | 'not_submitted'

interface StatusConfig {
  status:      Status
  label:       string
  message:     string
  actionLabel: string
}

function deriveStatus(kyc: KycStatus): StatusConfig {
  if (kyc.kyc_level === 'tier_3') {
    return {
      status:      'verified',
      label:       'Verified',
      message:     'Your identity has been verified.',
      actionLabel: 'View Details',
    }
  }

  const hasPending = kyc.verifications.some(
    (v) => v.status === 'pending' || v.status === 'in_progress',
  )
  if (hasPending) {
    return {
      status:      'under_review',
      label:       'Under Review',
      message:     'Your submission is being reviewed. We\'ll notify you when it\'s complete.',
      actionLabel: 'Check Status',
    }
  }

  const hasFailed = kyc.verifications.some(
    (v) => v.status === 'failed' || v.status === 'expired' || v.status === 'manual_review',
  )
  if (hasFailed) {
    return {
      status:      'action_required',
      label:       'Action Required',
      message:     'Additional documents needed. Please resubmit to continue.',
      actionLabel: 'Take Action',
    }
  }

  if (kyc.verifications.length === 0) {
    return {
      status:      'not_submitted',
      label:       'Not Submitted',
      message:     'Verify your identity to unlock higher limits and all features.',
      actionLabel: 'Get Verified',
    }
  }

  // Partially verified (tier_1 or tier_2) with no pending/failed — prompt to continue
  const nextTier = kyc.kyc_level === 'tier_1' ? '2' : '3'
  return {
    status:      'action_required',
    label:       'Action Required',
    message:     `Continue verification to unlock Tier ${nextTier} benefits.`,
    actionLabel: 'Continue',
  }
}

// ── Status visual config ──────────────────────────────────────

const STYLE: Record<Status, {
  icon:       React.ElementType
  iconBg:     string
  iconColor:  string
  labelColor: string
  cardBg:     string
  border:     string
  btnBase:    string
}> = {
  verified: {
    icon:       ShieldCheck,
    iconBg:     'bg-success/10',
    iconColor:  'text-success',
    labelColor: 'text-success',
    cardBg:     'bg-success/5 dark:bg-success/10',
    border:     'border-success/20',
    btnBase:    'bg-surface-1 border border-border text-ink hover:bg-surface-2',
  },
  under_review: {
    icon:       Clock,
    iconBg:     'bg-amber-100 dark:bg-amber-900/30',
    iconColor:  'text-amber-600 dark:text-amber-400',
    labelColor: 'text-amber-700 dark:text-amber-400',
    cardBg:     'bg-amber-50 dark:bg-amber-900/20',
    border:     'border-amber-200 dark:border-amber-700/40',
    btnBase:    'bg-amber-600 text-white hover:bg-amber-700',
  },
  action_required: {
    icon:       ShieldAlert,
    iconBg:     'bg-danger/10',
    iconColor:  'text-danger',
    labelColor: 'text-danger',
    cardBg:     'bg-danger/5 dark:bg-danger/10',
    border:     'border-danger/20',
    btnBase:    'bg-danger text-white hover:bg-red-600',
  },
  not_submitted: {
    icon:       Shield,
    iconBg:     'bg-surface-2',
    iconColor:  'text-ink-faint',
    labelColor: 'text-ink-muted',
    cardBg:     'bg-surface-1',
    border:     'border-border',
    btnBase:    'bg-brand-600 text-white hover:bg-brand-700',
  },
}

// ── Component ─────────────────────────────────────────────────

export function KycStatusCard() {
  const { data: kyc, isLoading } = useKycStatus()

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 px-4 py-3.5 rounded-2xl border border-border bg-surface-1">
        <Skeleton className="h-10 w-10 rounded-xl shrink-0" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-2.5 w-28 rounded" />
          <Skeleton className="h-3.5 w-20 rounded" />
          <Skeleton className="h-3 w-48 rounded" />
        </div>
        <Skeleton className="h-8 w-20 rounded-xl shrink-0" />
      </div>
    )
  }

  if (!kyc) return null

  const cfg   = deriveStatus(kyc)
  const style = STYLE[cfg.status]
  const Icon  = style.icon

  return (
    <div className={cn(
      'flex items-center gap-3 md:gap-4 px-4 py-3.5 rounded-2xl border',
      style.cardBg, style.border,
    )}>
      {/* Icon */}
      <div className={cn(
        'h-10 w-10 rounded-xl flex items-center justify-center shrink-0',
        style.iconBg,
      )}>
        <Icon className={cn('h-5 w-5', style.iconColor)} />
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint mb-0.5">
          Identity Verification
        </p>
        <p className={cn('text-sm font-bold leading-none', style.labelColor)}>
          {cfg.label}
        </p>
        <p className="text-xs text-ink-muted mt-1 leading-snug">{cfg.message}</p>
      </div>

      {/* Action */}
      <Link
        to="/kyc"
        className={cn(
          'shrink-0 text-xs font-semibold px-3.5 py-2 rounded-xl transition-colors active:scale-95',
          style.btnBase,
        )}
      >
        {cfg.actionLabel}
      </Link>
    </div>
  )
}
