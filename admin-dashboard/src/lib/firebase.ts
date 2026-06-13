import { initializeApp, getApps, getApp } from 'firebase/app'
import { getMessaging, getToken, onMessage } from 'firebase/messaging'

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY            as string | undefined,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN        as string | undefined,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID         as string | undefined,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET     as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID             as string | undefined,
}

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined

export function isFirebaseConfigured(): boolean {
  return !!(
    firebaseConfig.apiKey &&
    firebaseConfig.projectId &&
    firebaseConfig.messagingSenderId &&
    VAPID_KEY
  )
}

function getFirebaseApp() {
  if (!isFirebaseConfigured()) return null
  return getApps().length > 0 ? getApp() : initializeApp(firebaseConfig)
}

// Register the service worker and post the Firebase config to it so it can
// initialise firebase-messaging-compat in the background.
async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  try {
    const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js')
    const sw  = reg.installing ?? reg.waiting ?? reg.active
    if (sw) {
      sw.postMessage({ type: 'FIREBASE_CONFIG', config: firebaseConfig })
    } else {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        navigator.serviceWorker.controller?.postMessage({
          type: 'FIREBASE_CONFIG', config: firebaseConfig,
        })
      })
    }
    return reg
  } catch {
    return null
  }
}

export type FcmRegistrationResult =
  | { ok: true;  token: string }
  | { ok: false; reason: 'not_configured' | 'permission_denied' | 'error'; message?: string }

export async function requestFcmToken(): Promise<FcmRegistrationResult> {
  if (!isFirebaseConfigured()) {
    return { ok: false, reason: 'not_configured' }
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    return { ok: false, reason: 'permission_denied' }
  }

  try {
    const app         = getFirebaseApp()!
    const messaging   = getMessaging(app)
    const swReg       = await registerServiceWorker()

    const token = await getToken(messaging, {
      vapidKey:                VAPID_KEY,
      serviceWorkerRegistration: swReg ?? undefined,
    })

    if (!token) return { ok: false, reason: 'error', message: 'Empty token returned' }
    return { ok: true, token }
  } catch (err) {
    return {
      ok:      false,
      reason:  'error',
      message: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

// Subscribe to foreground messages (tab is open and focused).
// Returns an unsubscribe function.
export function onForegroundMessage(
  handler: (title: string, body: string, deepLink: string) => void,
): () => void {
  if (!isFirebaseConfigured()) return () => {}
  try {
    const app       = getFirebaseApp()!
    const messaging = getMessaging(app)
    return onMessage(messaging, (payload) => {
      const n        = payload.notification ?? {}
      const data     = (payload.data ?? {}) as Record<string, string>
      const deepLink = data['deep_link'] ?? '/dashboard'
      handler(n.title ?? 'Hive Data Admin', n.body ?? '', deepLink)
    })
  } catch {
    return () => {}
  }
}
