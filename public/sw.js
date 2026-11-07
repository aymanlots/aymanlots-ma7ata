/**
 * Sahara Express PWA Service Worker
 * Features:
 * - Immediate Skip Waiting & Auto Claim
 * - Network-First for Navigation (Index & Routes) so new Vercel deploys appear instantly
 * - Fast Offline Cache Fallback
 * - Proactive Client Notification on Update
 */

const SW_VERSION = 'sahara-express-v' + (self.registration ? self.registration.scope : '') + '-20261106-v10';
const CACHE_NAME = 'sahara-cache-v10';

const OFFLINE_FALLBACKS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png'
];

// Install: Immediately take over without waiting for tabs to close
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.allSettled(
        OFFLINE_FALLBACKS.map(async (url) => {
          try {
            const res = await fetch(url, { cache: 'no-cache' });
            if (res.ok) {
              await cache.put(url, res);
            }
          } catch {
            // Non-blocking for optional assets
          }
        })
      );
    })
  );
});

// Activate: Purge all stale caches and claim all open clients immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(async () => {
      await self.clients.claim();
      // Notify all connected tabs/PWA windows that a fresh version has taken over
      const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      allClients.forEach((client) => {
        client.postMessage({ type: 'PWA_UPDATED', version: SW_VERSION });
      });
    })
  );
});

// Listen for direct messages from the app (e.g. force skip waiting)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Fetch: Strategy depending on request type
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 1. Bypass all backend APIs, Vite dev modules, Supabase, Firebase Firestore/Auth
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/src/') ||
    url.pathname.startsWith('/node_modules/') ||
    url.pathname.startsWith('/@') ||
    url.pathname.endsWith('.tsx') ||
    url.pathname.endsWith('.ts') ||
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('gstatic.com/firebasejs')
  ) {
    return;
  }

  // 2. Never cache the service worker file itself
  if (url.pathname === '/sw.js') {
    event.respondWith(fetch(req, { cache: 'no-store' }));
    return;
  }

  // 3. Navigation requests (HTML pages & routes): NETWORK-FIRST with fast fallback
  // This guarantees that any new Vercel deployment is loaded immediately when online!
  const isNavigation = req.mode === 'navigate' || 
                       req.destination === 'document' || 
                       url.pathname === '/' || 
                       url.pathname.endsWith('index.html');

  if (isNavigation) {
    event.respondWith(
      fetch(req, { cache: 'no-cache' })
        .then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const clone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return networkRes;
        })
        .catch(async () => {
          // If offline or network error, fallback to cached index.html
          const cached = await caches.match(req);
          if (cached) return cached;
          const fallback = await caches.match('/index.html');
          if (fallback) return fallback;
          return caches.match('/');
        })
    );
    return;
  }

  // 4. Hashed Vite assets (/assets/*): Cache-First / Network fallback
  // Since Vite asset filenames have content hashes (e.g. index-D7x9.js), they are immutable.
  if (url.origin === self.location.origin && url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const clone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return networkRes;
        });
      })
    );
    return;
  }

  // 5. Other static assets (images, icons, manifest, fonts): Stale-While-Revalidate
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const fetchPromise = fetch(req, { cache: 'no-cache' })
          .then((networkRes) => {
            if (networkRes && networkRes.status === 200) {
              const clone = networkRes.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
            }
            return networkRes;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      })
    );
  }
});
