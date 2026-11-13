'use strict';
// De schijf: hoeveel ruimte is er nog, de reservekopieën van het bijwerken opruimen (de nieuwste
// blijft altijd staan) en de Nederlandse melding als de schijf vol zit.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const hulp = require('./hulp.js');
const schijf = require('../lib/schijf.js');

test('leesbaar maakt van bytes gewone tekst', () => {
  assert.equal(schijf.leesbaar(0), '0 bytes');
  assert.equal(schijf.leesbaar(1536), '1,5 kB');
  assert.equal(schijf.leesbaar(2 * 1024 * 1024), '2,0 MB');
  assert.equal(schijf.leesbaar(null), 'onbekend');
});

test('de schijf-route vertelt de vrije ruimte en welke reservekopieën er staan', async () => {
  const omgeving = await hulp.start();
  try {
    for (const naam of ['bijwerken-20260101-100000', 'bijwerken-20260102-100000']) {
      const map = path.join(omgeving.wortel, naam);
      fs.mkdirSync(map, { recursive: true });
      fs.writeFileSync(path.join(map, 'rommel.bin'), Buffer.alloc(2048));
    }
    const beheer = await hulp.alsBeheerder(omgeving.basis);
    const uit = await beheer.haal('/api/beheer/schijf');
    assert.equal(uit.status, 200, JSON.stringify(uit.data));
    assert.ok(uit.data.vrij > 0, 'er hoort vrije ruimte te zijn');
    assert.ok(uit.data.vrijTekst, 'met leesbare tekst erbij');
    const kopieen = uit.data.reservekopieen || [];
    assert.equal(kopieen.length, 2, JSON.stringify(kopieen));
    assert.equal(kopieen[0].nieuwste, true, 'de nieuwste staat vooraan');
    assert.equal(kopieen[0].naam, 'bijwerken-20260102-100000');
    assert.ok(kopieen[0].bytes >= 2048, 'de grootte van de kopie hoort erbij');
    assert.ok(Array.isArray(uit.data.grootste) && uit.data.grootste.length > 0, 'de grootste mappen horen erbij');
    assert.ok(uit.data.grootste.some(g => g.naam.indexOf('bijwerken-') === 0), 'de kopieën zijn er ook in terug te zien');
  } finally {
    await omgeving.stop();
  }
});

test('opruimen laat de nieuwste reservekopie met rust', async () => {
  const omgeving = await hulp.start();
  try {
    for (const naam of ['bijwerken-20260101-100000', 'bijwerken-20260102-100000', 'bijwerken-20260103-100000']) {
      fs.mkdirSync(path.join(omgeving.wortel, naam), { recursive: true });
      fs.writeFileSync(path.join(omgeving.wortel, naam, 'rommel.bin'), Buffer.alloc(1024));
    }
    const beheer = await hulp.alsBeheerder(omgeving.basis);
    const uit = await beheer.post('/api/beheer/schijf/opruimen', {});
    assert.equal(uit.status, 200, JSON.stringify(uit.data));
    assert.equal((uit.data.verwijderd || []).length, 2, JSON.stringify(uit.data));
    assert.equal((uit.data.bewaard || []).length, 1, 'de nieuwste wordt bewaard');
    assert.ok(fs.existsSync(path.join(omgeving.wortel, 'bijwerken-20260103-100000')), 'de nieuwste staat er nog');
    assert.ok(!fs.existsSync(path.join(omgeving.wortel, 'bijwerken-20260101-100000')), 'de oudste is weg');
  } finally {
    await omgeving.stop();
  }
});

test('de downloader herkent een volle schijf en zegt het in het Nederlands', () => {
  const bron = fs.readFileSync(path.join(__dirname, '..', 'lib', 'downloader.js'), 'utf8');
  assert.ok(bron.indexOf('No space left on device') !== -1, 'de systeemfout wordt herkend');
  assert.ok(bron.indexOf('ENOSPC') !== -1, 'ook de korte melding wordt herkend');
  assert.ok(bron.indexOf('De schijf van de app zit vol') !== -1, 'er staat een Nederlandse uitleg klaar');
  assert.ok(bron.indexOf('Beheer en bijwerken') !== -1, 'met de plek waar je het kunt opruimen');
});

test('de pagina heeft een schijfblok bij de beheerder', () => {
  const pagina = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  assert.ok(pagina.indexOf("id=\"schijf-kaart\"") !== -1, 'het blok hoort in de beheerderskaart');
  assert.ok(pagina.indexOf('function laadSchijf()') !== -1, 'met een eigen laadfunctie');
  // Op het hoogste niveau, niet per ongeluk binnen een andere functie (daar is deze app al eens
  // op stukgelopen): de regel begint met 'function'.
  assert.ok(/\nfunction laadSchijf\(\) \{/.test(pagina), 'laadSchijf staat op het hoogste niveau');
  assert.ok(pagina.indexOf('/api/beheer/schijf/opruimen') !== -1, 'en de opruimknop erin');
});
