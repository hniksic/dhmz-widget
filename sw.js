/*
 * Service Worker for Zagreb Temperature PWA
 *
 * Purpose:
 * - Makes the app "installable" on mobile (required by PWA spec)
 * - Caches static assets for offline use and faster loads
 *
 * Caching strategy:
 * - HTML/JS: Network-first, fall back to cache if offline
 *   (ensures updates are visible immediately on reload)
 * - CSS/images: Cache-first, fall back to network
 *   (these change rarely, so prefer speed)
 * - Weather API: Never cached (always need fresh data)
 *
 * Cache versioning:
 * - CACHE_NAME includes version number
 * - When version changes, old cache is deleted on activation
 * - Bump version whenever deploying changes to cached files
 */

const CACHE_NAME = 'zagreb-temp-v5';

const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './icon.svg',
  './icon-192.png',
  './icon-512.png'
];

/*
 * Install event: fired when browser detects a new service worker.
 * We pre-cache all static assets so they're available offline.
 */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  // skipWaiting() makes this SW activate immediately instead of waiting
  // for all tabs using the old SW to close.
  self.skipWaiting();
});

/*
 * Activate event: fired when the new service worker takes over.
 * We delete old caches to free space and avoid serving stale content.
 */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)  // Keep only current cache
          .map(k => caches.delete(k))      // Delete all others
      )
    )
  );
  // clients.claim() makes this SW control all open tabs immediately,
  // instead of waiting for them to reload.
  self.clients.claim();
});

/*
 * Fetch event: fired for every network request from controlled pages.
 * We intercept requests and decide whether to serve from cache or network.
 */
self.addEventListener('fetch', event => {
  const url = event.request.url;

  // Weather API: always fetch from network, never cache
  if (url.includes('corsproxy') || url.includes('allorigins') || url.includes('vrijeme.hr')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // HTML and JS: network-first strategy
  // Try network, update cache, fall back to cache if offline
  if (url.endsWith('.html') || url.endsWith('.js') || url.endsWith('/')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Got fresh response - update cache for offline use
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => {
          // Network failed (offline) - try to serve from cache
          return caches.match(event.request);
        })
    );
    return;
  }

  // Everything else (CSS, images): cache-first strategy
  // Serve from cache if available, otherwise fetch from network
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
