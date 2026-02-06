/*
 * Service Worker for Weather Widget PWA
 *
 * Purpose:
 * - Makes the app "installable" on mobile (required by PWA spec)
 * - Caches static assets for offline use and faster loads
 *
 * Caching strategy:
 * - HTML/CSS/JS/icons: Network-first, fall back to cache if offline
 * - Weather API: Never cached (always need fresh data)
 */

const CACHE_NAME = 'app-cache';

// Skip waiting and claim clients immediately
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());

/*
 * Fetch event: intercept requests and apply caching strategy.
 */
self.addEventListener('fetch', event => {
  const url = event.request.url;

  // Weather API and proxies: always fetch from network, never cache
  if (url.includes('codetabs') || url.includes('corsproxy') || url.includes('allorigins') ||
      url.includes('vrijeme.hr') || url.includes('pljusak.com') ||
      url.includes('open-meteo.com')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // HTML, CSS, JS, icons: network-first with cache fallback
  if (url.endsWith('.html') || url.endsWith('.css') || url.endsWith('.js') ||
      url.endsWith('.svg') || url.endsWith('.png') || url.endsWith('.json') ||
      url.endsWith('/')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Everything else: network only
  event.respondWith(fetch(event.request));
});
