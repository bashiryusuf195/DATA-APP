import { useState, useEffect } from 'react'
import { X, Megaphone, CheckCircle2, AlertTriangle, AlertCircle } from 'lucide-react'
import type { Announcement, AnnouncementSeverity } from '@/types'

// ── Per-session dismissal — cleared automatically on logout/new tab ───────────
// sessionStorage is scoped to the browser tab session; clearing on logout is
// handled implicitly because a fresh login opens a new session context.
const STORAGE_KEY = 'hivedata_dismissed_popups'

function getDismissedIds(): Set<string> {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set()
  } catch {
    return new Set()
  }
}

function saveDismissedId(id: string): void {
  try {
    const ids = getDismissedIds()
    ids.add(id)
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]))
  } catch {
    // sessionStorage unavailable — skip persistence
  }
}

// ── Severity appearance map ───────────────────────────────────────────────────

const SEVERITY_CONFIG: Record<
  AnnouncementSeverity,
  { headerBg: string; Icon: React.FC<{ className?: string }> }
> = {
  info:     { headerBg: 'bg-brand-600',   Icon: Megaphone      },
  success:  { headerBg: 'bg-emerald-600', Icon: CheckCircle2   },
  warning:  { headerBg: 'bg-amber-500',   Icon: AlertTriangle  },
  critical: { headerBg: 'bg-red-600',     Icon: AlertCircle    },
}

interface Props {
  announcements: Announcement[]
}

export function PopupAnnouncement({ announcements }: Props) {
  const [currentId, setCurrentId] = useState<string | null>(null)

  useEffect(() => {
    const dismissed = getDismissedIds()
    const next = announcements.find((a) => !dismissed.has(a.id))
    setCurrentId(next?.id ?? null)
  }, [announcements])

  const current = announcements.find((a) => a.id === currentId) ?? null

  if (!current) return null

  const severity = (current.severity ?? 'info') as AnnouncementSeverity
  const { headerBg, Icon } = SEVERITY_CONFIG[severity]

  const dismiss = () => {
    saveDismissedId(current.id)
    const dismissed = getDismissedIds()
    const next = announcements.find((a) => !dismissed.has(a.id))
    setCurrentId(next?.id ?? null)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 animate-fade-in"
      onClick={dismiss}
      aria-modal="true"
      role="dialog"
      aria-label={current.title}
    >
      {/* Panel — stop propagation so clicks inside don't dismiss */}
      <div
        className="relative w-full max-w-sm rounded-2xl bg-surface-1 shadow-xl border border-border overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header stripe — severity-tinted */}
        <div className={`flex items-center gap-3 px-5 py-4 ${headerBg}`}>
          <Icon className="h-5 w-5 text-white shrink-0" />
          <p className="text-sm font-bold text-white flex-1 leading-snug">{current.title}</p>
          <button
            onClick={dismiss}
            className="text-white/70 hover:text-white transition-colors"
            aria-label="Dismiss announcement"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          <p className="text-sm text-ink leading-relaxed whitespace-pre-wrap">{current.message}</p>
        </div>

        {/* Footer */}
        <div className="px-5 pb-4 flex justify-end">
          <button
            onClick={dismiss}
            className="text-sm font-semibold text-brand-600 hover:text-brand-700 transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
