import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  Gift, ArrowLeft, Copy, Check, Users, TrendingUp, Clock,
  Target, Share2, Wallet, AlertCircle, ChevronRight, Star,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { Card } from '@/components/ui'
import { ReferralsSkeleton } from '@/components/skeletons'
import { EmptyReferrals } from '@/components/shared/empty-states'
import { referralsApi } from '@/api/referrals.api'
import { useReferralSettings } from '@/hooks/useReferrals'
import type { ReferralReward } from '@/types'
import { fmtCurrency, fmtDate } from '@/utils/format'
import { cn } from '@/utils/cn'

// ── Helpers ───────────────────────────────────────────────────────────────────

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function getLast6Months(): { year: number; month: number; label: string }[] {
  const now = new Date()
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
    return { year: d.getFullYear(), month: d.getMonth(), label: MONTH_LABELS[d.getMonth()] }
  })
}

function buildMonthlyData(rewards: ReferralReward[]) {
  const months = getLast6Months()
  const growthData = months.map(({ year, month, label }) => {
    const count = rewards.filter((r) => {
      const d = new Date(r.created_at)
      return d.getFullYear() === year && d.getMonth() === month
    }).length
    return { label, value: count }
  })
  const earningsData = months.map(({ year, month, label }) => {
    const total = rewards
      .filter((r) => {
        const d = new Date(r.created_at)
        return d.getFullYear() === year && d.getMonth() === month && r.status === 'completed'
      })
      .reduce((sum, r) => sum + (r.amount ?? 0), 0)
    return { label, value: total }
  })
  return { growthData, earningsData }
}

// ── SVG Bar chart ─────────────────────────────────────────────────────────────

function BarChart({ data, color }: { data: { label: string; value: number }[]; color: string }) {
  const max   = Math.max(...data.map((d) => d.value), 1)
  const W     = 300
  const H     = 90
  const BAR_W = 30
  const GAP   = (W - data.length * BAR_W) / (data.length + 1)
  const LABEL_H = 18
  const CHART_H = H - LABEL_H

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id={`bar-grad-${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity="0.9" />
          <stop offset="100%" stopColor={color} stopOpacity="0.3" />
        </linearGradient>
      </defs>
      {data.map(({ label, value }, i) => {
        const barH  = Math.max(value === 0 ? 3 : (value / max) * (CHART_H - 8), 3)
        const x     = GAP + i * (BAR_W + GAP)
        const y     = CHART_H - barH
        return (
          <g key={label}>
            <rect
              x={x} y={y} width={BAR_W} height={barH}
              rx={4} ry={4}
              fill={value === 0 ? 'currentColor' : `url(#bar-grad-${color})`}
              className={value === 0 ? 'text-border' : ''}
            />
            <text
              x={x + BAR_W / 2} y={H - 2}
              textAnchor="middle" fontSize="9" fill="currentColor"
              className="text-ink-faint"
            >
              {label}
            </text>
            {value > 0 && (
              <text
                x={x + BAR_W / 2} y={y - 3}
                textAnchor="middle" fontSize="8" fontWeight="600" fill={color}
              >
                {value}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

// ── SVG Area chart ────────────────────────────────────────────────────────────

function AreaChart({ data, color }: { data: { label: string; value: number }[]; color: string }) {
  const max     = Math.max(...data.map((d) => d.value), 1)
  const W       = 300
  const H       = 90
  const LABEL_H = 18
  const CHART_H = H - LABEL_H
  const PAD_X   = 10

  const points = data.map((d, i) => ({
    x: PAD_X + (i / (data.length - 1)) * (W - PAD_X * 2),
    y: CHART_H - 8 - (d.value / max) * (CHART_H - 16),
    value: d.value,
    label: d.label,
  }))

  // Build smooth path using cubic bezier
  function smoothPath(pts: { x: number; y: number }[]): string {
    if (pts.length < 2) return ''
    let d = `M ${pts[0].x} ${pts[0].y}`
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1]
      const curr = pts[i]
      const cpX  = (prev.x + curr.x) / 2
      d += ` C ${cpX} ${prev.y} ${cpX} ${curr.y} ${curr.x} ${curr.y}`
    }
    return d
  }

  const linePath = smoothPath(points)
  const areaPath = linePath
    + ` L ${points[points.length - 1].x} ${CHART_H} L ${points[0].x} ${CHART_H} Z`

  const gradId = `area-grad-${color.replace('#', '')}`

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {/* Area fill */}
      <path d={areaPath} fill={`url(#${gradId})`} />
      {/* Line */}
      <path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
      {/* Dots + labels */}
      {points.map((pt, i) => (
        <g key={data[i].label}>
          {pt.value > 0 && (
            <circle cx={pt.x} cy={pt.y} r="3" fill={color} stroke="white" strokeWidth="1.5" />
          )}
          <text
            x={pt.x} y={H - 2}
            textAnchor="middle" fontSize="9" fill="currentColor"
            className="text-ink-faint"
          >
            {data[i].label}
          </text>
        </g>
      ))}
    </svg>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────

interface StatCardProps {
  icon:    React.ReactNode
  iconBg:  string
  label:   string
  value:   string | number
  sub?:    string
}

function StatCard({ icon, iconBg, label, value, sub }: StatCardProps) {
  return (
    <div className="bg-surface-1 rounded-2xl border border-border p-3.5 flex flex-col gap-2.5">
      <div className={cn('h-9 w-9 rounded-xl flex items-center justify-center', iconBg)}>
        {icon}
      </div>
      <div>
        <p className="text-[10px] font-semibold text-ink-faint uppercase tracking-wider leading-none mb-1">{label}</p>
        <p className="text-xl font-black text-ink leading-none tabular-nums">{value}</p>
        {sub && <p className="text-[10px] text-ink-faint mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { bg: string; text: string; label: string }> = {
  completed:  { bg: 'bg-emerald-100 dark:bg-emerald-950/60', text: 'text-emerald-700 dark:text-emerald-400', label: 'Completed' },
  pending:    { bg: 'bg-amber-100  dark:bg-amber-950/60',   text: 'text-amber-700 dark:text-amber-400',   label: 'Pending'   },
  processing: { bg: 'bg-blue-100   dark:bg-blue-950/60',    text: 'text-blue-700 dark:text-blue-400',     label: 'Active'    },
  failed:     { bg: 'bg-red-100    dark:bg-red-950/60',     text: 'text-red-700 dark:text-red-400',       label: 'Failed'    },
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function ReferralsPage() {
  const navigate            = useNavigate()
  const [codeCopied,  setCodeCopied]  = useState(false)
  const [linkCopied,  setLinkCopied]  = useState(false)
  const [showAll,     setShowAll]     = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['referrals-summary'],
    queryFn:  referralsApi.getMyReferrals,
    staleTime: 60_000,
  })

  const { data: settings } = useReferralSettings()
  const rewardLabel = settings
    ? settings.reward_type === 'percentage'
      ? `${settings.reward_value}%`
      : `₦${settings.reward_value.toLocaleString()}`
    : '₦200'

  const referralLink = data?.referral_code
    ? `https://hivedata.ng/register?ref=${data.referral_code}`
    : ''

  const handleCopyCode = () => {
    if (!data?.referral_code) return
    navigator.clipboard.writeText(data.referral_code).then(() => {
      setCodeCopied(true)
      setTimeout(() => setCodeCopied(false), 2000)
    })
  }

  const handleShare = async () => {
    if (!data?.referral_code) return
    const shareData = {
      title: 'Join Hive Data',
      text:  `Use my referral code ${data.referral_code} — get instant rewards when you sign up!`,
      url:   referralLink,
    }
    if (navigator.share) {
      try { await navigator.share(shareData) } catch { /* cancelled */ }
    } else {
      await navigator.clipboard.writeText(referralLink)
      setLinkCopied(true)
      toast.success('Referral link copied!')
      setTimeout(() => setLinkCopied(false), 2000)
    }
  }

  const { growthData, earningsData } = useMemo(
    () => buildMonthlyData(data?.rewards ?? []),
    [data?.rewards]
  )

  const isMilestone  = data?.reward_mode === 'milestone'
  const qualified    = data?.qualified_referrals ?? 0
  const nextM        = data?.next_milestone ?? null
  const progressPct  = nextM ? Math.min(100, Math.round((qualified / nextM) * 100)) : 100

  const activeReferrals = (data?.rewards ?? []).filter(
    (r) => r.status === 'pending' || r.status === 'processing'
  ).length

  const visibleRewards = showAll ? (data?.rewards ?? []) : (data?.rewards ?? []).slice(0, 5)
  const hasMore = (data?.rewards?.length ?? 0) > 5

  const hasGrowthData   = growthData.some((d)   => d.value > 0)
  const hasEarningsData = earningsData.some((d) => d.value > 0)

  if (isLoading) return <ReferralsSkeleton />

  return (
    <div className="space-y-5 pt-1 pb-8">
      {/* Back */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      {/* ── Hero card ──────────────────────────────────────────────────── */}
      <div
        className="relative overflow-hidden rounded-3xl p-5 text-white"
        style={{ background: 'linear-gradient(135deg, #4F46E5 0%, #6D28D9 50%, #7C3AED 100%)' }}
      >
        {/* Decorative blobs */}
        <div className="pointer-events-none absolute -top-8 -right-8 h-40 w-40 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -bottom-6 -left-4 h-28 w-28 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute top-4 right-20 h-16 w-16 rounded-full bg-white/5" />

        <div className="relative">
          {/* Title row */}
          <div className="flex items-center gap-2.5 mb-4">
            <div className="h-10 w-10 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
              <Gift className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="font-black text-lg leading-none">Refer &amp; Earn</p>
              <p className="text-white/60 text-xs mt-0.5">
                {isMilestone ? 'Earn milestone rewards' : 'Earn ₦200 per friend'}
              </p>
            </div>
            <div className="ml-auto flex items-center gap-1 bg-white/20 rounded-full px-2.5 py-1">
              <Star className="h-3 w-3 text-yellow-300 fill-yellow-300" />
              <span className="text-[11px] font-bold">Active</span>
            </div>
          </div>

          {/* Referral code */}
          {data ? (
            <>
              <p className="text-white/60 text-[11px] font-semibold uppercase tracking-wider mb-1.5">
                Your Referral Code
              </p>
              <div className="flex items-center gap-2 bg-white/15 rounded-2xl px-4 py-3 backdrop-blur-sm border border-white/20">
                <p className="flex-1 font-mono text-2xl font-black tracking-[0.2em] text-white">
                  {data.referral_code}
                </p>
                <button
                  onClick={handleCopyCode}
                  className="h-9 w-9 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
                  title="Copy code"
                >
                  {codeCopied
                    ? <Check className="h-4 w-4 text-emerald-300" />
                    : <Copy className="h-4 w-4 text-white" />
                  }
                </button>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2.5 mt-3">
                <button
                  onClick={handleCopyCode}
                  className="flex-1 flex items-center justify-center gap-2 bg-white/20 hover:bg-white/30 border border-white/20 rounded-2xl py-2.5 text-sm font-semibold transition-colors"
                >
                  {codeCopied ? <Check className="h-4 w-4 text-emerald-300" /> : <Copy className="h-4 w-4" />}
                  {codeCopied ? 'Copied!' : 'Copy Code'}
                </button>
                <button
                  onClick={handleShare}
                  className="flex-1 flex items-center justify-center gap-2 bg-white text-indigo-700 rounded-2xl py-2.5 text-sm font-bold hover:bg-white/90 transition-colors shadow-lg"
                >
                  {linkCopied ? <Check className="h-4 w-4 text-emerald-600" /> : <Share2 className="h-4 w-4" />}
                  {linkCopied ? 'Link Copied' : 'Share Link'}
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/* ── Stats grid (2×3) ───────────────────────────────────────────── */}
      {data ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatCard
            icon={<Users className="h-4.5 w-4.5 text-blue-600" />}
            iconBg="bg-blue-50 dark:bg-blue-950/40"
            label="Total Referrals"
            value={data.total_referrals}
            sub="all time"
          />
          <StatCard
            icon={<TrendingUp className="h-4.5 w-4.5 text-emerald-600" />}
            iconBg="bg-emerald-50 dark:bg-emerald-950/40"
            label="Successful"
            value={data.successful_referrals}
            sub="qualified"
          />
          <StatCard
            icon={<Clock className="h-4.5 w-4.5 text-amber-600" />}
            iconBg="bg-amber-50 dark:bg-amber-950/40"
            label="Active"
            value={activeReferrals}
            sub="in progress"
          />
          <StatCard
            icon={<Wallet className="h-4.5 w-4.5 text-indigo-600" />}
            iconBg="bg-indigo-50 dark:bg-indigo-950/40"
            label="Total Earned"
            value={fmtCurrency(data.total_rewards)}
          />
          <StatCard
            icon={<AlertCircle className="h-4.5 w-4.5 text-orange-600" />}
            iconBg="bg-orange-50 dark:bg-orange-950/40"
            label="Pending"
            value={fmtCurrency(data.pending_rewards)}
            sub="awaiting credit"
          />
          <StatCard
            icon={<Gift className="h-4.5 w-4.5 text-rose-600" />}
            iconBg="bg-rose-50 dark:bg-rose-950/40"
            label={isMilestone ? 'Qualified' : 'Rewards'}
            value={isMilestone ? qualified : data.successful_referrals}
            sub={isMilestone ? `of ${nextM ?? '∞'} milestone` : 'earned'}
          />
        </div>
      ) : null}

      {/* ── Milestone progress (milestone mode only) ───────────────────── */}
      {isMilestone && data && (
        <Card className="!p-4">
          <div className="flex items-center gap-2 mb-3">
            <Target className="h-4 w-4 text-indigo-600" />
            <p className="text-sm font-bold text-ink">Milestone Progress</p>
            <span className="ml-auto text-sm font-black text-indigo-600">{progressPct}%</span>
          </div>
          <div className="h-2.5 rounded-full bg-surface-2 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-700"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          {nextM !== null ? (
            <p className="text-xs text-ink-muted mt-2">
              {qualified} of {nextM} referrals — {nextM - qualified} more to unlock your reward
            </p>
          ) : (
            <p className="text-xs text-success mt-2 flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5" /> All milestones reached — keep referring!
            </p>
          )}
        </Card>
      )}

      {/* ── Charts ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Referral growth */}
        <Card className="!p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold text-ink">Referral Growth</p>
            <span className="text-[10px] font-semibold text-ink-faint uppercase tracking-wider">Last 6 months</span>
          </div>
          {hasGrowthData ? (
            <BarChart data={growthData} color="#4F46E5" />
          ) : (
            <div className="h-24 flex flex-col items-center justify-center gap-1">
              <Users className="h-7 w-7 text-ink-faint" />
              <p className="text-xs text-ink-faint">No referrals yet</p>
            </div>
          )}
        </Card>

        {/* Earnings trend */}
        <Card className="!p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold text-ink">Earnings Trend</p>
            <span className="text-[10px] font-semibold text-ink-faint uppercase tracking-wider">Last 6 months</span>
          </div>
          {hasEarningsData ? (
            <AreaChart data={earningsData} color="#059669" />
          ) : (
            <div className="h-24 flex flex-col items-center justify-center gap-1">
              <TrendingUp className="h-7 w-7 text-ink-faint" />
              <p className="text-xs text-ink-faint">No earnings yet</p>
            </div>
          )}
        </Card>
      </div>

      {/* ── Referral history ────────────────────────────────────────────── */}
      <Card className="!p-4">
        <p className="text-sm font-bold text-ink mb-4">
          {isMilestone ? 'Qualifying Referrals' : 'Reward History'}
        </p>

        {!data?.rewards?.length ? (
          <EmptyReferrals rewardLabel={rewardLabel} />
        ) : (
          <div className="space-y-0">
            {visibleRewards.map((r, i) => {
              const cfg = STATUS_CFG[r.status] ?? STATUS_CFG.pending
              return (
                <div
                  key={r.id}
                  className={cn(
                    'flex items-center justify-between gap-3 py-3',
                    i < visibleRewards.length - 1 && 'border-b border-border',
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-8 w-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 flex items-center justify-center shrink-0">
                      <Users className="h-3.5 w-3.5 text-indigo-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink truncate">{r.referred_user_email}</p>
                      <p className="text-[11px] text-ink-faint">{fmtDate(r.created_at)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {!isMilestone && r.amount > 0 && (
                      <p className="text-sm font-black text-success">+{fmtCurrency(r.amount)}</p>
                    )}
                    <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-semibold', cfg.bg, cfg.text)}>
                      {cfg.label}
                    </span>
                  </div>
                </div>
              )
            })}

            {hasMore && (
              <button
                onClick={() => setShowAll((v) => !v)}
                className="w-full mt-2 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-surface-2 hover:bg-surface-1 border border-border text-xs font-semibold text-ink-muted transition-colors"
              >
                {showAll ? 'Show less' : `Show all ${data?.rewards?.length} referrals`}
                <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', showAll && 'rotate-90')} />
              </button>
            )}
          </div>
        )}
      </Card>

      {/* ── How it works ────────────────────────────────────────────────── */}
      <Card className="!p-4">
        <p className="text-sm font-bold text-ink mb-3">How it works</p>
        <div className="space-y-3">
          {[
            { step: '1', text: 'Share your referral code or link with friends' },
            { step: '2', text: 'They sign up using your code' },
            { step: '3', text: isMilestone ? 'Reach milestones to earn rewards' : 'Earn ₦200 instantly when they make their first transaction' },
          ].map(({ step, text }) => (
            <div key={step} className="flex items-start gap-3">
              <div className="h-6 w-6 rounded-full bg-indigo-600 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-[10px] font-black text-white">{step}</span>
              </div>
              <p className="text-xs text-ink-muted leading-relaxed">{text}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
