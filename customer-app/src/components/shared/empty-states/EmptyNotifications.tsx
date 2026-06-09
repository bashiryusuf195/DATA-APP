function BellIllustration() {
  return (
    <svg viewBox="0 0 48 48" className="w-11 h-11" fill="none" aria-hidden="true">
      {/* Bell body */}
      <path
        d="M24 6 C16 6 14 12 14 18 L12 30 H36 L34 18 C34 12 32 6 24 6Z"
        className="fill-blue-100 dark:fill-blue-900/40 stroke-blue-500 dark:stroke-blue-400"
        strokeWidth="1.5" strokeLinejoin="round"
      />
      {/* Bell mouth (bottom curve) */}
      <path
        d="M12 30 Q12 34 24 34 Q36 34 36 30"
        className="fill-blue-100 dark:fill-blue-900/40 stroke-blue-500 dark:stroke-blue-400"
        strokeWidth="1.5" strokeLinecap="round"
      />
      {/* Clapper */}
      <circle cx="24" cy="37" r="2.5"
        className="fill-blue-500 dark:fill-blue-400" />
      {/* Handle notch at top */}
      <path d="M21 6 Q24 3 27 6"
        className="stroke-blue-400 dark:stroke-blue-500"
        strokeWidth="1.5" strokeLinecap="round" fill="none" />

      {/* Checkmark badge — bottom-right of bell, indicates "all read" */}
      <circle cx="36" cy="12" r="7"
        className="fill-white dark:fill-surface-1 stroke-blue-200 dark:stroke-blue-800"
        strokeWidth="1.5" />
      <circle cx="36" cy="12" r="5"
        className="fill-blue-500 dark:fill-blue-400" />
      <polyline points="33,12 35.5,14.5 39,10"
        stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />

      {/* Subtle ring lines (notification ripple, now quiet) */}
      <path d="M8 20 Q6 16 8 12"
        className="stroke-blue-200 dark:stroke-blue-700/50"
        strokeWidth="1.2" strokeLinecap="round" fill="none" />
      <path d="M40 20 Q42 16 40 12"
        className="stroke-blue-200 dark:stroke-blue-700/50"
        strokeWidth="1.2" strokeLinecap="round" fill="none" />
    </svg>
  )
}

export function EmptyNotifications() {
  return (
    <div className="flex flex-col items-center justify-center py-14 px-6 text-center select-none">
      {/* Ambient glow */}
      <div className="relative mb-6">
        <div className="absolute inset-0 rounded-full bg-blue-400/10 dark:bg-blue-500/8 blur-3xl scale-[2.4] pointer-events-none" />
        <div className="relative h-[88px] w-[88px] rounded-3xl bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/40 dark:to-blue-900/25 border border-blue-100 dark:border-blue-900/40 shadow-card flex items-center justify-center">
          <BellIllustration />
        </div>
        {/* Decorative dots */}
        <span className="absolute -top-1.5 -right-1.5 h-3 w-3 rounded-full bg-blue-300/40 dark:bg-blue-600/30" />
        <span className="absolute -bottom-1 -left-2 h-2 w-2 rounded-full bg-blue-200/60 dark:bg-blue-700/30" />
      </div>

      <h3 className="text-xl font-black text-ink mb-2">All Caught Up</h3>
      <p className="text-sm text-ink-muted leading-relaxed max-w-[260px]">
        You're up to date. We'll notify you of wallet activity, purchases, and important updates.
      </p>
    </div>
  )
}
