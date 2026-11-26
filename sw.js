// Service worker de Caja: guarda la app para abrirla rápido y sin internet.
// - La página (index.html): primero red, si no hay, la copia guardada (así las actualizaciones llegan solas).
// - Librerías de jsDelivr y fuentes: versiones fijas, se guardan la primera vez y se reutilizan.
// - Supabase (tus datos): nunca se guarda aquí; siempre va directo a la red.
const CACHE_APP = 'caja-app-v61';
const CACHE_LIBS = 'caja-libs-v1';
const RAIZ_APP = new URL(self.registration.scope);
const INDEX_APP = new URL('index.html', RAIZ_APP);
const RUTA_DEMO = new URL('demo/', RAIZ_APP).pathname;
const APP = ['./', './index.html', './recordatorio/cierre-21.ics', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png', './favicon.png'];
// Librerías que la app necesita para abrir sin internet (mismas versiones fijas que en index.html)
const LIBS = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.1/dist/umd/supabase.js',
];

self.addEventListener('install', e => {
  e.waitUntil(Promise.all([
    caches.open(CACHE_APP).then(c => c.addAll(APP)),
    caches.open(CACHE_LIBS).then(c => Promise.all(LIBS.map(u => c.match(u).then(h => h || fetch(new Request(u, { mode: 'cors' })).then(r => r.ok && c.put(u, r)))))),
  ]).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => /^caja-(app|libs)-v\d+$/.test(k) && ![CACHE_APP, CACHE_LIBS].includes(k)).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
const conLimite = (p, ms) => Promise.race([p, new Promise((_, mal) => setTimeout(() => mal(new Error('lento')), ms))]);
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.hostname.endsWith('.supabase.co')) return; // datos: siempre en vivo
  if (u.origin === self.location.origin) {
    if (!u.pathname.startsWith(RAIZ_APP.pathname) || u.pathname.startsWith(RUTA_DEMO)) return;
    if (u.pathname === RAIZ_APP.pathname || u.pathname === INDEX_APP.pathname) {
      e.respondWith(conLimite(fetch(r), 5000).then(async res => {
        if (res.ok) {
          const copia = res.clone();
          await caches.open(CACHE_APP).then(c => c.put(INDEX_APP.href, copia)).catch(() => {});
        }
        return res;
      }).catch(async () => (await caches.open(CACHE_APP)).match(INDEX_APP.href)));
      return;
    }
    if (r.mode === 'navigate') return;
    e.respondWith(caches.open(CACHE_APP).then(async c => {
      const hit = await c.match(r);
      if (hit) return hit;
      const res = await fetch(r);
      if (res.ok) await c.put(r, res.clone()).catch(() => {});
      return res;
    }));
    return;
  }
  if (u.hostname === 'cdn.jsdelivr.net' || u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(CACHE_LIBS).then(async c => {
      const hit = await c.match(r);
      if (hit) return hit;
      const res = await fetch(r);
      if (res.ok || res.type === 'opaque') c.put(r, res.clone());
      return res;
    }));
  }
});
