'use strict';
// De offline-setlist: welke adressen bewaart het toestel, hoe groot is dat samen, en hoe komt
// de service worker er weer aan als er geen internet is? Alles wat gerekend moet worden staat
// in lib/offline.js — dezelfde rekenkunde voor de app (klaarzetten), de service worker
// (uitleveren) en de setlistkaart (status tonen).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const offline = require('../lib/offline');
const lees = (naam) => fs.readFileSync(path.join(__dirname, '..', naam), 'utf8');

// Een minimale nep-opslag met dezelfde vorm als localStorage.
function nepWinkel() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    key: (i) => Array.from(map.keys())[i] || null,
    get length() { return map.size; }
  };
}

test('de bewaar-strategie per adres: muziek en beelden eerst uit de voorraad, gegevens eerst vers', () => {
  assert.equal(offline.politiekVoor('/api/audio/preview'), 'cache-eerst');
  assert.equal(offline.politiekVoor('/api/meespelen/audio'), 'cache-eerst');
  assert.equal(offline.politiekVoor('/media/audio/opname.mp3'), 'cache-eerst');
  assert.equal(offline.politiekVoor('/api/muziek/bestand'), 'cache-eerst');
  assert.equal(offline.politiekVoor('/api/liedjes/7'), 'netwerk-eerst');
  assert.equal(offline.politiekVoor('/api/liedjes/7/eigen-blad'), 'netwerk-eerst');
  assert.equal(offline.politiekVoor('/api/meespelen'), 'netwerk-eerst');
  assert.equal(offline.politiekVoor('/api/setlists/3'), 'netwerk-eerst');
  assert.equal(offline.politiekVoor('/api/setlists'), 'netwerk-eerst');
  assert.equal(offline.politiekVoor('/api/setlists/3/overgangen'), 'netwerk-eerst');
  assert.equal(offline.politiekVoor('/api/profielen'), 'netwerk-eerst');
  assert.equal(offline.politiekVoor('/api/versie'), 'netwerk-eerst');
  // De liedlijst hoort erbij (het hele liedboek offline); de rest van de losse routes niet.
  assert.equal(offline.politiekVoor('/api/liedjes'), 'netwerk-eerst');
  assert.equal(offline.politiekVoor('/api/artiesten'), null);
  assert.equal(offline.politiekVoor('/index.html'), null);
});

test('de adressenlijst voor één liedje: liedkaart, begeleiding, meespelen en bladmuziek', () => {
  const lied = {
    id: 7, tempo: 120, capo: 2, transpositie: 0,
    audio: { preview: '/api/audio/preview?liedje=7&capo=2&transpose=0&tempo=120&strum=%E2%86%93', opname: '' },
    muziek: { url: '' },
    bladmuziek: { url: '/api/liedjes/7/eigen-blad' }
  };
  assert.deepEqual(offline.urlsVoorLiedje(lied, { eigen: false }), [
    '/api/liedjes/7?',
    '/api/audio/preview?liedje=7&capo=2&transpose=0&tempo=120&strum=%E2%86%93',
    '/api/meespelen?liedje=7&capo=2&transpose=0&tempo=120&aftellen=1&klik=0',
    '/api/meespelen/audio?liedje=7&capo=2&transpose=0&tempo=120&aftellen=1&klik=0',
    '/api/liedjes/7/eigen-blad'
  ]);
});

test('eigen muziek en opname alleen als je ze meeneemt; met eigen audio geen synth-versie erbij', () => {
  const lied = {
    id: 3, tempo: 90, capo: 0, transpositie: 0,
    heeftEigenOpname: true,
    audio: { preview: '/api/audio/preview?liedje=3&capo=0&transpose=0&tempo=90', opname: '/media/audio/mijn-opname.m4a' },
    muziek: { url: '/api/muziek/bestand?liedje=3' }
  };
  const zonder = offline.urlsVoorLiedje(lied, { eigen: false });
  assert.ok(zonder.indexOf('/media/audio/mijn-opname.m4a') === -1, 'de opname hoort niet mee te gaan zonder de schakelaar');
  assert.ok(zonder.indexOf('/api/muziek/bestand?liedje=3') === -1, 'idem voor het muziekbestand');
  const met = offline.urlsVoorLiedje(lied, { eigen: true });
  assert.ok(met.indexOf('/media/audio/mijn-opname.m4a') !== -1);
  assert.ok(met.indexOf('/api/muziek/bestand?liedje=3') !== -1);
  assert.ok(met.indexOf('/api/meespelen/audio?') === -1,
    'met een eigen opname speelt de opname mee; de synth-versie hoeft dan niet bewaard te worden');
});

test('een liedje zonder id of zonder velden levert geen kapotte adressen op', () => {
  assert.deepEqual(offline.urlsVoorLiedje(null, { eigen: true }), []);
  const kaal = offline.urlsVoorLiedje({ id: 4, tempo: 100, capo: 0 }, { eigen: true });
  assert.deepEqual(kaal, [
    '/api/liedjes/4?',
    '/api/meespelen?liedje=4&capo=0&transpose=0&tempo=100&aftellen=1&klik=0',
    '/api/meespelen/audio?liedje=4&capo=0&transpose=0&tempo=100&aftellen=1&klik=0'
  ]);
});

test('een vraag die er nét anders uitziet vindt de bewaarde versie toch terug', () => {
  const sleutels = [
    'http://doos:8080/api/audio/preview?liedje=7&capo=2&transpose=0&tempo=120&strum=DD',
    'http://doos:8080/api/liedjes/7?',
    'http://doos:8080/api/meespelen?liedje=7&capo=2&transpose=0&tempo=120&aftellen=1&klik=0',
    'http://doos:8080/api/liedjes/7/eigen-blad'
  ];
  // Precies hetzelfde adres.
  assert.equal(offline.terugvalSleutel(sleutels[1], sleutels), sleutels[1]);
  // De speler vraagt de begeleiding zonder de strum-vraag erbij.
  assert.equal(
    offline.terugvalSleutel('http://doos:8080/api/audio/preview?liedje=7&capo=2&transpose=0&tempo=120', sleutels),
    sleutels[0]);
  // De liedkaart met een transpositie erbij.
  assert.equal(offline.terugvalSleutel('http://doos:8080/api/liedjes/7?transpose=2', sleutels), sleutels[1]);
  // Meespelen met een andere klikstand.
  assert.equal(
    offline.terugvalSleutel('http://doos:8080/api/meespelen?liedje=7&capo=2&transpose=0&tempo=120&aftellen=0&klik=1', sleutels),
    sleutels[2]);
  // Een ander liedje of een ander blad valt niet terug op iets anders.
  assert.equal(offline.terugvalSleutel('http://doos:8080/api/liedjes/9?', sleutels), null);
  assert.equal(offline.terugvalSleutel('http://doos:8080/api/liedjes/7/eigen-blad?x=1', sleutels.slice(0, 2)), null);
});

test('metagegevens per setlist: bewaren, lezen en wissen', () => {
  const winkel = nepWinkel();
  assert.equal(offline.leesMeta(winkel, 4), null);
  offline.bewaarMeta(winkel, { id: 4, naam: 'Kroeg', aantal: 12, bytes: 34 * 1024 * 1024, urls: ['A'], moment: '2026-11-15T20:00:00.000Z' });
  offline.bewaarMeta(winkel, { id: 5, naam: 'Kerk', aantal: 3, bytes: 2 * 1024 * 1024, urls: ['B'], moment: '2026-11-15T21:00:00.000Z' });
  const m = offline.leesMeta(winkel, 4);
  assert.equal(m.naam, 'Kroeg');
  assert.equal(m.aantal, 12);
  const alle = offline.leesAlleMetas(winkel);
  assert.equal(alle.length, 2);
  assert.deepEqual(alle.map((x) => x.id).sort(), [4, 5]);
  offline.wisMeta(winkel, 4);
  assert.equal(offline.leesMeta(winkel, 4), null);
  assert.equal(offline.leesAlleMetas(winkel).length, 1);
});

test('opruimen laat adressen staan die een andere setlist nog nodig heeft', () => {
  const alle = [
    { id: 1, urls: ['A', 'B', 'C'] },
    { id: 2, urls: ['B', 'D'] }
  ];
  assert.deepEqual(offline.opruimUrls(alle, 1), ['A', 'C']);
  assert.deepEqual(offline.opruimUrls(alle, 2), ['D']);
  assert.deepEqual(offline.opruimUrls(alle, 9), []);
});

test('heel het liedboek: alle liedjes leveren samen één adressenlijst op, zonder dubbelen', () => {
  const lied1 = { id: 1, tempo: 100, capo: 0, transpositie: 0, audio: { preview: '/api/audio/preview?liedje=1&capo=0&transpose=0&tempo=100' } };
  const lied2 = { id: 2, tempo: 90, capo: 2, transpositie: 0, audio: { preview: '/api/audio/preview?liedje=2&capo=2&transpose=0&tempo=90' } };
  const urls = offline.urlsVoorBoek([lied1, lied2], { eigen: false });
  assert.ok(urls.indexOf('/api/liedjes/1?') !== -1 && urls.indexOf('/api/liedjes/2?') !== -1);
  assert.ok(urls.indexOf('/api/meespelen/audio?liedje=1&capo=0&transpose=0&tempo=100&aftellen=1&klik=0') !== -1);
  assert.ok(urls.indexOf('/api/meespelen/audio?liedje=2&capo=2&transpose=0&tempo=90&aftellen=1&klik=0') !== -1);
  assert.equal(urls.length, new Set(urls).size, 'geen dubbelen');
  assert.deepEqual(offline.urlsVoorBoek(null), []);
});

test('de liedlijst van de app wordt per pagina bewaard, onder het adres dat de app vraagt', () => {
  assert.equal(offline.liedjesLijstUrl(0), '/api/liedjes?compact=1&vanaf=0&aantal=200');
  assert.equal(offline.liedjesLijstUrl(200), '/api/liedjes?compact=1&vanaf=200&aantal=200');
});

test('de boek-voorraad heeft een eigen sleutel en overleeft het opruimen van een setlist', () => {
  const winkel = nepWinkel();
  offline.bewaarMeta(winkel, { id: 4, naam: 'Kroeg', aantal: 2, bytes: 1, urls: ['/api/liedjes/7?', 'G'], moment: '2026-11-15T20:00:00.000Z' });
  offline.bewaarMeta(winkel, { id: offline.BOEK_ID, naam: 'Heel het liedboek', aantal: 2, bytes: 1,
    urls: ['/api/liedjes?compact=1&vanaf=0&aantal=200', '/api/liedjes/7?', 'H'], moment: '2026-11-15T21:00:00.000Z' });
  const alle = offline.leesAlleMetas(winkel);
  assert.equal(alle.length, 2);
  assert.equal(offline.leesMeta(winkel, 'boek').naam, 'Heel het liedboek');
  // De setlist weghalen raakt het liedboek niet: de liedlijst en de liedkaart blijven staan.
  assert.deepEqual(offline.opruimUrls(alle, 4), ['G']);
  // Het liedboek weghalen raakt de setlist niet: alleen wat nergens anders bij hoort gaat weg.
  assert.deepEqual(offline.opruimUrls(alle, 'boek'), ['/api/liedjes?compact=1&vanaf=0&aantal=200', 'H']);
});

test('een bewaarde liedlijst beantwoordt alleen een ongefilterde pagina-vraag', () => {
  const lijst = ['http://doos:8080/api/liedjes?compact=1&vanaf=0&aantal=200'];
  const kaleVraag = 'http://doos:8080/api/liedjes?compact=1&vanaf=0&aantal=24';
  assert.equal(offline.terugvalSleutel(kaleVraag, lijst), lijst[0]);
  assert.equal(offline.terugvalSleutel(kaleVraag + '&zoek=kerst', lijst), null, 'een zoekvraag krijgt nooit zomaar de hele lijst');
  assert.equal(offline.terugvalSleutel('http://doos:8080/api/liedjes?compact=1&vanaf=200&aantal=24', lijst), null,
    'zonder bewaarde pagina 2 geen antwoord');
  const paginas = lijst.concat(['http://doos:8080/api/liedjes?compact=1&vanaf=200&aantal=200']);
  assert.equal(offline.terugvalSleutel('http://doos:8080/api/liedjes?compact=1&vanaf=200&aantal=24', paginas), paginas[1]);
  assert.equal(offline.terugvalSleutel('http://doos:8080/api/liedjes/7?', lijst), null, 'een liedkaart valt niet terug op de lijst');
});

test('groottes in gewone taal', () => {
  assert.equal(offline.grootteTekst(0), '0 kB');
  assert.equal(offline.grootteTekst(812 * 1024), '812 kB');
  assert.equal(offline.grootteTekst(1024 * 1024), '1,0 MB');
  assert.equal(offline.grootteTekst(Math.round(34.2 * 1024 * 1024)), '34,2 MB');
});

test('de rekenkunde werkt in node én in de browser/de service worker', () => {
  const bron = lees('lib/offline.js');
  assert.ok(bron.includes('module.exports'), 'hoort in node te werken (voor deze proeven)');
  assert.ok(bron.includes('root.offlineRekenen'), 'hoort zichzelf in de browser en de service worker te zetten');
});

test('de service worker gebruikt de offline-voorraad en gooit hem niet weg', () => {
  const sw = lees('public/sw.js');
  assert.ok(sw.includes("importScripts('/lib/offline.js')"), 'de sw hoort dezelfde rekenkunde te gebruiken');
  assert.ok(sw.includes('s !== CACHE && s !== offlineRekenen.CACHE'),
    'een nieuw app-versienummer mag de offline-voorraad niet wissen');
  assert.ok(sw.includes('politiekVoor'), 'de sw hoort per adres te kiezen hoe hij uitlevert');
  assert.ok(sw.includes('terugvalSleutel'), 'de sw hoort een net-anders-vraag op de bewaarde versie te laten vallen');
  assert.ok(sw.includes("'/lib/offline.js'"), 'de offline-rekenkunde hoort in de schil te zitten');
  assert.ok(!sw.includes("'akkoordkast-v99'"), 'de cacheversie hoort opgehoogd te zijn');
});

test('de setlistkaart heeft de offline-knoppen en de uitleg', () => {
  const html = lees('public/index.html');
  assert.ok(html.includes('id="setlist-offline"'), 'de knop om klaar te zetten');
  assert.ok(html.includes('id="setlist-offline-wis"'), 'de knop om de voorraad van dit toestel te wissen');
  assert.ok(html.includes('id="setlist-offline-status"'), 'de statusregel naast de knoppen');
  assert.ok(html.includes('id="setlist-offline-eigen"'), 'de schakelaar voor je eigen muziekbestanden');
  assert.ok(html.includes('Offline klaarzetten'), 'de knop hoort gewone taal te spreken');
  assert.ok(html.includes('zonder wifi'), 'de uitleg hoort het podium te noemen');
  assert.ok(html.includes('<script src="/lib/offline.js"></script>'), 'de rekenkunde hoort in de pagina geladen te worden');
  assert.ok(html.includes('function zetOfflineSetlistKlaar('), 'de klaarzethulp hoort te bestaan');
  assert.ok(html.includes('id="boek-offline"'), 'de knop voor het hele liedboek');
  assert.ok(html.includes('id="boek-offline-wis"'), 'de wis-knop van het liedboek');
  assert.ok(html.includes('id="boek-offline-status"'), 'de statusregel van het liedboek');
  assert.ok(html.includes('id="boek-offline-melding"'), 'de meldingen van het liedboek');
  assert.ok(html.includes('Heel het liedboek'), 'de kaart hoort gewone taal te spreken');
  assert.ok(html.includes('function zetOfflineKlaar('), 'de gedeelde klaarzethulp hoort te bestaan');
  assert.ok(html.includes('function wisOfflineKlaar('), 'de gedeelde wishulp hoort te bestaan');
  assert.ok(html.includes('offlineRekenen.BOEK_ID'), 'de pagina hoort de boek-sleutel te gebruiken');
});
