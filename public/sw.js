'use strict';
// Service worker: de app-schil cachen, en de offline-voorraad uitleveren die je met
// "Offline klaarzetten" op een setlist hebt gelegd. Zonder die voorraad blijven /api/ en
// /media/ altijd live, zodat liedjes, audio en cast-status nooit uit een oude cache komen —
// alleen wat je zélf klaarzette, komt uit de voorraad (en wordt bij nieuwere data bijgewerkt).
importScripts('/lib/offline.js');

const CACHE = 'akkoordkast-v106';
// Deze bestanden komen ALTIJD eerst van de server. Ze zijn klein, en zo zie je na een bijwerking meteen
// de nieuwe versie in plaats van de oude uit de cache - dat kostte eerder een tweede keer laden, waardoor
// een melding die al weg was toch bleef staan.
const NETWERK_EERST = ['/', '/index.html', '/lib/offline.js', '/lib/sessie.js', '/lib/lessen-uitgebreid.js', '/lib/stemmen.js', '/lib/ritme.js',
  '/lib/toonladders.js', '/lib/noten.js', '/lib/oefenplan.js', '/lib/motiefjes.js', '/lib/showplan.js', '/lib/weetjes.js'];
const SCHIL = ['/', '/index.html', '/favicon.svg', '/manifest.webmanifest', '/icon-192.png', '/lib/offline.js', '/lib/sessie.js', '/lib/lessen-uitgebreid.js', '/lib/stemmen.js', '/lib/ritme.js', '/lib/toonladders.js', '/lib/noten.js', '/lib/oefenplan.js', '/lib/motiefjes.js', '/lib/showplan.js', '/lib/weetjes.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SCHIL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    // Let op: de offline-voorraad (offlineRekenen.CACHE) hoort een nieuwe app-versie te overleven —
    // anders zou een bijwerking de klaargezette setlists van dit toestel wissen.
    caches.keys().then(sleutels => Promise.all(sleutels.filter(s => s !== CACHE && s !== offlineRekenen.CACHE).map(s => caches.delete(s))))
      .then(() => self.clients.claim())
  );
});

// Een bewaard adres uit de offline-voorraad halen. Lukt het niet precies, dan zoeken we een
// bewaarde versie van dezelfde vraag (andere transpositie, andere schakelaar) via de
// rekenkunde in lib/offline.js.
function uitVoorraad(req) {
  return caches.open(offlineRekenen.CACHE).then(cache =>
    cache.match(req.url).then(hit => {
      if (hit) return hit;
      return cache.keys().then(sleutels => {
        const naam = offlineRekenen.terugvalSleutel(req.url, sleutels.map(k => k.url));
        return naam ? cache.match(naam) : null;
      });
    })
  );
}

// Hoe een adres wordt uitgeleverd:
//  cache-eerst   – eerst de voorraad (muziek en beelden), anders het netwerk;
//  netwerk-eerst – eerst het netwerk (kleine, verse gegevens), anders de voorraad. Komt er
//                  verse data binnen voor iets dat al in de voorraad zit, dan werken we die bij.
function behandel(req) {
  const politiek = offlineRekenen.politiekVoor(new URL(req.url).pathname);
  if (politiek === 'cache-eerst') {
    return uitVoorraad(req).then(hit => hit || fetch(req));
  }
  return fetch(req).then(r => {
    if (r.ok) {
      caches.open(offlineRekenen.CACHE).then(cache =>
        cache.match(req.url).then(hit => { if (hit) cache.put(req.url, r.clone()); }));
    }
    return r;
  }).catch(() => uitVoorraad(req).then(hit => {
    if (hit) return hit;
    throw new Error('geen verbinding');
  }));
}

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (offlineRekenen.politiekVoor(url.pathname)) {
    e.respondWith(behandel(e.request));
    return;
  }
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
