'use strict';
// De handleiding zit niet in het openbare repo (hij noemt het adres van de app). De beheerder zet hem in
// de app, en daar blijft hij staan bij elke bijwerking. Deze proef loopt dat hele pad door.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const hulp = require('./hulp');

const PAGINA = `<!doctype html>
<html lang="nl"><head><meta charset="utf-8"><title>AkkoordKast — handleiding</title></head>
<body><h1>Handleiding</h1><p>Proefhandleiding met een eigen woord: kwakzalver.</p>
<img src="img/liedjes-desktop.png" alt="voorbeeld"></body></html>`;

test('de beheerder plaatst de handleiding, en de app toont hem daarna', async () => {
  const omgeving = await hulp.start();
  const baas = await hulp.alsBeheerder(omgeving.basis);
  try {
    // Eerst: er is nog geen handleiding.
    const voor = await hulp.haal(omgeving.basis, '/api/handleiding');
    assert.equal(voor.status, 200);
    assert.equal(voor.data.aanwezig, false, 'er hoort nog geen handleiding te staan');

    // Zonder beheerderssessie mag het niet.
    const zonder = await hulp.haal(omgeving.basis, '/api/handleiding', {
      method: 'POST',
      headers: { 'content-type': 'text/html', 'x-bestandsnaam': 'index.html', 'x-akkoordkast': 'app' },
      body: PAGINA
    });
    assert.ok(zonder.status === 401 || zonder.status === 403, 'zonder beheerder hoort dit te weigeren, kreeg ' + zonder.status);

    // De beheerder plaatst het bestand, precies zoals de pagina dat doet.
    const geplaatst = await baas.haal('/api/handleiding', {
      method: 'POST',
      headers: { 'content-type': 'text/html', 'x-bestandsnaam': encodeURIComponent('index.html'), 'x-akkoordkast': 'app' },
      body: PAGINA
    });
    assert.equal(geplaatst.status, 200, JSON.stringify(geplaatst.data));
    assert.equal(geplaatst.data.ok, true);

    // En de app laat hem zien, uit de gegevensmap.
    const na = await hulp.haal(omgeving.basis, '/api/handleiding');
    assert.equal(na.data.aanwezig, true, 'de handleiding hoort er nu te staan');
    assert.ok(na.data.bytes > 100, 'met inhoud');

    const pagina = await hulp.haal(omgeving.basis, '/handleiding/');
    assert.equal(pagina.status, 200);
    assert.match(String(pagina.data), /kwakzalver/, 'de geplaatste pagina hoort geserveerd te worden');

    // De plaatjes komen uit het programma zelf (docs/img), zodat er maar één bestand geplaatst hoeft te worden.
    const beeld = await hulp.haal(omgeving.basis, '/handleiding/img/liedjes-desktop.png');
    assert.equal(beeld.status, 200, 'een plaatje van de handleiding hoort uit docs/img te komen');
    assert.match(String(beeld.type), /image\/png/);

    // Buiten de map van de handleiding schrijven mag nooit.
    const kwaad = await baas.haal('/api/handleiding', {
      method: 'POST',
      headers: { 'content-type': 'text/html', 'x-bestandsnaam': encodeURIComponent('../server.js'), 'x-akkoordkast': 'app' },
      body: PAGINA
    });
    assert.equal(kwaad.status, 400, 'een naam met ../ hoort te weigeren');

    // En weggooien werkt ook.
    const weg = await baas.haal('/api/handleiding', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-akkoordkast': 'app' },
      body: JSON.stringify({ weg: true })
    });
    assert.equal(weg.status, 200);
    const leeg = await hulp.haal(omgeving.basis, '/api/handleiding');
    assert.equal(leeg.data.aanwezig, false, 'na weggooien hoort er niets meer te staan');
  } finally {
    await omgeving.stop();
  }
});

test('de pagina in de app noemt de handleiding-bron uit de gegevensmap', () => {
  const bron = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  assert.match(bron, /id="hand-plaats"/, 'de beheerder hoort een knop te hebben');
  assert.match(bron, /x-bestandsnaam/, 'het bestand hoort met zijn naam verstuurd te worden');
  assert.match(bron, /Handleiding in de app/, 'met uitleg erbij');
});
