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

