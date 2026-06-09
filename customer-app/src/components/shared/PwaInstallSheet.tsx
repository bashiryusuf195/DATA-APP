import { useState, useEffect, useRef } from 'react'
import { X, Download, CheckCircle2 } from 'lucide-react'
import { cn } from '@/utils/cn'
import { useHaptic } from '@/hooks/useHaptic'
import type { InstallOutcome } from '@/hooks/usePwaInstall'

interface Props {
  isIos:     boolean
  onInstall: () => Promise<InstallOutcome>
  onDismiss: () => void   // "Not Now" — saves 14-day cooldown
  onClose:   () => void   // neutral close (success, backdrop, iOS got-it)
}

const BENEFITS = [
  'Instant access from your home screen',
  'Receive push notifications',
  'Faster loading & offline support',
]

// Safari share icon (iOS step 1 illustration)
function SafariShareIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  )
}

type Phase = 'prompt' | 'ios-guide' | 'installing' | 'success'

export function PwaInstallSheet({ isIos, onInstall, onDismiss, onClose }: Props) {
  const [phase,   setPhase]   = useState<Phase>('prompt')
  const [visible, setVisible] = useState(false)
  const [dragY,   setDragY]   = useState(0)
  const dragStartRef           = useRef(0)
  const dragYRef               = useRef(0)
  const { tap, success }       = useHaptic()

  // Staggered mount → triggers CSS enter animation
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 30)
    return () => clearTimeout(t)
  }, [])

  // Auto-close 2s after success
  useEffect(() => {
    if (phase !== 'success') return
    const t = setTimeout(onClose, 2000)
    return () => clearTimeout(t)
  }, [phase, onClose])

  const handleInstall = async () => {
    tap()
    if (isIos) {
      setPhase('ios-guide')
      return
    }
    setPhase('installing')
    const outcome = await onInstall()
    if (outcome === 'accepted') {
      success()
      setPhase('success')
    } else {
      onClose()
    }
  }

  const backdropClick = phase === 'prompt' ? onDismiss : onClose

  // Drag-to-dismiss gesture on the handle
  function onDragStart(e: React.TouchEvent) {
    dragStartRef.current = e.touches[0].clientY
    dragYRef.current     = 0
  }
  function onDragMove(e: React.TouchEvent) {
    const delta = e.touches[0].clientY - dragStartRef.current
    const clamped = Math.max(0, delta)
    dragYRef.current = clamped
    setDragY(clamped)
  }
  function onDragEnd() {
    if (dragYRef.current > 120) { backdropClick() }
    else                        { setDragY(0) }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pwa-sheet-title"
    >
      {/* Backdrop */}
      <div
        className={cn(
          'absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300',
          visible ? 'opacity-100' : 'opacity-0',
        )}
        onClick={backdropClick}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        className={cn(
          'relative w-full sm:max-w-sm',
          'bg-surface-1 border border-border shadow-modal',
          'rounded-t-3xl sm:rounded-3xl',
        )}
        style={dragY > 0
          ? { transform: `translateY(${dragY}px)`, transition: 'none' }
          : {
              transition: 'transform 320ms cubic-bezier(0.32, 0.72, 0, 1), opacity 300ms ease',
              transform:  visible ? 'translateY(0)' : 'translateY(100%)',
              opacity:    visible ? 1 : 0,
            }
        }
      >
        {/* Drag handle — mobile only */}
        <div
          className="flex justify-center pt-3 pb-1 sm:hidden cursor-grab active:cursor-grabbing"
          onTouchStart={onDragStart}
          onTouchMove={onDragMove}
          onTouchEnd={onDragEnd}
          aria-hidden="true"
        >
          <div className="h-1 w-10 rounded-full bg-border" />
        </div>

        {/* Close / dismiss button */}
        <button
          onClick={backdropClick}
          className="absolute top-4 right-4 p-1.5 rounded-xl text-ink-faint hover:text-ink hover:bg-surface-2 transition-colors"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="px-6 pb-8 pt-4 sm:pt-6">

          {/* ── Success ───────────────────────────────────────────── */}
          {phase === 'success' && (
            <div className="flex flex-col items-center text-center gap-4 py-4">
              <div className="h-16 w-16 rounded-2xl bg-success/10 flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-success" />
              </div>
              <div>
                <p className="text-lg font-black text-ink">Installed!</p>
                <p className="text-sm text-ink-muted mt-1.5 leading-relaxed">
                  Hive Data has been added to your home screen.
                </p>
              </div>
            </div>
          )}

          {/* ── iOS step-by-step guide ────────────────────────────── */}
          {phase === 'ios-guide' && (
            <>
              <div className="flex items-center gap-3 mb-5">
                <AppIcon />
                <div>
                  <h2
                    id="pwa-sheet-title"
                    className="text-base font-black text-ink leading-tight"
                  >
                    Add to Home Screen
                  </h2>
                  <p className="text-xs text-ink-faint mt-0.5">Follow these steps in Safari</p>
                </div>
              </div>

              <ol className="space-y-4 mb-6">
                <Step n={1}>
                  Tap the{' '}
                  <strong className="font-semibold text-ink">Share</strong>{' '}
                  button{' '}
                  <SafariShareIcon className="inline h-3.5 w-3.5 align-middle text-brand-600" />{' '}
                  in Safari's toolbar (bottom of screen on iPhone)
                </Step>
                <Step n={2}>
                  Scroll down and tap{' '}
                  <strong className="font-semibold text-ink">"Add to Home Screen"</strong>
                </Step>
                <Step n={3}>
                  Tap{' '}
                  <strong className="font-semibold text-ink">"Add"</strong>{' '}
                  in the top-right corner to confirm
                </Step>
              </ol>

              <button
                onClick={onClose}
                className="w-full py-3 rounded-2xl bg-brand-600 text-white text-sm font-bold hover:bg-brand-700 active:scale-[0.98] transition-all"
              >
                Got it
              </button>
            </>
          )}

          {/* ── Main install prompt ──────────────────────────────── */}
          {(phase === 'prompt' || phase === 'installing') && (
            <>
              {/* App identity */}
              <div className="flex items-center gap-3.5 mb-5">
                <AppIcon />
                <div>
                  <h2 id="pwa-sheet-title" className="text-lg font-black text-ink leading-tight">
                    Install Hive Data
                  </h2>
                  <p className="text-xs text-ink-faint mt-0.5">Free • No app store required</p>
                </div>
              </div>

              {/* Pitch */}
              <p className="text-sm text-ink-muted mb-5 leading-relaxed">
                Get faster access, push notifications, and an app-like experience.
              </p>

              {/* Benefits */}
              <ul className="space-y-2.5 mb-6">
                {BENEFITS.map((b) => (
                  <li key={b} className="flex items-center gap-2.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-brand-600 shrink-0" />
                    <span className="text-sm text-ink">{b}</span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <div className="space-y-2">
                <button
                  onClick={handleInstall}
                  disabled={phase === 'installing'}
                  className={cn(
                    'w-full py-3 rounded-2xl text-sm font-bold',
                    'flex items-center justify-center gap-2',
                    'transition-all active:scale-[0.98]',
                    phase === 'installing'
                      ? 'bg-brand-400 text-white cursor-not-allowed'
                      : 'bg-brand-600 text-white hover:bg-brand-700 shadow-brand',
                  )}
                >
                  {phase === 'installing' ? (
                    <>
                      <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                      Installing…
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4" />
                      {isIos ? 'Show me how' : 'Install App'}
                    </>
                  )}
                </button>

                <button
                  onClick={onDismiss}
                  disabled={phase === 'installing'}
                  className="w-full py-2.5 text-sm font-medium text-ink-muted hover:text-ink transition-colors disabled:opacity-40"
                >
                  Not Now
                </button>
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────

function AppIcon() {
  const [broken, setBroken] = useState(false)
  return broken ? (
    <div className="h-14 w-14 rounded-2xl bg-brand-600 flex items-center justify-center shrink-0 shadow-md">
      <span className="text-white text-xl font-black select-none">H</span>
    </div>
  ) : (
    <img
      src="/icons/icon-192x192.png"
      alt="Hive Data"
      className="h-14 w-14 rounded-2xl shadow-md shrink-0"
      onError={() => setBroken(true)}
    />
  )
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="h-6 w-6 rounded-full bg-brand-600 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
        {n}
      </span>
      <p className="text-sm text-ink-muted leading-relaxed">{children}</p>
    </li>
  )
}
