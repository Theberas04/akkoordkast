'use strict';
// Noten lezen: de vragen van het gereedschap in de Leren-tab.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const noten = require('../lib/noten.js');

const PAGINA = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

test('de eerste positie levert de stamtonen op die je op de balk leest', () => {
  const stam = noten.notenInBereik(null, null, { alleenStamtonen: true });
  assert.ok(stam.length >= 8, 'te weinig noten om te vragen: ' + stam.length);
  for (const n of stam) {
    assert.ok(['C', 'D', 'E', 'F', 'G', 'A', 'B'].includes(n.naam), 'kruis of mol in de vragen: ' + n.naam);
    assert.ok(n.vak >= 0 && n.vak <= 4, 'buiten de eerste positie: vak ' + n.vak);
    assert.ok(n.midi >= 52 && n.midi <= 76, 'buiten het bereik: midi ' + n.midi);
  }
  // Van laag naar hoog, zoals de balk loopt.
  for (let i = 1; i < stam.length; i++) assert.ok(stam[i].midi > stam[i - 1].midi);
});

test('een noot heeft een plaats op de hals en een naam', () => {
  // De open dunne e is de E4: midi 64, snaar 5 (de dunne e), vak 0.
  const e4 = noten.plaatsenVan(64);
  assert.ok(e4.length >= 1);
  assert.ok(e4.some(p => p.snaar === 5 && p.vak === 0), 'de open dunne e hoort erbij te zitten');
  // En dezelfde klank zit ook op de B-snaar, vijfde vak.
  assert.ok(e4.some(p => p.snaar === 4 && p.vak === 5) === false, 'vak 5 valt buiten de eerste positie');

  // De A op de dikke E, vijfde vak: midi 45.
  const a2 = noten.plaatsenVan(45);
  assert.ok(a2.some(p => p.snaar === 0 && p.vak === 5) === false, 'vak 5 valt buiten de eerste positie');
  assert.ok(a2.some(p => p.snaar === 1 && p.vak === 0), 'de losse A-snaar hoort erbij te zitten');
});

test('goed of fout, en de uitleg erbij', () => {
  assert.equal(noten.isGoed(64, 'E'), true);
  assert.equal(noten.isGoed(64, 'F'), false);
  assert.equal(noten.isGoed(64, 'e'), false, 'de namen zijn met een hoofdletter');
  assert.equal(noten.isGoed(60, 'C'), true);
  const plaats = noten.notenInBereik(null, null, { alleenStamtonen: true })[0];
  const uitleg = noten.uitleg(plaats);
  assert.ok(uitleg.indexOf(plaats.metOctaaf) !== -1, 'de uitleg hoort de noot te noemen');
  assert.ok(uitleg.indexOf(plaats.snaarNaam) !== -1, 'de uitleg hoort de snaar te noemen');
});

test('de vragen komen uit het bereik en herhalen niet meteen', () => {
  const vragen = noten.maakVragen(40, {});
  assert.equal(vragen.length, 40);
  for (const v of vragen) {
    assert.ok(v.midi >= 52 && v.midi <= 76, 'buiten het bereik: ' + v.midi);
    assert.ok(['C', 'D', 'E', 'F', 'G', 'A', 'B'].includes(v.naam));
  }
  for (let i = 1; i < vragen.length; i++) {
    assert.notEqual(vragen[i].midi, vragen[i - 1].midi, 'twee keer dezelfde noot achter elkaar');
  }
});

test('de antwoordknoppen horen bij de vraag', () => {
  const knoppen = noten.antwoordNamen(64);
  assert.deepEqual(knoppen, ['C', 'D', 'E', 'F', 'G', 'A', 'B']);
  assert.ok(knoppen.includes(noten.naam(64)), 'het goede antwoord hoort erbij te zitten');
});

test('de pagina heeft het gereedschap Noten lezen', () => {
  assert.ok(PAGINA.indexOf('id="noten-kaart"') !== -1, 'de kaart mist');
  assert.ok(PAGINA.indexOf('/lib/noten.js') !== -1, 'het rekenbestand wordt niet geladen');
  assert.ok(PAGINA.indexOf('function tekenNootBalk(') !== -1, 'de notenbalk van de vraag mist');
  assert.ok(PAGINA.indexOf('function antwoordNoot(') !== -1, 'het antwoorden mist');
  assert.ok(PAGINA.indexOf('startNotenLezen();') !== -1, 'het gereedschap wordt niet klaargezet');
});
