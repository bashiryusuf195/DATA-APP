// Firebase Messaging Service Worker
// Handles background (app not open/focused) push notifications.
// This file must live at the root path (/firebase-messaging-sw.js) — Vite
// serves everything inside /public at the root, so it is correctly located.

importScripts("https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging-compat.js");

// Config is injected at runtime from the query-string when the SW is registered.
// See src/hooks/usePushNotifications.ts — we register the SW with the config
// embedded in the URL so this file stays static and cache-safe.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "FIREBASE_CONFIG") {
    try {
      firebase.initializeApp(event.data.config);
      const messaging = firebase.messaging();

      messaging.onBackgroundMessage((payload) => {
        const notification = payload.notification ?? {};
        const data         = payload.data         ?? {};

        const title = notification.title ?? "Hive Data";
        const body  = notification.body  ?? "";
        const icon  = notification.icon  ?? "/icons/icon-192x192.png";
        const image = notification.image ?? data.image;

        const options = {
          body,
          icon,
          badge: "/icons/badge-72x72.png",
          data: {
            deep_link:         data.deep_link ?? "/notifications",
            notification_type: data.notification_type ?? "",
          },
          ...(image ? { image } : {}),
          requireInteraction: false,
          vibrate:            [200, 100, 200],
        };

        self.registration.showNotification(title, options);
      });
    } catch (e) {
      console.error("[FCM SW] Failed to initialise Firebase:", e);
    }
  }
});

// Handle notification click — focus existing window or open a new one,
// then navigate to deep_link if provided.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const deepLink = event.notification.data?.deep_link ?? "/notifications";
  const targetUrl = new URL(deepLink, self.location.origin).href;

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        // If app window is already open, focus it and post a navigation message
        for (const client of windowClients) {
          if (client.url.includes(self.location.origin) && "focus" in client) {
            client.postMessage({ type: "NAVIGATE", url: deepLink });
            return client.focus();
          }
        }
        // Otherwise open a new window
        if (clients.openWindow) return clients.openWindow(targetUrl);
      }),
  );
});
