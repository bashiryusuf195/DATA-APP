import type { Announcement, AnnouncementSeverity } from '@/types'

interface Props {
  items: Announcement[]
}

// Highest severity wins for the ticker bar color.
// Priority: critical > warning > success > info
const SEVERITY_RANK: Record<AnnouncementSeverity, number> = {
  critical: 3, warning: 2, success: 1, info: 0,
}

const SEVERITY_STYLE: Record<AnnouncementSeverity, { bar: string; label: string }> = {
  info:     { bar: 'bg-brand-600',   label: 'Notice'  },
  success:  { bar: 'bg-emerald-600', label: 'Update'  },
  warning:  { bar: 'bg-amber-500',   label: 'Warning' },
  critical: { bar: 'bg-red-600',     label: 'Alert'   },
}

function dominantSeverity(items: Announcement[]): AnnouncementSeverity {
  return items.reduce<AnnouncementSeverity>((top, item) => {
    const s = (item.severity ?? 'info') as AnnouncementSeverity
    return SEVERITY_RANK[s] > SEVERITY_RANK[top] ? s : top
  }, 'info')
}

export function AnnouncementTicker({ items }: Props) {
  if (items.length === 0) return null

  const severity = dominantSeverity(items)
  const { bar, label } = SEVERITY_STYLE[severity]

  const text    = items.map((a) => a.message).join('   •   ')
  const content = `${text}   •   ${text}`
  const duration = Math.max(18, content.length * 0.09)

  return (
    <>
      <style>{`
        @keyframes ticker-scroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .ticker-track {
          animation: ticker-scroll ${duration}s linear infinite;
          will-change: transform;
        }
      `}</style>
      <div
        className={`w-full overflow-hidden ${bar} text-white`}
        aria-label="Announcement ticker"
        role="marquee"
      >
        <div className="flex items-center h-8 px-3 gap-2">
          <span className="shrink-0 text-[10px] font-bold uppercase tracking-widest opacity-80 mr-1">
            {label}
          </span>
          <div className="flex-1 overflow-hidden relative">
            <div className="ticker-track inline-block whitespace-nowrap text-xs font-medium">
              {content}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
