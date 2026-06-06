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
    // Only follow same-origin paths; ignore external URLs.
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

let _foregroundListenerAttached = false;

export function attachForegroundListener(onDeepLink: (link: string) => void): void {
  if (_foregroundListenerAttached) return
  const messaging = getFirebaseMessaging()
  if (!messaging) return
  _foregroundListenerAttached = true

  onMessage(messaging, (payload) => {
    const notification = payload.notification
    const data         = payload.data ?? {}

    const title    = notification?.title ?? 'Hive Data'
    const body     = notification?.body  ?? ''
    const deepLink = data['deep_link'] ?? ''

    // Show a dismissible toast with optional navigation on click
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

// ── Main hook ─────────────────────────────────────────────────────────────────

export function usePushNotifications() {
  const [permission, setPermission] = useState<PermissionState>(() => {
    if (typeof Notification === 'undefined') return 'unsupported'
    if (!getFirebaseMessaging())             return 'unconfigured'
    return Notification.permission as PermissionState
  })
  const [loading,     setLoading]     = useState(false)
  const currentToken                  = useRef<string | null>(null)
  const handleDeepLink                = useHandleDeepLink()

  const enable = useCallback(async (): Promise<boolean> => {
    const messaging = getFirebaseMessaging()
    if (!messaging) { setPermission('unconfigured'); return false }
    if (typeof Notification === 'undefined') { setPermission('unsupported'); return false }

    setLoading(true)
    try {
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') { setPermission('denied'); return false }
      setPermission('granted')

      if (!VAPID_KEY) {
        console.warn('[PUSH] VITE_FIREBASE_VAPID_KEY not set — cannot get FCM token')
        return false
      }

      const token = await getToken(messaging, { vapidKey: VAPID_KEY })
      currentToken.current = token

      await notificationsApi.registerPushToken({
        token,
        platform:    'web',
        browser:     navigator.userAgent.slice(0, 100),
        device_name: navigator.platform ?? null,
      })

      // Attach foreground listener
      attachForegroundListener(handleDeepLink)
      return true
    } catch (err) {
      console.error('[PUSH] Failed to enable push notifications:', err)
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
