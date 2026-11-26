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

// 1. Supabase public REST API GET requests: NetworkFirst with 2s timeout for weak church Wi-Fi/cellular
//    Excludes admin/audit/reimbursement endpoints so private data is never stored in the SW cache.
registerRoute(
  ({ url, request }) =>
    request.method === 'GET' &&
    url.hostname.endsWith('.supabase.co') &&
    url.pathname.startsWith('/rest/v1/') &&
    !url.pathname.includes('admin_') &&
    !url.pathname.includes('reimbursement'),
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
// IMPORTANT (Apple WebKit requirement): Must ALWAYS display a visible notification on every push
// or iOS/iPadOS Safari will revoke push permission after 3 silent pushes.
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
      try {
        const text = event.data.text();
        if (text) body = text;
      } catch {
        // Use defaults
      }
    }
  }

  event.waitUntil(
    self.registration
      .showNotification(title, {
        body,
        icon: '/pwa-192x192.png',
        badge: '/badge-72x72.png',
        tag,
        data: { url },
      })
      .catch(() =>
        // Fallback minimal call without optional fields so iOS WebKit never counts a silent push
        self.registration.showNotification(title, { body })
      )
  );
});

// 4. Notification Tap Deep-Link Handler (safe for iOS/iPadOS standalone PWAs)
self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();
  const targetPath = (event.notification.data as { url?: string } | undefined)?.url ?? '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          try {
            if ('navigate' in client && typeof client.navigate === 'function') {
              await client.navigate(targetPath);
            }
            return await client.focus();
          } catch {
            // Fall through to openWindow on Safari if navigate() rejects
          }
        }
      }
      return self.clients.openWindow(targetPath);
    })
  );
});
