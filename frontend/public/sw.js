// LupeFlix service worker — React SPA build.
// Network-first for navigation and the admin panel so deployments never serve
// a stale shell; cache-first for hashed /assets and images.
const CACHE = 'lupeflix-v13-auth';
const APP_SHELL = ['/', '/index.html', '/admin.html', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(APP_SHELL).catch(() => undefined))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;

  // Never cache dynamic endpoints.
  if (
    url.pathname.startsWith('/api') ||
    url.pathname.startsWith('/stream') ||
    url.pathname.startsWith('/upload')
  ) {
    return;
  }

  // Hashed build assets are immutable — cache-first.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(event.request).then(
        (cached) =>
          cached ||
          fetch(event.request).then((res) => {
            if (res && res.status === 200) {
              const clone = res.clone();
              caches.open(CACHE).then((c) => c.put(event.request, clone));
            }
            return res;
          })
      )
    );
    return;
  }

  const isNavigation = event.request.mode === 'navigate';
  const isShellAsset = /\.(?:html|css|js|json)$/i.test(url.pathname) || url.pathname === '/';

  // Network-first for navigations and the app shell. Falls back to the cached
  // index.html so client-side routing keeps working offline.
  if (isNavigation || isShellAsset) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(event.request, clone));
          }
          return res;
        })
        .catch(() =>
          caches.match(event.request).then((cached) => cached || caches.match('/index.html'))
        )
    );
    return;
  }

  // Everything else (images/icons) — cache-first.
  event.respondWith(
    caches.match(event.request).then(
      (cached) =>
        cached ||
        fetch(event.request).then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(event.request, clone));
          }
          return res;
        })
    )
  );
});
