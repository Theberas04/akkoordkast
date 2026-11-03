'use strict';
// Muziektheorie, grepen, ChordPro-parser en capo-advies: puur rekenwerk.
const test = require('node:test');
const assert = require('node:assert');
const theorie = require('../lib/theorie');
const grepen = require('../lib/grepen');
const chordpro = require('../lib/chordpro');
const capo = require('../lib/capo');
const gitaar = require('../lib/gitaar');
const bron = require('../liedjes-bron');

const WHITELIST = ['C', 'C7', 'Cm', 'Cmaj7', 'D', 'D7', 'Dm', 'Dm7', 'E', 'E7', 'Em', 'Em7',
  'F', 'F7', 'Fm', 'Fmaj7', 'G', 'G7', 'Gm', 'A', 'A7', 'Am', 'Am7', 'Bb', 'B7', 'Bm'];

test('transponeren houdt de kwaliteit en de basnoot', () => {
  assert.equal(theorie.transponeer('G', 2, false), 'A');
  assert.equal(theorie.transponeer('Am', 2, false), 'Bm');
  assert.equal(theorie.transponeer('F#m', 2, false), 'G#m');
  assert.equal(theorie.transponeer('C', -1, false), 'B');
  assert.equal(theorie.transponeer('Am', -2, false), 'Gm');
  assert.equal(theorie.transponeer('Bb', 2, true), 'C');
  assert.equal(theorie.transponeer('G', 3, true), 'Bb');
  assert.equal(theorie.transponeer('C', 0, false), 'C');
});

test('toonsoort kiest mollen waar dat hoort', () => {
  assert.equal(theorie.transponeerToonsoort('F', 0), 'F');
  assert.equal(theorie.transponeerToonsoort('G', 3), 'Bb');
  assert.equal(theorie.transponeerToonsoort('C', 3), 'Eb');
  assert.equal(theorie.transponeerToonsoort('G', 2), 'A');
});

test('elke whitelist-greep heeft een compleet diagram', () => {
  for (const naam of WHITELIST) {
    assert.ok(grepen.heeftGreep(naam), `greep ontbreekt: ${naam}`);
    const g = grepen.greep(naam);
    assert.equal(g.frets.length, 6, `${naam}: zes snaren`);
    assert.ok(g.frets.some(f => f >= 0), `${naam}: minstens één klinkende snaar`);
    const svg = grepen.svgDiagram(naam);
    assert.match(svg, /^<svg /, `${naam}: svg`);
    assert.ok(svg.includes(`${naam}</text>`), `${naam}: naam in het diagram`);
  }
});

test('greep met barré wordt als barré herkend', () => {
  assert.equal(grepen.isBarre('F'), true);
  assert.equal(grepen.isBarre('C'), false);
  assert.equal(grepen.isBarre('Bm'), true);
});

test('capo verschuift de klinkende frets, niet de greep', () => {
  const zonder = grepen.klinkendeFrets('G', 0);
  const met = grepen.klinkendeFrets('G', 2);
  assert.deepEqual(zonder, [3, 2, 0, 0, 0, 3]);
  assert.deepEqual(met, [5, 4, 2, 2, 2, 5]);
  assert.deepEqual(grepen.noten('C', 0).map(n => n.midi), [48, 52, 55, 60, 64]);
});

test('ChordPro-parser leest richtlijnen, refrein en tabblok', () => {
  const model = chordpro.parse([
    '{title: Proefliedje}',
    '{key: G}',
    '{tempo: 96}',
    '{comment: Couplet 1}',
    '[G]eerste regel [C]tweede',
    '{soc}',
    '[D]refrein hier',
    '{eoc}',
    '{sot}',
    '3 2 0 0 0 3',
    '{eot}'
  ].join('\n'));
  assert.equal(model.meta.titel, 'Proefliedje');
  assert.equal(model.meta.toonsoort, 'G');
  assert.equal(model.meta.tempo, 96);
  assert.deepEqual(model.akkoorden.sort(), ['C', 'D', 'G']);
  assert.equal(model.regels.filter(r => r.soort === 'label').length, 1);
  assert.equal(model.regels.filter(r => r.soort === 'sectie-start').length, 1);
  const tab = model.regels.find(r => r.soort === 'tab');
  assert.deepEqual(tab.regels, ['3 2 0 0 0 3']);
  const tekst = model.regels.find(r => r.soort === 'tekst');
  assert.deepEqual(tekst.segmenten.map(s => s.akkoord), ['G', 'C']);
  assert.equal(tekst.segmenten[1].tekst, 'tweede');
});

test('transponeren van een model raakt akkoorden en toonsoort', () => {
  const model = chordpro.parse('{key: G}\n[G]een [Em]twee [C]drie');
  const omhoog = chordpro.transponeerModel(model, 2, false);
  assert.deepEqual(omhoog.akkoorden.sort(), ['A', 'D', 'F#m'].sort());
  assert.equal(omhoog.meta.toonsoort, 'A');
  assert.equal(omhoog.regels.find(r => r.soort === 'tekst').segmenten[0].akkoord, 'A');
  // het origineel blijft ongemoeid
  assert.equal(model.regels.find(r => r.soort === 'tekst').segmenten[0].akkoord, 'G');
});

test('capo-advies: A-majeur liedje wordt capo 2 met G-grepen', () => {
  const advies = capo.advies(['A', 'D', 'E', 'F#m', 'Bm'], 'A');
  assert.equal(advies.capo, 2);
  assert.equal(advies.vormToonsoort, 'G');
  assert.deepEqual(advies.akkoorden.map(a => a.vorm), ['G', 'C', 'D', 'Em', 'Am']);
  assert.equal(advies.zonderCapo, false);
  assert.match(advies.tekst, /Capo op 2/);
});

test('capo-advies laat een open toonsoort met rust', () => {
  const advies = capo.advies(['C', 'G', 'Am', 'F'], 'C');
  assert.equal(advies.capo, 0);
  assert.equal(advies.zonderCapo, true);
  assert.match(advies.tekst, /Zonder capo/);
  // F is een barré; dat wordt benoemd
  assert.match(advies.tekst, /barré/);
});

test('capo-advies zonder akkoorden valt niet om', () => {
  const advies = capo.advies([], 'C');
  assert.equal(advies.capo, 0);
  assert.deepEqual(advies.akkoorden, []);
  assert.match(advies.tekst, /Geen akkoorden/);
});

test('gitaarsynthesizer levert een geldige WAV van de juiste lengte', () => {
  const wav = gitaar.maakWav({ akkoorden: ['G', 'C'], capo: 0, bpm: 120, strum: 'D DU UDU', rondes: 1 });
  assert.equal(wav.slice(0, 4).toString(), 'RIFF');
  assert.equal(wav.slice(8, 12).toString(), 'WAVE');
  const sampleRate = wav.readUInt32LE(24);
  assert.equal(sampleRate, 44100);
  const samples = (wav.length - 44) / 2;
  // één ronde van twee akkoorden op 120 BPM = 4 seconden + staart
  assert.ok(samples / sampleRate > 3.5, 'duur te kort: ' + (samples / sampleRate));
  let piek = 0;
  for (let i = 0; i < samples; i++) piek = Math.max(piek, Math.abs(wav.readInt16LE(44 + i * 2)));
  assert.ok(piek > 3000, 'signaal te zacht: ' + piek);
  assert.ok(piek <= 32767, 'clipping: ' + piek);
});

test('gitaarsynthesizer weigert onbekende akkoorden', () => {
  assert.throws(() => gitaar.maakWav({ akkoorden: ['Xyz'] }), /Geen bekende akkoorden/);
});

test('patroon "D DU UDU" wordt acht achtste noten met rusten', () => {
  assert.deepEqual(gitaar.patroonTokens('D DU UDU'), ['D', '-', 'D', 'U', '-', 'U', 'D', 'U']);
  assert.deepEqual(gitaar.patroonTokens(''), ['D', '-', 'D', 'U', '-', 'U', 'D', 'U']);
  assert.deepEqual(gitaar.patroonTokens('DDDDDDDD'), ['D', 'D', 'D', 'D', 'D', 'D', 'D', 'D']);
  assert.deepEqual(gitaar.patroonTokens('U'), ['U', 'U', 'U', 'U', 'U', 'U', 'U', 'U']);
  assert.equal(gitaar.patroonTokens('D DU UDU').length, 8);
});

test('de meegeleverde liedjes-dataset is compleet en houdt zich aan de whitelist', () => {
  const liedjes = bron.alle();
  assert.ok(liedjes.length >= 20, 'te weinig liedjes: ' + liedjes.length);
  const titels = new Set();
  for (const lied of liedjes) {
    assert.ok(lied.titel && lied.titel.length > 1, 'titel ontbreekt');
    assert.ok(!titels.has(lied.titel), 'dubbele titel: ' + lied.titel);
    titels.add(lied.titel);
    assert.ok(['nl', 'en', 'de', 'af'].includes(lied.taal), 'taal onbekend: ' + lied.taal);
    assert.ok(lied.moeilijkheid >= 1 && lied.moeilijkheid <= 5, 'moeilijkheid buiten bereik');
    assert.ok(lied.tempo >= 40 && lied.tempo <= 200, 'tempo onrealistisch');
    assert.ok(lied.model.regels.length >= 10, 'te weinig regels: ' + lied.titel);
    assert.ok(lied.model.akkoorden.length >= 2, 'te weinig akkoorden: ' + lied.titel);
    for (const akkoord of lied.model.akkoorden) {
      assert.ok(WHITELIST.includes(akkoord), `${lied.titel}: akkoord buiten whitelist: ${akkoord}`);
    }
    assert.ok(lied.bron && lied.bron.length > 2, 'bronvermelding ontbreekt: ' + lied.titel);
  }
  // ids van meegeleverde liedjes blijven onder het bereik van eigen liedjes
  assert.ok(Math.max(...liedjes.map(l => l.id)) < 900000);
});

test('zoekindex van de meegeleverde liedjes bevat akkoorden en tekst', () => {
  const lied = bron.alle().find(l => l.titel === 'Amazing Grace');
  assert.ok(lied, 'Amazing Grace ontbreekt');
  const index = bron.zoekTekst(lied);
  assert.match(index, /amazing grace/);
  assert.match(index, /grace/);
  assert.ok(index.length > 100, 'zoekindex te mager');
});
