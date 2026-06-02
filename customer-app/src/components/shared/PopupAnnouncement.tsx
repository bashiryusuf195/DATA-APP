import { useState, useEffect } from 'react'
import { X, Megaphone } from 'lucide-react'
import type { Announcement } from '@/types'

const STORAGE_KEY = 'vtu_dismissed_announcements'

function getDismissedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set()
  } catch {
    return new Set()
  }
}

function saveDismissedId(id: string): void {
  try {
    const ids = getDismissedIds()
    ids.add(id)
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]))
  } catch {
    // localStorage unavailable — skip persistence
  }
}

interface Props {
  announcements: Announcement[]
}

export function PopupAnnouncement({ announcements }: Props) {
  // Pick the first undismissed popup, sorted by priority desc (already sorted by API)
  const [currentId, setCurrentId] = useState<string | null>(null)

  useEffect(() => {
    const dismissed = getDismissedIds()
    const next = announcements.find((a) => !dismissed.has(a.id))
    setCurrentId(next?.id ?? null)
  }, [announcements])

  const current = announcements.find((a) => a.id === currentId) ?? null

  if (!current) return null

  const dismiss = () => {
    saveDismissedId(current.id)
    // Show next undismissed popup (if any)
    const dismissed = getDismissedIds()
    const next = announcements.find((a) => !dismissed.has(a.id))
    setCurrentId(next?.id ?? null)
  }

  return (
    /* Backdrop */
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
        {/* Header stripe */}
        <div className="flex items-center gap-3 px-5 py-4 bg-brand-600">
          <Megaphone className="h-5 w-5 text-white shrink-0" />
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
