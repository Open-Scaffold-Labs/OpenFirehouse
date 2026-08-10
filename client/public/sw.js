// Open Firehouse Service Worker
const CACHE_NAME = 'openfirehouse-v0.18.1';
const API_CACHE  = 'openfirehouse-api-v3'; // v3 (2026-07-11): operational surfaces moved SWR → network-first
                                           // (a cached cad/alerts answer to the Realtime ping→refetch delayed
                                           // new-dispatch renders by a poll cycle); v2: W4.4 active-incident +
                                           // hazmat material caching, fixed offline fallback

// Top 20 ERG guides and all TIH isolation data pre-cached for offline field use.
// Guides chosen by incident frequency: common flammables, corrosives, TIH gases,
// explosives, oxidizers, miscellaneous dangerous goods, and mixed loads.
const ERG_GUIDES_TO_PRECACHE = [111, 115, 117, 119, 121, 122, 123, 124, 125,
                                 127, 128, 131, 132, 137, 138, 140, 151, 154, 157, 171];
const ERG_PRECACHE_URLS = [
  ...ERG_GUIDES_TO_PRECACHE.map(g => `/api/hazmat/guide/${g}`),
  '/api/hazmat/search?q=chlorine&type=all&limit=5',
  '/api/hazmat/search?q=ammonia&type=all&limit=5',
  '/api/hazmat/search?q=propane&type=all&limit=5',
  '/api/hazmat/search?q=gasoline&type=all&limit=5',
  '/api/hazmat/search?q=sulfuric+acid&type=all&limit=5',
];

// vite-plugin-pwa injects the build-time precache manifest here at build time.
// Each entry is { url, revision } — covers all JS/CSS/font chunks so the app
// shell loads fully offline after the first visit.
// In development (no build step) this is an empty array — no-op.
const PRECACHE_MANIFEST = self.__WB_MANIFEST || [];
const PRECACHE_URLS = PRECACHE_MANIFEST.map(e => (typeof e === 'string' ? e : e.url));

// ── Install: pre-cache the shell + all built chunks + ERG guides ──────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      // App shell + all JS/CSS/font chunks from the build manifest
      caches.open(CACHE_NAME).then((cache) => cache.addAll([
        '/',
        ...PRECACHE_URLS,
      ].filter(Boolean))),

      // ERG guide and common-material API responses — cached individually so
      // a single failed request doesn't abort the entire install.
      caches.open(API_CACHE).then((cache) =>
        Promise.allSettled(
          ERG_PRECACHE_URLS.map((url) =>
            fetch(url)
              .then((res) => { if (res.ok) cache.put(url, res); })
              .catch(() => { /* network unavailable at install time — skip */ })
          )
        )
      ),
    ])
  );
  self.skipWaiting();
});

// ── Activate: clear old caches ────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME && k !== API_CACHE).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: network-first for API, cache-first for assets ─────────────────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // In local development the Vite dev server proxies /api to port 3005.
  // The service worker runs on the app origin (5174) and cannot use that proxy,
  // so any fetch it makes to /api fails — returning a false "offline" error.
  // Skip ALL interception on localhost so the browser handles requests normally.
  if (self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1') {
    return;
  }

  // API calls: three tiers (2026-07-11 — replaces the single SWR list):
  //  • REFERENCE (ERG hazmat): stale-while-revalidate. The dataset is versioned
  //    yearly — serving cache instantly is correct AND fast for field lookups.
  //  • OPERATIONAL (dispatch, unit status, field data): NETWORK-FIRST with a
  //    cache fallback. The old SWR here was a life-safety accuracy bug: the
  //    Realtime "ping → refetch /api/cad/alerts" was answered from cache, so a
  //    NEW call's banner rendered a poll-cycle late; a post-edit refetch could
  //    show pre-edit values (the same class that bit the iPad — OFM T.7).
  //    Network-first keeps W4.4's offline promise (cache still answers when the
  //    network is gone) while never serving stale data when the network is up.
  //  • Everything else: network-only with an offline error.
  if (url.pathname.startsWith('/api/')) {
    const REFERENCE_APIS = [
      '/api/hazmat/guide/', '/api/hazmat/search', '/api/hazmat/material/',
      '/api/hazmat/placard/',
    ];
    const OPERATIONAL_APIS = [
      '/api/pre-plans', '/api/hydrants', '/api/knox-keys', '/api/members',
      '/api/active-board', '/api/cad/alerts', '/api/units/status',
    ];
    // On a degraded fireground connection, waiting on a dead-slow network is as
    // bad as a hang — after this timeout the cached copy answers and the still-
    // in-flight fetch refreshes the cache in the background for the next read.
    const OPERATIONAL_NETWORK_TIMEOUT_MS = 5000;

    const isGet = event.request.method === 'GET';
    const isReference   = isGet && REFERENCE_APIS.some(p => url.pathname.startsWith(p));
    const isOperational = isGet && OPERATIONAL_APIS.some(p => url.pathname.startsWith(p));

    const offline503 = () => new Response(
      JSON.stringify({ error: 'Offline — no cached data available', data: [] }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );

    if (isOperational) {
      // Network-first: fresh when reachable; cached when offline or dead-slow.
      event.respondWith(
        caches.open(API_CACHE).then(cache =>
          cache.match(event.request).then(cached => {
            // `network` NEVER rejects (it resolves null on failure) so every
            // consumer below can use plain .then — a rejecting handle here is
            // how the W4.4-class bug happens (respondWith receives a rejected
            // promise → the page sees a raw network error instead of the clean
            // offline 503; this exact slip was caught by audit before v3 shipped).
            const network = fetch(event.request).then(response => {
              // Cache only good answers; pass every real response through so a
              // 401 (token refresh) or 5xx reaches the app's own error handling
              // — cache must never mask an auth or server error.
              if (response.ok) cache.put(event.request, response.clone());
              return response;
            }).catch(() => null);
            const timeout = new Promise(resolve =>
              setTimeout(() => resolve(null), OPERATIONAL_NETWORK_TIMEOUT_MS));
            return Promise.race([network, timeout]).then(winner => {
              if (winner) return winner;              // a real network answer won
              if (cached) return cached;              // offline / dead-slow → last-known-good
              return network.then(r => r || offline503()); // no cache: better slow than 503-at-5s
            });
          })
        )
      );
      return;
    }

    if (isReference) {
      // Stale-while-revalidate: serve cache immediately, update in background.
      // W4.4 bugfix retained: `cached || fetchPromise || offline503` was broken —
      // a Promise is always truthy, so the 503 branch was unreachable, and a
      // cache-miss while offline resolved respondWith with null (a TypeError,
      // surfacing as a raw network error mid-incident).
      event.respondWith(
        caches.open(API_CACHE).then(cache =>
          cache.match(event.request).then(cached => {
            const fetchPromise = fetch(event.request).then(response => {
              if (response.ok) cache.put(event.request, response.clone());
              return response;
            }).catch(() => null);
            if (cached) {
              fetchPromise.catch(() => {}); // background refresh, result unused
              return cached;
            }
            return fetchPromise.then(r => r || offline503());
          })
        )
      );
      return;
    }

    // All other API calls: network-only with offline error
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(
          JSON.stringify({ error: 'You are offline. Please reconnect to sync.' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        )
      )
    );
    return;
  }

  // For everything else: try network first, fall back to cache
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful GET responses
        if (event.request.method === 'GET' && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// ── Push: show notification ───────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = { title: 'Open Firehouse', body: 'New update' };
  try { data = event.data.json(); } catch (_) {}

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body:    data.body,
      icon:    data.icon  || '/icon-192.png',
      badge:   data.badge || '/icon-192.png',
      vibrate: [200, 100, 200],
      data:    data.data || {},
      actions: [
        { action: 'open',    title: 'Open App' },
        { action: 'dismiss', title: 'Dismiss'  },
      ],
    })
  );
});

// ── Notification click: open app ─────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  // For recall notifications, deep-link to the Recall page
  const notifData = event.notification.data || {};
  let url = notifData.url || '/';
  if (notifData.type === 'recall' && notifData.recallId) {
    url = `/?page=recall&id=${notifData.recallId}`;
  }
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If the app is already open, focus it
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      // Otherwise open a new window
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
