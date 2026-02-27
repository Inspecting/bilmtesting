const CACHE_NAME = 'bilm-shell-v5';
const SCOPE_URL = new URL(self.registration.scope);
const APP_SHELL = ['.', 'index.html', 'home/', 'manifest.json', 'icon.png', 'shared/theme.css', 'shared/foundation.css']
  .map((path) => new URL(path, SCOPE_URL).toString());

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);
  const isHTML = event.request.mode === 'navigate' || event.request.headers.get('accept')?.includes('text/html');

  if (isHTML) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match(new URL('index.html', SCOPE_URL).toString())))
    );
    return;
  }

  if (requestUrl.origin !== self.location.origin) return;
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
