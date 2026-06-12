function GiftIllustration() {
  return (
    <svg viewBox="0 0 48 48" className="w-11 h-11" fill="none" aria-hidden="true">
      {/* Gift box lid */}
      <rect x="10" y="18" width="28" height="6" rx="2"
        className="fill-indigo-200 dark:fill-indigo-800/60 stroke-indigo-500 dark:stroke-indigo-400"
        strokeWidth="1.5" />
      {/* Gift box body */}
      <rect x="12" y="24" width="24" height="16" rx="2"
        className="fill-indigo-100 dark:fill-indigo-900/40 stroke-indigo-400 dark:stroke-indigo-500"
        strokeWidth="1.5" />
      {/* Vertical ribbon */}
      <rect x="22" y="18" width="4" height="22"
        className="fill-indigo-500 dark:fill-indigo-400" />
      {/* Horizontal ribbon on lid */}
      <rect x="10" y="20" width="28" height="2"
        className="fill-indigo-500 dark:fill-indigo-400" />

      {/* Bow left loop */}
      <path d="M24 18 C24 18 16 16 14 10 C13 7 18 6 22 12 L24 18Z"
        className="fill-indigo-400 dark:fill-indigo-500 stroke-indigo-500 dark:stroke-indigo-400"
        strokeWidth="1" />
      {/* Bow right loop */}
      <path d="M24 18 C24 18 32 16 34 10 C35 7 30 6 26 12 L24 18Z"
        className="fill-indigo-400 dark:fill-indigo-500 stroke-indigo-500 dark:stroke-indigo-400"
        strokeWidth="1" />
      {/* Bow centre knot */}
      <circle cx="24" cy="18" r="2.5"
        className="fill-indigo-600 dark:fill-indigo-300" />

      {/* Sparkle stars */}
      {/* Star top-right */}
      <path d="M39 10 L39.8 12.5 L42.5 12.5 L40.3 14 L41.1 16.5 L39 15 L36.9 16.5 L37.7 14 L35.5 12.5 L38.2 12.5Z"
        className="fill-amber-400 dark:fill-amber-300" />
      {/* Small star bottom-left */}
      <path d="M8 32 L8.5 33.5 L10 33.5 L8.8 34.4 L9.3 36 L8 35.1 L6.7 36 L7.2 34.4 L6 33.5 L7.5 33.5Z"
        className="fill-amber-300 dark:fill-amber-400/70" />
      {/* Tiny dot accent */}
      <circle cx="40" cy="28" r="1.5"
        className="fill-purple-400/60 dark:fill-purple-400/40" />
      <circle cx="7" cy="22" r="1"
        className="fill-indigo-300/60 dark:fill-indigo-600/50" />
    </svg>
  )
}

interface EmptyReferralsProps {
  rewardLabel?: string
}

export function EmptyReferrals({ rewardLabel = '₦200' }: EmptyReferralsProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center select-none">
      {/* Ambient glow */}
      <div className="relative mb-6">
        <div className="absolute inset-0 rounded-full bg-indigo-400/12 dark:bg-indigo-500/8 blur-3xl scale-[2.4] pointer-events-none" />
        <div className="relative h-[88px] w-[88px] rounded-3xl bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-950/40 dark:to-purple-950/30 border border-indigo-100 dark:border-indigo-900/40 shadow-card flex items-center justify-center">
          <GiftIllustration />
        </div>
        {/* Decorative dots */}
        <span className="absolute -top-1.5 -right-1.5 h-3 w-3 rounded-full bg-amber-300/50 dark:bg-amber-500/30" />
        <span className="absolute -bottom-1 -left-2 h-2 w-2 rounded-full bg-purple-300/50 dark:bg-purple-600/30" />
      </div>

      <h3 className="text-xl font-black text-ink mb-2">No Rewards Yet</h3>
      <p className="text-sm text-ink-muted leading-relaxed max-w-[260px]">
        Share your referral code with friends. You'll earn {rewardLabel} for every friend who signs up and makes a purchase.
      </p>
    </div>
  )
}
