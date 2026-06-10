import { useEffect, Suspense } from 'react'
import { RouterProvider } from 'react-router-dom'
import { router } from '@/router'
import { useThemeStore } from '@/store/theme.store'
import { getFirebaseApp } from '@/lib/firebase'
import { Capacitor } from '@capacitor/core'
import { SplashScreen } from '@capacitor/splash-screen'

// ── Service worker helpers ─────────────────────────────────────────────────────

function buildFirebaseConfig() {
  return {
    apiKey:            import.meta.env.VITE_FIREBASE_API_KEY             as string | undefined,
    authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN         as string | undefined,
    projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID          as string | undefined,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
    appId:             import.meta.env.VITE_FIREBASE_APP_ID              as string | undefined,
  }
}

function sendConfigToSw(sw: ServiceWorker): void {
  sw.postMessage({ type: 'FIREBASE_CONFIG', config: buildFirebaseConfig() })
  console.log('[FCM SW] Sent FIREBASE_CONFIG | state:', sw.state)
}

// Track a newly-installing SW and send config once it activates.
function trackInstalling(sw: ServiceWorker): void {
  sw.addEventListener('statechange', function (this: ServiceWorker) {
    console.log('[FCM SW] SW state →', this.state)
    if (this.state === 'activated') sendConfigToSw(this)
  })
}

// Register the Firebase Messaging service worker and deliver the Firebase
// config to it. The config is sent via postMessage because this file is
// static (no inline env vars) and must stay cache-friendly.
//
// Critical: on FIRST install registration.active is null (SW is still
// installing). The previous code used registration.active?.postMessage which
// silently no-ops in that case, so the SW never received the config.
// We now track the installing/waiting/active lifecycle explicitly.
function registerFcmServiceWorker(): void {
  if (!('serviceWorker' in navigator)) {
    console.log('[FCM SW] Service workers not supported in this browser')
    return
  }

  const app = getFirebaseApp()
  if (!app) {
    console.log('[FCM SW] Firebase not configured — skipping SW registration')
    return
  }

  console.log('[FCM SW] Registering /firebase-messaging-sw.js …')
  navigator.serviceWorker
    .register('/firebase-messaging-sw.js')
    .then((registration) => {
      console.log(
        '[FCM SW] Registered | scope:', registration.scope,
        '| active:', registration.active?.state ?? 'none',
        '| installing:', registration.installing?.state ?? 'none',
        '| waiting:', registration.waiting?.state ?? 'none',
      )

      // Already active (typical after first page load once SW is cached)
      if (registration.active) {
        sendConfigToSw(registration.active)
      }

      // Installing right now (very first visit) — wait for activation
      if (registration.installing) {
        console.log('[FCM SW] SW is installing — will send config on activate')
        trackInstalling(registration.installing)
      }

      // Installed but waiting to take control (another tab is open)
      if (registration.waiting) {
        sendConfigToSw(registration.waiting)
      }

      // Future updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing
        if (newWorker) {
          console.log('[FCM SW] Update found — tracking new worker')
          trackInstalling(newWorker)
        }
      })
    })
    .catch((err) => console.warn('[FCM SW] Registration failed:', err))
}

// Listen for navigation messages posted by the service worker on notification
// click.
function listenForSwNavigation(): () => void {
  const handler = (event: MessageEvent) => {
    if (event.data?.type === 'NAVIGATE' && typeof event.data.url === 'string') {
      router.navigate(event.data.url)
    }
  }
  navigator.serviceWorker?.addEventListener('message', handler)
  return () => navigator.serviceWorker?.removeEventListener('message', handler)
}

// ── App ────────────────────────────────────────────────────────────────────────

export default function App() {
  const dark = useThemeStore((s) => s.dark)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])

  useEffect(() => {
    // Hide the native splash screen now that React has rendered its first frame.
    // launchAutoHide is false in capacitor.config.ts so this is mandatory on native;
    // it is a no-op on web.
    if (Capacitor.isNativePlatform()) {
      SplashScreen.hide({ fadeOutDuration: 300 }).catch(() => {})
    }

    // Service workers are not supported in Capacitor Android WebView — skip
    // registration to avoid console noise and unnecessary work on native.
    if (!Capacitor.isNativePlatform()) {
      registerFcmServiceWorker()
    }

    const cleanup = listenForSwNavigation()
    return cleanup
  }, [])

  // Dark fallback matches the app background so lazy-chunk loads are invisible
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#070B12]" />}>
      <RouterProvider router={router} />
    </Suspense>
  )
}
