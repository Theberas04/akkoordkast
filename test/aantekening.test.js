'use strict';
// Je eigen aantekening bij een liedje: per profiel, niet aan het liedje zelf.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const hulp = require('./hulp.js');

const PAGINA = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

// Een verzoek namens één bepaald profiel, zoals de pagina doet met x-profiel.
function alsProfiel(basis, id, pad, opties) {
  const o = opties || {};
  return hulp.haal(basis, pad, Object.assign({}, o, {
    headers: Object.assign({ 'x-profiel': String(id) }, o.headers || {})
  }));
}
function schrijf(basis, id, pad, lichaam) {
  return alsProfiel(basis, id, pad, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(lichaam)
  });
}

test('een aantekening bewaren en teruglezen, per profiel', async () => {
  const omgeving = await hulp.start();
  try {
    const rij = omgeving.app.db.prepare('SELECT id FROM profielen WHERE is_beheer = 0 ORDER BY id').get();
    assert.ok(rij, 'er hoort een gewoon profiel te zijn');
    const profielId = Number(rij.id);

    const gezet = await schrijf(omgeving.basis, profielId, '/api/aantekening', { liedje: 1, tekst: 'tweede couplet rustig' });
    assert.equal(gezet.status, 200, JSON.stringify(gezet.data));
    assert.equal(gezet.data.aantekening, 'tweede couplet rustig');

    const liedje = await alsProfiel(omgeving.basis, profielId, '/api/liedjes/1');
    assert.equal(liedje.status, 200);
    assert.equal(liedje.data.aantekening, 'tweede couplet rustig');

    const lijst = await alsProfiel(omgeving.basis, profielId, '/api/liedjes?compact=1&aantal=5');
    assert.equal(lijst.status, 200);
    assert.equal(lijst.data.liedjes[0].aantekening, 'tweede couplet rustig', 'de lijst hoort het ook te laten zien');

    // Een tweede profiel ziet die aantekening niet: het is jouw notitie, niet iets van het liedje.
    const tweede = await hulp.post(omgeving.basis, '/api/profielen', { naam: 'Tweede speler' });
    assert.equal(tweede.status, 201, JSON.stringify(tweede.data));
    const anderId = Number(tweede.data.profiel.id);
    const bijAnder = await alsProfiel(omgeving.basis, anderId, '/api/liedjes/1');
    assert.equal(bijAnder.data.aantekening, '', 'de aantekening hoort niet bij een ander profiel');

    // En die van het tweede profiel blijft staan als het eerste hem wist.
    const bijAnderZetten = await schrijf(omgeving.basis, anderId, '/api/aantekening', { liedje: 1, tekst: 'van de tweede speler' });
    assert.equal(bijAnderZetten.status, 200);
    const gewist = await schrijf(omgeving.basis, profielId, '/api/aantekening', { liedje: 1, tekst: '   ' });
    assert.equal(gewist.status, 200);
    assert.equal(gewist.data.aantekening, '', 'een lege aantekening wist hem');
    const na = await alsProfiel(omgeving.basis, profielId, '/api/liedjes/1');
    assert.equal(na.data.aantekening, '');
    const anderNa = await alsProfiel(omgeving.basis, anderId, '/api/liedjes/1');
    assert.equal(anderNa.data.aantekening, 'van de tweede speler', 'het andere profiel houdt de zijne');
  } finally {
    await omgeving.stop();
  }
});

test('een aantekening bij een onbekend liedje wordt geweigerd', async () => {
  const omgeving = await hulp.start();
  try {
    const uit = await hulp.post(omgeving.basis, '/api/aantekening', { liedje: 999999, tekst: 'bestaat niet' });
    assert.equal(uit.status, 404);
  } finally {
    await omgeving.stop();
  }
});

test('de pagina heeft het scherm-aan, de verrasknop, de aantekening en de sneltoetsen', () => {
  assert.ok(PAGINA.indexOf('navigator.wakeLock') !== -1, 'het scherm aan houden mist');
  assert.ok(PAGINA.indexOf('id="scherm-aan"') !== -1, 'het pilletje van het scherm mist');
  assert.ok(PAGINA.indexOf('id="verras-knop"') !== -1, 'de verrasknop mist');
  assert.ok(PAGINA.indexOf('function verrasLiedje(') !== -1, 'de verrassing mist');
  assert.ok(PAGINA.indexOf('id="aantekening-kaart"') !== -1, 'de aantekening-kaart mist');
  assert.ok(PAGINA.indexOf("api('/api/aantekening'") !== -1, 'de pagina bewaart de aantekening niet');
  assert.ok(PAGINA.indexOf('function naarMaat(') !== -1, 'de pijltjestoetsen mist');
  assert.ok(PAGINA.indexOf('function toonToetsen(') !== -1, 'het toetsenoverzicht mist');
  assert.ok(PAGINA.indexOf('function zetPauzescherm(') !== -1, 'het pauzescherm mist');
  assert.ok(PAGINA.indexOf('houdSchermAan(naam === ') !== -1, 'het scherm aan houden hangt niet aan het tabblad');
});
