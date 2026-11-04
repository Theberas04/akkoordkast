'use strict';
// De beheerder kan de akkoorden uit de muziek halen voor alle liedjes tegelijk. Deze proef zet een
// eigen liedje neer met een echte opname (C-G-Am-F) en kijkt of de ronde er akkoorden bij zet.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const hulp = require('./hulp');
const proefsignaal = require('./proefsignaal');

test('de beheerder haalt de akkoorden uit de muziek voor alle liedjes tegelijk', async () => {
  const omgeving = await hulp.start();
  try {
    const baas = await hulp.alsBeheerder(omgeving.basis);

    const maak = await baas.haal('/api/liedjes', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        titel: 'Proefnummer', artiest: 'Proefzanger',
        chordpro: '{title: Proefnummer}\n\nregel een van de tekst\nregel twee van de tekst'
      })
    });
    assert.ok([200, 201].includes(maak.status), 'liedje maken lukte niet: ' + maak.status);
    const id = maak.data.id;

    // De opname erbij zetten, zoals de upload dat doet: een bestand plus een rij in liedje_muziek.
    const wav = proefsignaal.naarWav(proefsignaal.akkoordProef(['C', 'G', 'Am', 'F'], 84, 22050), 22050);
    const bestand = path.join(process.env.MEDIA_DIR, 'proefnummer.wav');
    fs.writeFileSync(bestand, wav);
    omgeving.app.db.prepare('INSERT INTO liedje_muziek (liedje_id, pad, titel, wanneer) VALUES (?,?,?,?)')
      .run(Number(id) - omgeving.app.paden.EIGEN_START, bestand, 'Proefnummer', new Date().toISOString());

    // Zonder beheerder mag de app dit niet doen.
    const gewoon = await hulp.haal(omgeving.basis, '/api/opname-scan');
    assert.equal(gewoon.status, 403, 'zonder beheerder hoort de app te weigeren');

    const scan = await baas.haal('/api/opname-scan');
    assert.equal(scan.status, 200);
    assert.equal(scan.data.aantal, 1, 'het proefnummer hoort als enige kandidaat te gelden: ' + JSON.stringify(scan.data));
    assert.equal(scan.data.voorbeelden[0].titel, 'Proefnummer');

    const start = await baas.haal('/api/opname-alles', { method: 'POST' });
    assert.equal(start.status, 200);
    assert.equal(start.data.ok, true);

    let stand = null;
    for (let i = 0; i < 120; i++) {
      stand = (await baas.haal('/api/opname-stand')).data;
      if (!stand.loopt && stand.klaar) break;
      await new Promise(r => setTimeout(r, 100));
    }
    assert.ok(stand && stand.klaar, 'de ronde hoort klaar te zijn');
    assert.equal(stand.gelukt, 1, 'het proefnummer hoort akkoorden te krijgen: ' + JSON.stringify(stand));

    const kaart = await baas.haal('/api/liedjes/' + id);
    assert.equal(kaart.data.akkoordenBron, 'opname', 'de akkoorden horen uit de opname te komen');
    assert.ok(kaart.data.akkoorden.length > 0, 'er horen akkoorden te staan');

    // En een tweede keer kijken: er is niets meer te doen.
    const nogeens = await baas.haal('/api/opname-scan');
    assert.equal(nogeens.data.aantal, 0, 'na de ronde hoort het proefnummer niet meer als kandidaat te gelden');
  } finally {
    await omgeving.stop();
  }
});

test('een liedje waar de akkoorden al in de tekst staan blijft ongemoeid', async () => {
  const omgeving = await hulp.start();
  try {
    const baas = await hulp.alsBeheerder(omgeving.basis);
    const maak = await baas.haal('/api/liedjes', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        titel: 'Zelf ingevoerd', artiest: 'Proefzanger',
        chordpro: '{title: Zelf ingevoerd}\n\n[C]regel een [G]regel twee'
      })
    });
    assert.ok([200, 201].includes(maak.status));
    const id = maak.data.id;

    const wav = proefsignaal.naarWav(proefsignaal.akkoordProef(['C', 'G', 'Am', 'F'], 84, 22050), 22050);
    const bestand = path.join(process.env.MEDIA_DIR, 'zelfingevoerd.wav');
    fs.writeFileSync(bestand, wav);
    omgeving.app.db.prepare('INSERT INTO liedje_muziek (liedje_id, pad, titel, wanneer) VALUES (?,?,?,?)')
      .run(Number(id) - omgeving.app.paden.EIGEN_START, bestand, 'Zelf ingevoerd', new Date().toISOString());

    const scan = await baas.haal('/api/opname-scan');
    assert.equal(scan.data.aantal, 0, 'een liedje met eigen akkoorden hoort geen kandidaat te zijn');

    // De kaart blijft zeggen dat de akkoorden van de invoer komen.
    const kaart = await baas.haal('/api/liedjes/' + id);
    assert.equal(kaart.data.akkoordenBron, 'bron');
  } finally {
    await omgeving.stop();
  }
});
