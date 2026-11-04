'use strict';
// De HTTP-kant van de app: pagina, PWA-assets, liedjes-API, audio, instellingen en casten.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { start, haal, post, alsBeheerder, zetHandleiding } = require('./hulp');

let omgeving;
// De beheerder: alles wat iets toevoegt, gebeurt met dit account (net als in de browser, waar
// je één keer inlogt en daarna kunt uploaden en omzetten).
let baas;

// Een schrijfactie met het koekje van de beheerder.
const alsBaas = (pad, opties = {}) => haal(omgeving.basis, pad, Object.assign({}, opties, {
  headers: Object.assign({}, opties.headers,
    { cookie: baas.koekje, 'x-profiel': String(baas.profiel) })
}));

test.before(async () => {
  omgeving = await start();
  baas = await alsBeheerder(omgeving.basis);
});
test.after(async () => { if (omgeving) await omgeving.stop(); });

test('de pagina komt uit de app zelf, met de app-marker', async () => {
  const r = await haal(omgeving.basis, '/');
  assert.equal(r.status, 200);
  assert.match(r.type, /text\/html/);
  assert.match(r.data, /AkkoordKast/);
  assert.equal(r.headers.get('cache-control'), 'no-cache');
});

test('healthz antwoordt ok met de app-marker', async () => {
  const r = await haal(omgeving.basis, '/healthz');
  assert.equal(r.status, 200);
  assert.equal(r.data.trim(), 'ok');
  assert.equal(r.headers.get('x-akkoordkast'), 'app');
});

test('elk inline scriptblok compileert en elk scriptbestand bestaat', async () => {
  const html = await haal(omgeving.basis, '/');
  const blokken = html.data.match(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g) || [];
  assert.equal(blokken.length, 1, 'de pagina hoort één inline scriptblok te hebben');
  for (const blok of blokken) {
    const inhoud = blok.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '');
    new vm.Script(inhoud); // gooit bij een syntaxfout
  }
  const bronnen = [...html.data.matchAll(/<script[^>]*src="([^"]+)"/g)].map(m => m[1]);
  for (const bron of bronnen) {
    // Scripts horen in public/ te staan. Eén uitzondering: /lib/ — daar staat de
    // rekenkunde die de server én de browser gebruiken (de metronoom), en die wordt
    // bewust uit lib/ geserveerd zodat er maar één kopie van is.
    const schoon = bron.replace(/^\//, '');
    const inPublic = path.join(__dirname, '..', 'public', schoon);
    const inLib = /^lib\/[a-z0-9-]+\.js$/.test(schoon) ? path.join(__dirname, '..', schoon) : '';
    assert.ok(fs.existsSync(inPublic) || (inLib && fs.existsSync(inLib)), `scriptbestand ontbreekt: ${bron}`);
  }
});

test('iedere id in de pagina is uniek', async () => {
  const html = await haal(omgeving.basis, '/');
  const ids = [...html.data.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
  const dubbel = ids.filter((id, i) => ids.indexOf(id) !== i);
  assert.deepEqual([...new Set(dubbel)], [], 'dubbele ids: ' + dubbel.join(', '));
});

test('de PWA-assets worden geserveerd met het juiste type', async () => {
  const verwacht = {
    '/manifest.webmanifest': /manifest\+json/,
    '/favicon.svg': /image\/svg\+xml/,
    '/sw.js': /javascript/,
    '/icon-192.png': /image\/png/,
    '/icon-512.png': /image\/png/,
    '/icon-512-maskable.png': /image\/png/,
    '/apple-touch-icon.png': /image\/png/
  };
  for (const [pad, type] of Object.entries(verwacht)) {
    const r = await haal(omgeving.basis, pad);
    assert.equal(r.status, 200, `${pad} hoort 200 te geven`);
    assert.match(r.type, type, `${pad} heeft een verkeerd content-type`);
  }
});

test('de service worker houdt /api/ en /media/ buiten de cache', () => {
  const sw = fs.readFileSync(path.join(__dirname, '..', 'public', 'sw.js'), 'utf8');
  // de naam mag opschuiven als de app-schil verandert; hij moet wel een versie hebben
  assert.match(sw, /const CACHE = 'akkoordkast-v\d+';/);
  assert.match(sw, /startsWith\('\/api\/'\)/);
  assert.match(sw, /startsWith\('\/media\/'\)/);
});

test('paden buiten de map worden geweigerd en de app blijft antwoorden', async () => {
  for (const pad of ['/../server.js', '/..%2fserver.js', '/media/../../server.js']) {
    const r = await haal(omgeving.basis, pad);
    assert.ok(r.status === 400 || r.status === 404, `${pad} gaf ${r.status}`);
    assert.doesNotMatch(String(r.data), /DatabaseSync/, `${pad} lekt servercode`);
  }
  // een protocol-relatief pad mag de server niet laten omvallen
  const r = await fetch(omgeving.basis + '//');
  assert.ok([200, 400, 404].includes(r.status));
  const nog = await haal(omgeving.basis, '/healthz');
  assert.equal(nog.status, 200);
});

test('de liedlijst geeft de meegeleverde liedjes met capo-advies', async () => {
  const r = await haal(omgeving.basis, '/api/liedjes?compact=1&aantal=5');
  assert.equal(r.status, 200);
  assert.ok(r.data.totaal >= 20);
  assert.equal(r.data.liedjes.length, 5);
  assert.ok(r.data.statistieken.aantal >= 20);
  const lied = r.data.liedjes[0];
  for (const veld of ['id', 'titel', 'artiest', 'taal', 'genre', 'moeilijkheid', 'toonsoort', 'capo', 'capoTekst', 'akkoorden', 'zonderCapo']) {
    assert.ok(veld in lied, `veld ontbreekt in de lijst: ${veld}`);
  }
  assert.ok(lied.capoTekst.length > 3);
});

test('de liedlijst filtert op zoekterm, taal, capo en moeilijkheid', async () => {
  const alles = await haal(omgeving.basis, '/api/liedjes?compact=1');
  const zonderCapo = await haal(omgeving.basis, '/api/liedjes?compact=1&capo=nee');
  assert.ok(zonderCapo.data.totaal <= alles.data.totaal);
  assert.ok(zonderCapo.data.liedjes.every(l => l.capo === 0), 'capo=nee geeft liedjes met capo');

  const metCapo = await haal(omgeving.basis, '/api/liedjes?compact=1&capo=ja');
  assert.ok(metCapo.data.liedjes.every(l => l.capo > 0), 'capo=ja geeft liedjes zonder capo');

  const nl = await haal(omgeving.basis, '/api/liedjes?compact=1&taal=nl');
  assert.ok(nl.data.totaal >= 5);
  assert.ok(nl.data.liedjes.every(l => l.taal === 'nl'));

  const zoek = await haal(omgeving.basis, '/api/liedjes?compact=1&zoek=grace');
  assert.ok(zoek.data.totaal >= 1);
  assert.ok(zoek.data.liedjes.some(l => /grace/i.test(l.titel)));

  const moeilijk = await haal(omgeving.basis, '/api/liedjes?compact=1&moeilijkheid=1');
  assert.ok(moeilijk.data.liedjes.every(l => l.moeilijkheid === 1));
});

test('de liedlijst paginaert met vanaf en aantal', async () => {
  const eerste = await haal(omgeving.basis, '/api/liedjes?compact=1&vanaf=0&aantal=3');
  const tweede = await haal(omgeving.basis, '/api/liedjes?compact=1&vanaf=3&aantal=3');
  assert.equal(eerste.data.liedjes.length, 3);
  assert.equal(tweede.data.liedjes.length, 3);
  assert.notEqual(eerste.data.liedjes[0].id, tweede.data.liedjes[0].id);
  assert.equal(tweede.data.meer, tweede.data.totaal > 6);
});

test('een liedje opvragen geeft model, capo-advies, grepen en audio-adressen', async () => {
  const lijst = await haal(omgeving.basis, '/api/liedjes?compact=1&aantal=1');
  const id = lijst.data.liedjes[0].id;
  const r = await haal(omgeving.basis, `/api/liedjes/${id}`);
  assert.equal(r.status, 200);
  const l = r.data;
  assert.ok(l.model.regels.length > 5, 'geen bladmuziek in het antwoord');
  assert.ok(l.advies && typeof l.advies.tekst === 'string');
  assert.ok(l.akkoorden.length > 0);
  assert.ok(l.akkoorden[0].svg.startsWith('<svg'), 'geen greepdiagram');
  assert.match(l.audio.preview, /^\/api\/audio\/preview\?/);
  assert.match(l.audio.youtube, /^https:\/\/www\.youtube\.com/);
  assert.ok(Array.isArray(l.akkoordenReeks));
});

test('capo=0 in de weergave laat de klinkende akkoorden zien', async () => {
  const lijst = await haal(omgeving.basis, '/api/liedjes?compact=1&aantal=1');
  const id = lijst.data.liedjes[0].id;
  const r = await haal(omgeving.basis, `/api/liedjes/${id}?capo=0`);
  assert.equal(r.data.capo, 0);
  assert.ok(r.data.akkoorden.every(a => a.vorm === a.naam), 'met capo 0 horen vorm en akkoord gelijk te zijn');
  assert.ok(r.data.akkoorden.every(a => a.svg.includes('aria-label')), 'greep mist een label');
});

test('een hoge capo verschuift de grepen en toont het capo-streepje', async () => {
  const lijst = await haal(omgeving.basis, '/api/liedjes?compact=1&aantal=1');
  const id = lijst.data.liedjes[0].id;
  const r = await haal(omgeving.basis, `/api/liedjes/${id}?capo=4`);
  assert.equal(r.data.capo, 4);
  assert.ok(r.data.akkoorden.every(a => a.vorm !== a.naam || a.naam === 'E'), 'grepen niet verschoven');
  assert.ok(r.data.akkoorden.some(a => a.svg.includes('capo 4')));
});

test('transponeren verandert de akkoorden en de toonsoort', async () => {
  const lijst = await haal(omgeving.basis, '/api/liedjes?compact=1&aantal=25');
  const lied = lijst.data.liedjes.find(l => l.toonsoort === 'G') || lijst.data.liedjes[0];
  const nul = await haal(omgeving.basis, `/api/liedjes/${lied.id}`);
  const twee = await haal(omgeving.basis, `/api/liedjes/${lied.id}?transpose=2`);
  assert.equal(twee.data.transpositie, 2);
  assert.notEqual(twee.data.akkoorden[0].naam, nul.data.akkoorden[0].naam);
  assert.notEqual(twee.data.toonsoort, nul.data.toonsoort);
  const terug = await haal(omgeving.basis, `/api/liedjes/${lied.id}?transpose=0`);
  assert.deepEqual(terug.data.akkoorden.map(a => a.naam), nul.data.akkoorden.map(a => a.naam));
});

test('een onbekend liedje geeft 404 en geen leeg antwoord', async () => {
  const r = await haal(omgeving.basis, '/api/liedjes/999999');
  assert.equal(r.status, 404);
  assert.match(r.data.fout, /niet gevonden/i);
});

test('een eigen liedje opslaan, lezen, wijzigen en verwijderen', async () => {
  const tekst = '{title: Testliedje}\n{key: G}\n\n[G]eerste regel [C]tweede [D]derde\n[Em]vierde regel [C]vijfde\n[G]zesde regel [D]zevende\n[Em]achtste [C]negende\n[G]tiende [D]elfde\n[C]twaalfde regel [G]dertiende';
  const nieuw = await baas.post('/api/liedjes/import', { titel: 'Testliedje', taal: 'nl', chordpro: tekst, toonsoort: 'G', tempo: 96, bron: 'Eigen test' });
  assert.equal(nieuw.status, 201);
  assert.equal(nieuw.data.aantal, 1);
  const id = nieuw.data.ids[0];
  assert.ok(id >= 900000, 'eigen liedje hoort in het eigen id-bereik');

  const gelezen = await haal(omgeving.basis, `/api/liedjes/${id}`);
  assert.equal(gelezen.status, 200);
  assert.equal(gelezen.data.titel, 'Testliedje');
  assert.equal(gelezen.data.eigen, true);
  assert.equal(gelezen.data.tempo, 96);

  const gewijzigd = await alsBaas(`/api/liedjes/${id}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ titel: 'Testliedje 2', moeilijkheid: 4 })
  });
  assert.equal(gewijzigd.status, 200);
  const na = await haal(omgeving.basis, `/api/liedjes/${id}`);
  assert.equal(na.data.titel, 'Testliedje 2');
  assert.equal(na.data.moeilijkheid, 4);
  // de liedtekst is niet verdwenen bij een gedeeltelijke wijziging
  assert.ok(na.data.model.akkoorden.length >= 3);

  const weg = await alsBaas(`/api/liedjes/${id}`, { method: 'DELETE' });
  assert.equal(weg.status, 200);
  const dood = await haal(omgeving.basis, `/api/liedjes/${id}`);
  assert.equal(dood.status, 404);
});

test('een liedje zonder bruikbare tekst wordt geweigerd', async () => {
  const leeg = await baas.post('/api/liedjes/import', { titel: 'Leeg' });
  assert.equal(leeg.status, 400);
  assert.match(leeg.data.fout, /ChordPro/i);
  // zonder {title:} krijgt een plaksel een werknaam in plaats van een fout
  const geenTitel = await baas.post('/api/liedjes/import', {
    chordpro: '[C]regel een\n[G]regel twee\n[Am]regel drie\n[F]regel vier\n[C]regel vijf\n[G]regel zes'
  });
  assert.equal(geenTitel.status, 201);
  const gelezen = await haal(omgeving.basis, `/api/liedjes/${geenTitel.data.ids[0]}`);
  assert.match(gelezen.data.titel, /Geïmporteerd liedje/);
  await alsBaas(`/api/liedjes/${geenTitel.data.ids[0]}`, { method: 'DELETE' });
});

test('meerdere liedjes in één plaksel worden apart opgeslagen', async () => {
  const plaksel = '{title: Eerste import}\n[C]regel een\n[G]regel twee\n[Am]regel drie\n[F]regel vier\n[C]regel vijf\n[G]regel zes\n[Am]regel zeven\n[F]regel acht\n[C]regel negen\n[G]regel tien\n\n{title: Tweede import}\n[G]regel een\n[C]regel twee\n[D]regel drie\n[Em]regel vier\n[G]regel vijf\n[C]regel zes\n[D]regel zeven\n[Em]regel acht\n[G]regel negen\n[C]regel tien';
  const r = await baas.post('/api/liedjes/import', { chordpro: plaksel, taal: 'nl' });
  assert.equal(r.status, 201);
  assert.equal(r.data.aantal, 2);
  const een = await haal(omgeving.basis, `/api/liedjes/${r.data.ids[0]}`);
  assert.equal(een.data.titel, 'Eerste import');
  const twee = await haal(omgeving.basis, `/api/liedjes/${r.data.ids[1]}`);
  assert.equal(twee.data.titel, 'Tweede import');
  for (const id of r.data.ids) await alsBaas(`/api/liedjes/${id}`, { method: 'DELETE' });
});

test('meegeleverde liedjes zijn niet te wijzigen of te verwijderen', async () => {
  const lijst = await haal(omgeving.basis, '/api/liedjes?compact=1&aantal=1');
  const id = lijst.data.liedjes[0].id;
  const wijzig = await alsBaas(`/api/liedjes/${id}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ titel: 'Hack' })
  });
  assert.equal(wijzig.status, 404);
  assert.match(wijzig.data.fout, /niet wijzigen/i);
  const del = await alsBaas(`/api/liedjes/${id}`, { method: 'DELETE' });
  assert.equal(del.status, 404);
  const nog = await haal(omgeving.basis, `/api/liedjes/${id}`);
  assert.equal(nog.status, 200);
});

test('van een meegeleverd liedje kun je een eigen kopie maken', async () => {
  const lijst = await haal(omgeving.basis, '/api/liedjes?compact=1&aantal=1');
  const id = lijst.data.liedjes[0].id;
  const kopie = await baas.post(`/api/liedjes/${id}/kopie`);
  assert.equal(kopie.status, 201);
  const nieuw = await haal(omgeving.basis, `/api/liedjes/${kopie.data.id}`);
  assert.equal(nieuw.data.eigen, true);
  assert.match(nieuw.data.titel, /eigen kopie/i);
  await alsBaas(`/api/liedjes/${kopie.data.id}`, { method: 'DELETE' });
});

test('audio uploaden naar een eigen liedje en weer verwijderen', async () => {
  const tekst = '{title: Met audio}\n[G]een [C]twee [D]drie\n[Em]vier [C]vijf [G]zes\n[D]zeven [Em]acht [C]negen\n[G]tien [D]elf [C]twaalf';
  const nieuw = await baas.post('/api/liedjes/import', { titel: 'Met audio', chordpro: tekst });
  const id = nieuw.data.ids[0];

  const nepMp3 = Buffer.concat([Buffer.from([0x49, 0x44, 0x33, 0x03]), Buffer.alloc(2000, 7)]);
  const up = await fetch(`${omgeving.basis}/api/liedjes/${id}/audio`, {
    method: 'POST',
    // Uploaden hoort bij de beheerder; zonder dit koekje weigert de app het (en dat is de bedoeling).
    headers: { 'content-type': 'audio/mpeg', 'x-bestandsnaam': 'mijn opname.mp3', 'x-audio-titel': 'Mijn opname', cookie: baas.koekje, 'x-profiel': String(baas.profiel) },
    body: nepMp3
  });
  assert.equal(up.status, 201);
  const gegevens = await up.json();
  assert.match(gegevens.url, /^\/media\/audio\//);

  const gelezen = await haal(omgeving.basis, `/api/liedjes/${id}`);
  assert.equal(gelezen.data.audio.opname, gegevens.url);
  const media = await fetch(omgeving.basis + gegevens.url);
  assert.equal(media.status, 200);
  assert.equal(media.headers.get('content-type'), 'audio/mpeg');
  assert.equal(media.headers.get('accept-ranges'), 'bytes');
  const bereik = await fetch(omgeving.basis + gegevens.url, { headers: { range: 'bytes=0-99' } });
  assert.equal(bereik.status, 206);
  assert.equal(bereik.headers.get('content-range'), `bytes 0-99/${nepMp3.length}`);

  const weg = await alsBaas(`/api/liedjes/${id}/audio`, { method: 'DELETE' });
  assert.equal(weg.status, 200);
  const na = await alsBaas(`/api/liedjes/${id}`);
  assert.equal(na.data.audio.opname, '');

  const verkeerd = await fetch(`${omgeving.basis}/api/liedjes/${id}/audio`, {
    method: 'POST', headers: { 'content-type': 'text/plain', cookie: baas.koekje, 'x-profiel': String(baas.profiel) }, body: 'geen audio'
  });
  assert.equal(verkeerd.status, 400);

  const meegeleverd = await alsBaas('/api/liedjes?compact=1&aantal=1');
  const verboden = await fetch(`${omgeving.basis}/api/liedjes/${meegeleverd.data.liedjes[0].id}/audio`, {
    method: 'POST', headers: { 'content-type': 'audio/mpeg', cookie: baas.koekje, 'x-profiel': String(baas.profiel) }, body: nepMp3
  });
  assert.equal(verboden.status, 400);

  await alsBaas(`/api/liedjes/${id}`, { method: 'DELETE' });
});

test('de begeleiding wordt gegenereerd als audio en daarna uit de cache geserveerd', async () => {
  const lijst = await haal(omgeving.basis, '/api/liedjes?compact=1&aantal=1');
  const id = lijst.data.liedjes[0].id;
  const eerste = await fetch(`${omgeving.basis}/api/audio/preview?liedje=${id}`);
  assert.equal(eerste.status, 200);
  const type = eerste.headers.get('content-type');
  assert.match(type, /audio\/(mpeg|wav)/);
  const eersteBytes = Buffer.from(await eerste.arrayBuffer());
  assert.ok(eersteBytes.length > 8000, 'te weinig audio: ' + eersteBytes.length);
  assert.match(eerste.headers.get('accept-ranges'), /bytes/);

  const tweede = await fetch(`${omgeving.basis}/api/audio/preview?liedje=${id}`);
  const tweedeBytes = Buffer.from(await tweede.arrayBuffer());
  assert.equal(tweedeBytes.length, eersteBytes.length, 'cache geeft andere audio');
  assert.deepEqual(tweedeBytes.slice(0, 4), eersteBytes.slice(0, 4));

  const andereCapo = await fetch(`${omgeving.basis}/api/audio/preview?liedje=${id}&capo=5`);
  assert.equal(andereCapo.status, 200);
});

test('een eigen akkoordenreeks voor de begeleiding wordt gebruikt', async () => {
  const lijst = await haal(omgeving.basis, '/api/liedjes?compact=1&aantal=1');
  const id = lijst.data.liedjes[0].id;
  const r = await fetch(`${omgeving.basis}/api/audio/preview?liedje=${id}&reeks=${encodeURIComponent('C G Am F')}&tempo=140`);
  assert.equal(r.status, 200);
  const bytes = Buffer.from(await r.arrayBuffer());
  assert.ok(bytes.length > 8000);
});

test('de begeleiding van een onbekend liedje geeft 404', async () => {
  const r = await haal(omgeving.basis, '/api/audio/preview?liedje=999999');
  assert.equal(r.status, 404);
});

test('instellingen worden bewaard en teruggelezen', async () => {
  const begin = await haal(omgeving.basis, '/api/instellingen');
  assert.equal(begin.status, 200);
  const zet = await baas.post('/api/instellingen', { cast_apparaat: '192.168.1.100', cast_naam: 'Woonkamer' });
  assert.equal(zet.status, 200);
  assert.equal(zet.data.instellingen.cast_apparaat, '192.168.1.100');
  const na = await haal(omgeving.basis, '/api/instellingen');
  assert.equal(na.data.cast_naam, 'Woonkamer');
});

test('de cast-route levert altijd JSON, ook zonder Chromecast', async () => {
  const r = await haal(omgeving.basis, '/api/cast/apparaten');
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.data.apparaten), 'apparaten hoort een lijst te zijn');
  assert.ok(r.data.apparaten.length === 0 || typeof r.data.apparaten[0].naam === 'string');
});

test('casten zonder liedje of apparaat geeft een leesbare fout', async () => {
  const zonder = await baas.post('/api/cast/start', { apparaat: '192.168.1.100' });
  assert.equal(zonder.status, 400);
  assert.match(zonder.data.fout, /geen audio/i);
});

test('casten naar een niet-bestaand apparaat meldt de fout netjes', async () => {
  const lijst = await haal(omgeving.basis, '/api/liedjes?compact=1&aantal=1');
  const r = await baas.post('/api/cast/start', { apparaat: '192.0.2.99', liedje: lijst.data.liedjes[0].id });
  assert.ok(r.status === 200 || r.status === 502);
  assert.ok(r.data.fout || r.data.ok, 'geen bruikbaar antwoord van de cast-helper');
});

test('de cast-helper zet nooit een kale traceback op de uitvoer', () => {
  const bron = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'cast-helper.py'), 'utf8');
  assert.match(bron, /except Exception as e:/);
  assert.match(bron, /"fout"/);
  assert.match(bron, /pychromecast/);
});

test('het liedpaneel heeft een eigen start- en stopknop bij het spelen', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  for (const id of ['speler-start', 'speler-stop', 'speler-stand', 'opname-start', 'opname-stop', 'opname-stand']) {
    assert.ok(html.includes('id="' + id + '"'), 'id ontbreekt: ' + id);
  }
  assert.match(html, /function koppelSpeler/);
  assert.match(html, /koppelSpeler\('speler-audio', 'speler-start', 'speler-stop', 'speler-stand'\)/);
  assert.match(html, /koppelSpeler\('opname-audio', 'opname-start', 'opname-stop', 'opname-stand'\)/);
  // stoppen zet de speler ook echt terug naar het begin
  assert.match(html, /a\.pause\(\);\s*\n\s*try \{ a\.currentTime = 0; \}/);
});

// ------------------------------------------------------------ leermodus ---

test('de leermodus staat in de pagina: leslijst, trainer, stemmen, ritme en grepen', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  assert.match(html, /id="tab-leren"[^>]*data-paneel="paneel-leren"/);
  assert.match(html, /var TABS = \['liedjes', 'spelen', 'leren', 'toevoegen', 'casten'\]/);
  for (const id of ['paneel-leren', 'leren-lessen', 'leren-balk', 'leren-voortgang', 'trein-set', 'trein-tempo',
    'trein-maten', 'trein-start', 'trein-stop', 'trein-akkoord', 'trein-volgend', 'trein-greep', 'trein-tellen',
    'trein-stats', 'stem-rij', 'ritme-rij', 'ritme-start', 'ritme-stop', 'ritme-tellen', 'ritme-uitleg', 'leren-grepen',
    'stem-start', 'stem-stop', 'stem-stand', 'stem-meter', 'stem-pen', 'stem-uitslag', 'stem-melding']) {
    assert.ok(html.includes('id="' + id + '"'), 'id ontbreekt in de leermodus: ' + id);
  }
  // De stemmer met de microfoon: het rekenwerk zit in lib/stemmen.js, de pagina gebruikt het.
  assert.match(html, /<script src="\/lib\/stemmen\.js"><\/script>/);
  assert.match(html, /tekenStemmer\(\);/);
  assert.match(html, /window\.stemmenRekenen\.uitslagVan\(/);
  assert.match(html, /navigator\.mediaDevices\.getUserMedia/);
  assert.match(html, /isSecureContext/);
  const stemReken = fs.readFileSync(path.join(__dirname, '..', 'lib', 'stemmen.js'), 'utf8');
  assert.match(stemReken, /root\.stemmenRekenen = reken/);
  // Alles binnen een eigen afsluiting: een aangifte op het hoogste niveau botst met de pagina zelf
  // (die heeft al een SNAREN) en laat het hele bestand dan stil stuklopen.
  assert.ok(stemReken.indexOf('(function (root) {') > 0, 'de stemmer hoort in een eigen afsluiting te staan');
  assert.ok(stemReken.indexOf('(function (root) {') < stemReken.indexOf('const SNAREN'),
    'de afsluiting moet om alles heen staan, ook om SNAREN');
  // De cursus: de eerste lessen staan in de pagina, de vervolgdelen in /lib/lessen-uitgebreid.js.
  assert.match(html, /var LESSEN = \[/);
  const lessen = html.match(/titel: '[^']+',\s*\n\s*kort:/g) || [];
  assert.ok(lessen.length >= 24, 'verwacht minstens vierentwintig lessen in de pagina, gevonden: ' + lessen.length);
  const vervolgBron = fs.readFileSync(path.join(__dirname, '..', 'lib', 'lessen-uitgebreid.js'), 'utf8');
  const vervolg = JSON.parse(vervolgBron.slice(vervolgBron.indexOf('['), vervolgBron.lastIndexOf(']') + 1));
  assert.ok(vervolg.length >= 84, 'verwacht minstens vierentwintig lessen in de vervolgdelen, gevonden: ' + vervolg.length);
  const delen = [...html.matchAll(/deel: '([^']+)'/g)].map(m => m[1]).concat(vervolg.map(l => l.deel));
  assert.deepEqual([...new Set(delen)].sort(), ['Akkoorden', 'Beginnen', 'Onderhoud en volhouden', 'Ritme en slag',
    'Samenspelen en optreden', 'Tokkelen', 'Toonladders en theorie', 'Verdiepen']);
  const blok = html.slice(html.indexOf('var LESSEN = ['), html.indexOf('// De lessen van de latere delen'));
  assert.equal([...blok.matchAll(/deel: '/g)].length, lessen.length, 'elke les in de pagina hoort bij een deel');
  // Elke les in de vervolgdelen heeft de onderdelen, en elke knop wijst naar iets dat de app kent.
  const naar = ['trainer', 'stemmen', 'ritme', 'liedjes', 'grepen', 'gehoor', 'week', 'setlist',
    'overgangen', 'capo', 'meespelen', 'spelen'];
  let knoppen = 0;
  for (const les of vervolg) {
    for (const veld of ['deel', 'titel', 'kort', 'doel', 'tekst', 'oefening']) {
      assert.ok(les[veld], les.titel + ': ' + veld + ' ontbreekt');
    }
    assert.ok(Array.isArray(les.tekst) && les.tekst.length >= 3, les.titel + ': te weinig uitleg');
    if (les.knop) {
      knoppen++;
      assert.ok(naar.includes(les.knop.naar), les.titel + ': onbekende knop ' + les.knop.naar);
      assert.ok(les.knop.tekst, les.titel + ': knop zonder tekst');
    }
  }
  assert.ok(knoppen >= 60, 'verwacht veel lesknoppen, gevonden: ' + knoppen);
  // De app zet de twee lijsten op de volgorde van de delen, en elk deel wordt één groep met teller.
  assert.match(html, /var DELEN_VOLGORDE = \[/);
  assert.match(html, /window\.LESSEN_UITGEBREID && window\.LESSEN_UITGEBREID\.length/);
  assert.match(html, /<script src="\/lib\/lessen-uitgebreid\.js"><\/script>/);
  assert.match(html, /var LES_SPRONG = \{/);
  for (const woord of ['doel:', 'tekst: [', 'oefening:', 'knop: {']) {
    assert.ok(html.includes(woord), 'lesonderdeel ontbreekt: ' + woord);
  }
  // het geluid wordt zelf gemaakt: geen geluidsbestanden of externe bronnen
  assert.match(html, /window\.AudioContext \|\| window\.webkitAudioContext/);
  assert.match(html, /new Ctx\(\)/);
  assert.ok(!/\.mp3|\.wav|\.ogg/.test(html.split('id="paneel-leren"')[1].split('</section>')[0]), 'leermodus verwijst naar geluidsbestanden');
});

test('de grepen-API geeft diagram plus posities en noten voor alle grepen', async () => {
  const r = await haal(omgeving.basis, '/api/grepen');
  assert.equal(r.status, 200);
  const data = r.data;
  assert.ok(Array.isArray(data.grepen));
  assert.ok(data.grepen.length >= 26, 'te weinig grepen: ' + data.grepen.length);
  for (const g of data.grepen) {
    assert.ok(typeof g.naam === 'string' && g.naam);
    assert.match(g.svg, /^<svg/);
    assert.equal(g.frets.length, 6, g.naam + ': frets horen zes snaren te hebben');
    assert.ok(g.noten.length >= 3, g.naam + ': te weinig klinkende snaren');
    for (const midi of g.noten) assert.ok(midi >= 36 && midi <= 84, g.naam + ': noot buiten bereik: ' + midi);
  }
  const f = data.grepen.find(g => g.naam === 'F');
  assert.equal(f.isBarre, true);
  assert.ok(f.barre && f.barre.fret === 1, 'de F-greep hoort een barré op fret 1 te hebben');
  const em = data.grepen.find(g => g.naam === 'Em');
  assert.equal(em.isBarre, false);
  assert.deepEqual(em.noten, [40, 47, 52, 55, 59, 64]);
});

test('de grepen-API geeft één greep en weigert een akkoord zonder diagram', async () => {
  const een = await haal(omgeving.basis, '/api/greep?akkoord=Am7');
  assert.equal(een.status, 200);
  const g = een.data;
  assert.equal(g.naam, 'Am7');
  assert.match(g.svg, /^<svg/);

  const mis = await haal(omgeving.basis, '/api/greep?akkoord=Cadd9');
  assert.equal(mis.status, 404);
  assert.match(mis.data.fout, /Geen greep/);
});

test('de leermodus rekent de lesknoppen om naar de trainer', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  // elke les met een trainerknop moet een set, tempo en aantal maten meegeven
  const knoppen = html.match(/knop: \{ tekst: '[^']+', naar: 'trainer', set: '[^']+', tempo: \d+, maten: \d+ \}/g) || [];
  assert.ok(knoppen.length >= 8, 'verwacht minstens acht trainerknoppen, gevonden: ' + knoppen.length);
  for (const k of knoppen) {
    const set = k.match(/set: '([^']+)'/)[1].split(' ');
    assert.ok(set.length >= 2, 'een trainerset hoort minstens twee akkoorden te hebben: ' + k);
    const tempo = Number(k.match(/tempo: (\d+)/)[1]);
    assert.ok(tempo >= 40 && tempo <= 140, 'tempo buiten bereik: ' + tempo);
  }
  assert.match(html, /function startTrainer\(\)/);
  assert.match(html, /function lesKaart\(les, i, af\)/);
  // De cursus overzichtelijk: per deel een groep die je open- en dichtklapt, met teller en balk,
  // een zoekvak en een kaart "verder waar je gebleven was".
  assert.match(html, /class="cursus-deel"/);
  assert.match(html, /function cursusDelen\(stand, zoek\)/);
  assert.match(html, /function cursusDeel\(deel, stand\)/);
  assert.match(html, /function tekenCursusVerder\(stand, groepen\)/);
  assert.match(html, /function openLes\(i\)/);
  assert.match(html, /function cursusVolgendeLes\(stand\)/);
  assert.match(html, /data-cursus-deel="/);
  assert.match(html, /\$\('cursus-zoek'\)\.addEventListener\('input', debounce\(tekenLessen, 200\)\)/);
  assert.match(html, /\$\('cursus-open'\)\.addEventListener\('click'/);
  assert.match(html, /\$\('cursus-dicht'\)\.addEventListener\('click'/);
  assert.match(html, /localStorage\.setItem\('akkoordkast-cursus'/);
  assert.match(html, /function stopTrainer\(/);
  assert.match(html, /localStorage\.setItem\(LEER_SLEUTEL/);
  assert.match(html, /document\.addEventListener\('visibilitychange'/);
});

// ------------------------------------------------------- filter op artiest ---

test('de artiestenlijst geeft namen met hun aantal liedjes', async () => {
  const r = await haal(omgeving.basis, '/api/artiesten');
  assert.equal(r.status, 200);
  const lijst = r.data.artiesten;
  assert.ok(Array.isArray(lijst) && lijst.length > 10, 'te weinig artiesten: ' + (lijst && lijst.length));
  for (const a of lijst) {
    assert.ok(typeof a.naam === 'string' && a.naam.length, 'naam ontbreekt');
    assert.ok(Number.isInteger(a.aantal) && a.aantal >= 1, 'aantal onbruikbaar bij ' + a.naam);
  }
  // van veel naar weinig, en nooit een lege naam
  for (let i = 1; i < lijst.length; i++) {
    assert.ok(lijst[i - 1].aantal >= lijst[i].aantal, 'de lijst is niet gesorteerd');
  }
  assert.ok(!lijst.some(a => !a.naam.trim()), 'lege artiestennaam in de lijst');
  assert.ok(lijst.some(a => a.aantal >= 100), 'de grote bundels horen bovenaan te staan');
});

test('het liedjesfilter werkt op artiest, ook gedeeltelijk', async () => {
  const alles = await haal(omgeving.basis, '/api/liedjes?compact=1&aantal=1');
  const totaalAlles = alles.data.totaal;

  const vol = await haal(omgeving.basis, '/api/liedjes?compact=1&aantal=200&artiest=' + encodeURIComponent("Kerr's Merry Melodies"));
  assert.equal(vol.status, 200);
  assert.ok(vol.data.totaal > 100, 'te weinig treffers op de bundelnaam: ' + vol.data.totaal);
  assert.ok(vol.data.totaal < totaalAlles, 'het filter laat alles door');
  for (const l of vol.data.liedjes) assert.match(l.artiest, /Kerr's Merry Melodies/);

  // een stukje van de naam is genoeg
  const stuk = await haal(omgeving.basis, '/api/liedjes?compact=1&aantal=5&artiest=O%27Neill');
  assert.ok(stuk.data.totaal > 1000, 'gedeeltelijk zoeken werkt niet: ' + stuk.data.totaal);

  // en het filter is te combineren met een genre
  const combi = await haal(omgeving.basis, '/api/liedjes?compact=1&aantal=5&artiest=O%27Neill&genre=Danswijsje');
  assert.ok(combi.data.totaal >= 0 && combi.data.totaal <= stuk.data.totaal, 'de combinatie klopt niet');

  const niets = await haal(omgeving.basis, '/api/liedjes?compact=1&aantal=5&artiest=bestaatnietecht');
  assert.equal(niets.data.totaal, 0);
});

test('de pagina heeft de filters voor genre en artiest', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  assert.match(html, /<label for="filter-genre">Genre<\/label>/);
  assert.match(html, /<select id="filter-artiest"><option value="">Alle artiesten<\/option><\/select>/);
  assert.match(html, /function laadArtiesten\(\)/);
  assert.match(html, /function laadLabels\(\)/);
  assert.match(html, /p\.set\('artiest', a\)/);
  assert.match(html, /\['filter-taal', 'filter-genre', 'filter-artiest', 'filter-bijzonder', 'filter-label', 'filter-capo', 'filter-moeilijkheid'\]/);
  // de filters wissen zet ze ook echt terug
  assert.match(html, /\$\('filter-artiest'\)\.value = ''/);
});

test('de handleiding is in de app te openen uit de gegevensmap, en zit niet in het repo', async () => {
  // De handleiding zit niet meer in het repo (die houd je voor jezelf) maar in de gegevensmap, waar de
  // app hem als eerste zoekt. Zo leest hij hem in de app, zonder dat hij openbaar te vinden is.
  assert.equal(fs.existsSync(path.join(__dirname, '..', 'public', 'handleiding')), false,
    'de handleiding hoort niet meer in het repo te staan');
  const omgeving = await start();
  try {
    zetHandleiding(omgeving.wortel);
    const pagina = await haal(omgeving.basis, '/handleiding/');
    assert.equal(pagina.status, 200, 'de handleiding hoort te openen op /handleiding/');
    assert.match(pagina.data, /AkkoordKast — handleiding/);
    assert.match(pagina.data, /Meespelen met muziek/);
    const eerste = (pagina.data.match(/img\/([a-z0-9-]+\.png)/) || [])[1];
    assert.ok(eerste, 'er hoort minstens een schermafbeelding in te staan');
    const beeld = await haal(omgeving.basis, '/handleiding/img/' + eerste);
    assert.equal(beeld.status, 200, 'het beeld ' + eerste + ' hoort te bestaan');
  } finally {
    await omgeving.stop();
  }
});


// ------------------------------- grepen, ritme, toonladders, oefenplan, opnemen ---

function leesPagina() {
  return fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
}

function leesLib(naam) {
  return fs.readFileSync(path.join(__dirname, '..', 'lib', naam), 'utf8');
}

function eisIds(html, ids, waar) {
  for (const id of ids) assert.ok(html.includes('id="' + id + '"'), 'id ontbreekt in ' + waar + ': ' + id);
}

// Elk nieuw rekenbestand hoort in een eigen afsluiting te staan: een aangifte op het hoogste
// niveau botst met de pagina zelf en laat het hele bestand dan stil stuklopen.
function eisAfsluiting(bron, naam) {
  const open = bron.indexOf('(function (root) {');
  assert.ok(open > 0, naam + ': hoort in een eigen afsluiting te staan');
  assert.match(bron, new RegExp('root\\.' + naam + ' = reken'));
  assert.match(bron, /module\.exports = reken/);
  assert.ok(open < bron.indexOf('var reken'), naam + ': de afsluiting moet om alles heen staan');
}

test('grepen leren met voortgang: per greep afvinken, en de grepen naar de trainer', () => {
  const html = leesPagina();
  eisIds(html, ['grepen-kaart', 'grepen-balk', 'grepen-voortgang', 'grepen-set', 'grepen-trainen',
    'grepen-kies-uitleg'], 'het grepenvak');
  assert.match(html, /data-greep-klaar=/);
  assert.match(html, /function grepenVoortgang/);
  assert.match(html, /function grepenKeuze/);
  assert.match(html, /function grepenStand\(\)/);
  assert.match(html, /if \(vakje\.checked\) nieuw\.grepen\[naam\] = true; else delete nieuw\.grepen\[naam\];/);
  assert.match(html, /grepen: ruw\.grepen \|\| \{\}/, 'de leerstand hoort de grepen te onthouden');
  assert.match(html, /\$\('grepen-trainen'\)\.addEventListener\('click', grepenNaarTrainer\)/);
  // Een afgevinkte greep mag geen streepjes meer door de tekening krijgen.
  assert.match(html, /greep-kaart' \+ \(stand\[g\.naam\] \? ' klaar' : ''\)/);
  // Op het afvinkvakje klikken speelt de greep niet.
  assert.match(html, /if \(e\.target && e\.target\.tagName === 'INPUT'\) return;/);
});

test('de ritme-trainer met de microfoon: rekenwerk in lib/ritme.js, de pagina luistert mee', () => {
  const html = leesPagina();
  eisIds(html, ['ritmetrainer-kaart', 'rt-tempo', 'rt-tempo-waarde', 'rt-maat', 'rt-tik', 'rt-start',
    'rt-stop', 'rt-stand', 'rt-niveau', 'rt-tellen', 'rt-meter', 'rt-uitslag', 'rt-lijst', 'rt-melding'],
    'de ritme-trainer');
  assert.match(html, /<script src="\/lib\/ritme\.js"><\/script>/);
  assert.match(html, /window\.ritmeRekenen \|\| null/);
  assert.match(html, /analyser\.getByteFrequencyData\(RT\.beeld\)/);
  assert.match(html, /reken\.fluxTussen\(RT\.beeld, RT\.vorigBeeld\)/);
  assert.match(html, /reken\.slagenUitFlux\(RT\.punten\)/);
  // Slagen in het spectrum, niet in de sterkte: anders mist de trainer de slagen die door de
  // vorige snaar heen vallen.
  assert.ok(!/reken\.slagenVan\(/.test(html), 'de pagina hoort de spectrumbaan te gebruiken, niet de tijdbaan');
  // uitslagVan werkt met slagen die hun eigen tijdstip bij zich hebben ({ tijd: ... }).
  assert.match(html, /var metTijd = RT\.slagen\.map\(function \(t\) \{ return \{ tijd: t \+ RT\.ijk \/ 1000 \}; \}\);/);
  assert.match(html, /reken\.uitslagVan\(metTijd, \{ bpm: RT\.bpm, maat: RT\.maat, vanaf: RT\.gridStart, goed: reken\.GOED_MS \}\)/);
  assert.match(html, /function rtTikLoop/);
  assert.match(html, /\$\('rt-start'\)\.addEventListener\('click', startRt\)/);
  // De tik staat standaard stil: de microfoon zou de tik uit de luidspreker horen en dat als
  // jouw slag tellen. Wie hem wil horen, doet oortjes in.
  assert.match(html, /<option value="uit" selected>Stil/);
  assert.match(html, /oortjes in/);
  // De ijking: de vaste vertraging van het toestel kun je er met één knop afzetten.
  eisIds(html, ['rt-ijk', 'rt-ijk-wis', 'rt-ijk-stand'], 'de ijking van de ritme-trainer');
  assert.match(html, /function rtZetIJking/);
  assert.match(html, /function rtWisIJking/);
  assert.match(html, /var metTijd = RT\.slagen\.map\(function \(t\) \{ return \{ tijd: t \+ RT\.ijk \/ 1000 \}; \}\)/);
  assert.match(html, /\$\('rt-ijk'\)\.addEventListener\('click', rtZetIJking\)/);
  const lib = leesLib('ritme.js');
  eisAfsluiting(lib, 'ritmeRekenen');
  assert.match(lib, /GOED_MS = 90/);
  assert.match(lib, /MIN_AFSTAND = 0\.12/);
});

test('toonladders op de hals: rekenwerk in lib/toonladders.js en een hals in de pagina', () => {
  const html = leesPagina();
  eisIds(html, ['ladder-kaart', 'ladder-grond', 'ladder-soort', 'ladder-octaven', 'ladder-horen',
    'ladder-oefenen', 'ladder-hals', 'ladder-uitleg', 'ladder-melding'], 'de toonladderkaart');
  assert.match(html, /<script src="\/lib\/toonladders\.js"><\/script>/);
  assert.match(html, /reken\.notenVan\(LADDER\.grond, LADDER\.soort, LADDER\.octaven\)/);
  assert.match(html, /reken\.positiesOpHals\(noten, \{ hoogsteVak: 12 \}\)/);
  assert.match(html, /function tekenLadder/);
  assert.match(html, /function ladderHoren/);
  assert.match(html, /function ladderOefenen/);
  assert.match(html, /\$\('ladder-horen'\)\.addEventListener\('click', ladderHoren\)/);
  const lib = leesLib('toonladders.js');
  eisAfsluiting(lib, 'toonladderRekenen');
  assert.match(lib, /pentatonisch mineur/);
  assert.match(lib, /blues/);
});

test('een oefenplan dat zichzelf vult: rekenwerk in lib/oefenplan.js en een plan in de pagina', () => {
  const html = leesPagina();
  eisIds(html, ['oefenplan-kaart', 'plan-zoek', 'plan-gekozen', 'plan-uitkomst', 'plan-weken',
    'plan-minuten', 'plan-perweek', 'plan-maak', 'plan-wis', 'plan-vak', 'plan-melding'], 'het oefenplan');
  assert.match(html, /<script src="\/lib\/oefenplan\.js"><\/script>/);
  assert.match(html, /window\.oefenplanRekenen \|\| null/);
  assert.match(html, /reken\.maakPlan\(invoer\)/);
  // Het plan wordt gevuld met de echte lessen van de app, en met de akkoorden van het liedje.
  assert.match(html, /lessen: LESSEN\.map\(function \(l\) \{ return \{ titel: l\.titel \}; \}\)/);
  assert.match(html, /doel: \{ titel: PLAN\.doel\.titel, akkoorden: PLAN\.doel\.akkoorden \|\| \[\] \}/);
  assert.match(html, /api\('\/api\/liedjes\/' \+ id\)/);
  assert.match(html, /akkoordkast-plan/);
  assert.match(html, /data-plan-taak=/);
  assert.match(html, /\$\('plan-maak'\)\.addEventListener\('click', planMaak\)/);
  const lib = leesLib('oefenplan.js');
  eisAfsluiting(lib, 'oefenplanRekenen');
  assert.match(lib, /'herhalen'/);
});

test('jezelf opnemen en terugluisteren: opnemen, terugluisteren, bewaren of weggooien', () => {
  const html = leesPagina();
  eisIds(html, ['opnemen-kaart', 'opn-start', 'opn-stop', 'opn-stand', 'opn-tijd', 'opn-meter',
    'opn-niveau', 'opn-speel', 'opn-bewaar', 'opn-weg', 'opn-audio', 'opn-melding'], 'het opneemvak');
  assert.match(html, /function opnStart/);
  assert.match(html, /function opnStop/);
  assert.match(html, /function opnKlaar/);
  assert.match(html, /new MediaRecorder\(stream/);
  assert.match(html, /URL\.createObjectURL\(blob\)/);
  assert.match(html, /URL\.revokeObjectURL\(OPN\.url\)/);
  assert.match(html, /\$\('opn-start'\)\.addEventListener\('click', opnStart\)/);
  assert.match(html, /\$\('opn-weg'\)\.addEventListener\('click', opnWeg\)/);
  // De opname blijft in het toestel: in het opneemgedeelte gaat niets naar de server.
  const begin = html.indexOf('// ---------------------------------------------------- jezelf opnemen');
  const eind = html.indexOf('// ---------------------------------------------------------------- laden');
  const opnBlok = html.slice(begin, eind);
  assert.ok(opnBlok.length > 1000, 'het opneemgedeelte hoort er te zijn');
  assert.ok(!/api\(/.test(opnBlok), 'een opname hoort niet naar de server te gaan');
  // Vijf minuten is het maximum; daarna stopt de opname vanzelf.
  assert.match(html, /var OPN_MAX = 300/);
});


// ------------------------------------- liedjes weghalen en filters (de beheerder) ---

test('de beheerder kan liedjes weghalen en filters beheren in de app', () => {
  const html = leesPagina();
  eisIds(html, ['liedjes-weg-kaart', 'weg-zoek', 'weg-wat', 'weg-zoek-knop', 'weg-lijst', 'weg-stand', 'weg-melding',
    'filters-kaart', 'flt-soort', 'flt-nieuw', 'flt-toevoegen', 'flt-lijst', 'flt-koppel-soort', 'flt-koppel-zoek',
    'flt-koppel-knop', 'flt-koppel-doen', 'flt-losmaken', 'flt-koppel-lijst', 'flt-stand', 'flt-melding'],
    'de beheerkanten');
  // De kaarten horen alleen zichtbaar te zijn als de beheerder is ingelogd.
  assert.match(html, /#paneel-toevoegen:not\(\.beheer\) > \.kaart:not\(#beheer-poort\)\{display:none\}/);
  for (const functie of ['laadWegLijst', 'tekenWegLijst', 'haalLiedjeWeg', 'zetLiedjeTerug', 'laadFilterBeheer',
    'tekenFilters', 'filterToevoegen', 'filterWeg', 'zoekKoppelLiedjes', 'tekenKoppelLijst', 'koppelUitvoeren',
    'koppelBeheerKaarten']) {
    assert.match(html, new RegExp('function ' + functie + '\\('), functie + ' ontbreekt');
  }
  // De routes die erbij horen.
  for (const pad of ['/api/beheer/liedjes', '/api/beheer/liedje/weg', '/api/beheer/liedje/terug',
    '/api/beheer/filters', '/api/beheer/filters/weg']) {
    assert.ok(html.includes(pad), 'de pagina hoort ' + pad + ' te gebruiken');
  }
  // Een meegeleverd liedje wordt verborgen in plaats van weggegooid: de knop zegt het ook.
  assert.match(html, /l\.eigen \? 'Weggooien' : 'Verbergen'/);
  assert.match(html, /window\.confirm\(vraag\)/);
  // Koppelen gaat in één keer voor alles wat je hebt aangevinkt.
  assert.match(html, /'\/api\/beheer\/filters\/' \+ \(los \? 'los' : 'koppel'\)/);
  assert.match(html, /ids: ids \}/);
  assert.match(html, /koppelUitvoeren\(false\)/);
  assert.match(html, /koppelUitvoeren\(true\)/);
});
