/*
 * Service Worker for Weather Widget PWA
 *
 * Purpose:
 * - Makes the app "installable" on mobile (required by PWA spec)
 * - Caches static assets for offline use and faster loads
 *
 * Caching strategy:
 * - Hashed JS files (app-XXX.js, outlines-XXX.js): Cache forever (immutable)
 * - HTML/CSS/icons: Network-first, fall back to cache if offline
 * - Weather API: Never cached (always need fresh data)
 *
 * No manual versioning needed:
 * - JS files have content hashes in their names - new builds = new URLs
 * - Cache is cleaned up when activating: old hashed files are removed
 */

const CACHE_NAME = 'app-cache';

// Skip waiting and claim clients immediately
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      // Clean up old hashed JS files that are no longer referenced
      const keys = await cache.keys();
      const toDelete = keys.filter(req => {
        const url = req.url;
        // Keep only the latest hashed files (they'll be re-cached on fetch)
        return url.match(/\/(app|outlines)-[A-Z0-9]+\.js$/);
      });
      await Promise.all(toDelete.map(req => cache.delete(req)));
    })
  );
  self.clients.claim();
});

/*
 * Fetch event: intercept requests and apply caching strategy.
 */
self.addEventListener('fetch', event => {
  const url = event.request.url;

  // Weather API and proxies: always fetch from network, never cache
  if (url.includes('corsproxy') || url.includes('allorigins') ||
      url.includes('vrijeme.hr') || url.includes('pljusak.com') ||
      url.includes('open-meteo.com')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Hashed JS files: cache forever (immutable content)
  if (url.match(/\/(app|outlines)-[A-Z0-9]+\.js$/)) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        });
      })
    );
    return;
  }

  // HTML, CSS, icons: network-first with cache fallback
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
