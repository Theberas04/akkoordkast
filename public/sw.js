'use strict';
// Service worker: alleen de app-schil cachen. /api/ en /media/ blijven altijd live,
// zodat liedjes, audio en cast-status nooit uit een oude cache komen.
const CACHE = 'akkoordkast-v75';
// Deze bestanden komen ALTIJD eerst van de server. Ze zijn klein, en zo zie je na een bijwerking meteen
// de nieuwe versie in plaats van de oude uit de cache - dat kostte eerder een tweede keer laden, waardoor
// een melding die al weg was toch bleef staan.
const NETWERK_EERST = ['/', '/index.html', '/lib/lessen-uitgebreid.js', '/lib/stemmen.js', '/lib/ritme.js',
  '/lib/toonladders.js', '/lib/oefenplan.js'];
const SCHIL = ['/', '/index.html', '/favicon.svg', '/manifest.webmanifest', '/icon-192.png', '/lib/lessen-uitgebreid.js', '/lib/stemmen.js', '/lib/ritme.js', '/lib/toonladders.js', '/lib/oefenplan.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SCHIL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(sleutels => Promise.all(sleutels.filter(s => s !== CACHE).map(s => caches.delete(s))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/media/')) return;
  const uitCache = () => caches.match(e.request).then(antwoord => antwoord || caches.match('/index.html'));

  if (NETWERK_EERST.includes(url.pathname)) {
    e.respondWith(fetch(e.request).then(r => {
      if (r.ok) {
        const kopie = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, kopie));
      }
      return r;
    }).catch(uitCache));
    return;
  }

  e.respondWith(
    caches.match(e.request).then(antwoord => antwoord || fetch(e.request).then(r => {
      if (r.ok && SCHIL.includes(url.pathname)) {
        const kopie = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, kopie));
      }
      return r;
    }).catch(uitCache))
  );
});
