'use strict';
// Tests voor de akkoordovergangen in een setlist: welk advies krijg je per paar
// opeenvolgende liedjes, en klopt dat met de theorie erachter.
const test = require('node:test');
const assert = require('node:assert');
const hulp = require('./hulp');
const overgangen = require('../lib/overgangen');

test('twee liedjes in dezelfde toonsoort: je kunt zo doorgaan', () => {
  const uit = overgangen.overgang(
    { titel: 'Amazing Grace', toonsoort: 'G', akkoorden: ['G', 'C', 'D7'] },
    { titel: 'Stille nacht', toonsoort: 'G', akkoorden: ['G', 'C', 'D7'] }
  );
  assert.equal(uit.stappen, 0);
  assert.equal(uit.verandert, false);
  assert.match(uit.advies, /Beide liedjes staan in G/);
  assert.deepEqual(uit.gemeenschappelijk, ['G', 'C', 'D7']);
});

test('een andere toonsoort wordt omgerekend naar die van het liedje ervoor', () => {
  const uit = overgangen.overgang(
    { titel: 'Eerste', toonsoort: 'G', akkoorden: ['G', 'C', 'D7', 'Em'] },
    { titel: 'Tweede', toonsoort: 'D', akkoorden: ['D', 'G', 'A7'] }
  );
  assert.equal(uit.toonsoort, 'G', 'het tweede liedje komt in de toonsoort van het eerste');
  assert.equal(uit.stappen, 5, 'D naar G is vijf halve tonen omhoog');
  assert.equal(uit.capo, 5, 'of capo 5 en dezelfde grepen');
  assert.ok(uit.gemeenschappelijk.length >= 1);
  assert.match(uit.advies, /capo 5/);
});

test('zonder gemeenschappelijke akkoorden krijg je een bruggetje of stilte als advies', () => {
  const uit = overgangen.overgang(
    { titel: 'Eerste', toonsoort: 'G', akkoorden: ['G', 'C', 'D7'] },
    { titel: 'Tweede', toonsoort: 'F', akkoorden: ['Fm'] }
  );
  assert.deepEqual(uit.gemeenschappelijk, []);
  assert.match(uit.advies, /geen akkoord gemeen/);
  assert.match(uit.advies, /bruggetje|vier tellen stilte/);
});

test('zonder akkoorden zegt de app eerlijk dat ze niets kan zeggen', () => {
  const uit = overgangen.overgang({ titel: 'Eerste', toonsoort: 'G', akkoorden: [] }, { titel: 'Tweede', toonsoort: 'C', akkoorden: ['C'] });
  assert.match(uit.advies, /ken ik geen akkoorden/);
  assert.equal(uit.stappen, 0);
});

test('een hele setlist langs: elk paar opeenvolgende liedjes', () => {
  const liedjes = [
    { titel: 'Een', toonsoort: 'G', akkoorden: ['G', 'C', 'D7'] },
    { titel: 'Twee', toonsoort: 'G', akkoorden: ['G', 'D7'] },
    { titel: 'Drie', toonsoort: 'C', akkoorden: ['C', 'F', 'G7'] }
  ];
  const uit = overgangen.overgangenVan(liedjes);
  assert.equal(uit.length, 2);
  assert.equal(uit[0].van.titel, 'Een');
  assert.equal(uit[0].naar.titel, 'Twee');
  assert.equal(uit[1].van.titel, 'Twee');
  assert.equal(uit[1].naar.titel, 'Drie');
  assert.equal(overgangen.overgangenVan([{ titel: 'Alleen', toonsoort: 'G', akkoorden: ['G'] }]).length, 0);
});

test('via de app: de overgangen van een echte setlist', async () => {
  const omgeving = await hulp.start();
  try {
    const lijst = await hulp.haal(omgeving.basis, '/api/liedjes?compact=1&aantal=4');
    const ids = lijst.data.liedjes.slice(0, 3).map(l => l.id);
    assert.ok(ids.length === 3, 'drie liedjes nodig');

    const nieuw = await hulp.post(omgeving.basis, '/api/setlists', { naam: 'Testovergangen' });
    const setlistId = nieuw.data.setlist.id;
    for (const id of ids) {
      const bij = await hulp.post(omgeving.basis, '/api/setlists/' + setlistId + '/liedjes', { liedje: id, actie: 'bij' });
      assert.equal(bij.status, 200, JSON.stringify(bij.data));
    }

    const uit = await hulp.haal(omgeving.basis, '/api/setlists/' + setlistId + '/overgangen');
    assert.equal(uit.status, 200, JSON.stringify(uit.data));
    assert.equal(uit.data.setlist, 'Testovergangen');
    assert.equal(uit.data.overgangen.length, 2, 'drie liedjes geven twee overgangen');
    for (const o of uit.data.overgangen) {
      assert.ok(o.van.titel && o.naar.titel);
      assert.ok(typeof o.advies === 'string' && o.advies.length > 20, 'een echt advies: ' + o.advies);
    }

    const bestaatNiet = await hulp.haal(omgeving.basis, '/api/setlists/99999/overgangen');
    assert.equal(bestaatNiet.status, 404);
  } finally {
    await omgeving.stop();
  }
});
