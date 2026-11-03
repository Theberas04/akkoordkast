'use strict';
// Tests voor het oefenen per week: de weekberekening (ISO-weken) en het overzicht dat de
// app laat zien.
const test = require('node:test');
const assert = require('node:assert');
const hulp = require('./hulp');
const week = require('../lib/week');

test('de week van een dag klopt met de ISO-kalender', () => {
  // Deze waarden komen uit de systeemkalender (date +%V), dus niet uit de eigen rekenkunde.
  const gevallen = [
    ['2026-01-01', '2026-W01'],
    ['2026-01-04', '2026-W01'],
    ['2026-01-05', '2026-W02'],
    ['2026-11-03', '2026-W45'],
    ['2026-11-09', '2026-W46'],
    ['2025-12-29', '2026-W01'],   // hoort bij de eerste week van 2026
    ['2027-01-01', '2026-W53']    // valt nog in de laatste week van 2026
  ];
  for (const [dag, verwacht] of gevallen) {
    assert.equal(week.weekSleutel(week.datumVan(dag)), verwacht, dag);
  }
});

test('maandag hoort bij de week die begint, zondag bij de maandag ervoor', () => {
  assert.equal(week.maandagVanWeek('2026-W45'), '2026-11-02');
  assert.equal(week.weekSleutel(week.datumVan('2026-11-08')), '2026-W45', 'zondag 8 november hoort nog bij week 45');
  assert.equal(week.weekSleutel(week.datumVan('2026-11-09')), '2026-W46');
  const vier = week.laatsteWeken(4, new Date('2026-11-03T12:00:00Z'));
  assert.deepEqual(vier, ['2026-W42', '2026-W43', '2026-W44', '2026-W45']);
  assert.equal(week.weekLabel('2026-W45'), 'week 45 van 2026');
});

test('sessies worden per week opgeteld, ook de weken zonder oefening', () => {
  const sessies = [
    { moment: '2026-11-03T19:00:00.000Z', seconden: 300, wissels: 12, akkoorden: 'G C' },
    { moment: '2026-11-03T19:30:00.000Z', seconden: 600, wissels: 8, akkoorden: 'G D7' },
    { moment: '2026-11-02T10:00:00.000Z', seconden: 120, wissels: 4, akkoorden: 'C' },
    { moment: '2026-10-27T10:00:00.000Z', seconden: 60, wissels: 1, akkoorden: 'Am' },
    { moment: 'onzin', seconden: 9999, wissels: 0, akkoorden: 'X' }
  ];
  const uit = week.groepeerPerWeek(sessies, 4, new Date('2026-11-03T12:00:00Z'));
  assert.equal(uit.length, 4);
  assert.deepEqual(uit.map(w => w.week), ['2026-W42', '2026-W43', '2026-W44', '2026-W45']);

  const laatste = uit[3];
  assert.equal(laatste.week, '2026-W45');
  assert.equal(laatste.sessies, 3, 'drie sessies in week 45');
  assert.equal(laatste.seconden, 1020);
  assert.equal(laatste.minuten, 17);
  assert.equal(laatste.wissels, 24);
  assert.deepEqual(laatste.akkoorden, [{ akkoord: 'C', keer: 2 }, { akkoord: 'G', keer: 2 }, { akkoord: 'D7', keer: 1 }]);
  assert.equal(laatste.maandag, '2026-11-02');

  const week44 = uit[2];
  assert.equal(week44.week, '2026-W44');
  assert.equal(week44.minuten, 1, 'de sessie van 27 oktober valt in week 44 (die begint op 26 oktober)');
  const week43 = uit[1];
  assert.equal(week43.sessies, 0, 'een week zonder oefening staat er wel in');
  assert.equal(week43.minuten, 0);
  assert.deepEqual(week43.akkoorden, []);
});

test('via de app: het weekoverzicht met echte oefensessies', async () => {
  const omgeving = await hulp.start();
  try {
    const leeg = await hulp.haal(omgeving.basis, '/api/oefenen/weken?weken=4');
    assert.equal(leeg.status, 200, JSON.stringify(leeg.data));
    assert.equal(leeg.data.weken.length, 4);
    assert.ok(leeg.data.weken.every(w => w.sessies === 0), 'nog niets geoefend');

    const nu = new Date().toISOString();
    const gezet = await hulp.post(omgeving.basis, '/api/oefenen', {
      soort: 'trainer', seconden: 420, wissels: 15, akkoorden: ['G', 'C', 'D7']
    });
    assert.equal(gezet.status, 201, JSON.stringify(gezet.data));

    const uit = await hulp.haal(omgeving.basis, '/api/oefenen/weken?weken=4');
    const deze = uit.data.weken[uit.data.weken.length - 1];
    assert.equal(deze.sessies, 1);
    assert.equal(deze.minuten, 7);
    assert.deepEqual(deze.akkoorden, [{ akkoord: 'C', keer: 1 }, { akkoord: 'D7', keer: 1 }, { akkoord: 'G', keer: 1 }]);
  } finally {
    await omgeving.stop();
  }
});
