import { useEffect } from 'react'
import { RouterProvider } from 'react-router-dom'
import { router } from '@/router'
import { useThemeStore } from '@/store/theme.store'
import { getFirebaseApp } from '@/lib/firebase'

// Register the Firebase Messaging service worker and send it the Firebase
// config (config is already public — it only authenticates Firebase project
// access, not any sensitive backend credentials).
function registerFcmServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return
  const app = getFirebaseApp()
  if (!app) return

  const {
    VITE_FIREBASE_API_KEY:             apiKey,
    VITE_FIREBASE_AUTH_DOMAIN:         authDomain,
    VITE_FIREBASE_PROJECT_ID:          projectId,
    VITE_FIREBASE_MESSAGING_SENDER_ID: messagingSenderId,
    VITE_FIREBASE_APP_ID:              appId,
  } = import.meta.env

  navigator.serviceWorker
    .register('/firebase-messaging-sw.js')
    .then((registration) => {
      registration.active?.postMessage({
        type:   'FIREBASE_CONFIG',
        config: { apiKey, authDomain, projectId, messagingSenderId, appId },
      })

      // Also send config when a new SW activates (update case)
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing
        newWorker?.addEventListener('statechange', () => {
          if (newWorker.state === 'activated') {
            newWorker.postMessage({
              type:   'FIREBASE_CONFIG',
              config: { apiKey, authDomain, projectId, messagingSenderId, appId },
            })
          }
        })
      })
    })
    .catch((err) => console.warn('[FCM SW] Registration failed:', err))
}

// Listen for navigation messages posted by the service worker on notification click.
function listenForSwNavigation(): () => void {
  const handler = (event: MessageEvent) => {
    if (event.data?.type === 'NAVIGATE' && typeof event.data.url === 'string') {
      router.navigate(event.data.url)
    }
  }
  navigator.serviceWorker?.addEventListener('message', handler)
  return () => navigator.serviceWorker?.removeEventListener('message', handler)
}

export default function App() {
  const dark = useThemeStore((s) => s.dark)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])

  useEffect(() => {
    registerFcmServiceWorker()
    const cleanup = listenForSwNavigation()
    return cleanup
  }, [])

  return <RouterProvider router={router} />
}
