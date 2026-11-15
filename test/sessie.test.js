'use strict';
// De slimme oefensessie: uit je oefencijfers en je liedjes stelt de app een sessie samen —
// even inkomen, iets dat je lang niet deed, een uitdaging en een afsluiter. Alle keuzes staan
// in lib/sessie.js, zodat ze hier met vaste invoer te controleren zijn.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sessie = require('../lib/sessie');
const lees = (naam) => fs.readFileSync(path.join(__dirname, '..', naam), 'utf8');

const NU = '2026-11-15T12:00:00.000Z';

function lied(id, titel, moeilijkheid, extra) {
  return Object.assign({ id, titel, moeilijkheid, favoriet: false, gespeeld: '' }, extra || {});
}

const VIJF = [
  lied(1, 'Aap', 1, { favoriet: true, gespeeld: '2026-10-01T10:00:00.000Z' }),
  lied(2, 'Beer', 2, { gespeeld: '2026-11-14T10:00:00.000Z' }),
  lied(3, 'Citroen', 3, { gespeeld: '2026-11-01T10:00:00.000Z' }),
  lied(4, 'Dolfijn', 4, {}),
  lied(5, 'Egel', 5, { gespeeld: '2026-10-20T10:00:00.000Z' })
];

test('de minutenverdeling per lengte: opwarmen, herhalen, uitdaging en afsluiter tellen op tot de sessie', () => {
  for (const minuten of [5, 8, 10, 15, 20, 30]) {
    const plan = sessie.stelSamen({ minuten, liedjes: VIJF, nu: NU });
    const som = plan.blokken.reduce((s, b) => s + b.minuten, 0);
    assert.equal(som, minuten, 'bij ' + minuten + ' minuten hoort de som te kloppen');
    assert.ok(plan.blokken.length >= 2, 'er horen minstens twee blokken te zijn');
    assert.equal(plan.totaal, minuten);
  }
  // Kort blijft kort: vijf minuten heeft geen afsluiter.
  const kort = sessie.stelSamen({ minuten: 5, liedjes: VIJF, nu: NU });
  assert.ok(kort.blokken.every((b) => b.soort !== 'afsluiter'), 'vijf minuten is te kort voor een afsluiter');
});

test('opwarmen pakt een favoriet die te doen is; zonder favorieten het makkelijkste liedje', () => {
  const metFav = sessie.stelSamen({ minuten: 15, liedjes: VIJF, nu: NU });
  assert.equal(metFav.blokken[0].soort, 'opwarmen');
  assert.equal(metFav.blokken[0].liedje.titel, 'Aap', 'de favoriet met moeilijkheid 1 hoort vooraan te staan');
  const zonder = sessie.stelSamen({ minuten: 15, liedjes: VIJF.map((l) => Object.assign({}, l, { favoriet: false })), nu: NU });
  assert.equal(zonder.blokken[0].liedje.titel, 'Aap', 'zonder favorieten is het makkelijkste liedje de warming-up');
});

test('herhalen pakt wat je het langst niet deed (na de warming-up)', () => {
  const plan = sessie.stelSamen({ minuten: 15, liedjes: VIJF, nu: NU });
  const herhaal = plan.blokken.find((b) => b.soort === 'herhalen');
  assert.equal(herhaal.liedje.titel, 'Egel', 'Egel is het langst niet gespeeld; Aap is al de warming-up');
});

test('de herhaling: de oudste uit je geschiedenis, of iets dat er nog niet in staat', () => {
  const plan = sessie.stelSamen({ minuten: 15, liedjes: VIJF, nu: NU });
  const herhaal = plan.blokken.find((b) => b.soort === 'herhalen');
  assert.equal(herhaal.liedje.titel, 'Egel');
  assert.match(herhaal.uitleg, /geleden/);
  // Zonder geschiedenis: een liedje zonder 'gespeeld' krijgt de uitleg dat het nieuw is.
  const kaal = VIJF.map((l) => Object.assign({}, l, { gespeeld: '' }));
  const plan2 = sessie.stelSamen({ minuten: 10, liedjes: kaal, nu: NU });
  const herhaal2 = plan2.blokken.find((b) => b.soort === 'herhalen');
  assert.match(herhaal2.uitleg, /nog niet recent gespeeld|nieuw voor jou/i);
});

test('de uitleg noemt hoe lang het geleden is in dagen en weken', () => {
  const liedjes = [lied(1, 'Aap', 1, { gespeeld: '2026-11-15T09:00:00.000Z' }),
    lied(2, 'Beer', 2, { gespeeld: '2026-11-01T10:00:00.000Z' }),
    lied(3, 'Citroen', 3, {})];
  const plan = sessie.stelSamen({ minuten: 10, liedjes, nu: NU });
  const herhaal = plan.blokken.find((b) => b.soort === 'herhalen');
  assert.equal(herhaal.liedje.titel, 'Beer');
  assert.match(herhaal.uitleg, /2 weken geleden/);
});

test('de uitdaging is een moeilijker liedje; zonder kandidaten gaat die tijd naar het herhalen', () => {
  const plan = sessie.stelSamen({ minuten: 15, liedjes: VIJF, nu: NU });
  const uit = plan.blokken.find((b) => b.soort === 'uitdaging');
  assert.ok(uit, 'met moeilijke liedjes hoort er een uitdaging te zijn');
  assert.equal(uit.liedje.titel, 'Dolfijn', 'nog niet gespeeld en moeilijk genoeg: precies een uitdaging');
  const makkelijk = VIJF.map((l) => Object.assign({}, l, { moeilijkheid: 1 }));
  const plan2 = sessie.stelSamen({ minuten: 15, liedjes: makkelijk, nu: NU });
  assert.ok(!plan2.blokken.some((b) => b.soort === 'uitdaging'), 'zonder moeilijke liedjes geen uitdagingsblok');
  assert.equal(plan2.blokken.reduce((s, b) => s + b.minuten, 0), 15, 'de minuten blijven wel kloppen');
});

test('de afsluiter speelt hetzelfde liedje als de herhaling, op tempo', () => {
  const plan = sessie.stelSamen({ minuten: 15, liedjes: VIJF, nu: NU });
  const herhaal = plan.blokken.find((b) => b.soort === 'herhalen');
  const slot = plan.blokken.find((b) => b.soort === 'afsluiter');
  assert.ok(slot, 'vijftien minuten heeft een afsluiter');
  assert.equal(slot.liedje.id, herhaal.liedje.id);
  assert.match(slot.uitleg, /nog één keer|op tempo/);
});

test('zonder liedjes is er geen plan, en te veel minuten wordt begrensd', () => {
  assert.deepEqual(sessie.stelSamen({ minuten: 15, liedjes: [], nu: NU }).blokken, []);
  const lang = sessie.stelSamen({ minuten: 999, liedjes: VIJF, nu: NU });
  assert.ok(lang.totaal <= 60, 'een sessie van meer dan een uur is geen sessie');
});

test('een week zonder oefening kleurt de opening, een goede week niet', () => {
  const stil = sessie.stelSamen({ minuten: 15, liedjes: VIJF, nu: NU, weken: [{ minuten: 0, sessies: 0 }, { minuten: 0, sessies: 0 }] });
  assert.match(stil.blokken[0].uitleg, /rustig/i);
  const actief = sessie.stelSamen({ minuten: 15, liedjes: VIJF, nu: NU, weken: [{ minuten: 40, sessies: 4 }, { minuten: 75, sessies: 5 }] });
  assert.ok(!/rustig/i.test(actief.blokken[0].uitleg), 'na een goede week hoeft de opening niet voorzichtig te zijn');
});

test('de blokken kiezen verschillende liedjes waar dat kan, en dezelfde alleen voor de afsluiter', () => {
  const plan = sessie.stelSamen({ minuten: 20, liedjes: VIJF, nu: NU });
  const ids = plan.blokken.filter((b) => b.soort !== 'afsluiter').map((b) => b.liedje.id);
  assert.equal(new Set(ids).size, ids.length, 'opwarmen, herhalen en uitdaging zijn verschillende liedjes');
});

test('de sessie-rekenkunde werkt in node én in de browser/de service worker', () => {
  const bron = lees('lib/sessie.js');
  assert.ok(bron.includes('module.exports'), 'hoort in node te werken (voor deze proeven)');
  assert.ok(bron.includes('root.sessieRekenen'), 'hoort zichzelf in de browser te zetten');
});

test('de Leren-pagina heeft de sessiekaart met de knoppen', () => {
  const html = lees('public/index.html');
  assert.ok(html.includes('id="sessie-kaart"'), 'de kaart hoort er te zijn');
  assert.ok(html.includes('id="sessie-minuten"'), 'de keuze van de lengte');
  assert.ok(html.includes('id="sessie-maak"'), 'de knop om samen te stellen');
  assert.ok(html.includes('id="sessie-plan"'), 'de plek voor het plan');
  assert.ok(html.includes('<script src="/lib/sessie.js"></script>'), 'de rekenkunde hoort in de pagina geladen te worden');
  assert.ok(html.includes('function maakSessie('), 'de hulp om samen te stellen hoort te bestaan');
});

test('de service worker neemt de sessie-rekenkunde mee in de schil', () => {
  const sw = lees('public/sw.js');
  assert.ok(sw.includes("'/lib/sessie.js'"), 'de schil hoort lib/sessie.js te bevatten');
  assert.ok(!sw.includes("'akkoordkast-v97'"), 'de cacheversie hoort opgehoogd te zijn');
});
