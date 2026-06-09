import { useState, useEffect } from 'react'

// BeforeInstallPromptEvent is not in the standard TS lib
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const VISIT_KEY   = 'hive-pwa-visits'
const DISMISS_KEY = 'hive-pwa-dismissed'
const INSTALL_KEY = 'hive-pwa-installed'
const COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000  // 14 days

function getVisitCount(): number {
  try { return parseInt(localStorage.getItem(VISIT_KEY) ?? '0', 10) || 0 } catch { return 0 }
}

function wasDismissedRecently(): boolean {
  try {
    const ts = parseInt(localStorage.getItem(DISMISS_KEY) ?? '0', 10)
    return ts > 0 && Date.now() - ts < COOLDOWN_MS
  } catch { return false }
}

function isRunningStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

export function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  return (
    /iPhone|iPad|iPod/.test(navigator.userAgent) &&
    !(window as Window & { MSStream?: unknown }).MSStream
  )
}

export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable'

export interface PwaInstallState {
  shouldShow:  boolean
  isIos:       boolean
  isInstalled: boolean
  install:     () => Promise<InstallOutcome>
  dismiss:     () => void
}

export function usePwaInstall(): PwaInstallState {
  const [promptEvent,    setPromptEvent]    = useState<BeforeInstallPromptEvent | null>(null)
  const [nativeInstalled, setNativeInstalled] = useState(false)
  const [localDismissed,  setLocalDismissed]  = useState(false)
  const [visitOk,         setVisitOk]         = useState(false)

  const isIos       = isIosDevice()
  const isInstalled = isRunningStandalone()

  // Count visits once per browser session so a hard reload isn't a new visit.
  // Second visit (count >= 2) unlocks the prompt.
  useEffect(() => {
    const counted = sessionStorage.getItem('hive-pwa-counted')
    if (!counted) {
      sessionStorage.setItem('hive-pwa-counted', '1')
      const next = getVisitCount() + 1
      try { localStorage.setItem(VISIT_KEY, String(next)) } catch { /* quota exceeded */ }
      setVisitOk(next >= 2)
    } else {
      setVisitOk(getVisitCount() >= 2)
    }
  }, [])

  // Capture the native browser install prompt (Android / Chrome Desktop / Edge).
  // Must preventDefault() to suppress the mini-infobar and control timing.
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setPromptEvent(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  // Detect when the OS completes the install (fires after user taps "Install").
  useEffect(() => {
    const handler = () => {
      setNativeInstalled(true)
      try { localStorage.setItem(INSTALL_KEY, '1') } catch { /* */ }
    }
    window.addEventListener('appinstalled', handler)
    return () => window.removeEventListener('appinstalled', handler)
  }, [])

  const alreadyInstalled =
    isInstalled ||
    nativeInstalled ||
    localStorage.getItem(INSTALL_KEY) === '1'

  const shouldShow =
    !alreadyInstalled &&
    !localDismissed &&
    !wasDismissedRecently() &&
    visitOk &&
    (!!promptEvent || isIos)

  const install = async (): Promise<InstallOutcome> => {
    if (!promptEvent) return 'unavailable'
    await promptEvent.prompt()
    const { outcome } = await promptEvent.userChoice
    setPromptEvent(null)
    if (outcome === 'accepted') setNativeInstalled(true)
    return outcome
  }

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())) } catch { /* */ }
    setLocalDismissed(true)
  }

  return {
    shouldShow,
    isIos,
    isInstalled: alreadyInstalled,
    install,
    dismiss,
  }
}
