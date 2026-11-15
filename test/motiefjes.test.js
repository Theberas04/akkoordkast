'use strict';
// Nazingen & naspelen: het motiefje bedenken en beoordelen wat er terugkwam. Alles wat
// gerekend moet worden staat in lib/motiefjes.js — dezelfde rekenkunde voor de app (het
// motiefje voor-spelen en de microfoon) en deze proeven.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const motief = require('../lib/motiefjes');
const lees = (naam) => fs.readFileSync(path.join(__dirname, '..', naam), 'utf8');

test('dezelfde kiem geeft altijd hetzelfde motiefje', () => {
  const een = motief.motiefNoten({ toonsoort: 'C', aantal: 4, seed: 4242 });
  const twee = motief.motiefNoten({ toonsoort: 'C', aantal: 4, seed: 4242 });
  assert.deepEqual(een, twee);
  assert.equal(een.length, 4);
  const andereKiem = motief.motiefNoten({ toonsoort: 'C', aantal: 4, seed: 4243 });
  assert.notDeepEqual(een, andereKiem, 'een andere kiem hoort een ander motiefje te geven');
});

test('elk motiefje blijft binnen de ladder van zijn toonsoort — in elke kiem', () => {
  for (const toonsoort of ['C', 'D', 'E', 'G', 'A']) {
    const grond = motief.TOONSOORTEN[toonsoort];
    const ladder = motief.TRAPPEN.map((t) => grond + t);
    for (let kiem = 1; kiem <= 40; kiem++) {
      const noten = motief.motiefNoten({ toonsoort, aantal: 5, seed: kiem });
      assert.equal(noten.length, 5);
      noten.forEach((n) => {
        assert.ok(ladder.includes(n), 'noot ' + n + ' hoort bij ' + toonsoort + ' te horen');
      });
    }
  }
});

test('de lengte blijft binnen twee en zes noten', () => {
  assert.equal(motief.motiefNoten({ aantal: 1, seed: 7 }).length, 2);
  assert.equal(motief.motiefNoten({ aantal: 9, seed: 7 }).length, 6);
  assert.equal(motief.motiefNoten({ seed: 7 }).length, 4, 'zonder keuze: vier noten');
});

test('noten krijgen gewone namen en frequenties vinden de noot terug', () => {
  assert.equal(motief.naamVan(60), 'C4');
  assert.equal(motief.naamVan(64), 'E4');
  assert.equal(motief.naamVan(69), 'A4');
  assert.equal(motief.naamVan(55), 'G3');
  assert.equal(motief.midiVanFrequentie(440), 69);
  assert.equal(motief.midiVanFrequentie(261.63), 60);
  assert.equal(motief.midiVanFrequentie(659.26), 76);
  assert.equal(motief.midiVanFrequentie(0), null);
});

test('alles goed is goed, en een uitglijder kost één noot', () => {
  const doel = [60, 62, 64, 65];
  const perfect = motief.vergelijk(doel, [60, 62, 64, 65]);
  assert.equal(perfect.goed, 4);
  assert.equal(perfect.oordeel, 'goed');
  assert.ok(perfect.per.every((p) => p.goed));

  // De laatste noot twee tonen ernaast: die telt als fout (binnen één halve toon is goed).
  const bijna = motief.vergelijk(doel, [60, 62, 64, 67]);
  assert.equal(bijna.goed, 3);
  assert.equal(bijna.oordeel, 'bijna');
  assert.equal(bijna.per[3].goed, false);

  // Eén halve toon ernaast is geen fout: gitaarsnaren wiebelen altijd een beetje.
  const halve = motief.vergelijk([60, 62], [61, 63]);
  assert.equal(halve.goed, 2);
});

test('een verkeerde volgorde of ontbrekende noten zakken door', () => {
  const omgekeerd = motief.vergelijk([60, 62, 64], [64, 62, 60]);
  assert.ok(omgekeerd.goed <= 1, 'omgekeerd naspelen is geen goed antwoord');
  assert.equal(omgekeerd.oordeel, 'opnieuw');
  const niets = motief.vergelijk([60, 62, 64], []);
  assert.equal(niets.goed, 0);
  assert.equal(niets.oordeel, 'opnieuw');
  const leegdoel = motief.vergelijk([], [60]);
  assert.equal(leegdoel.oordeel, 'opnieuw');
});

test('een extra noot ertussen mag, als de volgorde maar klopt', () => {
  // Je raakt een snaar extra aan; de app mag daar niet meteen op stuklopen.
  const ruim = motief.vergelijk([60, 62, 64], [60, 60, 62, 64]);
  assert.equal(ruim.goed, 3, 'de drie doelnoten horen gevonden te worden');
});

test('een verre volgende poging dekt een fout niet toe', () => {
  // De vierde noot ging mis; de eerste noot van een tweede ronde (die een halve toon van het
  // doel af zit) mag die fout niet goedpraten — daarvoor zit er te veel tijd tussen.
  const doel = [64, 65, 67, 65];
  const gehoord = [
    { midi: 64, tijd: 0.0 }, { midi: 65, tijd: 1.0 }, { midi: 67, tijd: 2.0 }, { midi: 67, tijd: 3.0 },
    { midi: 64, tijd: 6.3 }, { midi: 65, tijd: 7.3 }
  ];
  const uitslag = motief.vergelijk(doel, gehoord);
  assert.equal(uitslag.goed, 3);
  assert.equal(uitslag.oordeel, 'bijna');
  assert.equal(uitslag.per[3].goed, false);
});

test('een extra aanslag binnen dezelfde frase mag wel overslagen worden', () => {
  const doel = [60, 62];
  const gehoord = [{ midi: 60, tijd: 0.0 }, { midi: 60, tijd: 0.4 }, { midi: 62, tijd: 0.9 }];
  assert.equal(motief.vergelijk(doel, gehoord).goed, 2);
  // En zonder tijden (los rekenwerk) blijft de oude, soepele regel gelden.
  assert.equal(motief.vergelijk([60, 62], [60, 60, 62]).goed, 2);
});

test('de rekenkunde werkt in node én in de browser', () => {
  const bron = lees('lib/motiefjes.js');
  assert.ok(bron.includes('module.exports'), 'hoort in node te werken (voor deze proeven)');
  assert.ok(bron.includes('root.motiefRekenen'), 'hoort zichzelf in de browser te zetten');
});

test('de kaart "Nazingen & naspelen" staat in het tabblad Leren met de juiste knoppen', () => {
  const html = lees('public/index.html');
  assert.ok(html.includes('id="motief-kaart"'), 'de kaart hoort te bestaan');
  assert.ok(html.includes('Nazingen') && html.includes('naspelen'), 'de kaart hoort gewone taal te spreken');
  assert.ok(html.includes('id="motief-toonsoort"'), 'de toonsoortkeuze');
  assert.ok(html.includes('id="motief-aantal"'), 'de lengtekeuze');
  assert.ok(html.includes('id="motief-nieuw"'), 'een nieuw motiefje');
  assert.ok(html.includes('id="motief-horen"'), 'laat horen');
  assert.ok(html.includes('id="motief-jij"'), 'nu jij');
  assert.ok(html.includes('id="motief-doel"'), 'waar het motiefje in beeld komt');
  assert.ok(html.includes('id="motief-uitslag"'), 'waar de uitslag per noot komt');
  assert.ok(html.includes('id="motief-melding"'), 'de meldingen');
  assert.ok(html.includes('function motiefNieuw('), 'het motiefje kiezen');
  assert.ok(html.includes('function motiefHoren('), 'het motiefje voor-spelen');
  assert.ok(html.includes('function motiefJij('), 'het luisteren');
  assert.ok(html.includes('function stopMotiefLuister('), 'en netjes stoppen');
  assert.ok(html.includes('<script src="/lib/motiefjes.js"></script>'), 'de rekenkunde hoort in de pagina geladen te worden');
});

test('de service worker en de offline-lijsten kennen het nieuwe rekenbestand', () => {
  const sw = lees('public/sw.js');
  assert.ok(sw.includes("'/lib/motiefjes.js'"), 'het rekenbestand hoort in de schil te zitten');
  assert.ok(!sw.includes("'akkoordkast-v100'"), 'de cacheversie hoort opgehoogd te zijn');
});
