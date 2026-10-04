const CACHE_NAME = 'alarvix_pwa_v14';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './favicon.svg'
];

function esRespuestaCacheable(response, request) {
  if (!response || !response.ok) return false;
  if (response.redirected) return false;

  const responseUrl = new URL(response.url || request.url, self.location.origin);
  if (responseUrl.origin !== self.location.origin) return false;

  const contentType = String(response.headers.get('content-type') || '').toLowerCase();

  // Nunca guardar HTML como si fuera un recurso estático solicitado.
  // Esto evita contaminar la caché cuando Vercel/SSO devuelve una página HTML.
  if (request.destination === 'script' && !contentType.includes('javascript')) return false;
  if (request.destination === 'style' && !contentType.includes('css')) return false;
  if (request.destination === 'image' && !contentType.startsWith('image/')) return false;
  if (request.destination === 'manifest' && !contentType.includes('manifest') && !contentType.includes('json')) return false;

  return true;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async (cache) => {
        for (const asset of APP_SHELL) {
          try {
            const request = new Request(asset, { cache: 'no-store' });
            const response = await fetch(request);
            if (esRespuestaCacheable(response, request)) {
              await cache.put(request, response.clone());
            }
          } catch (error) {
            console.warn('[Alarvix PWA] No se pudo precargar:', asset, error);
          }
        }
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // No interceptar recursos de otros dominios.
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok && !response.redirected) {
            const copy = response.clone();
            caches.open(CACHE_NAME)
              .then((cache) => cache.put('./index.html', copy))
              .catch(() => {});
          }
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request)
        .then((response) => {
          if (esRespuestaCacheable(response, event.request)) {
            const copy = response.clone();
            caches.open(CACHE_NAME)
              .then((cache) => cache.put(event.request, copy))
              .catch(() => {});
          }
          return response;
        })
        .catch((error) => {
          console.warn('[Alarvix PWA] Recurso no disponible:', event.request.url, error);
          throw error;
        });
    })
  );
});
