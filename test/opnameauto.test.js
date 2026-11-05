'use strict';
// De app vult de bladmuziek zelf aan: zonder dat er ook maar iemand op een knop drukt haalt hij de
// akkoorden uit een opname die bij een liedje staat. Deze proef zet zo'n liedje neer en wacht rustig
// tot de app het zelf gedaan heeft.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const hulp = require('./hulp');
const proefsignaal = require('./proefsignaal');

test('de app haalt de akkoorden zelf uit de muziek, zonder dat je iets aanklikt', async () => {
  // In deze proef doen we het juist wél vanzelf, en snel (in het echt is het één liedje per kwartier).
  delete process.env.OPNAME_AUTO_UIT;
  process.env.OPNAME_AUTO_MS = '400';

  const omgeving = await hulp.start();
  try {
    const baas = await hulp.alsBeheerder(omgeving.basis);
    const maak = await baas.haal('/api/liedjes', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        titel: 'Vanzelfnummer', artiest: 'Proefzanger',
        chordpro: '{title: Vanzelfnummer}\n\nregel een van de tekst\nregel twee van de tekst'
      })
    });
    assert.ok([200, 201].includes(maak.status), 'liedje maken lukte niet: ' + maak.status);
    const id = maak.data.id;

    // De opname erbij zetten, zoals de upload dat doet.
    const wav = proefsignaal.naarWav(proefsignaal.akkoordProef(['C', 'G', 'Am', 'F'], 84, 22050), 22050);
    const bestand = path.join(process.env.MEDIA_DIR, 'vanzelfnummer.wav');
    fs.writeFileSync(bestand, wav);
    omgeving.app.db.prepare('INSERT INTO liedje_muziek (liedje_id, pad, titel, wanneer) VALUES (?,?,?,?)')
      .run(Number(id) - omgeving.app.paden.EIGEN_START, bestand, 'Vanzelfnummer', new Date().toISOString());

    // De app vertelt eerlijk welk gereedschap er op deze machine staat.
    const gereedschap = await hulp.haal(omgeving.basis, '/api/gereedschap');
    assert.equal(gereedschap.status, 200, 'de stand van het gereedschap hoort op te vragen zijn');
    assert.equal(typeof gereedschap.data.ffmpeg, 'boolean');
    assert.ok(gereedschap.data.opname, 'de stand van het zelf aanvullen hoort erbij te zitten');

    // En dan gewoon wachten: geen knop, geen opdracht.
    let bron = '';
    for (let i = 0; i < 80 && bron !== 'opname'; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const kaart = await hulp.haal(omgeving.basis, '/api/liedjes/' + id);
      bron = kaart.data.akkoordenBron;
    }
    assert.equal(bron, 'opname', 'de app hoort dit vanzelf te doen, maar de kaart zegt: ' + bron);

    const kaart = await hulp.haal(omgeving.basis, '/api/liedjes/' + id);
    assert.ok((kaart.data.akkoorden || []).length >= 2, 'er horen echte akkoorden te staan');
    assert.ok((kaart.data.akkoorden || []).every((a) => a.heeftDiagram),
      'elke greep hoort tekenbaar te zijn: ' + JSON.stringify(kaart.data.akkoorden));

    // De stand laat zien dat hij bezig is geweest.
    const stand = await hulp.haal(omgeving.basis, '/api/gereedschap');
    assert.ok(stand.data.opname.geprobeerd >= 1, 'de stand hoort te laten zien dat hij gedaan heeft: ' +
      JSON.stringify(stand.data.opname));
  } finally {
    await omgeving.stop();
  }
});

test('de beheerder kan het zelf aanvullen uitzetten, en dan blijft het stil', async () => {
  delete process.env.OPNAME_AUTO_UIT;
  process.env.OPNAME_AUTO_MS = '300';

  const omgeving = await hulp.start();
  try {
    const baas = await hulp.alsBeheerder(omgeving.basis);

    // Zonder beheerder mag dit niet.
    const gewoon = await hulp.post(omgeving.basis, '/api/opname-auto', { aan: false });
    assert.equal(gewoon.status, 403, 'zonder beheerder hoort de app te weigeren');

    const uit = await baas.haal('/api/opname-auto', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ aan: false })
    });
    assert.equal(uit.status, 200);
    assert.equal(uit.data.aan, false);

    const stand = await hulp.haal(omgeving.basis, '/api/gereedschap');
    assert.equal(stand.data.opname.auto, false, 'de stand hoort te zeggen dat het uit staat');
  } finally {
    await omgeving.stop();
  }
});

test('de app vindt de muziek ook als de rij onder het grote nummer bewaard is', async () => {
  // Dit is precies de situatie in de verzameling van de gebruiker: het liedje staat in de database
  // onder een klein nummer (145), maar de muziekrij staat onder het nummer dat de app laat zien
  // (900145). Eerst zei de app daardoor onterecht 'er is niets te doen'.
  delete process.env.OPNAME_AUTO_UIT;
  process.env.OPNAME_AUTO_MS = '400';

  const omgeving = await hulp.start();
  try {
    const baas = await hulp.alsBeheerder(omgeving.basis);
    const maak = await baas.haal('/api/liedjes', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        titel: 'Groot nummer', artiest: 'Proefzanger',
        chordpro: '{title: Groot nummer}\n\nregel een van de tekst\nregel twee van de tekst'
      })
    });
    assert.ok([200, 201].includes(maak.status));
    const id = maak.data.id;

    const wav = proefsignaal.naarWav(proefsignaal.akkoordProef(['C', 'G', 'Am', 'F'], 84, 22050), 22050);
    const bestand = path.join(process.env.MEDIA_DIR, 'groot-nummer.wav');
    fs.writeFileSync(bestand, wav);
    // Bewust onder het GROTE nummer, zoals bij de gebruiker.
    omgeving.app.db.prepare('INSERT INTO liedje_muziek (liedje_id, pad, titel, wanneer) VALUES (?,?,?,?)')
      .run(Number(id), bestand, 'Groot nummer', new Date().toISOString());

    // De muziek hoort gevonden te worden, ook al staat de rij onder het grote nummer.
    const kaart = await baas.haal('/api/liedjes/' + id);
    assert.equal(kaart.data.heeftMuziek, true, 'de app hoort de muziek te vinden');
    assert.ok(kaart.data.muziek && kaart.data.muziek.bestaat, 'het bestand hoort gevonden te worden: ' +
      JSON.stringify(kaart.data.muziek));

    // En het zelf aanvullen moet dit liedje dus ook zien.
    const voor = await hulp.haal(omgeving.basis, '/api/gereedschap');
    assert.ok(voor.data.opname.nogTeDoen >= 1, 'dit liedje hoort nog te doen te zijn: ' +
      JSON.stringify(voor.data.opname));

    const scan = await baas.haal('/api/opname-scan');
    assert.equal(scan.data.aantal, 1, 'de app hoort dit liedje als kandidaat te zien: ' +
      JSON.stringify(scan.data));

    let bron = '';
    for (let i = 0; i < 80 && bron !== 'opname'; i++) {
      await new Promise((r) => setTimeout(r, 500));
      bron = (await hulp.haal(omgeving.basis, '/api/liedjes/' + id)).data.akkoordenBron;
    }
    assert.equal(bron, 'opname', 'de app hoort de akkoorden er zelf in te zetten, maar de kaart zegt: ' + bron);
  } finally {
    await omgeving.stop();
  }
});
