'use strict';
// Testen van het rekenwerk van de toonladders. We vragen de noten van een paar bekende ladders
// op en kijken of ze kloppen, en we zoeken die noten op de gitaarhals. Zo weten we dat de app de
// juiste noten op de juiste plek laat zien, zonder dat er iemand een gitaar hoeft te pakken.
var test = require('node:test');
var assert = require('node:assert/strict');
var toonladders = require('../lib/toonladders');

test('A mineur pentatonisch geeft de noten A, C, D, E en G', function () {
  var noten = toonladders.notenVan('A', 'pentatonisch mineur', 1);
  assert.equal(noten.length, 6);
  assert.deepEqual(noten.map(toonladders.naamVan), ['A', 'C', 'D', 'E', 'G', 'A']);
});

test('C majeur geeft C D E F G A B en eindigt een octaaf hoger', function () {
  var noten = toonladders.notenVan('C', 'majeur', 1);
  assert.deepEqual(noten.map(toonladders.naamVan), ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C']);
  assert.equal(noten[0], 48);
  assert.equal(noten[noten.length - 1], 60);
});

test('A blues geeft A, C, D, D#, E en G', function () {
  var noten = toonladders.notenVan('A', 'blues', 1);
  assert.deepEqual(noten.map(toonladders.naamVan), ['A', 'C', 'D', 'D#', 'E', 'G', 'A']);
});

test('mollen en kruizen geven dezelfde noten, ook met kleine letters', function () {
  assert.deepEqual(toonladders.notenVan('Bb', 'majeur', 2), toonladders.notenVan('A#', 'majeur', 2));
  assert.deepEqual(toonladders.notenVan('Db', 'majeur', 2), toonladders.notenVan('C#', 'majeur', 2));
  assert.deepEqual(toonladders.notenVan('Eb', 'mineur', 2), toonladders.notenVan('D#', 'mineur', 2));
  assert.deepEqual(toonladders.notenVan('gb', 'majeur', 2), toonladders.notenVan('F#', 'majeur', 2));
  assert.deepEqual(toonladders.notenVan('ab', 'pentatonisch majeur', 2), toonladders.notenVan('G#', 'pentatonisch majeur', 2));
  assert.deepEqual(toonladders.notenVan('eb', 'majeur', 1), toonladders.notenVan('D#', 'majeur', 1));
  assert.equal(toonladders.grondtoonNaarKlasse('eb'), toonladders.grondtoonNaarKlasse('D#'));
});

test('een onbekende grondtoon of ladder levert niets op', function () {
  assert.deepEqual(toonladders.notenVan('H', 'majeur', 2), []);
  assert.deepEqual(toonladders.notenVan('C', 'onbekend', 2), []);
  assert.deepEqual(toonladders.notenVan('', 'majeur', 2), []);
  assert.deepEqual(toonladders.notenVan('H#', 'majeur', 2), []);
  assert.equal(toonladders.grondtoonNaarKlasse('H'), null);
  assert.equal(toonladders.grondtoonNaarKlasse('Q'), null);
  assert.equal(toonladders.ladderVan('geen ladder'), null);
});

test('de noten lopen op, zonder dubbelen, met de juiste lengte', function () {
  var gevallen = [
    ['C', 'majeur', 2],
    ['C', 'majeur', 3],
    ['A', 'pentatonisch mineur', 2],
    ['A', 'pentatonisch mineur', 3]
  ];
  var i, j, k, g, noten, ladder, uniek;
  for (i = 0; i < gevallen.length; i++) {
    g = gevallen[i];
    noten = toonladders.notenVan(g[0], g[1], g[2]);
    ladder = toonladders.ladderVan(g[1]);
    assert.equal(noten.length, ladder.stappen.length * g[2] + 1, g[1] + ' met ' + g[2] + ' octaven');
    for (j = 1; j < noten.length; j++) {
      assert.ok(noten[j] > noten[j - 1], g[1] + ' loopt niet op');
    }
    uniek = {};
    for (k = 0; k < noten.length; k++) {
      assert.ok(!uniek[noten[k]], 'dubbele noot ' + noten[k]);
      uniek[noten[k]] = true;
    }
  }
  // standaard twee octaven, minimaal één octaaf, en nooit meer dan vier
  assert.deepEqual(toonladders.notenVan('C', 'majeur'), toonladders.notenVan('C', 'majeur', 2));
  assert.deepEqual(toonladders.notenVan('C', 'majeur', 0), toonladders.notenVan('C', 'majeur', 1));
  assert.deepEqual(toonladders.notenVan('C', 'majeur', 9), toonladders.notenVan('C', 'majeur', 4));
});

test('naamVan geeft de toonnaam met kruizen', function () {
  assert.equal(toonladders.naamVan(69), 'A');
  assert.equal(toonladders.naamVan(60), 'C');
  assert.equal(toonladders.naamVan(70), 'A#');
  assert.equal(toonladders.naamVan(40), 'E');
  assert.equal(toonladders.naamVan(64), 'E');
});

test('posities op de hals kloppen en de open snaren tellen mee', function () {
  var opties = { hoogsteVak: 12, stemming: toonladders.STANDAARD_STEMMING };
  var noten = toonladders.notenVan('A', 'pentatonisch mineur', 2);
  var posities = toonladders.positiesOpHals(noten, opties);
  assert.ok(posities.length > 0, 'geen posities gevonden');

  var dubbel = {};
  var i, p, sleutel;
  for (i = 0; i < posities.length; i++) {
    p = posities[i];
    assert.equal(p.midi, opties.stemming[p.snaar] + p.vak, 'midi klopt niet met snaar en vak');
    assert.ok(p.vak >= 0 && p.vak <= opties.hoogsteVak, 'vak valt buiten het bereik');
    assert.equal(p.naam, toonladders.naamVan(p.midi), 'naam klopt niet met de midi-noot');
    sleutel = p.snaar + ':' + p.vak;
    assert.ok(!dubbel[sleutel], 'dubbele positie ' + sleutel);
    dubbel[sleutel] = true;
  }
  // gesorteerd op snaar en dan op vak
  for (i = 1; i < posities.length; i++) {
    assert.ok(posities[i].snaar > posities[i - 1].snaar ||
      (posities[i].snaar === posities[i - 1].snaar && posities[i].vak > posities[i - 1].vak),
      'posities staan niet op volgorde');
  }

  // De open dunne e (snaar 5, midi 64) zit midden in deze ladder en telt dus als open snaar mee.
  var openE = posities.filter(function (pos) { return pos.snaar === 5 && pos.vak === 0; });
  assert.equal(openE.length, 1, 'de open dunne e ontbreekt');
  assert.equal(openE[0].midi, 64);

  // En de open A-snaar (snaar 1, midi 45) wordt ook als open snaar gevonden.
  var openPos = toonladders.positiesOpHals([40, 45, 50, 55, 59, 64], opties);
  var openA = null;
  for (i = 0; i < openPos.length; i++) {
    if (openPos[i].snaar === 1 && openPos[i].vak === 0) openA = openPos[i];
  }
  assert.ok(openA, 'de open A-snaar ontbreekt');
  assert.equal(openA.midi, 45);
  assert.equal(openA.naam, 'A');
});

test('een hoge grondtoon met vier octaven loopt niet stuk', function () {
  var noten = toonladders.notenVan('B', 'majeur', 4);
  assert.equal(noten.length, 7 * 4 + 1);
  var posities = toonladders.positiesOpHals(noten, { hoogsteVak: 12 });
  assert.ok(posities.length > 0, 'geen posities gevonden');
  assert.ok(posities.length < 1000, 'te veel posities');
  var i, p;
  for (i = 0; i < posities.length; i++) {
    p = posities[i];
    assert.ok(p.vak >= 0 && p.vak <= 12, 'vak valt buiten het bereik');
    assert.ok(p.midi >= 59 && p.midi <= 59 + 48, 'midi valt buiten het bereik');
  }
});
