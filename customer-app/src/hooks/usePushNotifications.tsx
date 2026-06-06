import { useState, useCallback, useRef } from 'react'
import { getToken, onMessage } from 'firebase/messaging'
import toast from 'react-hot-toast'
import { getFirebaseMessaging, VAPID_KEY } from '@/lib/firebase'
import { notificationsApi } from '@/api/notifications.api'
import { useNavigate } from 'react-router-dom'

export type PermissionState = 'default' | 'granted' | 'denied' | 'unsupported' | 'unconfigured'

// ── Deep-link routing ─────────────────────────────────────────────────────────

function useHandleDeepLink() {
  const navigate = useNavigate()
  return useCallback((deepLink?: string) => {
    if (!deepLink) return
    try {
      const url = new URL(deepLink, window.location.origin)
      if (url.origin === window.location.origin) {
        navigate(url.pathname + url.search)
      }
    } catch {
      if (deepLink.startsWith('/')) navigate(deepLink)
    }
  }, [navigate])
}

// ── Foreground message listener ───────────────────────────────────────────────

let _foregroundListenerAttached = false

export function attachForegroundListener(onDeepLink: (link: string) => void): void {
  if (_foregroundListenerAttached) return
  const messaging = getFirebaseMessaging()
  if (!messaging) return
  _foregroundListenerAttached = true

  onMessage(messaging, (payload) => {
    const notification = payload.notification
    const data         = payload.data ?? {}
    const title        = notification?.title ?? 'Hive Data'
    const body         = notification?.body  ?? ''
    const deepLink     = data['deep_link'] ?? ''

    toast(
      (t) => (
        <button
          className="text-left w-full"
          onClick={() => { toast.dismiss(t.id); if (deepLink) onDeepLink(deepLink) }}
        >
          <p className="text-sm font-semibold leading-tight">{title}</p>
          {body && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{body}</p>}
        </button>
      ),
      { duration: 6000, icon: '🔔' },
    )
  })
}

// ── SW registration helper ────────────────────────────────────────────────────

async function getSwRegistration(): Promise<ServiceWorkerRegistration | undefined> {
  if (!('serviceWorker' in navigator)) return undefined
  try {
    // Wait for the controller to be ready — this resolves once the SW is active.
    const reg = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js')
    console.log(
      '[PUSH] SW registration:',
      reg
        ? `scope=${reg.scope} active=${reg.active?.state ?? 'none'} installing=${reg.installing?.state ?? 'none'}`
        : 'not found',
    )
    return reg
  } catch (err) {
    console.warn('[PUSH] Could not read SW registration:', err)
    return undefined
  }
}

// ── Main hook ─────────────────────────────────────────────────────────────────

export function usePushNotifications() {
  const [permission, setPermission] = useState<PermissionState>(() => {
    if (typeof Notification === 'undefined') return 'unsupported'
    if (!getFirebaseMessaging())             return 'unconfigured'
    return Notification.permission as PermissionState
  })
  const [loading,  setLoading]  = useState(false)
  const currentToken            = useRef<string | null>(null)
  const handleDeepLink          = useHandleDeepLink()

  const enable = useCallback(async (): Promise<boolean> => {
    console.log(
      '[PUSH] enable() called | browser permission =',
      typeof Notification !== 'undefined' ? Notification.permission : 'N/A (unsupported)',
    )

    const messaging = getFirebaseMessaging()
    if (!messaging) {
      console.warn('[PUSH] Firebase Messaging is null — check VITE_FIREBASE_* build-time env vars')
      setPermission('unconfigured')
      return false
    }
    console.log('[PUSH] Firebase Messaging OK')

    if (typeof Notification === 'undefined') {
      console.warn('[PUSH] Notification API not available in this browser')
      setPermission('unsupported')
      return false
    }

    setLoading(true)
    try {
      // ── 1. Request permission ─────────────────────────────────────────────
      console.log('[PUSH] Requesting notification permission…')
      const perm = await Notification.requestPermission()
      console.log('[PUSH] Permission result:', perm)
      if (perm !== 'granted') {
        setPermission('denied')
        return false
      }
      setPermission('granted')

      // ── 2. VAPID key check ────────────────────────────────────────────────
      if (!VAPID_KEY) {
        console.warn('[PUSH] VITE_FIREBASE_VAPID_KEY is empty — cannot call getToken()')
        return false
      }
      console.log('[PUSH] VAPID key present (length:', VAPID_KEY.length, ')')

      // ── 3. Get SW registration (passed explicitly to avoid getToken having
      //       to discover it — prevents a race on first-install where the SW
      //       may still be installing when getToken is called). ──────────────
      const swRegistration = await getSwRegistration()

      // ── 4. Get FCM token ──────────────────────────────────────────────────
      console.log('[PUSH] Calling getToken()…')
      let token: string
      try {
        token = await getToken(messaging, {
          vapidKey: VAPID_KEY,
          ...(swRegistration ? { serviceWorkerRegistration: swRegistration } : {}),
        })
      } catch (tokenErr) {
        console.error('[PUSH] getToken() threw:', tokenErr)
        return false
      }

      if (!token) {
        console.error('[PUSH] getToken() returned empty string — check VAPID key and Firebase project config')
        return false
      }
      console.log('[PUSH] getToken() success | token prefix:', token.slice(0, 20) + '…')
      currentToken.current = token

      // ── 5. Register token with backend ────────────────────────────────────
      console.log('[PUSH] POST /notifications/push-token …')
      try {
        await notificationsApi.registerPushToken({
          token,
          platform:    'web',
          browser:     navigator.userAgent.slice(0, 100),
          device_name: navigator.platform ?? null,
        })
        console.log('[PUSH] Token registered with backend ✓')
      } catch (regErr) {
        console.error('[PUSH] Backend token registration failed:', regErr)
        return false
      }

      attachForegroundListener(handleDeepLink)
      return true

    } catch (err) {
      console.error('[PUSH] Unexpected error in enable():', err)
      return false
    } finally {
      setLoading(false)
    }
  }, [handleDeepLink])

  const disable = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      if (currentToken.current) {
        await notificationsApi.deregisterPushToken(currentToken.current)
        currentToken.current = null
      }
      setPermission('default')
    } catch (err) {
      console.error('[PUSH] Failed to disable push notifications:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  return { permission, loading, enable, disable }
}
