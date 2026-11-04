/**
 * PWA Auto-Update & Fast Refresh Engine
 * Ensures that whenever a new Vercel build is deployed, the installed PWA
 * detects it, activates the new Service Worker immediately, and refreshes the application.
 */

let isRefreshing = false;

export function initPWAAutoUpdate(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  // In development environment, unregister any stale service workers and clear SW caches
  // so source code edits (.tsx/.ts) are always fetched fresh from Vite
  if ((import.meta as any).env?.DEV) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((reg) => reg.unregister());
    }).catch(() => {});
    if ('caches' in window) {
      caches.keys().then((names) => {
        names.forEach((name) => caches.delete(name));
      }).catch(() => {});
    }
    return;
  }

  // 1. Handle Vite dynamic import chunk loading errors
  // This occurs when a new Vercel deployment has deleted old hashed chunks
  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault();
    if (!isRefreshing) {
      isRefreshing = true;
      window.location.reload();
    }
  });

  window.addEventListener('load', async () => {
    try {
      // 2. Register with updateViaCache: 'none' so browser never uses HTTP cache for /sw.js
      const registration = await navigator.serviceWorker.register('/sw.js', {
        updateViaCache: 'none',
      });

      // 3. If a new worker is already waiting in background, tell it to take over immediately
      if (registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }

      // 4. When an update is detected, force it to activate as soon as installed
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // New deployment detected! Force immediate takeover
            newWorker.postMessage({ type: 'SKIP_WAITING' });
          }
        });
      });

      // 5. Proactive check on initial load
      registration.update().catch(() => {});

      // 6. Check whenever the user switches back to the installed PWA app
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          registration.update().catch(() => {});
        }
      });

      window.addEventListener('focus', () => {
        registration.update().catch(() => {});
      });

      window.addEventListener('online', () => {
        registration.update().catch(() => {});
      });

      // 7. Check periodically every 5 minutes while the app is active
      setInterval(() => {
        registration.update().catch(() => {});
      }, 5 * 60 * 1000);

    } catch (err) {
      console.warn('[PWA] Service worker registration error:', err);
    }
  });

  // 8. Auto-reload when new service worker takes control
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (isRefreshing) return;
    isRefreshing = true;
    window.location.reload();
  });

  // 9. Listen for explicit broadcast message from sw.js
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'PWA_UPDATED') {
      if (isRefreshing) return;
      isRefreshing = true;
      window.location.reload();
    }
  });
}

/**
 * Manually force check for latest version, purge all stale caches, and refresh immediately
 */
export async function forceCheckUpdateAndRefresh(): Promise<void> {
  if (isRefreshing) return;
  isRefreshing = true;

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.update();
        if (reg.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
      }
    }

    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((name) => caches.delete(name)));
    }
  } catch (err) {
    console.warn('[PWA] Force refresh error:', err);
  }

  // Force clean reload bypassing HTTP cache
  window.location.reload();
}
