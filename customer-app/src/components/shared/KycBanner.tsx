import { Link } from 'react-router-dom'
import { ShieldCheck, ShieldAlert, ChevronRight, Clock } from 'lucide-react'
import { useKycStatus } from '@/hooks/useKyc'
import type { KycLevel } from '@/types'

const LEVEL_NUM: Record<KycLevel, number> = {
  none:   0,
  tier_1: 1,
  tier_2: 2,
  tier_3: 3,
}

const NEXT_ACTION: Record<KycLevel, { label: string; hint: string } | null> = {
  none:   { label: 'Verify your identity',   hint: 'Submit your NIN to unlock Tier 1' },
  tier_1: { label: 'Upgrade to Tier 2',      hint: 'Submit your BVN to increase your limits' },
  tier_2: { label: 'Complete full verification', hint: 'Awaiting Tier 3 review by our team' },
  tier_3: null,
}

export function KycBanner() {
  const { data: kyc } = useKycStatus()

  if (!kyc || kyc.kyc_level === 'tier_3') return null

  const level   = kyc.kyc_level
  const levelN  = LEVEL_NUM[level]
  const action  = NEXT_ACTION[level]
  const hasPending = kyc.verifications.some((v) => v.status === 'pending' || v.status === 'in_progress')

  if (hasPending) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-amber-50 border border-amber-200">
        <Clock className="h-5 w-5 text-amber-600 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-amber-900">Verification under review</p>
          <p className="text-xs text-amber-700 mt-0.5">Your submission is being reviewed. We'll notify you once complete.</p>
        </div>
      </div>
    )
  }

  return (
    <Link
      to="/kyc"
      className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-brand-50 border border-brand-200 hover:bg-brand-100 transition-colors group"
    >
      <div className="h-9 w-9 rounded-xl bg-brand-100 flex items-center justify-center shrink-0">
        {levelN === 0
          ? <ShieldAlert className="h-5 w-5 text-brand-600" />
          : <ShieldCheck className="h-5 w-5 text-brand-600" />
        }
      </div>
      <div className="flex-1 min-w-0">
        {action && (
          <>
            <p className="text-sm font-semibold text-brand-900">{action.label}</p>
            <p className="text-xs text-brand-700 mt-0.5">{action.hint}</p>
          </>
        )}
        {/* Progress dots */}
        <div className="flex items-center gap-1.5 mt-2">
          {[0, 1, 2, 3].map((n) => (
            <div
              key={n}
              className={`h-1.5 rounded-full transition-all ${
                n <= levelN
                  ? 'bg-brand-600 w-5'
                  : 'bg-brand-200 w-2'
              }`}
            />
          ))}
          <span className="text-xs text-brand-600 ml-1">Tier {levelN} of 3</span>
        </div>
      </div>
      <ChevronRight className="h-4 w-4 text-brand-500 shrink-0 group-hover:translate-x-0.5 transition-transform" />
    </Link>
  )
}
