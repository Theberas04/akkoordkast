'use strict';
// Meespelen met muziek uit je eigen map. Zo'n liedje had vaak geen eigen akkoorden, en dan zocht de app
// alleen naar een opname-analyse — waarna je alleen de muziek hoorde en er niets meeliep. Nu loopt het
// beeld mee op het akkoordenschema (of op het voorstel dat de kaart ook laat zien), met de eerlijke
// melding dat het schema een voorstel is.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const hulp = require('./hulp');

test('muziek uit je map laat het beeld meelopen op het schema', async () => {
  const omgeving = await hulp.start();
  const baas = await hulp.alsBeheerder(omgeving.basis);
  try {
    // Een muziekmap met een bestand erin, en dat bestand aan een liedje hangen (zoals de beheerder
    // dat in de app doet als hij muziek kiest).
    const map = path.join(omgeving.wortel, 'muziek');
    fs.mkdirSync(map, { recursive: true });
    const bestand = path.join(map, 'proefnummer.mp3');
    fs.writeFileSync(bestand, Buffer.alloc(2048, 7));
    omgeving.app.db.prepare('INSERT INTO instellingen (sleutel, waarde) VALUES (?, ?) ' +
      'ON CONFLICT(sleutel) DO UPDATE SET waarde = excluded.waarde').run('scan_map', map);
    omgeving.app.db.prepare('INSERT INTO liedje_muziek (liedje_id, pad, titel, wanneer) VALUES (?, ?, ?, ?) ' +
      'ON CONFLICT(liedje_id) DO UPDATE SET pad = excluded.pad').run(1, bestand, 'Proefnummer', new Date().toISOString());

    const d = await baas.haal('/api/meespelen?liedje=1&tempo=83');
    assert.equal(d.status, 200, String(JSON.stringify(d.data)).slice(0, 300));
    assert.ok(!d.data.alleenMuziek, 'met akkoorden hoort het beeld mee te lopen, ook als ze een voorstel zijn');
    assert.ok(d.data.tijdlijn && (d.data.tijdlijn.maten || []).length > 0, 'er hoort een tijdlijn te zijn');
    assert.equal(d.data.audio, '/api/muziek/bestand?liedje=1', 'en de muziek uit je eigen map');
    assert.equal(typeof d.data.voorstel, 'boolean', 'de app hoort te zeggen of de akkoorden een voorstel zijn');
    assert.equal(d.data.bron, 'muziek', 'de herkomst is de muziek uit de map');

    // Een eigen liedje zonder eigen akkoorden: dan is het schema een voorstel, en dat hoort de app te
    // zeggen — maar het beeld loopt net zo goed mee.
    const eigenId = 900001;
    omgeving.app.db.prepare('INSERT INTO liedjes (id, titel, artiest, toonsoort, tempo, chordpro) VALUES (?, ?, ?, ?, ?, ?)')
      .run(1, 'Proeflied zonder akkoorden', 'Proef', 'Am', 83, 'Alleen een liedtekst, zonder akkoorden.');
    omgeving.app.db.prepare('INSERT INTO liedje_muziek (liedje_id, pad, titel, wanneer) VALUES (?, ?, ?, ?) ' +
      'ON CONFLICT(liedje_id) DO UPDATE SET pad = excluded.pad').run(eigenId, bestand, 'Proefnummer', new Date().toISOString());
    const e = await baas.haal('/api/meespelen?liedje=' + eigenId + '&tempo=83');
    assert.equal(e.status, 200, String(JSON.stringify(e.data)).slice(0, 300));
    assert.ok(!e.data.alleenMuziek, 'ook met een voorstel hoort het beeld mee te lopen');
    assert.ok(e.data.tijdlijn && (e.data.tijdlijn.maten || []).length > 0, 'met een tijdlijn erbij');
    assert.equal(e.data.voorstel, true, 'en met de eerlijke melding dat de akkoorden een voorstel zijn');
  } finally {
    await omgeving.stop();
  }
});

test('de melding in de pagina noemt het voorstel en wat er meeloopt', () => {
  const bron = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  assert.match(bron, /de akkoorden hierboven zijn een voorstel/, 'de pagina hoort het voorstel te noemen');
  assert.match(bron, /lopen mee met de muziek/, 'en te zeggen dat het beeld meeloopt');
});
