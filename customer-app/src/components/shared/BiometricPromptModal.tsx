import { useState, useEffect } from 'react'
import { Fingerprint } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { useAuthStore } from '@/store/auth.store'
import { performNativeBiometric } from '@/hooks/useBiometricAuth'
import { biometricDeviceApi } from '@/api/biometric-device.api'
import { saveBiometricCredentials, getBiometricCredentials } from '@/lib/secureTokens'
import toast from 'react-hot-toast'

// ── Persistence ───────────────────────────────────────────────────────────────

const PROMPT_KEY = 'hive-biometric-prompt'
const COOLDOWN   = 30 * 24 * 60 * 60 * 1000  // 30 days

type BioRecord = { decision: 'enabled' | 'dismissed' | 'never'; ts: number }

export function isBiometricPromptSuppressed(biometricEnabled: boolean): boolean {
  if (biometricEnabled) return true  // already enabled — never prompt
  try {
    const raw = localStorage.getItem(PROMPT_KEY)
    if (!raw) return false
    const { decision, ts } = JSON.parse(raw) as BioRecord
    if (decision === 'never') return true
    // 'enabled' entry means a prior enrollment existed. If biometricEnabled is now false
    // (credentials lost/revoked), do NOT suppress — let the user re-enroll immediately.
    if (decision === 'enabled') return false
    if (decision === 'dismissed') return Date.now() - ts < COOLDOWN
  } catch { /* ignore */ }
  return false
}

/** Call when biometric is forcibly disabled (revoked, credentials lost) so the
 *  re-enrollment prompt appears on the next dashboard visit. */
export function clearBiometricPromptDecision(): void {
  try { localStorage.removeItem(PROMPT_KEY) } catch {}
}

function saveDecision(decision: BioRecord['decision']): void {
  localStorage.setItem(PROMPT_KEY, JSON.stringify({ decision, ts: Date.now() }))
}

// ── Device secret generation ──────────────────────────────────────────────────
// Generates a cryptographically random device_id (UUID) and device_secret
// (64 hex characters = 32 bytes = 256-bit entropy).

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  // Fallback for environments without crypto.randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

function generateDeviceSecret(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function getDeviceName(): string {
  if (Capacitor.isNativePlatform()) {
    const ua = navigator.userAgent
    if (/android/i.test(ua)) return 'Android Device'
    if (/iphone|ipad/i.test(ua)) return 'iPhone/iPad'
    return 'Mobile Device'
  }
  return 'Web Browser'
}

// ── Modal ─────────────────────────────────────────────────────────────────────

type Phase = 'idle' | 'loading' | 'success' | 'error'

export function BiometricPromptModal({ onClose }: { onClose: () => void }) {
  const { setBiometricEnabled, setBiometricDeviceId } = useAuthStore((s) => ({
    setBiometricEnabled:  s.setBiometricEnabled,
    setBiometricDeviceId: s.setBiometricDeviceId,
  }))
  const [phase, setPhase]       = useState<Phase>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const handleEnable = async () => {
    setPhase('loading')
    setErrorMsg('')

    // 1. Native biometric prompt — proves the user is physically present.
    const biometricResult = await performNativeBiometric('Enable biometric login for Hive Data')
    if (biometricResult !== 'success') {
      setPhase('idle')
      return // Cancelled — let user try again
    }

    // 2. Generate device credentials.
    const deviceId     = generateUuid()
    const deviceSecret = generateDeviceSecret()
    const deviceName   = getDeviceName()
    const platform     = Capacitor.isNativePlatform()
      ? (/iphone|ipad/i.test(navigator.userAgent) ? 'ios' : 'android')
      : 'web'

    // 3. Register with backend (requires active session via Authorization header).
    try {
      await biometricDeviceApi.register({
        device_id:     deviceId,
        device_name:   deviceName,
        platform:      platform as 'android' | 'ios' | 'web',
        device_secret: deviceSecret,
      })
    } catch {
      setPhase('error')
      setErrorMsg('Registration failed. Please try again.')
      return
    }

    // 4. Persist credentials in Android Keystore — await so we can verify the write.
    try {
      await saveBiometricCredentials(deviceId, deviceSecret)
    } catch {
      setPhase('error')
      setErrorMsg('Could not save credentials to secure storage. Please try again.')
      return
    }

    // 5. Verify the save actually worked before marking as enabled.
    const saved = await getBiometricCredentials()
    if (!saved) {
      setPhase('error')
      setErrorMsg('Credential verification failed. Please try again.')
      return
    }

    // 6. Mark biometric as enabled in store and remember the device_id.
    setBiometricDeviceId(deviceId)
    setBiometricEnabled(true)
    saveDecision('enabled')
    setPhase('success')
  }

  const handleLater = () => {
    saveDecision('dismissed')
    onClose()
  }

  const handleNever = () => {
    saveDecision('never')
    onClose()
  }

  // Auto-close 1.5 s after success
  useEffect(() => {
    if (phase !== 'success') return
    toast.success('Biometric login enabled')
    const t = setTimeout(onClose, 1500)
    return () => clearTimeout(t)
  }, [phase, onClose])

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bio-prompt-title"
    >
      {/* Backdrop — clicking it = Maybe Later */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={phase === 'idle' || phase === 'error' ? handleLater : undefined}
        aria-hidden="true"
      />

      <div className="relative w-full max-w-sm bg-surface-1 rounded-3xl shadow-modal border border-border p-6">

        {/* ── Success ─────────────────────────────────────────────────────── */}
        {phase === 'success' && (
          <div className="flex flex-col items-center text-center gap-3 py-3">
            <div className="h-14 w-14 rounded-full bg-success/10 flex items-center justify-center">
              <Fingerprint className="h-7 w-7 text-success" />
            </div>
            <div>
              <p className="text-base font-bold text-ink">Biometric login enabled!</p>
              <p className="text-sm text-ink-muted mt-1">
                Sign in faster next time with your fingerprint or face.
              </p>
            </div>
          </div>
        )}

        {/* ── Prompt / Error ───────────────────────────────────────────────── */}
        {phase !== 'success' && (
          <>
            <div className="flex justify-center mb-5">
              <div className="h-16 w-16 rounded-2xl bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center">
                <Fingerprint className="h-8 w-8 text-brand-600 dark:text-brand-400" />
              </div>
            </div>

            <h2
              id="bio-prompt-title"
              className="text-xl font-black text-ink text-center mb-2"
            >
              Sign In Faster
            </h2>
            <p className="text-sm text-ink-muted text-center mb-6">
              Enable fingerprint or face login for quick, secure access — no password needed next time.
            </p>

            {phase === 'error' && (
              <p className="text-xs text-danger text-center mb-4">{errorMsg}</p>
            )}

            <div className="space-y-2.5">
              <button
                onClick={handleEnable}
                disabled={phase === 'loading'}
                className="w-full py-3 rounded-2xl text-sm font-bold transition-all flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 text-white shadow-brand active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {phase === 'loading' ? (
                  <>
                    <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    Setting up…
                  </>
                ) : (
                  <>
                    <Fingerprint className="h-4 w-4" />
                    {phase === 'error' ? 'Try Again' : 'Enable Biometric Login'}
                  </>
                )}
              </button>

              <button
                onClick={handleLater}
                disabled={phase === 'loading'}
                className="w-full py-2.5 text-sm font-medium text-ink-muted hover:text-ink transition-colors disabled:opacity-50"
              >
                Maybe Later
              </button>

              <button
                onClick={handleNever}
                disabled={phase === 'loading'}
                className="w-full py-2 text-xs text-ink-faint hover:text-ink-muted transition-colors disabled:opacity-50"
              >
                Don't ask again
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
