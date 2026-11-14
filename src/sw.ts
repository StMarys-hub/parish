/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { ExpirationPlugin } from 'workbox-expiration';
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst } from 'workbox-strategies';

declare let self: ServiceWorkerGlobalScope;

// Clean old precaches and immediately control open tabs on update
cleanupOutdatedCaches();
self.skipWaiting();
clientsClaim();

// Precache static Vite build assets (JS, CSS, HTML, icons)
precacheAndRoute(self.__WB_MANIFEST);

// 1. Supabase REST API GET requests: NetworkFirst with 2s timeout for weak church Wi-Fi/cellular
registerRoute(
  ({ url, request }) =>
    request.method === 'GET' &&
    url.hostname.endsWith('.supabase.co') &&
    url.pathname.startsWith('/rest/v1/'),
  new NetworkFirst({
    cacheName: 'parish-api-cache',
    networkTimeoutSeconds: 2,
    plugins: [
      new ExpirationPlugin({
        maxEntries: 30,
        maxAgeSeconds: 60 * 60 * 24 * 14, // 14 days offline fallback
      }),
    ],
  })
);

// 2. Uploaded Flyers & Brochures in Supabase Storage: CacheFirst (immutable UUID paths)
registerRoute(
  ({ url, request }) =>
    request.method === 'GET' &&
    url.hostname.endsWith('.supabase.co') &&
    url.pathname.includes('/storage/v1/object/public/flyers/'),
  new CacheFirst({
    cacheName: 'parish-flyers-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 40,
        maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
      }),
    ],
  })
);

// 3. Web Push Event Handler
// IMPORTANT (Apple WebKit requirement): Must ALWAYS display a visible notification on push!
self.addEventListener('push', (event: PushEvent) => {
  let title = "St. Mary's Syro-Malabar Parish";
  let body = 'A new weekly schedule and parish bulletin is available.';
  let url = '/';
  let tag = 'parish-update';

  if (event.data) {
    try {
      const data = event.data.json() as {
        title?: string;
        body?: string;
        url?: string;
        tag?: string;
      };
      if (data.title) title = data.title;
      if (data.body) body = data.body;
      if (data.url && data.url.startsWith('/')) url = data.url;
      if (data.tag) tag = data.tag;
    } catch {
      const text = event.data.text();
      if (text) body = text;
    }
  }

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/pwa-192x192.png',
      badge: '/badge-72x72.png',
      tag,
      data: { url },
    })
  );
});

// 4. Notification Tap Deep-Link Handler
self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();
  const targetPath = (event.notification.data as { url?: string } | undefined)?.url ?? '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(targetPath);
          return client.focus();
        }
      }
      return self.clients.openWindow(targetPath);
    })
  );
});
