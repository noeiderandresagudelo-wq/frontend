// Service Worker de Alarvix Enterprise
// IMPORTANTE: cada vez que subas cambios importantes y el celular no los muestre,
// sube este número (v2 -> v3 -> v4...). Eso obliga a todos los celulares a bajar
// la versión nueva en vez de seguir usando la copia guardada.
const CACHE_NAME = 'alarvix_cache_v7';

// Archivos propios de Alarvix (mismo origen) + librerías externas (CDN) que usa la app.
const urlsToCache = [
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;700&display=swap'
];

// --- INSTALACIÓN: guarda en caché lo que pueda. Si una librería externa falla
// (por CORS o caída del CDN), no rompe el resto — solo avisa en consola. ---
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      const resultados = await Promise.allSettled(
        urlsToCache.map((url) => cache.add(url))
      );
      resultados.forEach((r, i) => {
        if (r.status === 'rejected') {
          console.warn('[Alarvix SW] No se pudo cachear:', urlsToCache[i], r.reason);
        }
      });
    }).then(() => self.skipWaiting())
  );
});

// --- ACTIVACIÓN: limpia cachés de versiones viejas del Service Worker ---
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// --- PETICIONES DE RED ---
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  const esArchivoPrincipal = e.request.mode === 'navigate' || e.request.url.endsWith('/index.html') || e.request.url.endsWith('/');

  if (esArchivoPrincipal) {
    // Para el HTML principal: siempre intenta traer la versión más reciente si hay
    // internet (así ves tus cambios apenas los subís). Si no hay conexión, usa la
    // última copia guardada.
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copia = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, copia));
          return res;
        })
        .catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html')))
    );
    return;
  }

  // Para todo lo demás (librerías, fuentes, íconos): usa la caché primero (más rápido
  // y funciona sin señal), y si no está guardado, lo busca en internet y lo guarda.
  e.respondWith(
    caches.match(e.request).then((res) => {
      if (res) return res;
      return fetch(e.request)
        .then((networkRes) => {
          return caches.open(CACHE_NAME).then((cache) => {
            try { cache.put(e.request, networkRes.clone()); } catch (err) {}
            return networkRes;
          });
        })
        .catch(() => caches.match(e.request));
    })
  );
});
