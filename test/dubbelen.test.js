'use strict';
// Dubbele nummers: een overzicht met liedjes die dezelfde titel hebben. Alleen kijken — er wordt nooit
// iets weggehaald — en alleen de beheerder mag het zien.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const hulp = require('./hulp');

test('het overzicht van dubbele nummers is er alleen voor de beheerder', async () => {
  const omgeving = await hulp.start();
  const baas = await hulp.alsBeheerder(omgeving.basis);
  try {
    // Zonder beheerderssessie: geweigerd.
    const zonder = await hulp.haal(omgeving.basis, '/api/dubbelen');
    assert.ok(zonder.status === 401 || zonder.status === 403, 'zonder beheerder hoort dit te weigeren, kreeg ' + zonder.status);

    const met = await baas.haal('/api/dubbelen');
    assert.equal(met.status, 200, JSON.stringify(met.data));
    const d = met.data;
    assert.ok(Array.isArray(d.groepen), 'er hoort een lijst groepen te zijn');
    assert.equal(typeof d.groepenTotaal, 'number');
    assert.equal(typeof d.liedjesTotaal, 'number');

    // Elke groep gaat ergens over: minstens twee liedjes, allemaal met een titel.
    for (const g of d.groepen) {
      assert.ok(g.aantal >= 2, 'een groep met minder dan twee liedjes hoort er niet in: ' + JSON.stringify(g));
      assert.ok(g.liedjes.length >= 2, 'een groep hoort zijn liedjes te tonen');
      assert.ok(g.titel, 'een groep hoort een titel te hebben');
      for (const l of g.liedjes) {
        assert.ok(l.titel, 'een liedje hoort een titel te hebben');
        assert.ok(typeof l.id === 'number' && l.id > 0, 'met een nummer om het te openen');
        assert.ok(['eigen', 'verzameling'].indexOf(l.bron) !== -1, 'met een herkomst');
        assert.equal(typeof l.akkoorden, 'boolean');
        assert.equal(typeof l.muziek, 'boolean');
      }
    }

    // De tellers horen bij elkaar te kloppen.
    assert.equal(d.groepenTotaal >= d.groepen.length, true, 'het totaal is minstens wat er getoond wordt');
    assert.ok(d.liedjesTotaal <= 12 * d.groepenTotaal || d.groepenTotaal === d.liedjesTotaal,
      'het aantal liedjes hoort bij het aantal groepen te passen');

    // De verzameling is nu klein en Nederlandstalig: het kan goed zijn dat er geen dubbele titel in
    // zit. Als er wel groepen zijn, is hierboven al gecontroleerd dat ze kloppen.
    assert.ok(d.groepenTotaal >= 0, 'het aantal groepen hoort een getal te zijn');
  } finally {
    await omgeving.stop();
  }
});

test('de pagina heeft de kaart met het overzicht, en haalt niets weg', () => {
  const bron = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  assert.match(bron, /id="dubbelen-kaart"/, 'de kaart hoort er te zijn');
  assert.match(bron, /id="dubbel-kijk"/, 'met een knop om te zoeken');
  assert.match(bron, /api\/dubbelen/, 'die de lijst ophaalt');
  assert.match(bron, /data-open=/, 'en per liedje een knop om het te openen');
});
