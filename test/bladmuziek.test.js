'use strict';
// Je eigen bladmuziek bij een liedje: een foto of een PDF, alleen voor de beheerder, en het blijft
// in je eigen app. (De verzameling zelf houdt zich aan publiek domein; dit is jouw eigen materiaal.)
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const hulp = require('./hulp');

// Een piepklein maar geldig png-bestand (1 bij 1 pixel).
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64');
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');

test('je eigen bladmuziek bij een liedje: opslaan, bekijken, weghalen', async () => {
  const omgeving = await hulp.start();
  try {
    const baas = await hulp.alsBeheerder(omgeving.basis, 'proefwachtwoord-bladmuziek');
    const id = 1;

    // Zonder bladmuziek is er niets.
    const voor = await baas.haal('/api/liedjes/' + id);
    assert.equal(voor.status, 200, JSON.stringify(voor.data));
    assert.equal((voor.data.liedje || voor.data).bladmuziek || null, null);

    // Een foto opslaan.
    const gezet = await baas.haal('/api/liedjes/' + id + '/eigen-blad', {
      method: 'POST',
      headers: { 'content-type': 'image/png', 'x-bestandsnaam': encodeURIComponent('mijn%20blad.png') },
      body: PNG
    });
    assert.equal(gezet.status, 200, JSON.stringify(gezet.data));
    assert.equal(gezet.data.bladmuziek.bestaat, true);
    assert.equal(gezet.data.bladmuziek.isPdf, false);

    const kaart = await baas.haal('/api/liedjes/' + id);
    const blad = (kaart.data.liedje || kaart.data).bladmuziek;
    assert.ok(blad && blad.bestaat, 'de kaart hoort de bladmuziek te tonen: ' + JSON.stringify(blad));
    assert.equal(blad.url, '/api/liedjes/' + id + '/eigen-blad');

    // En het bestand is op te halen.
    const bestand = await baas.haal('/api/liedjes/' + id + '/eigen-blad');
    assert.equal(bestand.status, 200);
    assert.match(String(bestand.headers.get('content-type')), /image\/png/);

    // Een PDF vervangt de foto (er blijft er maar één over).
    const pdf = await baas.haal('/api/liedjes/' + id + '/eigen-blad', {
      method: 'POST',
      headers: { 'content-type': 'application/pdf', 'x-bestandsnaam': encodeURIComponent('mijn blad.pdf') },
      body: PDF
    });
    assert.equal(pdf.status, 200, JSON.stringify(pdf.data));
    assert.equal(pdf.data.bladmuziek.isPdf, true);
    const map = path.join(omgeving.wortel, 'media', 'bladmuziek');
    assert.equal(fs.readdirSync(map).length, 1, 'er hoort één blad te blijven staan: ' + fs.readdirSync(map).join(', '));

    // Iets anders dan een foto of PDF wordt geweigerd.
    const onzin = await baas.haal('/api/liedjes/' + id + '/eigen-blad', {
      method: 'POST', headers: { 'content-type': 'text/plain', 'x-bestandsnaam': 'x.txt' }, body: Buffer.from('hoi')
    });
    assert.equal(onzin.status, 400, 'alleen een foto of een PDF: ' + JSON.stringify(onzin.data));

    // Weghalen.
    const weg = await baas.haal('/api/liedjes/' + id + '/eigen-blad', { method: 'DELETE' });
    assert.equal(weg.status, 200, JSON.stringify(weg.data));
    const na = await baas.haal('/api/liedjes/' + id);
    assert.equal((na.data.liedje || na.data).bladmuziek, null, 'het blad hoort weg te zijn');
    assert.equal(fs.readdirSync(map).length, 0);
  } finally {
    await omgeving.stop();
  }
});

test('bladmuziek hoort bij de beheerder', async () => {
  const omgeving = await hulp.start();
  try {
    const zet = await hulp.haal(omgeving.basis + '/api/liedjes/1/eigen-blad', {
      method: 'POST', headers: { 'content-type': 'image/png' }, body: PNG
    });
    assert.ok([403, 404].includes(zet.status), 'zonder beheerder hoort dit niet te kunnen: ' + zet.status);
    const kijk = await hulp.haal(omgeving.basis + '/api/liedjes/1/eigen-blad');
    assert.ok([403, 404].includes(kijk.status), 'zonder beheerder hoort dit niet te kunnen: ' + kijk.status);
    const haal = await hulp.haal(omgeving.basis + '/api/liedjes/1/eigen-blad', { method: 'DELETE' });
    assert.ok([403, 404].includes(haal.status), 'zonder beheerder hoort dit niet te kunnen: ' + haal.status);
  } finally {
    await omgeving.stop();
  }
});

// De foto van je eigen bladmuziek wordt met de beheerderssessie opgehaald (een gewone <img> stuurt
// geen profiel mee, en daar hangt het beheerdersrecht aan). Deze proef bewaakt dat dat zo blijft.
test('de pagina haalt je eigen bladmuziek met de beheerderssessie op', () => {
  const fs = require('fs');
  const path = require('path');
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  assert.match(html, /data-bladmuziek-url/, 'de afbeelding hoort via de beheerderssessie geladen te worden');
  assert.match(html, /querySelectorAll\('\[data-bladmuziek-url\]'\)/, 'er hoort een lader voor de afbeelding te zijn');
  assert.match(html, /x-profiel/, 'de lader hoort het profiel mee te sturen');
});

// De kaart hoort te zeggen waar de akkoorden van een eigen liedje vandaan komen: uit wat je zelf
// toevoegde, niet van een website. Bij meegeleverde liedjes blijft die regel weg.
test('de kaart noemt de herkomst van zelf ingevoerde akkoorden', () => {
  const fs = require('fs');
  const path = require('path');
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  assert.match(html, /akkoordenBron === 'bron' && l\.eigen/,
    'de regel hoort alleen bij eigen liedjes te verschijnen');
  assert.match(html, /De app zoekt zelf geen/,
    'de kaart hoort eerlijk te zeggen dat de app geen akkoorden van websites haalt');
  assert.match(html, /van websites op/);
});

test('de melding van het ophalen verdwijnt als de akkoorden er wel zijn', async () => {
  // Liedjes die uit een link zijn opgehaald kregen de melding "de bladmuziek staat er nog niet in" in de
  // tekst. Kwamen de akkoorden er later wel, dan bleef die melding staan - echte akkoorden boven een tekst
  // die zei dat er niets was. Dat mag niet meer gebeuren.
  const fs = require('fs');
  const path = require('path');
  const proefsignaal = require('./proefsignaal');
  const omgeving = await hulp.start();
  try {
    const baas = await hulp.alsBeheerder(omgeving.basis);
    const maak = await baas.haal('/api/liedjes', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        titel: 'Uit een link', artiest: 'Gedownload', genre: 'Gedownload',
        chordpro: '{title: Uit een link}\n\nDit liedje is opgehaald uit een link. De bladmuziek staat er ' +
          'nog niet in, maar de muziek wel: druk in het speelscherm op Meespelen met de muziek.'
      })
    });
    assert.ok([200, 201].includes(maak.status), JSON.stringify(maak.data));
    const id = maak.data.id;

    const wav = proefsignaal.naarWav(proefsignaal.akkoordProef(['C', 'G', 'Am', 'F'], 84, 22050), 22050);
    const bestand = path.join(process.env.MEDIA_DIR, 'uit-een-link.wav');
    fs.writeFileSync(bestand, wav);
    omgeving.app.db.prepare('INSERT INTO liedje_muziek (liedje_id, pad, titel, wanneer) VALUES (?,?,?,?)')
      .run(Number(id) - omgeving.app.paden.EIGEN_START, bestand, 'Uit een link', new Date().toISOString());

    const uit = await baas.post('/api/liedjes/' + id + '/bladmuziek', {});
    assert.ok([200, 201].includes(uit.status), 'de akkoorden halen lukte niet: ' + JSON.stringify(uit.data));
    assert.equal(uit.data.ok, true, JSON.stringify(uit.data));

    const kaart = await baas.haal('/api/liedjes/' + id);
    const tekst = String(kaart.data.chordpro || '');
    assert.ok(!/staat er nog niet in/i.test(tekst), 'de melding hoort weg te zijn: ' + tekst);
    assert.match(tekst, /^\s*\{title:/, 'de kop van het liedje hoort te blijven staan: ' + tekst);
    // En er hoort echte bladmuziek te staan: de akkoorden per maat, niet een lap uitleg.
    assert.match(tekst, /\|\[[A-G][^\]]*\]/, 'er hoort een akkoordenschema te staan: ' + tekst);
    assert.ok(!/De akkoorden van dit nummer zijn uit de opname gehaald/.test(tekst),
      'de lap uitleg hoort niet meer in het blad te staan: ' + tekst);
    assert.match(tekst, /^\|\[[A-G]/m, 'de akkoorden horen per maat op een regel te staan: ' + tekst);
  } finally {
    await omgeving.stop();
  }
});

test('de melding wordt rechtgezet bij liedjes die de akkoorden al hadden', async () => {
  // Nummers die hun akkoorden kregen vóór deze versie hebben de melding nog in de tekst staan. De app
  // zet dat recht (herstelOphaalTeksten), zodat de gebruiker niets opnieuw hoeft te doen - alleen bijwerken.
  const omgeving = await hulp.start();
  try {
    omgeving.app.db.prepare('INSERT INTO liedjes (titel, artiest, taal, genre, moeilijkheid, toonsoort, ' +
      'tempo, strum, bron, youtube, notitie, chordpro, aangemaakt, akkoorden_per_maat, maatsoort) ' +
      'VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
      'Oud nummer', 'Gedownload', 'nl', 'Gedownload', 2, 'C', 90, '', 'Gedownload', '', '',
      '{title: Oud nummer}\n\nDit liedje is opgehaald uit een link. De bladmuziek staat er nog niet in.',
      new Date().toISOString(), JSON.stringify(['C', 'G', 'Am', 'F']), 4);

    const gedaan = omgeving.app.herstelOphaalTeksten();
    assert.ok(gedaan >= 1, 'de app hoort de melding recht te zetten, gedaan: ' + gedaan);

    const rij = omgeving.app.db.prepare('SELECT chordpro FROM liedjes WHERE titel = ?').get('Oud nummer');
    const tekst = String(rij.chordpro || '');
    assert.ok(!/staat er nog niet in/i.test(tekst), 'de melding hoort rechtgezet te zijn: ' + tekst);
    assert.match(tekst, /^\s*\{title:/, 'en de kop blijft staan: ' + tekst);
    // De akkoorden die er al waren horen als schema in het blad te komen.
    for (const akkoord of ['C', 'G', 'Am', 'F']) {
      assert.ok(tekst.includes('[' + akkoord + ']'), 'het akkoord ' + akkoord + ' hoort in het schema te staan: ' + tekst);
    }

    // En bij een tweede keer doen blijft het rustig: er is dan niets meer recht te zetten.
    const nogeens = omgeving.app.herstelOphaalTeksten();
    assert.equal(nogeens, 0, 'de tweede keer hoort er niets meer te doen te zijn: ' + nogeens);
  } finally {
    await omgeving.stop();
  }
});
