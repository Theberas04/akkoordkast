'use strict';
// De beheerder haalt liedjes weg en beheert de filters: talen en genres toevoegen, weghalen en
// liedjes eraan koppelen. Alles wat iets verandert hoort achter het beheerderswachtwoord te zitten.
const test = require('node:test');
const assert = require('node:assert');
const hulp = require('./hulp');

test('de beheerder haalt een eigen liedje echt weg en verbergt een meegeleverd liedje', async () => {
  const omgeving = await hulp.start();
  try {
    const baas = await hulp.alsBeheerder(omgeving.basis);

    // Een eigen liedje maken en weer weghalen.
    const nieuw = await baas.post('/api/liedjes', { titel: 'Wegwerpbaar proefliedje', chordpro: '[C]Test [G]liedje' });
    assert.equal(nieuw.status, 201);
    const id = nieuw.data.id;
    assert.ok(id >= 900000, 'een eigen liedje hoort een eigen id te hebben');
    assert.equal((await baas.haal('/api/liedjes?zoek=Wegwerpbaar')).data.totaal, 1);

    const weg = await baas.post('/api/beheer/liedje/weg', { id });
    assert.equal(weg.status, 200);
    assert.equal(weg.data.weggehaald, 'verwijderd');
    assert.equal((await baas.haal('/api/liedjes?zoek=Wegwerpbaar')).data.totaal, 0, 'het liedje hoort weg te zijn');

    // Een meegeleverd liedje: dat verbergen we, want het zit in de bestanden van de app.
    const eerste = (await haalEerste(omgeving.basis)).id;
    const verberg = await baas.post('/api/beheer/liedje/weg', { id: eerste });
    assert.equal(verberg.status, 200);
    assert.equal(verberg.data.weggehaald, 'verborgen');

    const lijst = await hulp.haal(omgeving.basis, '/api/liedjes?compact=1&aantal=200');
    assert.ok(!lijst.data.liedjes.some(l => l.id === eerste), 'een verborgen liedje hoort niet in de lijst');

    // En de beheerder ziet hem in zijn eigen lijst met verborgen liedjes.
    const verborgen = await baas.haal('/api/beheer/liedjes?verborgen=1&aantal=50');
    assert.equal(verborgen.status, 200);
    assert.ok(verborgen.data.liedjes.some(l => l.id === eerste), 'het verborgen liedje hoort in deze lijst');
    assert.equal(verborgen.data.liedjes[0].verborgen, true);

    // Terugzetten.
    const terug = await baas.post('/api/beheer/liedje/terug', { id: eerste });
    assert.equal(terug.status, 200);
    const weer = await hulp.haal(omgeving.basis, '/api/liedjes?compact=1&aantal=200');
    assert.ok(weer.data.liedjes.some(l => l.id === eerste), 'het liedje hoort weer terug te zijn');
  } finally {
    await omgeving.stop();
  }
});

test('een eigen taal toevoegen, liedjes eraan koppelen en weer losmaken', async () => {
  const omgeving = await hulp.start();
  try {
    const baas = await hulp.alsBeheerder(omgeving.basis);

    // Zonder inloggen mag niemand dit.
    const zonder = await hulp.post(omgeving.basis, '/api/beheer/filters', { soort: 'genre', waarde: 'Stiekem' });
    assert.equal(zonder.status, 403);
    assert.match(zonder.data.fout, /beheerder/i);

    // Een nieuw genre toevoegen zonder dat er al een liedje bij hoort.
    const toe = await baas.post('/api/beheer/filters', { soort: 'genre', waarde: 'Proefgenre' });
    assert.equal(toe.status, 201);
    assert.equal(toe.data.waarde, 'Proefgenre');
    const overzicht = await baas.haal('/api/beheer/filters');
    const proef = overzicht.data.filters.genre.find(g => g.waarde === 'Proefgenre');
    assert.ok(proef, 'het nieuwe genre hoort in de lijst te staan');
    assert.equal(proef.aantal, 0);
    assert.equal(proef.eigen, true);

    // Het genre staat meteen in de filters die de app aan de gewone gebruiker laat zien.
    const stats = await hulp.haal(omgeving.basis, '/api/liedjes?compact=1&aantal=1');
    assert.ok(Object.prototype.hasOwnProperty.call(stats.data.statistieken.genres, 'Proefgenre'),
      'een eigen genre hoort in de keuzelijst te staan, ook met nul liedjes');

    // Twee liedjes aan dat genre koppelen.
    const twee = (await hulp.haal(omgeving.basis, '/api/liedjes?compact=1&aantal=2')).data.liedjes.map(l => l.id);
    const koppel = await baas.post('/api/beheer/filters/koppel', { soort: 'genre', waarde: 'Proefgenre', ids: twee });
    assert.equal(koppel.status, 200);
    assert.equal(koppel.data.aantal, 2);

    // De koppeling is te zien in de gewone app: het liedje staat er onder dat genre, en filteren
    // op dat genre geeft precies die liedjes.
    const gefilterd = await hulp.haal(omgeving.basis, '/api/liedjes?compact=1&genre=proefgenre');
    assert.equal(gefilterd.data.totaal, 2, 'filteren op het eigen genre hoort de gekoppelde liedjes te geven');
    assert.ok(gefilterd.data.liedjes.every(l => l.genre === 'Proefgenre'));

    const detail = await hulp.haal(omgeving.basis, '/api/liedjes/' + twee[0]);
    assert.equal(detail.status, 200);

    // En de telling in de keuzelijst loopt mee.
    const stats2 = await hulp.haal(omgeving.basis, '/api/liedjes?compact=1&aantal=1');
    assert.equal(stats2.data.statistieken.genres['Proefgenre'], 2);

    // Losmaken: het liedje valt terug op het genre dat het zelf had.
    const los = await baas.post('/api/beheer/filters/los', { soort: 'genre', waarde: 'Proefgenre', ids: [twee[0]] });
    assert.equal(los.status, 200);
    const naLos = await hulp.haal(omgeving.basis, '/api/liedjes?compact=1&genre=proefgenre');
    assert.equal(naLos.data.totaal, 1);

    // Het genre weghalen haalt ook de koppelingen weg.
    const weg = await baas.post('/api/beheer/filters/weg', { soort: 'genre', waarde: 'Proefgenre' });
    assert.equal(weg.status, 200);
    const naWeg = await baas.haal('/api/beheer/filters');
    assert.ok(!naWeg.data.filters.genre.some(g => g.waarde === 'Proefgenre'), 'het genre hoort weg te zijn');
    const stats3 = await hulp.haal(omgeving.basis, '/api/liedjes?compact=1&aantal=1');
    assert.ok(!Object.prototype.hasOwnProperty.call(stats3.data.statistieken.genres, 'Proefgenre'));
  } finally {
    await omgeving.stop();
  }
});

test('een eigen taal koppelen werkt hetzelfde, en de app weigert onzin', async () => {
  const omgeving = await hulp.start();
  try {
    const baas = await hulp.alsBeheerder(omgeving.basis);

    const toe = await baas.post('/api/beheer/filters', { soort: 'taal', waarde: 'Frysk' });
    assert.equal(toe.status, 201);
    const liedje = (await hulp.haal(omgeving.basis, '/api/liedjes?compact=1&aantal=1')).data.liedjes[0].id;
    assert.equal((await baas.post('/api/beheer/filters/koppel', { soort: 'taal', waarde: 'Frysk', ids: [liedje] })).status, 200);
    const frysk = await hulp.haal(omgeving.basis, '/api/liedjes?compact=1&taal=frysk');
    assert.equal(frysk.data.totaal, 1);
    assert.equal(frysk.data.liedjes[0].taal, 'Frysk');

    // Onzin wordt netjes geweigerd, met een Nederlandse uitleg.
    const onzin = [
      [{ soort: 'kleur', waarde: 'Blauw' }, /taal of een genre/i],
      [{ soort: 'genre', waarde: '   ' }, /Vul een naam/i],
      [{ soort: 'genre', waarde: '<script>' }, /vreemde tekens/i]
    ];
    for (const [lichaam, verwacht] of onzin) {
      const uit = await baas.post('/api/beheer/filters', lichaam);
      assert.equal(uit.status, 400, JSON.stringify(lichaam));
      assert.match(uit.data.fout, verwacht);
    }
    // Een lange naam wordt gewoon afgekapt in plaats van geweigerd.
    const lang = await baas.post('/api/beheer/filters', { soort: 'genre', waarde: 'a'.repeat(80) });
    assert.equal(lang.status, 201);
    assert.ok(lang.data.waarde.length <= 40);

    // Koppelen zonder liedjes of zonder filter geeft uitleg in plaats van een fout stapel.
    assert.equal((await baas.post('/api/beheer/filters/koppel', { soort: 'taal', waarde: 'Frysk', ids: [] })).status, 400);
    assert.equal((await baas.post('/api/beheer/filters/koppel', { soort: 'taal', waarde: '', ids: [1] })).status, 400);
  } finally {
    await omgeving.stop();
  }
});

async function haalEerste(basis) {
  return (await hulp.haal(basis, '/api/liedjes?compact=1&aantal=1')).data.liedjes[0];
}
