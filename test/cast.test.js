'use strict';
// Chromecast zoeken: via mDNS, en als dat niets oplevert via een netwerkscan (poort 8009).
const test = require('node:test');
const assert = require('node:assert');
const net = require('net');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const hulp = require('./hulp');

const helper = path.join(__dirname, '..', 'scripts', 'cast-helper.py');

test('de cast-hulp vindt een toestel met de netwerkscan, ook zonder pychromecast', async () => {
  const srv = net.createServer();
  await new Promise(r => srv.listen(8009, '127.0.0.1', r));
  try {
    const uit = spawnSync('python3', [helper, 'scan', '127.0.0'], { encoding: 'utf8', timeout: 90000 });
    assert.equal(uit.status, 0, 'de hulp hoort zonder fout te eindigen: ' + uit.stderr);
    const antwoord = JSON.parse(String(uit.stdout).trim().split('\n').pop());
    assert.equal(antwoord.pychromecast, false, 'de netwerkscan hoort zonder pychromecast te werken');
    assert.ok(antwoord.apparaten.some(a => a.ip === '127.0.0.1'),
      'het luisterende adres hoort gevonden te worden: ' + uit.stdout);
    assert.equal(antwoord.apparaten[0].via, 'netwerkscan');
  } finally {
    await new Promise(r => srv.close(r));
  }
});

test('de app geeft het eigen netwerk mee en de pagina meldt hoe er gezocht is', async () => {
  const omgeving = await hulp.start();
  try {
    const uit = await hulp.haal(omgeving.basis, '/api/cast/apparaten');
    assert.equal(uit.status, 200);
    assert.ok(Array.isArray(uit.data.apparaten), 'de apparatenlijst hoort er te zijn');
    assert.equal(typeof uit.data.bereik, 'string');
    assert.ok(uit.data.bereik === '' || /^\d+\.\d+\.\d+$/.test(uit.data.bereik),
      'het bereik hoort er als 192.168.1 uit te zien: ' + uit.data.bereik);
    assert.equal(typeof uit.data.pychromecast, 'boolean');
  } finally {
    await omgeving.stop();
  }
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  assert.match(html, /netwerkscan in/, 'de pagina hoort te vertellen dat er ook in het netwerk is gezocht');
  assert.match(html, /zelfde netwerk/, 'de pagina hoort te wijzen op hetzelfde netwerk');
  assert.match(html, /stem-rechten/, 'de pagina hoort de microfoontoestemming van de browser te laten zien');
  assert.match(html, /navigator\.permissions\.query/, 'en die toestemming ook echt op te vragen');
});

test('de cast krijgt altijd een adres in het eigen netwerk, ook als de pagina van buiten komt', async () => {
  // Een nagemaakte cast-hulp: hij schrijft op wat hij te horen kreeg. Zo testen we zonder een echt
  // toestel aan te raken.
  const os = require('os');
  const wortel = fs.mkdtempSync(path.join(os.tmpdir(), 'ak-cast-'));
  const nep = path.join(wortel, 'nep-cast.py');
  fs.writeFileSync(nep, [
    'import json, sys',
    'print(json.dumps({"fout": "", "apparaat": {"naam": "Proefcast"}, "argumenten": sys.argv[1:]}))',
    ''
  ].join('\n'));
  process.env.CAST_HELPER = nep;
  process.env.CAST_PYTHON = process.env.CAST_PYTHON || 'python3';

  const omgeving = await hulp.start();
  try {
    const poort = omgeving.app.server.address().port;

    // De pagina doet alsof hij via een adres van buiten geopend is - precies de situatie waarin het
    // casten bij de gebruiker misging.
    const vanBuiten = await hulp.post(omgeving.basis, '/api/cast/start', {
      apparaat: '192.168.1.100:8009',
      url: '/api/muziek/bestand?liedje=1',
      titel: 'Proefnummer',
      basis: 'https://muziek-van-buiten.example'
    });
    assert.equal(vanBuiten.status, 200, JSON.stringify(vanBuiten.data));
    const argumenten = vanBuiten.data.argumenten || [];   // [speel, apparaat, adres, titel, ...]
    const gespeeld = String(argumenten[2] || '');
    assert.match(gespeeld, /^http:\/\/192\.168\./, 'de cast hoort een adres in het eigen netwerk te krijgen: ' + gespeeld);
    assert.ok(gespeeld.includes(':' + poort + '/'), 'met de poort waarop de app echt luistert: ' + gespeeld);
    assert.ok(gespeeld.endsWith('/api/muziek/bestand?liedje=1'), 'met het juiste pad: ' + gespeeld);
    assert.ok(!/muziek-van-buiten/.test(gespeeld), 'het adres van buiten hoort er niet in te zitten: ' + gespeeld);
    assert.match(String(vanBuiten.data.basis || ''), /^http:\/\/192\.168\./,
      'de app hoort te melden waarlangs de cast het ophaalt: ' + JSON.stringify(vanBuiten.data.basis));

    // Een zelf opgegeven adres in het eigen netwerk mag wel gebruikt worden.
    const eigenBasis = await hulp.post(omgeving.basis, '/api/cast/start', {
      apparaat: '192.168.1.100:8009',
      url: 'https://muziek-van-buiten.example/api/muziek/bestand?liedje=1',
      titel: 'Proefnummer',
      basis: 'http://192.168.1.100:9000'
    });
    assert.equal(eigenBasis.status, 200, JSON.stringify(eigenBasis.data));
    const eigenUrl = String((eigenBasis.data.argumenten || [])[2] || '');
    assert.ok(eigenUrl.startsWith('http://192.168.1.100:9000/api/muziek/bestand?liedje=1'),
      'een eigen adres in het netwerk hoort gebruikt te worden, met alleen het pad van het liedje: ' + eigenUrl);
  } finally {
    delete process.env.CAST_HELPER;
    await omgeving.stop();
  }
});


test('de app kan het geluid van een liedje klaarzetten voor een cast in elk netwerk', async () => {
  // Voor het casten vanaf je eigen apparaat (als je ergens anders bent) moet de app een volledig adres
  // geven: precies het adres waarmee de pagina de app heeft geopend, want daar kan een cast in welk
  // netwerk dan ook bij.
  const omgeving = await hulp.start();
  try {
    const poort = omgeving.app.server.address().port;

    // De begeleiding die de app zelf maakt.
    const begeleiding = await hulp.haal(omgeving.basis, '/api/cast/audio?liedje=1&bron=meespelen&tempo=90');
    assert.equal(begeleiding.status, 200, JSON.stringify(begeleiding.data));
    assert.match(String(begeleiding.data.url), /^http:\/\/127\.0\.0\.1:\d+\/api\/meespelen\/audio\?/,
      'het adres hoort volledig te zijn: ' + begeleiding.data.url);
    assert.ok(String(begeleiding.data.url).includes(':' + poort + '/'),
      'met de poort waarop deze pagina de app bereikt: ' + begeleiding.data.url);
    assert.ok(String(begeleiding.data.url).includes('liedje=1'), 'met het liedje erin: ' + begeleiding.data.url);
    assert.ok(String(begeleiding.data.titel || '').length > 0, 'de titel hoort erbij te zitten');
    assert.ok(String(begeleiding.data.toelichting || '').length > 0, 'de app hoort uit te leggen wat er speelt');

    // En de gewone begeleiding (wat de app als standaard kiest) levert ook een volledig adres.
    const gewoon = await hulp.haal(omgeving.basis, '/api/cast/audio?liedje=1');
    assert.equal(gewoon.status, 200, JSON.stringify(gewoon.data));
    assert.match(String(gewoon.data.url), /^http:\/\/127\.0\.0\.1:\d+\/api\//, 'ook dit adres hoort volledig te zijn: ' + gewoon.data.url);

    // Een liedje dat niet bestaat hoort netjes te worden geweigerd.
    const niets = await hulp.haal(omgeving.basis, '/api/cast/audio?liedje=99999999');
    assert.equal(niets.status, 404);

    // En de pagina hoort het casten vanaf het eigen apparaat echt te hebben.
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
    assert.match(html, /cast-vanaf-dit/, 'de pagina hoort een knop te hebben om vanaf dit apparaat te casten');
    assert.match(html, /cast_sender\.js/, 'de pagina hoort de cast-bibliotheek van de browser te gebruiken');
    assert.match(html, /\/api\/cast\/audio/, 'en het geluid bij de app op te vragen');
    assert.match(html, /DEFAULT_MEDIA_RECEIVER_APP_ID/, 'met de standaard-ontvanger van Chromecast');
    assert.match(html, /netwerk waar je nu bent/, 'de pagina hoort uit te leggen waarom je dit gebruikt');
    assert.match(html, /cast-bereik/, 'en de server mag ook in een ander netwerk zoeken');
  } finally {
    await omgeving.stop();
  }
});

test('de cast speelt de muziek van het liedje als die er is', async () => {
  // Dit was de klacht: "chromecast werkt nog niet". De app probeerde zelf begeleiding te maken en
  // kreeg "geen bekende akkoorden om te spelen", terwijl er gewoon muziek bij het liedje stond. Nu
  // cast de app die muziek - precies wat de speler ook doet.
  const omgeving = await hulp.start();
  try {
    const baas = await hulp.alsBeheerder(omgeving.basis);
    const maak = await baas.haal('/api/liedjes', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        titel: 'Liedje met muziek', artiest: 'Proefzanger',
        chordpro: '{title: Liedje met muziek}\n\nregel een van de tekst'
      })
    });
    assert.ok([200, 201].includes(maak.status), JSON.stringify(maak.data));
    const id = maak.data.id;

    // Een muziekbestand erbij, onder het GROTE nummer - zoals in de verzameling van de gebruiker.
    const bestand = path.join(process.env.MEDIA_DIR, 'proef-cast.mp3');
    fs.writeFileSync(bestand, Buffer.from('nagemaakte mp3'));
    omgeving.app.db.prepare('INSERT INTO liedje_muziek (liedje_id, pad, titel, wanneer) VALUES (?,?,?,?)')
      .run(Number(id), bestand, 'proef-cast.mp3', new Date().toISOString());

    const r = await hulp.haal(omgeving.basis, '/api/cast/audio?liedje=' + id);
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.ok(String(r.data.url).endsWith('/api/muziek/bestand?liedje=' + id),
      'de muziek van het liedje hoort gecast te worden: ' + r.data.url);
    assert.equal(r.data.type, 'audio/mpeg', 'met het juiste soort bestand');
    assert.match(String(r.data.toelichting || ''), /muziek/i, 'de app hoort te zeggen dat het de muziek is');

    // En de server-cast geeft dezelfde muziek door aan het toestel (met een nagemaakte hulp).
    const os = require('os');
    const wortel = fs.mkdtempSync(path.join(os.tmpdir(), 'ak-cast-'));
    const nep = path.join(wortel, 'nep-cast.py');
    fs.writeFileSync(nep, 'import json, sys\nprint(json.dumps({"fout": "", "apparaat": {"naam": "Proefcast"}, "argumenten": sys.argv[1:]}))\n');
    process.env.CAST_HELPER = nep;
    const omgeving2 = await hulp.start();
    try {
      const baas2 = await hulp.alsBeheerder(omgeving2.basis);
      const maak2 = await baas2.haal('/api/liedjes', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ titel: 'Ook met muziek', artiest: 'Proefzanger', chordpro: '{title: Ook met muziek}\n\ntekst' })
      });
      const id2 = maak2.data.id;
      const bestand2 = path.join(process.env.MEDIA_DIR, 'proef-cast2.mp3');
      fs.writeFileSync(bestand2, Buffer.from('nagemaakte mp3'));
      omgeving2.app.db.prepare('INSERT INTO liedje_muziek (liedje_id, pad, titel, wanneer) VALUES (?,?,?,?)')
        .run(Number(id2), bestand2, 'proef-cast2.mp3', new Date().toISOString());
      const gespeeld = await hulp.post(omgeving2.basis, '/api/cast/start', { apparaat: '192.168.1.100', liedje: id2 });
      assert.equal(gespeeld.status, 200, JSON.stringify(gespeeld.data));
      const adres = String((gespeeld.data.argumenten || [])[2] || '');
      assert.ok(adres.includes('/api/muziek/bestand?liedje=' + id2),
        'de cast hoort de muziek van het liedje te spelen: ' + adres);
      assert.match(adres, /^http:\/\/192\.168\./, 'en wel via het eigen netwerk: ' + adres);
    } finally {
      delete process.env.CAST_HELPER;
      await omgeving2.stop();
    }
  } finally {
    await omgeving.stop();
  }
});

test('zonder muziek en zonder akkoorden legt de app uit waarom casten niet gaat', async () => {
  const omgeving = await hulp.start();
  try {
    const baas = await hulp.alsBeheerder(omgeving.basis);
    const maak = await baas.haal('/api/liedjes', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ titel: 'Zonder alles', artiest: 'Proefzanger', chordpro: '{title: Zonder alles}\n\nalleen wat tekst' })
    });
    const r = await hulp.haal(omgeving.basis, '/api/cast/audio?liedje=' + maak.data.id);
    assert.equal(r.status, 400, 'de app hoort dit netjes te weigeren: ' + JSON.stringify(r.data));
    assert.ok(String(r.data.fout || '').length > 20, 'met een uitleg erbij: ' + JSON.stringify(r.data));
    // De server-cast geeft dezelfde uitleg door in plaats van een rauwe fout.
    const viaServer = await hulp.post(omgeving.basis, '/api/cast/start', { apparaat: '192.168.1.100', liedje: maak.data.id });
    assert.equal(viaServer.status, 400);
    assert.ok(String(viaServer.data.fout || '').length > 20, 'ook hier een uitleg: ' + JSON.stringify(viaServer.data));
  } finally {
    await omgeving.stop();
  }
});
