/* Kryzen app shell service worker (no build step, static file).
 *
 * Strategy (offline-first shell, network-first data):
 * - Precache the app shell on install: document, manifest, icons.
 * - Navigations: network first, fall back to the cached shell so
 *   installed/open tabs still open offline (React Router renders the
 *   route client-side; API calls fail gracefully like any offline app).
 * - Same-origin GET static assets (JS/CSS/fonts/images): stale-while-
 *   revalidate for instant repeat loads without blocking updates.
 * - Everything else (API, websockets, cross-origin): network only —
 *   the worker never serves stale data and never touches auth.
 * - Versioned cache; old caches are purged on activate.
 *
 * Deliberately separate from firebase-messaging-sw.js (push keeps its
 * own registration and lifecycle).
 */

const VERSION = 'kryzen-shell-v1';
const SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

function isStaticAsset(url) {
  return (
    /\.(js|css|woff2?|ttf|png|svg|ico|webp|avif)$/i.test(url.pathname) ||
    url.pathname.startsWith('/assets/')
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // third-party: passthrough
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws')) return; // data: network only

  if (request.mode === 'navigate') {
    // App shell offline: live page when online, cached shell when offline.
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html')),
    );
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then((hit) => {
        const fresh = fetch(request).then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((cache) => cache.put(request, copy));
          }
          return res;
        });
        return hit || fresh;
      }),
    );
  }
});
