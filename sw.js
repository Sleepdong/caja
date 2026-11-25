// Service worker de Caja: guarda la app para abrirla rápido y sin internet.
// - La página (index.html): primero red, si no hay, la copia guardada (así las actualizaciones llegan solas).
// - Librerías de jsDelivr y fuentes: versiones fijas, se guardan la primera vez y se reutilizan.
// - Supabase (tus datos): nunca se guarda aquí; siempre va directo a la red.
const CACHE_APP = 'caja-app-v53';
const CACHE_LIBS = 'caja-libs-v1';
const APP = ['./', './index.html', './recordatorio/cierre-21.ics', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png', './favicon.png'];
// Librerías que la app necesita para abrir sin internet (mismas versiones fijas que en index.html)
const LIBS = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.1/dist/umd/supabase.js',
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
];

self.addEventListener('install', e => {
  e.waitUntil(Promise.all([
    caches.open(CACHE_APP).then(c => c.addAll(APP)),
    caches.open(CACHE_LIBS).then(c => Promise.all(LIBS.map(u => c.match(u).then(h => h || fetch(new Request(u, { mode: 'cors' })).then(r => r.ok && c.put(u, r)))))),
  ]).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => ![CACHE_APP, CACHE_LIBS].includes(k)).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
const conLimite = (p, ms) => Promise.race([p, new Promise((_, mal) => setTimeout(() => mal(new Error('lento')), ms))]);
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.hostname.endsWith('.supabase.co')) return; // datos: siempre en vivo
  if (u.origin === self.location.origin) {
    if (r.mode === 'navigate' || u.pathname.endsWith('/') || u.pathname.endsWith('index.html')) {
      e.respondWith(conLimite(fetch(r), 5000).then(res => {
        if (res.ok) { const copia = res.clone(); caches.open(CACHE_APP).then(c => c.put('./index.html', copia)); }
        return res;
      }).catch(() => caches.match('./index.html')));
      return;
    }
    e.respondWith(caches.open(CACHE_APP).then(async c => {
      const hit = await c.match(r);
      const red = fetch(r).then(res => { if (res.ok) c.put(r, res.clone()); return res; });
      return hit || red;
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
