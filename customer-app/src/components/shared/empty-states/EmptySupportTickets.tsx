import { Link } from 'react-router-dom'
import { MessageCircle } from 'lucide-react'

function TicketIllustration() {
  return (
    <svg viewBox="0 0 48 48" className="w-11 h-11" fill="none" aria-hidden="true">
      {/* Main chat bubble */}
      <rect x="6" y="8" width="30" height="22" rx="5"
        className="fill-teal-100 dark:fill-teal-900/40 stroke-teal-500 dark:stroke-teal-400"
        strokeWidth="1.5" />
      {/* Bubble tail */}
      <path d="M14 30 L10 38 L22 30Z"
        className="fill-teal-100 dark:fill-teal-900/40 stroke-teal-500 dark:stroke-teal-400"
        strokeWidth="1.5" strokeLinejoin="round" />
      {/* Question mark — vertical stroke */}
      <path d="M21 14 C21 14 21 12 24 12 C27 12 27 14 27 15 C27 16.5 24 18 24 20"
        className="stroke-teal-600 dark:stroke-teal-400"
        strokeWidth="2" strokeLinecap="round" fill="none" />
      {/* Question mark — dot */}
      <circle cx="24" cy="23" r="1.5"
        className="fill-teal-600 dark:fill-teal-400" />

      {/* Secondary smaller bubble — agent reply */}
      <rect x="22" y="28" width="22" height="14" rx="4"
        className="fill-white dark:fill-surface-2 stroke-teal-300 dark:stroke-teal-700"
        strokeWidth="1.5" />
      {/* Headset icon inside secondary bubble */}
      {/* Left earpiece */}
      <path d="M27 36 C27 33 33 33 33 36"
        className="stroke-teal-500 dark:stroke-teal-400"
        strokeWidth="1.4" strokeLinecap="round" fill="none" />
      <rect x="26" y="35.5" width="2" height="3" rx="1"
        className="fill-teal-500 dark:fill-teal-400" />
      <rect x="32" y="35.5" width="2" height="3" rx="1"
        className="fill-teal-500 dark:fill-teal-400" />
      {/* Mic arm */}
      <line x1="34" y1="37.5" x2="36" y2="37.5"
        className="stroke-teal-400 dark:stroke-teal-500"
        strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="36.5" cy="37.5" r="0.8"
        className="fill-teal-400 dark:fill-teal-500" />

      {/* Decorative tick mark in corner of main bubble */}
      <circle cx="36" cy="10" r="6"
        className="fill-white dark:fill-surface-1 stroke-teal-200 dark:stroke-teal-800"
        strokeWidth="1.5" />
      <circle cx="36" cy="10" r="4"
        className="fill-teal-500 dark:fill-teal-400" />
      <path d="M33.5 10 L35.5 12 L38.5 8"
        stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function EmptySupportTickets() {
  return (
    <div className="flex flex-col items-center justify-center py-14 px-6 text-center select-none">
      {/* Ambient glow */}
      <div className="relative mb-6">
        <div className="absolute inset-0 rounded-full bg-teal-400/10 dark:bg-teal-500/8 blur-3xl scale-[2.4] pointer-events-none" />
        <div className="relative h-[88px] w-[88px] rounded-3xl bg-gradient-to-br from-teal-50 to-teal-100 dark:from-teal-950/40 dark:to-teal-900/25 border border-teal-100 dark:border-teal-900/40 shadow-card flex items-center justify-center">
          <TicketIllustration />
        </div>
        {/* Decorative dots */}
        <span className="absolute -top-1.5 -right-1.5 h-3 w-3 rounded-full bg-teal-300/50 dark:bg-teal-500/30" />
        <span className="absolute -bottom-1 -left-2 h-2 w-2 rounded-full bg-teal-200/60 dark:bg-teal-700/30" />
      </div>

      <h3 className="text-xl font-black text-ink mb-2">No Open Tickets</h3>
      <p className="text-sm text-ink-muted leading-relaxed max-w-[260px] mb-6">
        You don't have any open support tickets. Need help? Our team is ready to assist.
      </p>

      <Link
        to="/support"
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-teal-600 text-white text-sm font-bold hover:bg-teal-700 active:scale-[0.98] transition-all"
        style={{ boxShadow: '0 4px 16px 0 rgba(13,148,136,0.28)' }}
      >
        <MessageCircle className="h-4 w-4" />
        Contact Support
      </Link>
    </div>
  )
}
