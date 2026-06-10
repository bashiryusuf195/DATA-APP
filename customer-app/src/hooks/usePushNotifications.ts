import { useState, useEffect, useCallback } from 'react'
import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { onMessage } from 'firebase/messaging'
import { useAuthStore } from '@/store/auth.store'
import { getFirebaseMessaging, VAPID_KEY } from '@/lib/firebase'
import { getToken } from 'firebase/messaging'
import { notificationsApi } from '@/api/notifications.api'

export type PushPermission = 'unconfigured' | 'unsupported' | 'denied' | 'granted' | 'default'

// ── Initial permission state ──────────────────────────────────────────────────

function getInitialPermission(): PushPermission {
  if (Capacitor.isNativePlatform()) {
    return 'default' // updated async by checkPermissions() in the effect below
  }
  if (typeof Notification === 'undefined' || !('serviceWorker' in navigator)) {
    return 'unsupported'
  }
  if (!VAPID_KEY) return 'unconfigured'
  if (Notification.permission === 'denied')  return 'denied'
  if (Notification.permission === 'granted') return 'granted'
  return 'default'
}

// ── Hook ─────────────────────────────────────────────────────────────────────
// Used by Settings and NotificationPromptModal to:
//  – read the current permission state
//  – call enable() when user opts in
//  – call disable() when user opts out
//
// Global FCM listeners (registration event → send token, tap → deep link,
// foreground toast) live in App.tsx so they are always active.

export function usePushNotifications() {
  const [permission, setPermission] = useState<PushPermission>(getInitialPermission)
  const isLoggedIn = useAuthStore((s) => Boolean(s.access_token))

  // Native: sync permission state on mount
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    PushNotifications.checkPermissions()
      .then((r) => {
        if      (r.receive === 'granted') setPermission('granted')
        else if (r.receive === 'denied')  setPermission('denied')
        // 'prompt' stays as 'default'
      })
      .catch(() => {})
  }, [])

  // Web: silently re-register on login if permission was already granted
  useEffect(() => {
    if (Capacitor.isNativePlatform() || !isLoggedIn) return
    if (Notification.permission !== 'granted') return
    void registerWebToken()
  }, [isLoggedIn])

  const enable = useCallback(async (): Promise<boolean> => {
    if (Capacitor.isNativePlatform()) {
      try {
        const r = await PushNotifications.requestPermissions()
        if (r.receive !== 'granted') { setPermission('denied'); return false }
        // Token arrives via 'registration' listener in App.tsx
        await PushNotifications.register()
        setPermission('granted')
        return true
      } catch {
        return false
      }
    }

    // Web path
    if (permission === 'unconfigured' || permission === 'unsupported') return false
    try {
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') { setPermission('denied'); return false }
      const ok = await registerWebToken()
      if (ok) { setPermission('granted'); return true }
      return false
    } catch (err) {
      console.error('[Push:web] enable() error:', err)
      return false
    }
  }, [permission])

  const disable = useCallback(async (): Promise<void> => {
    // Backend uses push_enabled pref as the gate — tokens stay in the DB
    // but no messages are sent when push_enabled = false.
    // Call notificationsApi.deregisterPushToken(token) here for hard removal.
  }, [])

  return { permission, enable, disable }
}

// ── Web token registration ────────────────────────────────────────────────────

export async function registerWebToken(): Promise<boolean> {
  try {
    const messaging = getFirebaseMessaging()
    if (!messaging || !VAPID_KEY) return false
    const swReg = await navigator.serviceWorker.ready
    const token = await getToken(messaging, {
      vapidKey:                  VAPID_KEY,
      serviceWorkerRegistration: swReg,
    })
    if (!token) return false
    await notificationsApi.registerPushToken({
      token,
      platform: 'web',
      browser:  navigator.userAgent.slice(0, 200),
    })
    console.log('[Push:web] Token registered')
    return true
  } catch (err) {
    console.error('[Push:web] registerWebToken error:', err)
    return false
  }
}

// ── Foreground listener (web only) ───────────────────────────────────────────
// Called after enable() so web foreground messages are surfaced.
// Native foreground handling is done in App.tsx via pushNotificationReceived.

export function attachForegroundListener(callback: (payload: unknown) => void): void {
  if (Capacitor.isNativePlatform()) return
  const messaging = getFirebaseMessaging()
  if (!messaging) return
  onMessage(messaging, callback)
}
