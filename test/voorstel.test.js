'use strict';
// Elk liedje hoort akkoorden te hebben. Heeft de bron ze niet (een nummer dat uit een link is
// opgehaald, of een liedje waarvan alleen de tekst is overgeleverd), dan stelt de app een schema voor
// in de toonaard van het liedje. Deze proef controleert twee dingen: het voorstel is altijd
// tekenbaar (elk akkoord heeft een greep, desnoods met capo zoals de app zelf uitrekent), en de
// toonaard wordt netjes gelezen.
const test = require('node:test');
const assert = require('node:assert');
const voorstel = require('../lib/voorstel');
const capo = require('../lib/capo');

test('elke toonaard in het voorstel is te tekenen', () => {
  const sleutels = Object.keys(voorstel.MAJOR).concat(Object.keys(voorstel.MINEUR));
  assert.ok(sleutels.length >= 12, 'er horen genoeg toonaarden in de tabel te staan');
  for (const sleutel of sleutels) {
    const v = voorstel.voorstelReeks(sleutel);
    assert.equal(v.akkoorden.length, 4, sleutel + ' hoort vier akkoorden te hebben');
    assert.ok(v.akkoorden.every(a => a && a.trim()), sleutel + ': geen leeg akkoord');
    const advies = capo.advies(v.akkoorden, v.toonsoort);
    const zonder = (advies.akkoorden || []).filter(a => !a.heeftDiagram).map(a => a.concert);
    assert.equal(zonder.length, 0, sleutel + ': deze akkoorden zijn niet te tekenen: ' + zonder.join(' '));
  }
});

test('de toonaard wordt gelezen zoals hij in de liedjes staat', () => {
  assert.equal(voorstel.schoonToonsoort('G'), 'G');
  assert.equal(voorstel.schoonToonsoort('g'), 'G');
  assert.equal(voorstel.schoonToonsoort('Am'), 'Am');
  assert.equal(voorstel.schoonToonsoort('a mineur'), 'Am');
  assert.equal(voorstel.schoonToonsoort('Bb'), 'Bb');
  assert.equal(voorstel.schoonToonsoort(''), '');
  assert.equal(voorstel.schoonToonsoort('onzin'), '');
});

test('een toonaard buiten de tabel levert een verwant, tekenbaar schema op', () => {
  const es = voorstel.voorstelReeks('Eb');
  assert.equal(es.verwisseld, true, 'Es hoort een verwante toonaard te krijgen');
  assert.ok(voorstel.MAJOR[es.toonsoort], 'het verwante schema hoort in de tabel te staan');
  const advies = capo.advies(es.akkoorden, es.toonsoort);
  assert.equal((advies.akkoorden || []).filter(a => !a.heeftDiagram).length, 0);
  // En zonder toonaard: gewoon C.
  assert.deepEqual(voorstel.voorstelReeks('').akkoorden, voorstel.MAJOR.C);
});

test('elk voorstel zegt zelf dat het een voorstel is', () => {
  for (const sleutel of ['C', 'G', 'D', 'A', 'Am', 'Dm', 'Bb']) {
    assert.equal(voorstel.voorstelReeks(sleutel).voorstel, true);
  }
});
