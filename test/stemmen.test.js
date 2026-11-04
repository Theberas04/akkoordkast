'use strict';
// Testen van het rekenwerk van de stemmer. We maken zelf geluid na — een zuivere toon, een
// toon met veel boventonen, en een snaar die aangeslagen wordt (Karplus-Strong, net als de
// gitaar-synthesizer van de app) — en kijken of de app de juiste snaar en het juiste aantal
// cent vindt. Zo weten we dat de stemmer klopt zonder dat er iemand een gitaar hoeft te pakken.
const test = require('node:test');
const assert = require('node:assert');
const stemmen = require('../lib/stemmen');

const SR = 44100;

function ruis() {
  return Math.random() * 2 - 1;
}

// Een zuivere toon met een paar boventonen, zoals een snaar die je rustig aanslaat.
function toon(frequentie, seconden, verhoudingen) {
  const n = Math.round(seconden * SR);
  const uit = new Float32Array(n);
  const delen = verhoudingen || [1, 0.5, 0.3];
  for (let i = 0; i < n; i++) {
    let s = 0;
    delen.forEach(function (a, k) { s += a * Math.sin(2 * Math.PI * frequentie * (k + 1) * i / SR); });
    uit[i] = s / delen.length * 0.6;
  }
  return uit;
}

// Een aangeslagen snaar: ruis die zichzelf door de snaar heen dempt (Karplus-Strong).
function aangeslagenSnaar(frequentie, seconden) {
  const n = Math.round(seconden * SR);
  const lengte = Math.max(2, Math.round(SR / frequentie));
  const ring = new Float32Array(lengte);
  let vorige = 0;
  for (let i = 0; i < lengte; i++) {
    vorige = vorige * 0.4 + ruis() * 0.6;
    ring[i] = vorige;
  }
  const uit = new Float32Array(n);
  let idx = 0;
  for (let i = 0; i < n; i++) {
    const huidige = ring[idx];
    uit[i] = huidige * 0.8;
    ring[idx] = (huidige + ring[(idx + 1) % lengte]) * 0.5 * 0.997;
    idx = (idx + 1) % lengte;
  }
  return uit;
}

test('het rekenwerk rekent frequenties en centen goed om', () => {
  assert.equal(Math.round(stemmen.frequentieVanMidi(69)), 440);
  assert.equal(Math.round(stemmen.frequentieVanMidi(40) * 100) / 100, 82.41);
  assert.equal(Math.round(stemmen.frequentieVanMidi(64) * 100) / 100, 329.63);
  assert.equal(Math.round(stemmen.centenTussen(880, 440)), 1200);
  assert.equal(Math.round(stemmen.centenTussen(440, 880)), -1200);
  assert.equal(Math.round(stemmen.centenTussen(440, 440)), 0);
  // Een kwart toon erboven is vijftig cent: precies de grens van "je zit ernaast".
  assert.equal(Math.round(stemmen.centenTussen(440 * Math.pow(2, 0.25 / 12), 440)), 25);
});

test('een rustige toon wordt op de cent nauwkeurig herkend', () => {
  for (const snaar of stemmen.SNAREN) {
    const doel = stemmen.frequentieVanMidi(snaar.midi);
    const uitslag = stemmen.uitslagVan(toon(doel, 0.4), SR);
    assert.ok(uitslag, snaar.naam + ': geen toonhoogte gevonden');
    assert.equal(uitslag.snaar.naam, snaar.naam, snaar.naam + ': verkeerde snaar');
    assert.ok(Math.abs(uitslag.centen) <= 2, snaar.naam + ': ' + uitslag.centen.toFixed(1) + ' cent ernaast');
    assert.equal(uitslag.gestemd, true);
  }
});

test('een toon die een paar cent te laag staat wordt ook zo gemeld', () => {
  for (const centen of [-30, -12, 9, 25]) {
    const doel = stemmen.frequentieVanMidi(45) * Math.pow(2, centen / 1200);
    const uitslag = stemmen.uitslagVan(toon(doel, 0.4), SR);
    assert.ok(uitslag, centen + ' cent: geen uitslag');
    assert.equal(uitslag.snaar.naam, 'A');
    assert.ok(Math.abs(uitslag.centen - centen) <= 3,
      'verwacht ' + centen + ' cent, gemeten ' + uitslag.centen.toFixed(1));
    assert.equal(uitslag.gestemd, Math.abs(centen) <= stemmen.GOED_CENTEN);
  }
});

test('een snaar met een sterke boventoon wordt niet een octaaf te hoog gehoord', () => {
  // De tweede boventoon is hier het sterkst; een naïeve piekzoeker zou het octaaf erboven
  // aanwijzen. Juist bij een gitaar komt dit veel voor, dus dit moet goed gaan.
  const monsters = toon(110, 0.4, [0.2, 1, 0.7, 0.4]);
  const uitslag = stemmen.uitslagVan(monsters, SR);
  assert.ok(uitslag);
  assert.ok(Math.abs(uitslag.frequentie - 110) < 3, 'frequentie: ' + uitslag.frequentie.toFixed(1));
  assert.equal(uitslag.snaar.naam, 'A');
});

test('een aangeslagen snaar (met ruis erin) wordt herkend', () => {
  for (const snaar of [stemmen.SNAREN[0], stemmen.SNAREN[3], stemmen.SNAREN[5]]) {
    const doel = stemmen.frequentieVanMidi(snaar.midi);
    const uitslag = stemmen.uitslagVan(aangeslagenSnaar(doel, 0.5), SR);
    assert.ok(uitslag, snaar.naam + ': geen uitslag');
    assert.equal(uitslag.snaar.naam, snaar.naam);
    assert.ok(Math.abs(uitslag.centen) <= 25, snaar.naam + ': ' + uitslag.centen.toFixed(1) + ' cent ernaast');
  }
});

test('stilte en geruis leveren geen valse toonhoogte op', () => {
  assert.equal(stemmen.toonhoogteUit(new Float32Array(4096), SR), null);
  const zachtGeruis = new Float32Array(4096).map(function () { return ruis() * 0.002; });
  assert.equal(stemmen.toonhoogteUit(zachtGeruis, SR), null);
  assert.equal(stemmen.uitslagVan(new Float32Array(4096), SR), null);
  assert.equal(stemmen.sterkteVan(new Float32Array(64)), 0);
});

test('de dichtstbijzijnde snaar is de snaar die je hoort', () => {
  // Tussen twee snaren in: 123 Hz zit tussen A (110) en D (146,8) en hoort bij A.
  const bij = stemmen.snaarBij(123);
  assert.equal(bij.snaar.naam, 'A');
  assert.ok(bij.centen > 0, 'hoger dan de A, dus positieve centen');
  // Precies op de dunste snaar.
  assert.equal(stemmen.snaarBij(329.63).snaar.naam, 'e');
  assert.ok(Math.abs(stemmen.snaarBij(329.63).centen) < 1);
});
