// ExamPro DSU - Service Worker v5
const CACHE_NAME = 'exampro-dsu-v6';

// Static assets to cache immediately on install (App Shell)
const STATIC_ASSETS = [
  '/',
  '/login.html',
  '/dashboard.html',
  '/manifest.json',
  '/dsu_logo.png',
  '/theme.css',
  '/theme.js',
];

// ─── Install: Cache App Shell ─────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
});

// ─── Activate: Clear Old Caches ───────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// ─── Fetch: Network-first for API/Firebase, Cache-first for static assets ─────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests and chrome-extension requests
  if (event.request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;

  // NETWORK-FIRST for Firebase, Google APIs, and gstatic (auth tokens, Firestore)
  const isApiCall =
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('identitytoolkit.googleapis.com') ||
    url.hostname.includes('recaptcha.google.com') ||
    url.hostname.includes('gstatic.com');

  if (isApiCall) {
    // Network-first, no caching for API calls
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response('{}', { headers: { 'Content-Type': 'application/json' } });
      })
    );
    return;
  }

  // NETWORK-FIRST for HTML pages to ensure users always get the latest code
  if (event.request.headers.get('accept') && event.request.headers.get('accept').includes('text/html')) {
    event.respondWith(
      fetch(event.request).then((networkResponse) => {
        // Cache the latest HTML for offline fallback
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return networkResponse;
      }).catch(() => {
        // Fallback to cached HTML if offline
        return caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) return cachedResponse;
            return caches.match('/login.html');
        });
      })
    );
    return;
  }

  // CACHE-FIRST for static assets (CSS, images, JS files)
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Serve from cache, but update cache in background (stale-while-revalidate)
        const fetchPromise = fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, networkResponse.clone());
            });
          }
          return networkResponse;
        }).catch(() => cachedResponse);
        return cachedResponse; // Serve cache immediately
      }

      // Not in cache — fetch from network and cache it
      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type === 'opaque') {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return networkResponse;
      }).catch(() => {
        // Offline fallback for HTML pages — serve login page
        if (event.request.headers.get('accept').includes('text/html')) {
          return caches.match('/login.html');
        }
      });
    })
  );
});
