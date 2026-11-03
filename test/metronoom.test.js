'use strict';
// Tests voor de metronoom: tik-tempo, wanneer de klikken vallen en hoeveel tellen aftellen.
// Puur rekenwerk, dus zonder geluid te testen.
const test = require('node:test');
const assert = require('node:assert');
const metro = require('../lib/metronoom');

test('tik-tempo rekent het tempo uit de tussenpozen', () => {
  // vijf tikken om de 500 ms = 120 bpm
  const uit = metro.tapTempo([0, 500, 1000, 1500, 2000]);
  assert.equal(uit.bpm, 120);
  assert.equal(uit.tikken, 5);
  assert.deepEqual(uit.tussenpozen, [500, 500, 500, 500]);
});

test('een dubbeltik en een lange pauze verpesten het tempo niet', () => {
  const dubbel = metro.tapTempo([0, 400, 800, 1200, 1600, 1602]);
  assert.equal(dubbel.bpm, 150, 'de tik van 2 ms telt niet mee');

  // eerst drie tikken, dan een lange stilte: alleen het laatste stuk telt
  const naPauze = metro.tapTempo([0, 500, 1000, 6000, 6500, 7000]);
  assert.equal(naPauze.bpm, 120);
  assert.equal(naPauze.tikken, 3);
});

test('één tik levert nog geen tempo op, en het tempo blijft binnen de grenzen', () => {
  assert.equal(metro.tapTempo([100]).bpm, 0);
  assert.equal(metro.tapTempo([]).bpm, 0);
  assert.equal(metro.tapTempo([0, 5]).bpm, 0, 'twee tikken met 5 ms ertussen is geen tempo');
  assert.ok(metro.tapTempo([0, 2000]).bpm >= metro.MIN_BPM, 'heel langzaam blijft boven het minimum');
});

test('de klikken vallen op het tempo, met een zware tik op de eerste tel', () => {
  const klikken = metro.klikTijden(0, 120, 8, 4);
  assert.equal(klikken.length, 8);
  assert.equal(Math.round(klikken[1].wanneer * 100) / 100, 0.5);
  assert.equal(Math.round(klikken[4].wanneer * 100) / 100, 2);
  assert.deepEqual(klikken.map(k => k.zwaar), [true, false, false, false, true, false, false, false]);
  assert.equal(metro.klikTijden(0, 0, 4, 4).length, 0, 'zonder tempo geen klikken');
});

test('aftellen: vier tellen in 4/4, twee maten in 3/4, en dubbel bij een langzaam tempo', () => {
  assert.equal(metro.aftelTellen(90, 4), 4);
  assert.equal(metro.aftelTellen(90, 3), 6);
  assert.equal(metro.aftelTellen(50, 4), 8, 'bij een langzaam tempo twee keer zo lang aftellen');
  assert.equal(metro.aftelTellen(0, 4), 4, 'zonder tempo het gewone aanloopje');
});

test('de rekenkunde staat ook klaar voor de browser', () => {
  // Hetzelfde bestand wordt in de app als script geladen; daar moet een gewoon object
  // op window staan en geen module.exports.
  const bron = require('fs').readFileSync(require('path').join(__dirname, '..', 'lib', 'metronoom.js'), 'utf8');
  assert.match(bron, /window\.metronoomRekenen = reken/);
});
