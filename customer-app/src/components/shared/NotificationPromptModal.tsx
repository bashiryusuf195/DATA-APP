import { useState, useEffect, useCallback } from 'react'
import { Bell, BellOff, CheckCircle2, X } from 'lucide-react'
import { cn } from '@/utils/cn'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import { notificationsApi } from '@/api/notifications.api'
import { useQueryClient } from '@tanstack/react-query'

// ── Persistence ───────────────────────────────────────────────────────────────

const PROMPT_KEY       = 'hive-push-prompt'
const DISMISS_COOLDOWN = 30 * 24 * 60 * 60 * 1000   // 30 days in ms

type PromptRecord = { decision: 'granted' | 'dismissed'; ts: number }

/**
 * Returns true if the onboarding prompt should be shown.
 * – Never shows when the browser has already granted or hard-denied permission.
 * – Never shows if push is not supported in this browser.
 * – On a first visit (no stored record): always shows.
 * – After "Maybe Later": re-shows once 30 days have elapsed.
 * – After "Enable" (granted or browser-denied): never shows again.
 */
export function shouldShowNotificationPrompt(): boolean {
  if (typeof Notification === 'undefined') return false
  if (Notification.permission === 'granted') return false
  if (Notification.permission === 'denied')  return false
  try {
    const raw = localStorage.getItem(PROMPT_KEY)
    if (!raw) return true                                       // first visit
    const { decision, ts } = JSON.parse(raw) as PromptRecord
    if (decision === 'granted')   return false                  // already set up
    if (decision === 'dismissed') return Date.now() - ts >= DISMISS_COOLDOWN
  } catch { /* ignore corrupt storage */ }
  return true
}

function saveDecision(decision: PromptRecord['decision']): void {
  localStorage.setItem(PROMPT_KEY, JSON.stringify({ decision, ts: Date.now() }))
}

// ── Modal ─────────────────────────────────────────────────────────────────────

type Phase = 'idle' | 'loading' | 'success' | 'denied' | 'unsupported'

const BULLETS = [
  'Wallet funding alerts',
  'Purchase confirmations',
  'Failed transaction alerts',
  'Important service announcements',
]

export function NotificationPromptModal({ onClose }: { onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>('idle')
  const qc   = useQueryClient()
  const push = usePushNotifications()

  const handleEnable = async () => {
    if (push.permission === 'unconfigured' || push.permission === 'unsupported') {
      setPhase('unsupported')
      return
    }
    setPhase('loading')
    const ok = await push.enable()
    if (ok) {
      saveDecision('granted')
      // Silently auto-enable push pref so Settings reflects the new state
      try {
        const updated = await notificationsApi.updatePreferences({ push: true })
        qc.setQueryData(['notification-prefs'], updated)
      } catch { /* non-fatal */ }
      setPhase('success')
    } else {
      const perm = typeof Notification !== 'undefined' ? Notification.permission : 'denied'
      setPhase(perm === 'denied' ? 'denied' : 'unsupported')
    }
  }

  const handleDismiss = useCallback(() => {
    saveDecision('dismissed')
    onClose()
  }, [onClose])

  // Auto-close 2.5 s after success
  useEffect(() => {
    if (phase !== 'success') return
    const t = setTimeout(onClose, 2500)
    return () => clearTimeout(t)
  }, [phase, onClose])

  // Clicking backdrop or X closes — "dismissed" only when in prompt state
  const handleBackdrop = phase === 'idle' ? handleDismiss : onClose

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="notif-prompt-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleBackdrop}
        aria-hidden="true"
      />

      {/* Card */}
      <div className="relative w-full max-w-sm bg-surface-1 rounded-3xl shadow-modal border border-border p-6">

        {/* Close */}
        <button
          onClick={handleBackdrop}
          className="absolute top-4 right-4 p-1.5 rounded-xl text-ink-faint hover:text-ink hover:bg-surface-2 transition-colors"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        {/* ── Success ─────────────────────────────────────────────────────── */}
        {phase === 'success' && (
          <div className="flex flex-col items-center text-center gap-3 py-3">
            <div className="h-14 w-14 rounded-full bg-success/10 flex items-center justify-center">
              <CheckCircle2 className="h-7 w-7 text-success" />
            </div>
            <div>
              <p className="text-base font-bold text-ink">Notifications enabled!</p>
              <p className="text-sm text-ink-muted mt-1">
                You're all set. We'll keep you in the loop.
              </p>
            </div>
          </div>
        )}

        {/* ── Browser denied ──────────────────────────────────────────────── */}
        {phase === 'denied' && (
          <div className="flex flex-col items-center text-center gap-3 py-3">
            <div className="h-14 w-14 rounded-full bg-warning/10 flex items-center justify-center">
              <BellOff className="h-7 w-7 text-warning" />
            </div>
            <div>
              <p className="text-base font-bold text-ink">Permission denied</p>
              <p className="text-sm text-ink-muted mt-1 leading-relaxed">
                Notification permission was denied by your browser. To enable it later, update
                the site's notification permissions in your browser settings, then turn on{' '}
                <strong>Push Notifications</strong> in the app Settings.
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-full py-2.5 rounded-2xl bg-surface-2 text-sm font-semibold text-ink hover:bg-border transition-colors"
            >
              Got it
            </button>
          </div>
        )}

        {/* ── Not supported / unconfigured ────────────────────────────────── */}
        {phase === 'unsupported' && (
          <div className="flex flex-col items-center text-center gap-3 py-3">
            <div className="h-14 w-14 rounded-full bg-surface-2 flex items-center justify-center">
              <Bell className="h-7 w-7 text-ink-faint" />
            </div>
            <div>
              <p className="text-base font-bold text-ink">Not available</p>
              <p className="text-sm text-ink-muted mt-1">
                Push notifications are not supported in this browser or on this device.
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-full py-2.5 rounded-2xl bg-surface-2 text-sm font-semibold text-ink hover:bg-border transition-colors"
            >
              OK
            </button>
          </div>
        )}

        {/* ── Default prompt ───────────────────────────────────────────────── */}
        {(phase === 'idle' || phase === 'loading') && (
          <>
            <div className="flex justify-center mb-5">
              <div className="h-16 w-16 rounded-2xl bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center">
                <Bell className="h-8 w-8 text-brand-600 dark:text-brand-400" />
              </div>
            </div>

            <h2
              id="notif-prompt-title"
              className="text-xl font-black text-ink text-center mb-2"
            >
              Stay Updated
            </h2>
            <p className="text-sm text-ink-muted text-center mb-5">
              Enable notifications to receive:
            </p>

            <ul className="space-y-2.5 mb-6">
              {BULLETS.map((b) => (
                <li key={b} className="flex items-center gap-3">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-600 shrink-0" />
                  <span className="text-sm text-ink">{b}</span>
                </li>
              ))}
            </ul>

            <div className="space-y-2.5">
              <button
                onClick={handleEnable}
                disabled={phase === 'loading'}
                className={cn(
                  'w-full py-3 rounded-2xl text-sm font-bold transition-all',
                  'flex items-center justify-center gap-2',
                  phase === 'loading'
                    ? 'bg-brand-400 text-white cursor-not-allowed'
                    : 'bg-brand-600 hover:bg-brand-700 text-white shadow-brand active:scale-[0.98]',
                )}
              >
                {phase === 'loading' ? (
                  <>
                    <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    Enabling…
                  </>
                ) : (
                  <>
                    <Bell className="h-4 w-4" />
                    Enable Notifications
                  </>
                )}
              </button>

              <button
                onClick={handleDismiss}
                disabled={phase === 'loading'}
                className="w-full py-2.5 text-sm font-medium text-ink-muted hover:text-ink transition-colors disabled:opacity-50"
              >
                Maybe Later
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
