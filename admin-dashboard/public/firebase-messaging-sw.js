// Firebase Cloud Messaging service worker for Hive Data admin dashboard.
// This file must live at /firebase-messaging-sw.js (served from public/).

importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js');

// Config injected by the main thread via postMessage after registration.
// Falls back to empty object — SW won't initialise without valid config.
let messagingInstance = null;

self.addEventListener('message', (event) => {
  if (event.data?.type === 'FIREBASE_CONFIG' && !messagingInstance) {
    const cfg = event.data.config;
    if (!cfg?.apiKey) return;

    firebase.initializeApp(cfg);
    messagingInstance = firebase.messaging();

    messagingInstance.onBackgroundMessage((payload) => {
      const n = payload.notification ?? {};
      const data = payload.data ?? {};

      self.registration.showNotification(n.title ?? 'Hive Data Admin', {
        body:  n.body ?? '',
        icon:  '/logo.png',
        badge: '/badge.png',
        data:  { deep_link: data.deep_link ?? '/' },
      });
    });
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const deepLink = event.notification.data?.deep_link ?? '/dashboard';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes(self.location.origin)) {
          client.focus();
          client.postMessage({ type: 'NAVIGATE', path: deepLink });
          return;
        }
      }
      return clients.openWindow(self.location.origin + deepLink);
    }),
  );
});
