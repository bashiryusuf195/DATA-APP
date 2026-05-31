import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Gift, ArrowLeft, Copy, Check, Users, TrendingUp, Clock, Target } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { Card, Skeleton } from '@/components/ui'
import { referralsApi } from '@/api/referrals.api'
import { fmtCurrency, fmtDate } from '@/utils/format'
import { cn } from '@/utils/cn'

const STATUS_STYLES: Record<string, string> = {
  completed:  'bg-emerald-100 text-emerald-700',
  pending:    'bg-amber-100  text-amber-700',
  processing: 'bg-blue-100   text-blue-700',
  failed:     'bg-red-100    text-red-700',
}

export function ReferralsPage() {
  const navigate          = useNavigate()
  const [copied, setCopied] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['referrals-summary'],
    queryFn:  referralsApi.getMyReferrals,
    staleTime: 60_000,
  })

  const handleCopy = () => {
    if (!data?.referral_code) return
    navigator.clipboard.writeText(data.referral_code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const isMilestone    = data?.reward_mode === 'milestone'
  const qualified      = data?.qualified_referrals  ?? 0
  const nextMilestone  = data?.next_milestone        ?? null
  const progressPct    = nextMilestone
    ? Math.min(100, Math.round((qualified / nextMilestone) * 100))
    : 100

  return (
    <div className="space-y-4 pt-2">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      {/* Header + referral code */}
      <Card>
        <div className="flex items-center gap-2.5 mb-4">
          <div className="h-10 w-10 rounded-xl bg-green-50 flex items-center justify-center">
            <Gift className="h-5 w-5 text-green-600" />
          </div>
          <div>
            <p className="text-base font-semibold text-ink">Refer & Earn</p>
            <p className="text-xs text-ink-muted">Invite friends and earn rewards</p>
          </div>
        </div>

        {isLoading ? (
          <Skeleton className="h-16 rounded-xl" />
        ) : data ? (
          <>
            <p className="text-xs font-medium text-ink-muted mb-1.5">Your referral code</p>
            <div className="flex items-center gap-2 p-3 rounded-xl bg-surface-2 border border-border">
              <p className="flex-1 font-mono text-base font-bold text-ink tracking-widest">
                {data.referral_code}
              </p>
              <button
                onClick={handleCopy}
                className="p-2 rounded-lg hover:bg-surface-0 transition-colors"
                title="Copy code"
              >
                {copied
                  ? <Check className="h-4 w-4 text-success" />
                  : <Copy className="h-4 w-4 text-ink-muted" />
                }
              </button>
            </div>
          </>
        ) : null}
      </Card>

      {/* Milestone progress card — shown only in milestone mode */}
      {isMilestone && (
        <Card>
          {isLoading ? (
            <Skeleton className="h-24 rounded-xl" />
          ) : data ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-brand-600" />
                <p className="text-sm font-semibold text-ink">Milestone Progress</p>
              </div>

              {nextMilestone !== null ? (
                <>
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-2xl font-bold text-ink tabular-nums">
                        {qualified}
                        <span className="text-base font-medium text-ink-muted"> / {nextMilestone}</span>
                      </p>
                      <p className="text-xs text-ink-muted mt-0.5">
                        qualified referrals toward next milestone
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-brand-600">{progressPct}%</p>
                  </div>

                  {/* Progress bar */}
                  <div className="h-2.5 rounded-full bg-surface-2 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-brand-600 transition-all duration-500"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>

                  <p className="text-xs text-ink-muted">
                    {nextMilestone - qualified} more referral{nextMilestone - qualified === 1 ? '' : 's'} to unlock your reward.
                  </p>
                </>
              ) : (
                <div className="flex items-center gap-2 py-2">
                  <Check className="h-5 w-5 text-success" />
                  <p className="text-sm font-medium text-ink">
                    All milestones reached! Keep referring to earn more.
                  </p>
                </div>
              )}
            </div>
          ) : null}
        </Card>
      )}

      {/* Stats grid */}
      {isLoading ? (
        <div className="grid grid-cols-3 gap-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : data ? (
        <div className="grid grid-cols-3 gap-3">
          <Card className="!p-3 text-center">
            <Users className="h-5 w-5 text-brand-600 mx-auto mb-1" />
            <p className="text-xl font-bold text-ink">{data.total_referrals}</p>
            <p className="text-xs text-ink-muted">Total</p>
          </Card>
          <Card className="!p-3 text-center">
            <TrendingUp className="h-5 w-5 text-success mx-auto mb-1" />
            <p className="text-xl font-bold text-ink">{data.successful_referrals}</p>
            <p className="text-xs text-ink-muted">
              {isMilestone ? 'Qualified' : 'Successful'}
            </p>
          </Card>
          <Card className="!p-3 text-center">
            <Gift className="h-5 w-5 text-amber-500 mx-auto mb-1" />
            <p className="text-lg font-bold text-ink">{fmtCurrency(data.total_rewards)}</p>
            <p className="text-xs text-ink-muted">Earned</p>
          </Card>
        </div>
      ) : null}

      {/* Reward history */}
      <Card>
        <p className="text-sm font-semibold text-ink mb-4">
          {isMilestone ? 'Qualifying Referrals' : 'Reward History'}
        </p>

        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex justify-between items-center">
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-40 rounded" />
                  <Skeleton className="h-3 w-24 rounded" />
                </div>
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
            ))}
          </div>
        ) : !data?.rewards?.length ? (
          <div className="py-8 text-center">
            <Clock className="h-8 w-8 text-ink-faint mx-auto mb-2" />
            <p className="text-sm text-ink-muted">No referrals yet</p>
            <p className="text-xs text-ink-faint mt-1">Share your code to start earning.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {data.rewards.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink truncate">{r.referred_user_email}</p>
                  <p className="text-xs text-ink-muted">{fmtDate(r.created_at)}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {/* In milestone mode rewards_amount=0 so skip the amount display */}
                  {!isMilestone && r.amount > 0 && (
                    <p className="text-sm font-bold text-success">+{fmtCurrency(r.amount)}</p>
                  )}
                  <span className={cn(
                    'text-xs px-2 py-0.5 rounded-full font-medium',
                    STATUS_STYLES[r.status] ?? 'bg-surface-2 text-ink-muted',
                  )}>
                    {r.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
