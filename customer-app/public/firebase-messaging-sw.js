// Firebase Cloud Messaging — background service worker
// Uses the native Web Push API so there are zero CDN importScripts calls.
// FCM delivers push messages via the standard Web Push Protocol; the browser
// decrypts them and fires 'push' with the JSON payload — no Firebase SDK needed.

// Activate immediately: skip the "waiting" phase so a fresh SW takes effect
// on the next navigation without requiring the user to close all tabs.
self.addEventListener('install',  ()  => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

// ── Helpers ───────────────────────────────────────────────────────────────────

// Returns a safe, same-origin app route from a raw deep_link value.
// Rejects anything that:
//   - is not a string
//   - doesn't start with '/' (relative or external URLs)
//   - contains a dot in the last path segment (static files: .js .css .png …)
// Falls back to /notifications in all invalid cases.
function safeRoute(raw) {
  if (!raw || typeof raw !== 'string') return '/notifications'
  try {
    // Must be an absolute path (leading /)
    if (!raw.startsWith('/')) return '/notifications'
    // Reject paths whose final segment contains a dot (static file heuristic)
    const lastSegment = raw.split('/').pop() ?? ''
    if (lastSegment.includes('.')) {
      console.warn('[SW] deep_link looks like a file, ignoring:', raw)
      return '/notifications'
    }
    return raw
  } catch {
    return '/notifications'
  }
}

// Returns true if a window client's URL is an app page on this origin
// (same origin AND pathname has no dot in its last segment).
function isAppClient(client) {
  try {
    const u = new URL(client.url)
    if (u.origin !== self.location.origin) return false
    const lastSegment = u.pathname.split('/').pop() ?? ''
    return !lastSegment.includes('.')   // excludes /firebase-messaging-sw.js etc.
  } catch {
    return false
  }
}

// ── Background push handler ───────────────────────────────────────────────────
// Fires when a push message arrives and the app is not in the foreground.
// The FCM payload is a JSON object with optional `notification` and `data` fields.
// Firebase Admin SDK puts custom fields in both payload.data (top-level) and
// payload.notification.data (webpush-specific); we check both.
self.addEventListener('push', (event) => {
  if (!event.data) return

  let payload
  try {
    payload = event.data.json()
  } catch {
    return
  }

  const notification = payload.notification ?? {}
  // FCM may put custom data in payload.data (top-level) or notification.data
  const data = payload.data ?? notification.data ?? {}

  const title = notification.title ?? data.title ?? 'Hive Data'
  const body  = notification.body  ?? data.body  ?? ''
  const icon  = notification.icon  ?? data.icon  ?? '/icons/icon-192x192.png'
  const image = notification.image ?? data.image

  const route = safeRoute(data.deep_link)

  console.log('[SW push] title:', title, '| deep_link:', data.deep_link, '| route:', route)

  // Browsers require a user-visible notification in response to a push event.
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge: '/icons/badge-72x72.png',
      data: {
        deep_link:         route,
        notification_type: data.notification_type ?? '',
      },
      ...(image ? { image } : {}),
      requireInteraction: false,
      vibrate: [200, 100, 200],
    })
  )
})

// ── Notification click ────────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  // data.deep_link was already sanitised by safeRoute() when showNotification
  // was called, but we validate again in case the notification was shown by
  // another code path (e.g. browser-native FCM handling).
  const route     = safeRoute(event.notification.data?.deep_link)
  const targetUrl = self.location.origin + route

  console.log(
    '[SW notificationclick] raw deep_link:', event.notification.data?.deep_link,
    '| safe route:', route,
    '| targetUrl:', targetUrl,
  )

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        // Only consider tabs that are actual app pages on this origin.
        // client.url.includes(origin) is intentionally NOT used here because it
        // would also match tabs showing /firebase-messaging-sw.js or other
        // static files directly — focusing such a tab displays raw file content.
        const appClients = windowClients.filter(isAppClient)

        if (appClients.length > 0 && 'focus' in appClients[0]) {
          console.log('[SW notificationclick] focusing existing client:', appClients[0].url, '→', route)
          appClients[0].postMessage({ type: 'NAVIGATE', url: route })
          return appClients[0].focus()
        }

        console.log('[SW notificationclick] no app client open, opening:', targetUrl)
        if (clients.openWindow) return clients.openWindow(targetUrl)
      })
  )
})
