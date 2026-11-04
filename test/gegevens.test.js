'use strict';
// De gegevens van een liedje aanpassen: titel, zanger, taal, genre, toonaard, tempo, maatsoort,
// slagpatroon, YouTube en notitie. Een eigen liedje wordt bijgewerkt; een meegeleverd liedje zit in
// de bestanden van de app, dus daarvan maakt de app een eigen kopie met de nieuwe gegevens.
const test = require('node:test');
const assert = require('node:assert');
const hulp = require('./hulp');

test('een meegeleverd liedje aanpassen levert een eigen kopie met de nieuwe gegevens', async () => {
  const omgeving = await hulp.start();
  try {
    const baas = await hulp.alsBeheerder(omgeving.basis, 'proefwachtwoord-gegevens');
    const voor = await baas.haal('/api/liedjes/1');
    const oud = voor.data.liedje || voor.data;

    const nieuw = {
      titel: 'Mijn eigen titel', artiest: 'Mijn eigen zanger', taal: 'nl', genre: 'Eigen keuze',
      toonsoort: 'G', tempo: 123, maatsoort: 3, moeilijkheid: 4, strum: 'D DU UDU',
      youtube: 'dQw4w9WgXcQ', notitie: 'even nagekeken'
    };
    const uit = await baas.haal('/api/liedjes/1/gegevens', {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(nieuw)
    });
    assert.equal(uit.status, 200, JSON.stringify(uit.data));
    assert.equal(uit.data.kopie, true, 'een meegeleverd liedje hoort een kopie op te leveren');
    assert.ok(uit.data.id >= 900000, 'de kopie is een eigen liedje: ' + uit.data.id);

    const kaart = await baas.haal('/api/liedjes/' + uit.data.id);
    const l = kaart.data.liedje || kaart.data;
    assert.equal(l.titel, 'Mijn eigen titel');
    assert.equal(l.artiest, 'Mijn eigen zanger');
    assert.equal(l.genre, 'Eigen keuze');
    assert.equal(l.toonsoort, 'G');
    assert.equal(l.tempo, 123);
    assert.equal(l.maatsoort, 3);
    assert.equal(l.moeilijkheid, 4);
    assert.equal(l.notitie, 'even nagekeken');
    assert.equal(l.eigen, true, 'de kopie is een eigen liedje');

    // Het origineel is niet veranderd.
    const nog = await baas.haal('/api/liedjes/1');
    const origineel = nog.data.liedje || nog.data;
    assert.equal(origineel.titel, oud.titel, 'het meegeleverde liedje hoort ongemoeid te blijven');
    assert.notEqual(origineel.titel, 'Mijn eigen titel');

    // En de kopie zelf nog eens aanpassen werkt zonder nieuwe kopie.
    const tweede = await baas.haal('/api/liedjes/' + uit.data.id + '/gegevens', {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(Object.assign({}, nieuw, { titel: 'Nog een keer anders', artiest: 'Andere zanger' }))
    });
    assert.equal(tweede.status, 200, JSON.stringify(tweede.data));
    assert.equal(tweede.data.kopie, false, 'een eigen liedje wordt bijgewerkt, niet gekopieerd');
    assert.equal(tweede.data.id, uit.data.id);
    const kaart2 = await baas.haal('/api/liedjes/' + uit.data.id);
    const l2 = kaart2.data.liedje || kaart2.data;
    assert.equal(l2.titel, 'Nog een keer anders');
    assert.equal(l2.artiest, 'Andere zanger');
  } finally {
    await omgeving.stop();
  }
});

test('gegevens aanpassen hoort bij de beheerder, en een lege titel wordt geweigerd', async () => {
  const omgeving = await hulp.start();
  try {
    // Zonder beheerderssessie: geen toegang.
    const zonder = await hulp.haal(omgeving.basis + '/api/liedjes/1/gegevens', {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ titel: 'Stiekem', artiest: 'x' })
    });
    // De app laat beheerroutes helemaal niet zien zonder beheerderssessie (403 of een kale 404).
    assert.ok([403, 404].includes(zonder.status),
      'zonder beheerder hoort dit niet te kunnen: ' + zonder.status + ' ' + JSON.stringify(zonder.data));

    const baas = await hulp.alsBeheerder(omgeving.basis, 'proefwachtwoord-gegevens-2');
    const leeg = await baas.haal('/api/liedjes/1/gegevens', {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ titel: '   ', artiest: 'x' })
    });
    assert.equal(leeg.status, 400, 'een lege titel hoort te worden geweigerd');

    const onzin = await baas.haal('/api/liedjes/999999/gegevens', {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ titel: 'Bestaat niet', artiest: 'x' })
    });
    assert.equal(onzin.status, 404);
  } finally {
    await omgeving.stop();
  }
});
