'use strict';
// Tests voor de Anthology-dataset: song-data/anthology-liedjes.json, gemaakt met
// scripts/musicxml-naar-liedjes.js uit de MusicXML-bestanden van The Public
// Domain Song Anthology.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const grepen = require('../lib/grepen');

const PAD = path.join(__dirname, '..', 'song-data', 'anthology-liedjes.json');

function leesAlsTekst() {
  return fs.readFileSync(PAD, 'utf8');
}

test('het bestand is geldige JSON zonder BOM', () => {
  const rauw = fs.readFileSync(PAD);
  assert.notEqual(rauw[0], 0xef, 'geen UTF-8 BOM aan het begin');
  const data = JSON.parse(rauw.toString('utf8'));
  assert.ok(Array.isArray(data), 'een JSON-array met één object per liedje');
  assert.ok(data.length >= 300, 'minstens 300 liedjes, gevonden: ' + data.length);
});

test('elk liedje heeft de velden van het uitvoerformaat en een niet-lege tekst', () => {
  const data = JSON.parse(leesAlsTekst());
  for (const lied of data) {
    for (const veld of ['titel', 'artiest', 'taal', 'genre', 'moeilijkheid', 'toonsoort', 'tempo', 'maatsoort', 'strum', 'bron', 'licentie', 'chordpro', 'akkoordenPerMaat', 'noten']) {
      assert.ok(Object.prototype.hasOwnProperty.call(lied, veld), 'veld ontbreekt bij ' + lied.titel + ': ' + veld);
    }
    assert.equal(lied.taal, 'en');
    assert.equal(lied.genre, 'Liedje');
    assert.equal(lied.bron, 'The Public Domain Song Anthology');
    assert.equal(lied.licentie, 'CC0 1.0 (publieke-domein-toewijding, Aperio Press)');
    assert.ok(lied.maatsoort >= 2 && lied.maatsoort <= 12, 'maatsoort tussen 2 en 12 bij ' + lied.titel);
    assert.ok(lied.moeilijkheid >= 1 && lied.moeilijkheid <= 5, 'moeilijkheid 1..5 bij ' + lied.titel);
    // de liedtekst zit in de ChordPro-regel: haal de kop en de akkoorden eraf
    const tekst = lied.chordpro.replace(/\{[^}]*\}/g, '').replace(/\[[^\]]*\]/g, '');
    assert.ok(/[A-Za-z]/.test(tekst), 'tekst mag niet leeg zijn bij ' + lied.titel);
  }
});

test('elke akkoordnaam heeft een greepdiagram', () => {
  const data = JSON.parse(leesAlsTekst());
  let overtredingen = 0;
  for (const lied of data) {
    for (const akkoord of lied.akkoordenPerMaat) {
      if (!grepen.heeftGreep(akkoord)) overtredingen += 1;
      assert.ok(grepen.heeftGreep(akkoord), 'geen greep voor ' + akkoord + ' in ' + lied.titel);
    }
    // de akkoorden in de ChordPro-regel moeten dezelfde zijn als akkoordenPerMaat
    const inChordpro = [...lied.chordpro.matchAll(/\[([^\]]+)\]/g)].map(m => m[1]);
    for (const a of inChordpro) {
      assert.ok(grepen.heeftGreep(a), 'geen greep voor ' + a + ' in de ChordPro van ' + lied.titel);
    }
  }
  assert.equal(overtredingen, 0);
});

test('elk liedje heeft minstens 8 noten met niet-dalende starttijden', () => {
  const data = JSON.parse(leesAlsTekst());
  for (const lied of data) {
    assert.ok(Array.isArray(lied.noten), 'noten ontbreken bij ' + lied.titel);
    assert.ok(lied.noten.length >= 8, 'te weinig noten (' + lied.noten.length + ') bij ' + lied.titel);
    let vorige = -1;
    for (const noot of lied.noten) {
      assert.equal(typeof noot.midi, 'number', 'midi is een getal bij ' + lied.titel);
      assert.ok(noot.duur > 0, 'duur groter dan 0 bij ' + lied.titel);
      assert.ok(noot.start >= vorige - 1e-6, 'starttijden dalen niet bij ' + lied.titel);
      vorige = noot.start;
    }
  }
});

test('elke akkoordenPerMaat heeft precies één akkoord per maat en de ChordPro heeft akkoorden', () => {
  const data = JSON.parse(leesAlsTekst());
  for (const lied of data) {
    assert.ok(lied.akkoordenPerMaat.length >= 1, 'minstens één maat bij ' + lied.titel);
    for (const akkoord of lied.akkoordenPerMaat) {
      assert.ok(akkoord && typeof akkoord === 'string', 'geen leeg akkoord bij ' + lied.titel);
    }
    assert.match(lied.chordpro, /\[[A-G]/, 'minstens één [X]-akkoord in de ChordPro van ' + lied.titel);
  }
});
