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

// ------------------------------------------- wat telt niet als slag, en wat wel ---
// De drempel vergelijkt met het stukje ervoor en met een langer venster, niet met de luidste klap
// uit het hele stuk. Zonder dat telt de app omgevingsgeluid als slagen: met een drempel op de
// luidste klap gaf gewone ruis veertien valse slagen per drie seconden, en netbrom tweeëntwintig.

// Ruis met een eigen reeks en een eigen naam, zodat de ruis hierboven niet in de war raakt.
function ruissignaal(lengte, amplitude, zaad) {
  var reeks = toevalsreeks(zaad || 77);
  var a = new Float32Array(lengte);
  for (var i = 0; i < lengte; i++) a[i] = reeks() * amplitude;
  return a;
}

// Netbrom: vijftig hertz met boventonen, zoals een zoemende versterker.
function brom(lengte, amplitude, vanaf) {
  var a = new Float32Array(lengte);
  var begin = Math.round((vanaf || 0) * SR);
  for (var i = begin; i < lengte; i++) {
    var t = (i - begin) / SR;
    a[i] = amplitude * (Math.sin(2 * Math.PI * 50 * t) + 0.4 * Math.sin(2 * Math.PI * 100 * t) +
      0.2 * Math.sin(2 * Math.PI * 150 * t));
  }
  return a;
}

// Een vaste tik (vijftig milliseconden toon van 196 hertz) op een tijdstip in het geluid, zodat
// deze proeven niet afhangen van de gedeelde ruisreeks hierboven.
function klank(mono, opTijd, sterkte) {
  var begin = Math.round(opTijd * SR);
  var n = Math.round(0.05 * SR);
  for (var i = 0; i < n && begin + i < mono.length; i++) {
    mono[begin + i] += (1 - i / n) * sterkte * Math.sin(2 * Math.PI * 196 * (i / SR));
  }
}

// Een aangeslagen snaar die langzaam uitsterft, in plaats van een korte tik.
function snaar(lengte, opTijd, amplitude, frequentie) {
  var a = new Float32Array(lengte);
  var begin = Math.round(opTijd * SR);
  for (var i = begin; i < lengte; i++) {
    var t = (i - begin) / SR;
    a[i] = amplitude * Math.exp(-t * 2.5) * Math.sin(2 * Math.PI * (frequentie || 196) * t);
  }
  return a;
}

// Een harde klap van vijf milliseconden, die dus helemaal in één stukje past.
function klap(lengte, opTijd, amplitude) {
  var a = new Float32Array(lengte);
  var begin = Math.round(opTijd * SR);
  var n = Math.round(0.005 * SR);
  for (var i = 0; i < n && begin + i < lengte; i++) {
    a[begin + i] = (1 - i / n) * amplitude * (i % 2 ? -1 : 1);
  }
  return a;
}

// Verschillende signalen bij elkaar optellen, zodat we tikken in ruis of in brom kunnen maken.
function opgeteld(signalen) {
  var a = new Float32Array(signalen[0].length);
  for (var i = 0; i < a.length; i++) {
    for (var k = 0; k < signalen.length; k++) a[i] += signalen[k][i];
  }
  return a;
}

var MAATSLAGEN = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4];

test('gewone ruis geeft geen enkele valse slag, hoe hard ook', () => {
  [0.05, 0.15, 0.5].forEach(function (amplitude, i) {
    var a = ruissignaal(SR * 4, amplitude, 3 + i * 101);
    assert.equal(ritme.slagenVan(a, SR).length, 0, 'ruis met amplitude ' + amplitude + ' gaf valse slagen');
  });
});

test('netbrom en stilte geven geen slag', () => {
  assert.equal(ritme.slagenVan(brom(SR * 4, 0.2), SR).length, 0, 'brom vanaf het begin gaf een slag');
  // Een brom die midden in het stuk begint is één niveauverandering; dat mag één slag geven.
  assert.ok(ritme.slagenVan(brom(SR * 4, 0.2, 1.5), SR).length <= 1, 'brom die later begint gaf te veel slagen');
  assert.equal(ritme.slagenVan(new Float32Array(SR * 3), SR).length, 0, 'stilte gaf een slag');
});

test('tikken worden ook in ruis en in brom gevonden', () => {
  var tikken = new Float32Array(SR * 6);
  MAATSLAGEN.forEach(function (t) { klank(tikken, t, 0.5); });
  assert.equal(ritme.slagenVan(tikken, SR).length, 8, 'de tikken zelf');
  assert.equal(ritme.slagenVan(opgeteld([tikken, ruissignaal(SR * 6, 0.2, 21)]), SR).length, 8, 'tikken in ruis');
  assert.equal(ritme.slagenVan(opgeteld([tikken, brom(SR * 6, 0.15)]), SR).length, 8, 'tikken in brom');
});

test('losse snaren worden in de tijdbaan gevonden; doorlopende niet, daar is het spectrum voor', () => {
  // Deze proef laat de grens van de tijdbaan zien. Klinkt de vorige snaar nog door, dan verandert de
  // sterkte bijna niet en mist de tijdbaan een deel van de slagen. Daarom gebruikt de app in de
  // browser de spectrumbaan (zie de proef 'slagen worden ook in het spectrum gevonden').
  var dicht = [0.5, 0.85, 1.2, 1.55, 1.9, 2.25, 2.6, 2.95].map(function (t) {
    return snaar(SR * 4, t, 0.45);
  });
  assert.ok(ritme.slagenVan(opgeteld(dicht), SR).length < 8,
    'de tijdbaan hoort de doorlopende snaren niet allemaal te vinden');
  var snaren = MAATSLAGEN.map(function (t) { return snaar(SR * 6, t, 0.45); });
  assert.equal(ritme.slagenVan(opgeteld(snaren.concat([brom(SR * 6, 0.15)])), SR).length, 8, 'snaren in brom');
});

test('een zachte slag in een rumoerige kamer wordt niet gemeld', () => {
  // Boven het lawaai uit is die slag ook niet te horen; de app meldt hem dan niet in plaats van
  // hem op een verkeerde tel te zetten.
  var zacht = new Float32Array(SR * 4);
  tik(zacht, SR, 1, 0.12);
  assert.equal(ritme.slagenVan(opgeteld([ruissignaal(SR * 4, 0.25, 33), zacht]), SR).length, 0);
});

test('een harde klap op het allereerste stukje wordt gevonden', () => {
  // Er is geen stukje ervoor om mee te vergelijken; een harde klap pikken we er los uit.
  assert.equal(ritme.slagenVan(klap(SR * 2, 0, 0.5), SR).length, 1);
});

test('slagen worden ook in het spectrum gevonden, als de vorige snaar nog doorklinkt', () => {
  // Nagemaakte spectra: een rustig niveau met ruis erop, en op elke slag een breedbandige aanslag
  // die uitsterft. Dit is de maat die de app in de browser gebruikt (de analyser van de WebAudio-
  // kaart), en de enige maat die een snel slagpatroon aankan: bij een drempel op de sterkte miste
  // de app slagen zodra de vorige snaar nog klonk.
  assert.equal(typeof ritme.fluxTussen, 'function');
  assert.equal(typeof ritme.slagenUitFlux, 'function');
  assert.equal(ritme.slagenUitFlux([]).length, 0);

  var AANSLAG = [40, 30, 25, 20];
  var ZACHT = [9, 7, 6, 5];

  function spectra(aantal, slagen, opties) {
    var o = opties || {};
    var grond = o.grond || 20;
    var ruis = o.ruis || 3;
    var bakken = 64;
    var uit = [];
    var herinnering = new Array(bakken).fill(0);
    var reeks = toevalsreeks(o.zaad || 1234);
    for (var i = 0; i < aantal; i++) {
      var tijd = i / 60;
      var beeld = [];
      for (var b = 0; b < bakken; b++) {
        beeld.push(grond + reeks() * ruis + ((o.brom && b < 3) ? o.brom : 0));
      }
      slagen.forEach(function (st) {
        if (tijd >= st) {
          var af = Math.exp(-(tijd - st) * o.verval);
          for (var k = 0; k < bakken; k++) beeld[k] += o.aanslag[k % o.aanslag.length] * af;
        }
      });
      uit.push({ tijd: tijd, flux: ritme.fluxTussen(beeld, herinnering) });
      herinnering = beeld;
    }
    return uit;
  }

  var MAAT = [0.5, 1, 1.5, 2, 2.5, 3];
  var SNEL = [0.5, 0.8, 1.1, 1.4, 1.7, 2, 2.3, 2.6];

  assert.equal(ritme.slagenUitFlux(spectra(240, [])).length, 0, 'een rustig niveau gaf slagen');
  assert.equal(ritme.slagenUitFlux(spectra(240, [], { brom: 30 })).length, 0, 'brom gaf slagen');
  assert.equal(ritme.slagenUitFlux(spectra(240, MAAT, { aanslag: AANSLAG, verval: 3 })).length, 6);
  assert.equal(ritme.slagenUitFlux(spectra(240, SNEL, { aanslag: AANSLAG, verval: 1.2 })).length, 8,
    'een snel slagpatroon, terwijl de vorige snaar nog doorklinkt');
  assert.equal(ritme.slagenUitFlux(spectra(240, MAAT, { aanslag: AANSLAG, verval: 3, brom: 30 })).length, 6,
    'slagen met brom erdoorheen');
  assert.equal(ritme.slagenUitFlux(spectra(240, MAAT, { aanslag: ZACHT, verval: 3 })).length, 6, 'zachte slagen');
  assert.ok(ritme.slagenUitFlux(spectra(240, MAAT, { aanslag: ZACHT, verval: 3, ruis: 10 })).length >= 5,
    'zachte slagen in een rumoerige kamer: de meeste horen we nog');
  // De slagen komen ook op de juiste tijd, niet alleen in het juiste aantal.
  var tijden = ritme.slagenUitFlux(spectra(240, MAAT, { aanslag: AANSLAG, verval: 3 })).map(function (p) { return p.tijd; });
  MAAT.forEach(function (t, i) { assert.ok(Math.abs(tijden[i] - t) < 0.04, 'slag op ' + t + ' kwam op ' + tijden[i]); });
});

test('de twee vensters staan als getal in het rekenwerk', () => {
  assert.equal(typeof ritme.STILTE, 'number');
  assert.equal(typeof ritme.SPRONG, 'number');
  assert.equal(typeof ritme.LANG_SPRONG, 'number');
  assert.equal(ritme.LANG_VENSTER, 4);
  assert.equal(typeof ritme.langVensterVan, 'function');
  var energie = ritme.energieVan(klap(SR, 0.2, 0.5));
  var lang = ritme.langVensterVan(energie);
  assert.equal(lang.length, energie.length);
  var hoogsteKort = Math.max.apply(null, energie);
  var hoogsteLang = Math.max.apply(null, lang);
  assert.ok(hoogsteLang <= hoogsteKort + 1e-6, 'het lange venster is nooit hoger dan het korte');
  // Ruis staat in het lange venster vlak: dat is precies waarom het brom en ruis weghoudt.
  var ruisLang = ritme.langVensterVan(ritme.energieVan(ruissignaal(SR * 2, 0.3, 5)));
  var hoogste = Math.max.apply(null, ruisLang);
  var laagste = Math.min.apply(null, ruisLang.slice(ritme.LANG_VENSTER));
  assert.ok((hoogste - laagste) / hoogste < 0.2, 'ruis hoort in het lange venster vlak te zijn');
});
