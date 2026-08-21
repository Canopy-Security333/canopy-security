// ═══════════════════════════════════════════════════
// CANOPY CAMPUS SECURITY — SERVICE WORKER
// ═══════════════════════════════════════════════════
// Bump VERSION with every deployment. Changing it
// invalidates the old cache and triggers the
// "App updated — tap to reload" banner on all devices.
const VERSION = '1.0.2';
const CACHE_NAME = 'canopy-v' + VERSION;

// App shell — everything needed to render the UI offline.
// Update these paths once the project is split into separate files.
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  // Add your CSS / JS bundle paths here once the project is built, e.g.:
  // '/assets/index.css',
  // '/assets/index.js',
];

// Third-party assets to cache on first use (CDN scripts, etc.)
const CACHE_CDN = [
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
];

// API origins that should NEVER be served from cache —
// always go to the network so data is always fresh.
// Update this to your Supabase project URL once wired up.
const NETWORK_ONLY_ORIGINS = [
  'supabase.co',       // Supabase REST + realtime
  'supabase.in',
];

// ───────────────────────────────────────────────────
// INSTALL — pre-cache the app shell
// ───────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Pre-caching app shell');
      return cache.addAll(SHELL_ASSETS);
    }).then(() => self.skipWaiting()) // activate immediately
  );
});

// ───────────────────────────────────────────────────
// ACTIVATE — delete old caches, claim clients, notify
// ───────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    const stale = keys.filter(key => key !== CACHE_NAME);
    await Promise.all(stale.map(key => {
      console.log('[SW] Deleting old cache:', key);
      return caches.delete(key);
    }));
    // Take control of all open tabs immediately
    await self.clients.claim();
    // If we replaced at least one old cache this is an upgrade — tell every
    // open window tab so the app can show the "tap to reload" banner.
    if (stale.length > 0) {
      const all = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
      all.forEach(c => c.postMessage({ type: 'APP_UPDATED', version: VERSION }));
    }
  })());
});

// ───────────────────────────────────────────────────
// FETCH — caching strategy per request type
// ───────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. Skip non-GET requests entirely (POST, PATCH, DELETE go straight to network)
  if (request.method !== 'GET') return;

  // 2. Network-only for Supabase API calls — never serve stale data
  if (NETWORK_ONLY_ORIGINS.some(origin => url.hostname.includes(origin))) {
    event.respondWith(fetch(request));
    return;
  }

  // 3. Cache-first for CDN assets (QRCode library, etc.)
  if (CACHE_CDN.some(cdn => request.url.startsWith(cdn))) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // 4. Network-first for navigation requests (HTML pages)
  //    Falls back to cached shell if offline
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstWithShellFallback(request));
    return;
  }

  // 5. Stale-while-revalidate for everything else (icons, fonts, static assets)
  event.respondWith(staleWhileRevalidate(request));
});

// ───────────────────────────────────────────────────
// STRATEGY: Cache-first
// Serve from cache; fetch & cache if missing
// ───────────────────────────────────────────────────
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline — resource unavailable.', { status: 503 });
  }
}

// ───────────────────────────────────────────────────
// STRATEGY: Network-first with shell fallback
// Try network; if offline, serve cached shell
// ───────────────────────────────────────────────────
async function networkFirstWithShellFallback(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Offline — serve the cached app shell so the UI still loads
    const cached = await caches.match(request) || await caches.match('/index.html') || await caches.match('/');
    if (cached) return cached;
    return new Response('<h2>You are offline</h2><p>Please reconnect to use Canopy Security.</p>', {
      headers: { 'Content-Type': 'text/html' },
      status: 503,
    });
  }
}

// ───────────────────────────────────────────────────
// STRATEGY: Stale-while-revalidate
// Serve from cache instantly; update cache in background
// ───────────────────────────────────────────────────
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);

  return cached || await fetchPromise || new Response('Offline', { status: 503 });
}

// ───────────────────────────────────────────────────
// BACKGROUND SYNC — queue offline writes to Supabase
// Fires automatically when the device reconnects
// ───────────────────────────────────────────────────
self.addEventListener('sync', event => {
  if (event.tag === 'sync-dar-entries') {
    event.waitUntil(syncOfflineEntries());
  }
  if (event.tag === 'sync-patrol-logs') {
    event.waitUntil(syncPatrolLogs());
  }
  if (event.tag === 'sync-near-miss') {
    event.waitUntil(syncNearMissReports());
  }
});

// ── Placeholder sync functions ──
// These will be implemented once Supabase is wired up.
// The pattern: read pending items from IndexedDB, POST to Supabase, clear queue.

async function syncOfflineEntries() {
  console.log('[SW] Background sync: DAR entries');
  // TODO: read from IndexedDB queue, POST to /rest/v1/dar_entries, clear queue
}

async function syncPatrolLogs() {
  console.log('[SW] Background sync: patrol logs');
  // TODO: read from IndexedDB queue, POST to /rest/v1/patrol_logs, clear queue
}

async function syncNearMissReports() {
  console.log('[SW] Background sync: near miss reports');
  // TODO: read from IndexedDB queue, POST to /rest/v1/near_miss_reports, clear queue
}

// ───────────────────────────────────────────────────
// PUSH NOTIFICATIONS (future)
// Uncomment and wire up once push is configured
// ───────────────────────────────────────────────────
// self.addEventListener('push', event => {
//   const data = event.data?.json() ?? {};
//   event.waitUntil(
//     self.registration.showNotification(data.title || 'Canopy Security', {
//       body: data.body || '',
//       icon: '/icons/icon-192.png',
//       badge: '/icons/icon-192.png',
//       data: { url: data.url || '/' },
//     })
//   );
// });

// self.addEventListener('notificationclick', event => {
//   event.notification.close();
//   event.waitUntil(clients.openWindow(event.notification.data.url));
// });
