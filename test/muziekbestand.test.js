'use strict';
// De muziek van een liedje: een bestand uit de muziekmappen van de gebruiker. Dit is het
// rekenwerk plus de belangrijkste veiligheidsregel: een pad buiten de muziekmappen komt er
// niet door, ook niet met '..' of via een symbolische link.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const mb = require('../lib/muziekbestand');

function proefmap() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'akkoordkast-muziek-'));
}

test('normaliseren maakt titels vergelijkbaar', () => {
  assert.equal(mb.normaliseer('Het Dorp (live)'), 'het dorp');
  assert.equal(mb.normaliseer('Het_Dorp.mp3'), 'het dorp');
  assert.equal(mb.normaliseer('Café  "De Zwaan"'), 'cafe de zwaan');
  assert.equal(mb.normaliseer('Rock & Roll'), 'rock en roll');
  // Het volgnummer blijft hier staan: '99 Luftballons' is een titel, geen volgnummer.
  // beoordeel() haalt een nummer vooraan er wél af, via titelVan.
  assert.equal(mb.normaliseer('01 - Jo Erens - Sjeng en Marlies.m4a'), '01 jo erens sjeng en marlies');
  assert.equal(mb.normaliseer(''), '');
});

test('uit een bestandsnaam komt een leesbare titel', () => {
  assert.equal(mb.titelVan('/muziek/01 - Het Dorp.mp3'), 'Het Dorp');
  assert.equal(mb.titelVan('/muziek/het_dorp_live.flac'), 'het dorp live');
  assert.equal(mb.titelVan('/muziek/zonder-extensie'), 'zonder-extensie');
});

test('alleen audioformaten tellen mee, met het juiste mime-type', () => {
  for (const goed of ['a.mp3', 'a.M4A', 'a.flac', 'a.ogg', 'a.opus', 'a.wav']) {
    assert.ok(mb.isAudio(goed), goed + ' hoort audio te zijn');
  }
  for (const fout of ['a.txt', 'a.mp4', 'a.jpg', 'a']) {
    assert.ok(!mb.isAudio(fout), fout + ' hoort geen audio te zijn');
  }
  assert.equal(mb.mimeVan('a.mp3'), 'audio/mpeg');
  assert.equal(mb.mimeVan('a.flac'), 'audio/flac');
});

test('een pad buiten de muziekmappen komt er niet door', () => {
  const wortel = proefmap();
  const muziek = path.join(wortel, 'muziek');
  const buiten = path.join(wortel, 'geheim');
  fs.mkdirSync(muziek, { recursive: true });
  fs.mkdirSync(buiten, { recursive: true });
  fs.writeFileSync(path.join(muziek, 'lied.mp3'), 'x');
  fs.writeFileSync(path.join(buiten, 'geheim.mp3'), 'x');

  const mappen = [muziek];
  assert.equal(mb.veilig(path.join(muziek, 'lied.mp3'), mappen), path.join(muziek, 'lied.mp3'));
  assert.equal(mb.veilig(path.join(buiten, 'geheim.mp3'), mappen), '', 'bestand buiten de map toegestaan');
  assert.equal(mb.veilig(path.join(muziek, '..', 'geheim', 'geheim.mp3'), mappen), '', 'via .. naar buiten');
  assert.equal(mb.veilig(muziek, mappen), '', 'de map zelf is geen bestand');
  assert.equal(mb.veilig('', mappen), '');
  assert.equal(mb.veilig('/etc/passwd', []), '', 'zonder mappen mag niets');

  // Een map die met dezelfde letters begint is een andere map.
  const muziek2 = path.join(wortel, 'muziek-extra');
  fs.mkdirSync(muziek2, { recursive: true });
  fs.writeFileSync(path.join(muziek2, 'ander.mp3'), 'x');
  assert.equal(mb.veilig(path.join(muziek2, 'ander.mp3'), [muziek]), '', 'zustermap met dezelfde begintletters');

  // En een symbolische link naar buiten telt ook niet mee.
  const link = path.join(muziek, 'sluip.mp3');
  try {
    fs.symlinkSync(path.join(buiten, 'geheim.mp3'), link);
    assert.equal(mb.veilig(link, [muziek]), '', 'symbolische link naar buiten');
  } catch (e) {
    // Geen symlinks toegestaan op dit systeem: dan vervalt alleen deze controle.
  }
  fs.rmSync(wortel, { recursive: true, force: true });
});

test('het beoordelen van een bestand bij een liedje', () => {
  const lied = { titel: 'Het Dorp', artiest: 'Wim Sonneveld' };
  assert.equal(mb.beoordeel('/m/01 - Het Dorp.mp3', lied), 100);
  assert.equal(mb.beoordeel('/m/Het Dorp.mp3', { titel: 'Het Dorp' }), 100);
  assert.ok(mb.beoordeel('/m/Het Dorp (live).mp3', lied) > 60, 'met toevoeging tussen haakjes');
  assert.ok(mb.beoordeel('/m/Het Dorp van Wim Sonneveld.mp3', lied) >= 70, 'titel met artiest erachter');
  assert.ok(mb.beoordeel('/m/Wim Sonneveld/01 Het Dorp.mp3', lied) >= 100, 'artiest in de mapnaam');
  assert.equal(mb.beoordeel('/m/Ander Liedje.mp3', lied), 0);
  assert.equal(mb.beoordeel('/m/Het Dorp.mp3', { titel: '' }), 0);
  // Een veel te lange bestandsnaam met de titel erin is minder overtuigend.
  const lang = '/m/Het Dorp van Wim Sonneveld in de originele uitvoering van de televisieserie remaster 2019.mp3';
  assert.ok(mb.beoordeel(lang, lied) < mb.beoordeel('/m/Het Dorp.mp3', lied));
});

test('kandidaten staan op score en zonder dubbelen', () => {
  const lied = { titel: 'Het Dorp', artiest: 'Wim Sonneveld' };
  const uit = mb.kandidaten([
    '/m/Het Dorp van Wim Sonneveld.mp3',
    '/m/01 - Het Dorp.mp3',
    '/m/Ander Liedje.mp3',
    '/m/01 - Het Dorp.mp3',          // dubbel
    '/m/notities.txt',               // geen audio
  ], lied);
  assert.equal(uit.length, 2, 'kreeg: ' + JSON.stringify(uit.map(k => k.pad)));
  assert.equal(uit[0].pad, '/m/01 - Het Dorp.mp3');
  assert.equal(uit[0].score, 100);
  assert.equal(uit[0].titel, 'Het Dorp');
  assert.equal(mb.kandidaten(['/m/01 - Het Dorp.mp3'], lied, { max: 1 }).length, 1);
});

test('zoeken loopt de mappen langs en slaat rommel over', () => {
  const wortel = proefmap();
  const muziek = path.join(wortel, 'Muziek');
  fs.mkdirSync(path.join(muziek, 'Nederlands', 'Jo Erens'), { recursive: true });
  fs.mkdirSync(path.join(muziek, '.verborgen'), { recursive: true });
  fs.mkdirSync(path.join(muziek, 'akkoordkast-backup'), { recursive: true });

  fs.writeFileSync(path.join(muziek, '01 - Het Dorp.mp3'), 'x');
  fs.writeFileSync(path.join(muziek, 'Nederlands', 'Jo Erens', 'Sjeng en Marlies.m4a'), 'x');
  fs.writeFileSync(path.join(muziek, '.verborgen', 'Het Dorp (dubbel).mp3'), 'x');
  fs.writeFileSync(path.join(muziek, 'akkoordkast-backup', 'Het Dorp.mp3'), 'x');
  fs.writeFileSync(path.join(muziek, 'hoes.jpg'), 'x');

  const uit = mb.zoek([muziek], { titel: 'Het Dorp', artiest: 'Wim Sonneveld' });
  assert.equal(uit.kandidaten.length, 1, 'kreeg: ' + JSON.stringify(uit.kandidaten.map(k => k.pad)));
  assert.ok(uit.kandidaten[0].pad.endsWith('01 - Het Dorp.mp3'));
  assert.ok(uit.bekeken >= 3, 'te weinig bestanden bekeken: ' + uit.bekeken);

  const tweede = mb.zoek([muziek], { titel: 'Sjeng en Marlies', artiest: 'Jo Erens' });
  assert.equal(tweede.kandidaten.length, 1);
  assert.ok(tweede.kandidaten[0].pad.includes('Jo Erens'));

  // Een map die niet bestaat mag geen fout geven.
  assert.deepEqual(mb.zoek([path.join(wortel, 'bestaat-niet')], { titel: 'Het Dorp' }).kandidaten, []);
  fs.rmSync(wortel, { recursive: true, force: true });
});
