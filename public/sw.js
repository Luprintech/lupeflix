const CACHE = 'lupeflix-v3-20260602';
const STATIC = [
  '/', '/index.html', '/home.html', '/admin.html', '/profile.html',
  '/home.css', '/login.css', '/admin.css', '/profile.css',
  '/app.js', '/login.js', '/admin.js', '/profile.js',
  '/manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(STATIC))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  if (url.origin !== location.origin) return;

  // Never cache dynamic/runtime endpoints.
  if (
    url.pathname.startsWith('/api') ||
    url.pathname.startsWith('/stream') ||
    url.pathname.startsWith('/upload')
  ) {
    return;
  }

  const isStaticAsset = /\.(?:html|css|js|json)$/i.test(url.pathname) || url.pathname === '/';

  // Network first prevents mixed deployments: new HTML with old JS/CSS is what broke LupeFlix.
  if (event.request.mode === 'navigate' || isStaticAsset) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then(cached => cached || caches.match('/index.html')))
    );
    return;
  }

  // Cache first only for non-critical assets like images/icons.
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
