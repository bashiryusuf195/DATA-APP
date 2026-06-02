import type { Announcement } from '@/types'

interface Props {
  items: Announcement[]
}

export function AnnouncementTicker({ items }: Props) {
  if (items.length === 0) return null

  const text = items.map((a) => a.message).join('   •   ')
  // Double the text so the loop is seamless
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
        className="w-full overflow-hidden bg-amber-500 text-white"
        aria-label="Announcement ticker"
        role="marquee"
      >
        <div className="flex items-center h-8 px-3 gap-2">
          <span className="shrink-0 text-[10px] font-bold uppercase tracking-widest opacity-80 mr-1">
            Notice
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
