// sw.js — Medical Study OS Service Worker
// Strategy: Network-first with cache fallback for navigation; cache-first for static assets.

const CACHE_NAME = 'medos-v4';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/analytics.html',
  '/browse.html',
  '/create.html',
  '/editor.html',
  '/notes.html',
  '/planner.html',
  '/profile.html',
  '/review.html',
  '/styles.css',
  '/utils.js',
  '/data.js',
  '/app.js',
  '/analytics.js',
  '/browse.js',
  '/cardCreator.js',
  '/cardSync.js',
  '/charts.js',
  '/create.js',
  '/editor.js',
  '/imageOcclusion.js',
  '/intelligence.js',
  '/noteSync.js',
  '/notes.js',
  '/pomodoro.js',
  '/revisionEngine.js',
  '/rotateScreen.js',
  '/router.js',
  '/scheduler.js',
  '/search.js',
  '/stopwatch.js',
  '/supabase.js',
  '/manifest.json',
];

// ── Install: pre-cache critical assets ─────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .catch(err => console.warn('[SW] Pre-cache failed:', err))
  );
  self.skipWaiting();
});

// ── Activate: clean old caches ──────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch ───────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  let { request } = event;
  let url = new URL(request.url);

  // Skip non-GET, cross-origin (supabase API, CDN, etc.)
  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // For navigation requests (HTML pages): network-first, fallback to cache
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(res => {
          let clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(request, clone));
          return res;
        })
        .catch(() => caches.match(request).then(r => r || caches.match('/index.html')))
    );
    return;
  }

  // For JS/CSS: network-first so code changes are always picked up on normal refresh.
  // Falls back to cache only when offline.
  if (url.pathname.match(/\.(js|css)$/)) {
    event.respondWith(
      fetch(request)
        .then(res => {
          let clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(request, clone));
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // For images/fonts/icons: cache-first (these rarely change)
  if (url.pathname.match(/\.(svg|png|ico|woff2?|ttf)$/)) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(res => {
          let clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(request, clone));
          return res;
        });
      })
    );
    return;
  }
  // All others: network only
});

// ── Push (for future badge updates) ────────────────────────────
self.addEventListener('push', event => {
  if (!event.data) return;
  let { title, body, url } = event.data.json();
  event.waitUntil(
    self.registration.showNotification(title || 'Medical Study OS', {
      body: body || '',
      icon: '/icon/icon-192.png',
      badge: '/icon/icon-192.png',
      data: { url: url || '/' },
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  let url = event.notification.data?.url || '/';
  event.waitUntil(clients.openWindow(url));
});
