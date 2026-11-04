'use strict';
// Testen van het rekenwerk van de ritme-trainer. We maken zelf geluid na — korte tikken die
// snel uitsterven — en kijken of de app de slagen vindt en of ze op de maat vallen. Zo weten
// we dat de ritme-trainer klopt zonder dat er iemand in de maat hoeft te klappen.
//
// Alle ruis komt uit een eigen toevalsgenerator met een vaste beginwaarde, zodat de tests
// altijd hetzelfde lopen en een fout dus echt een fout is.
var test = require('node:test');
var assert = require('node:assert');
var ritme = require('../lib/ritme');

var SR = 44100;

// Een klein toevalsreeksje (Lehmer) met een vaste beginwaarde: hetzelfde zaad geeft altijd
// dezelfde reeks, dus dezelfde testuitslag.
function toevalsreeks(zaad) {
  var waarde = zaad;
  return function () {
    waarde = waarde * 16807 % 2147483647;
    return waarde / 2147483647 * 2 - 1;
  };
}

var ruis = toevalsreeks(1234);

// Een stil stuk geluid van een aantal seconden.
function stilte(seconden) {
  return new Float32Array(Math.round(seconden * SR));
}

// Een korte slag op een tijdstip in het geluid zetten: 20 ms ruis die snel uitsterft.
function tik(mono, sampleRate, opTijd, sterkte) {
  if (sterkte === undefined) sterkte = 0.6;
  var begin = Math.round(opTijd * sampleRate);
  var lengte = Math.round(0.02 * sampleRate);
  for (var i = 0; i < lengte; i++) {
    var idx = begin + i;
    if (idx >= mono.length) break;
    if (idx < 0) continue;
    var demping = 1 - i / lengte;
    mono[idx] += ruis() * demping * sterkte;
  }
}

// Zachte willekeurige ruis zonder slagen: wit geruis per stukje op een vaste sterkte gezet,
// zodat er geen enkele slag in te vinden is.
function zachteRuis(seconden, sterkte) {
  var n = Math.round(seconden * SR);
  var uit = new Float32Array(n);
  var blok = ritme.BLOK;
  var aantal = Math.floor(n / blok);
  var reeks = toevalsreeks(99);
  for (var b = 0; b < aantal; b++) {
    var stuk = new Float32Array(blok);
    var som = 0;
    for (var i = 0; i < blok; i++) {
      stuk[i] = reeks();
      som += stuk[i] * stuk[i];
    }
    var rms = Math.sqrt(som / blok) || 1;
    for (var j = 0; j < blok; j++) uit[b * blok + j] = stuk[j] * (sterkte / rms);
  }
  return uit;
}

// De eerste tel van een patroon; niet op nul, anders valt de eerste slag in het allereerste
// stukje en is er geen stukje ervoor om mee te vergelijken.
var EERSTE = 0.1;

test('stilte geeft geen slagen en een lege uitslag', function () {
  var mono = stilte(2);
  assert.equal(ritme.slagenVan(mono, SR).length, 0);
  var uitslag = ritme.uitslagVan([], { bpm: 120, maat: 4, vanaf: EERSTE });
  assert.equal(uitslag.aantal, 0);
  assert.equal(uitslag.opMaat, 0);
  assert.equal(uitslag.gemiddelde, 0);
  assert.equal(uitslag.spreiding, 0);
  assert.deepEqual(uitslag.slagen, []);
});

test('acht tikken om de halve seconde worden acht slagen op de maat', function () {
  var mono = stilte(4.5);
  for (var i = 0; i < 8; i++) tik(mono, SR, EERSTE + i * 0.5);
  var slagen = ritme.slagenVan(mono, SR);
  assert.equal(slagen.length, 8);
  var uitslag = ritme.uitslagVan(slagen, { bpm: 120, maat: 4, vanaf: EERSTE });
  assert.equal(uitslag.aantal, 8);
  assert.equal(uitslag.opMaat, 100);
  assert.ok(Math.abs(uitslag.gemiddelde) <= 15, 'gemiddelde: ' + uitslag.gemiddelde);
});

test('tikken die steeds te laat komen meten een kleine vertraging', function () {
  var mono = stilte(4.5);
  for (var i = 0; i < 8; i++) tik(mono, SR, EERSTE + i * 0.5 + 0.04);
  var slagen = ritme.slagenVan(mono, SR);
  assert.equal(slagen.length, 8);
  var uitslag = ritme.uitslagVan(slagen, { bpm: 120, maat: 4, vanaf: EERSTE });
  assert.ok(uitslag.gemiddelde > 25 && uitslag.gemiddelde < 55, 'gemiddelde: ' + uitslag.gemiddelde);
  assert.equal(uitslag.opMaat, 100);
  assert.equal(uitslag.laat, 8);
});

test('tikken die ver te laat komen staan niet op de maat', function () {
  var mono = stilte(4.5);
  for (var i = 0; i < 8; i++) tik(mono, SR, EERSTE + i * 0.5 + 0.2);
  var slagen = ritme.slagenVan(mono, SR);
  var uitslag = ritme.uitslagVan(slagen, { bpm: 120, maat: 4, vanaf: EERSTE });
  assert.equal(uitslag.opMaat, 0);
  assert.equal(uitslag.laat, uitslag.aantal);
});

test('twee tikken vlak na elkaar tellen als één slag', function () {
  var mono = stilte(2);
  tik(mono, SR, 1.0);
  tik(mono, SR, 1.06);
  var slagen = ritme.slagenVan(mono, SR);
  assert.equal(slagen.length, 1);
});

test('alleen zachte ruis levert hooguit één slag op', function () {
  var mono = zachteRuis(2, 0.03);
  assert.ok(ritme.slagenVan(mono, SR).length <= 1);
});

test('de tel en de afwijking van een tijdstip kloppen', function () {
  // Tussen twee tellen zit 60/160 = 0,375 seconde; tel 1 valt op 0,5 seconde.
  var opties = { bpm: 160, maat: 4, vanaf: 0.5 };
  assert.equal(ritme.telVan(0.5, opties), 1);
  assert.equal(Math.round(ritme.afwijkingVan(0.5, opties)), 0);
  assert.equal(ritme.telVan(1.25, opties), 3);
  assert.equal(Math.round(ritme.afwijkingVan(1.25, opties)), 0);
  assert.equal(ritme.telVan(0.55, opties), 1);
  assert.ok(Math.abs(ritme.afwijkingVan(0.55, opties) - 50) < 1, 'afwijking: ' + ritme.afwijkingVan(0.55, opties));
});

test('de grens van op de maat ligt bij de ingestelde marge', function () {
  var opTijd = [{ tijd: 0.08 }, { tijd: 0.58 }, { tijd: 1.08 }];
  var uitslag = ritme.uitslagVan(opTijd, { bpm: 120, maat: 4, vanaf: 0, goed: 90 });
  assert.equal(uitslag.opMaat, 100);
  var teLaat = [{ tijd: 0.1 }, { tijd: 0.6 }, { tijd: 1.1 }];
  var uitslag2 = ritme.uitslagVan(teLaat, { bpm: 120, maat: 4, vanaf: 0, goed: 90 });
  assert.equal(uitslag2.opMaat, 0);
  assert.equal(uitslag2.laat, 3);
});
