'use strict';
// De routekant van "de muziek van een liedje": zoeken in je eigen mappen, koppelen,
// streamen (ook met een bereik, zodat de speler kan spoelen) en losmaken. De
// veiligheidsregel wordt hier op de echte route getest: een bestand buiten de
// muziekmappen komt er niet door, ook niet via '..'.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { start, haal, post, alsBeheerder } = require('./hulp');

test('de muziek van een liedje komt uit je eigen map en nergens anders vandaan', async () => {
  const omgeving = await start();
  const baas = await alsBeheerder(omgeving.basis);
  const muziekmap = fs.mkdtempSync(path.join(os.tmpdir(), 'akkoordkast-map-'));
  const buiten = fs.mkdtempSync(path.join(os.tmpdir(), 'akkoordkast-buiten-'));
  try {
    const lijst = await haal(omgeving.basis, '/api/liedjes?aantal=1');
    assert.equal(lijst.status, 200);
    const lied = lijst.data.liedjes[0];
    assert.ok(lied && lied.id, 'geen liedje in de bibliotheek');

    const bestand = path.join(muziekmap, '01 - ' + lied.titel + '.mp3');
    fs.writeFileSync(bestand, Buffer.from('ID3 nep-audio voor de test'));
    fs.writeFileSync(path.join(buiten, lied.titel + '.mp3'), 'x');
    fs.writeFileSync(path.join(muziekmap, 'hoes.jpg'), 'x');

    // De map aanwijzen zoals de gebruiker dat in de app doet.
    const toegevoegd = await baas.post('/api/mappen', { pad: muziekmap });
    assert.equal(toegevoegd.status, 201, JSON.stringify(toegevoegd.data));

    // Zoeken levert dat bestand bovenaan op.
    const gezocht = await baas.post('/api/muziek', { liedje: lied.id, zoek: true });
    assert.equal(gezocht.status, 200, JSON.stringify(gezocht.data));
    assert.ok(gezocht.data.kandidaten.length >= 1, 'geen kandidaten: ' + JSON.stringify(gezocht.data));
    const kandidaat = gezocht.data.kandidaten[0];
    assert.equal(kandidaat.pad, bestand);
    assert.equal(kandidaat.score, 100);
    assert.equal(kandidaat.titel, lied.titel);
    assert.ok(gezocht.data.mappen.includes(muziekmap));

    // Een bestand buiten de muziekmappen weigeren.
    const fout = await baas.post('/api/muziek',
      { liedje: lied.id, kies: path.join(buiten, lied.titel + '.mp3') });
    assert.equal(fout.status, 400, JSON.stringify(fout.data));
    assert.match(fout.data.fout, /niet in een van je muziekmappen/);

    // En een pad dat met '..' naar buiten wijst ook.
    const sluip = await baas.post('/api/muziek',
      { liedje: lied.id, kies: path.join(muziekmap, '..', path.basename(buiten), lied.titel + '.mp3') });
    assert.equal(sluip.status, 400);

    // Niets audio: ook weigeren.
    const plaatje = await baas.post('/api/muziek', { liedje: lied.id, kies: path.join(muziekmap, 'hoes.jpg') });
    assert.equal(plaatje.status, 400);
    assert.match(plaatje.data.fout, /geen audiobestand/);

    // Het goede bestand kiezen.
    const gekozen = await baas.post('/api/muziek', { liedje: lied.id, kies: bestand });
    assert.equal(gekozen.status, 200, JSON.stringify(gekozen.data));
    assert.equal(gekozen.data.titel, lied.titel);
    assert.match(gekozen.data.url, /^\/api\/muziek\/bestand\?liedje=/);

    // Het liedje weet het nu ook (in het detail en op zichzelf).
    const info = await haal(omgeving.basis, '/api/muziek?liedje=' + lied.id);
    assert.equal(info.data.pad, bestand);
    assert.equal(info.data.bestaat, true);
    assert.equal(info.data.url, gekozen.data.url);
    const detail = await haal(omgeving.basis, '/api/liedjes/' + lied.id);
    assert.equal(detail.data.muziek.pad, bestand);
    assert.equal(detail.data.muziek.bestaat, true);
    assert.equal(detail.data.heeftMuziek, true);

    // En in de lijst staat het merkteken.
    const opnieuw = await haal(omgeving.basis, '/api/liedjes?compact=1&aantal=1');
    assert.equal(opnieuw.data.liedjes[0].heeftMuziek, true);

    // Streamen: het hele bestand, en een stukje met een bereik.
    const heel = await fetch(omgeving.basis + info.data.url);
    assert.equal(heel.status, 200);
    assert.match(heel.headers.get('content-type') || '', /audio\/mpeg/);
    assert.equal(Buffer.from(await heel.arrayBuffer()).toString(), 'ID3 nep-audio voor de test');

    const stuk = await fetch(omgeving.basis + info.data.url, { headers: { range: 'bytes=0-2' } });
    assert.equal(stuk.status, 206, 'een bereikverzoek hoort 206 te geven');
    assert.equal(Buffer.from(await stuk.arrayBuffer()).toString(), 'ID3');

    // Losmaken, en dan is er niets meer te streamen.
    const weg = await baas.post('/api/muziek', { liedje: lied.id, weg: true });
    assert.equal(weg.status, 200);
    const na = await haal(omgeving.basis, '/api/muziek?liedje=' + lied.id);
    assert.equal(na.data.pad, '');
    assert.equal(na.data.url, '');
    const geen = await fetch(omgeving.basis + '/api/muziek/bestand?liedje=' + lied.id);
    assert.equal(geen.status, 404);

    // Een bestand dat intussen verdwenen is (NAS los): koppelen kan nog, maar het
    // antwoord zegt eerlijk dat het er niet meer staat.
    const gekozen2 = await baas.post('/api/muziek', { liedje: lied.id, kies: bestand });
    assert.equal(gekozen2.status, 200);
    fs.rmSync(bestand);
    const kwijt = await haal(omgeving.basis, '/api/muziek?liedje=' + lied.id);
    assert.equal(kwijt.data.pad, bestand);
    assert.equal(kwijt.data.bestaat, false);
    const mis = await fetch(omgeving.basis + '/api/muziek/bestand?liedje=' + lied.id);
    assert.equal(mis.status, 404);
  } finally {
    fs.rmSync(muziekmap, { recursive: true, force: true });
    fs.rmSync(buiten, { recursive: true, force: true });
    await omgeving.stop();
  }
});
