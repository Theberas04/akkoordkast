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
