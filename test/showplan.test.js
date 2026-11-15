'use strict';
// Showplan: het rekenwerk (schatting van speeltijden, kloktijden, de tijdlijn met praatjes) staat in
// lib/showplan.js — dezelfde rekenkunde voor de app (het tabblad Liedjes) en voor deze proeven.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const showplan = require('../lib/showplan');
const lees = (naam) => fs.readFileSync(path.join(__dirname, '..', naam), 'utf8');

test('de schatting telt de zingbare regels, niet de opdrachtregels', () => {
  assert.equal(showplan.regelsVan('{title: Liedje}\n\n/* commentaar */\nEen regel\n\nNog een regel'), 2);
  assert.equal(showplan.regelsVan('{soc}\nO warm land\n{title: X}\n{eoc}'), 1);
  assert.equal(showplan.regelsVan(''), 0);
  assert.equal(showplan.regelsVan('# alleen commentaar'), 0);
});

test('de schatting schaalt met het tempo en blijft binnen perken', () => {
  const tekst = Array.from({ length: 20 }, (_, i) => 'regel ' + i).join('\n');
  const langzaam = showplan.schatSeconden(tekst, 60);
  const snel = showplan.schatSeconden(tekst, 120);
  assert.ok(langzaam > snel, 'een lager tempo hoort een langere schatting te geven');
  // (20 × 4 + 6) maten op 60 BPM = 86 seconden → afgerond op vijven.
  assert.equal(langzaam, 85);
  // Op 120 BPM is dat 43 seconden → de ondergrens van 45 seconden.
  assert.equal(snel, 45);
  // Zonder tekst gaan we van een flinke schatting uit; die blijft binnen de grenzen.
  const zonder = showplan.schatSeconden('', 84);
  assert.ok(zonder >= 45 && zonder <= 480);
  const absurd = showplan.schatSeconden(Array.from({ length: 200 }, () => 'x').join('\n'), 40);
  assert.equal(absurd, 480, 'de schatting hoort afgetopt te worden');
});

test('kloktijden lezen en schrijven, ook over middernacht', () => {
  assert.equal(showplan.klokNaarSeconden('20:00'), 72000);
  assert.equal(showplan.klokNaarSeconden('0:05'), 300);
  assert.equal(showplan.klokNaarSeconden('24:00'), null);
  assert.equal(showplan.klokNaarSeconden('20:75'), null);
  assert.equal(showplan.klokNaarSeconden('vanavond'), null);
  assert.equal(showplan.secondenNaarKlok(72000), '20:00');
  assert.equal(showplan.secondenNaarKlok(72000 + 3 * 60 + 12), '20:03');
  assert.equal(showplan.secondenNaarKlok(86400 + 15 * 60), '0:15 (+1 dag)');
  assert.equal(showplan.minuutSeconde(192), '3:12');
  assert.equal(showplan.minuutSeconde(45), '0:45');
});

test('de tijdlijn zet de liedjes achter elkaar met het praatje ertussen', () => {
  const plan = showplan.maakTijdlijn([
    { id: 1, titel: 'Een', seconden: 180 },
    { id: 2, titel: 'Twee', seconden: 240 },
    { id: 3, titel: 'Drie', seconden: 60 }
  ], { startSeconden: showplan.klokNaarSeconden('20:00'), praatjeSeconden: 30 });
  assert.equal(plan.rijen[0].begintSeconden, 72000);
  assert.equal(plan.rijen[0].klaarSeconden, 72000 + 180);
  assert.equal(plan.rijen[1].begintSeconden, 72000 + 180 + 30);
  assert.equal(plan.rijen[2].begintSeconden, 72000 + 180 + 30 + 240 + 30);
  assert.equal(plan.eindSeconden, 72000 + 180 + 30 + 240 + 30 + 60);
  assert.equal(plan.gespeeldSeconden, 480);
  assert.equal(plan.totaalSeconden, 540, 'gespeeld plus twee praatjes');
  assert.equal(showplan.secondenNaarKlok(plan.eindSeconden), '20:09');
  const leeg = showplan.maakTijdlijn([], { startSeconden: 100, praatjeSeconden: 30 });
  assert.equal(leeg.totaalSeconden, 0);
  assert.equal(leeg.eindSeconden, 100);
  assert.equal(leeg.rijen.length, 0);
});

test('de showplankaart staat op het tabblad liedjes en gebruikt de gekozen setlist', () => {
  const html = lees('public/index.html');
  for (const id of ['showplan-kaart', 'showplan-maak', 'showplan-print', 'showplan-stand',
    'showplan-instellingen', 'showplan-start', 'showplan-praatje', 'showplan-slot',
    'showplan-inhoud', 'showplan-melding', 'showplan-totaal']) {
    assert.ok(html.includes('id="' + id + '"'), 'de pagina hoort ' + id + ' te hebben');
  }
  for (const fn of ['function laadShowplan(', 'function tekenShowplan(', 'function showplanHerreken(',
    'function showplanBewaar(', 'function showplanLees(', 'function printShowplan(']) {
    assert.ok(html.includes(fn), fn + ' hoort te bestaan');
  }
  assert.ok(html.includes('<script src="/lib/showplan.js"></script>'), 'de rekenkunde hoort in de pagina geladen te worden');
  assert.ok(lees('public/sw.js').includes("'/lib/showplan.js'"), 'het rekenbestand hoort in de schil te zitten');
  assert.ok(html.includes("'akkoordkast-showplan-'"), 'het plan hoort per setlist op dit toestel bewaard te worden');
  assert.ok(html.includes('laadShowplan()') && html.includes("laadShowplan();\n});"),
    'een andere setlist kiezen hoort het plan te verversen');
  assert.ok(html.includes('Showplan — '), 'het printvel hoort een eigen titel te hebben');
  // In het showplan-gedeelte zelf hoort niets rechtstreeks te fetchten: de api()-helper stuurt
  // profiel en app-merk mee (zie aanvragen.test.js), en de rest van de pagina heeft daar eigen
  // uitzonderingen voor die hier niet meegeteld horen te worden.
  const begin = html.indexOf('// ----------------------------------------------------------------- showplan ---');
  const eind = html.indexOf('// ---------------------------------------------------------------- laden ---', begin);
  const blok = html.slice(begin, eind);
  assert.ok(blok.length > 1000, 'het showplan-gedeelte hoort er te zijn');
  assert.ok(!/fetch\(/.test(blok), 'de showplan hoort via de api()-helper te werken (profiel en merk gaan automatisch mee)');
});
