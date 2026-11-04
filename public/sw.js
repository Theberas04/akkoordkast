'use strict';
// Service worker: alleen de app-schil cachen. /api/ en /media/ blijven altijd live,
// zodat liedjes, audio en cast-status nooit uit een oude cache komen.
const CACHE = 'akkoordkast-v48';
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
  e.respondWith(
    caches.match(e.request).then(antwoord => antwoord || fetch(e.request).then(r => {
      if (r.ok && SCHIL.includes(url.pathname)) {
        const kopie = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, kopie));
      }
      return r;
    }).catch(() => caches.match('/index.html')))
  );
});
