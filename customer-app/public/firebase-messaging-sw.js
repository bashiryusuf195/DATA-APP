// Firebase Cloud Messaging — background service worker
// Uses the native Web Push API so there are zero CDN importScripts calls.
// FCM delivers push messages via the standard Web Push Protocol; the browser
// decrypts them and fires 'push' with the JSON payload — no Firebase SDK needed.

// Activate immediately: skip the "waiting" phase so a fresh SW takes effect
// on the next navigation without requiring the user to close all tabs.
self.addEventListener('install',  ()  => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

// ── Background push handler ───────────────────────────────────────────────────
// Fires when a push message arrives and the app is not in the foreground.
// The FCM payload is a JSON object with optional `notification` and `data` fields.
self.addEventListener('push', (event) => {
  if (!event.data) return

  let payload
  try {
    payload = event.data.json()
  } catch {
    return
  }

  const notification = payload.notification ?? {}
  const data         = payload.data         ?? {}

  const title = notification.title ?? data.title ?? 'Hive Data'
  const body  = notification.body  ?? data.body  ?? ''
  const icon  = notification.icon  ?? data.icon  ?? '/icons/icon-192x192.png'
  const image = notification.image ?? data.image

  // Browsers require a user-visible notification in response to a push event.
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge: '/icons/badge-72x72.png',
      data: {
        deep_link:         data.deep_link         ?? '/notifications',
        notification_type: data.notification_type ?? '',
      },
      ...(image ? { image } : {}),
      requireInteraction: false,
      vibrate: [200, 100, 200],
    })
  )
})

// ── Notification click ────────────────────────────────────────────────────────
// Focus an existing app window or open a new one, then navigate to deep_link.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const deepLink  = event.notification.data?.deep_link ?? '/notifications'
  const targetUrl = new URL(deepLink, self.location.origin).href

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.postMessage({ type: 'NAVIGATE', url: deepLink })
            return client.focus()
          }
        }
        if (clients.openWindow) return clients.openWindow(targetUrl)
      })
  )
})
