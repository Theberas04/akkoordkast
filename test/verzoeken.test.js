'use strict';
// Verzoekjes: iemand vraagt om een liedje (ieder profiel), de beheerder ziet het en vinkt af of
// gooit weg. Dit dekt de serverkant (de routes en de opruimregels) en de bedrading in de pagina.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const hulp = require('./hulp.js');

const PAGINA = () => fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

test('een verzoekje komt aan, met naam, titel, moment en bericht', async () => {
  const omgeving = await hulp.start();
  try {
    const uit = await hulp.post(omgeving.basis, '/api/verzoek', { liedje: 1, bericht: 'Graag vanavond!' });
    assert.equal(uit.status, 201, JSON.stringify(uit.data));
    assert.equal(uit.data.ok, true);
    const lijst = await hulp.haal(omgeving.basis, '/api/verzoeken');
    assert.equal(lijst.status, 200, JSON.stringify(lijst.data));
    const open = (lijst.data.verzoeken || []).filter(v => !v.gedaan);
    assert.equal(open.length, 1, 'er hoort één open verzoekje te staan');
    const v = open[0];
    assert.equal(v.liedje, 1);
    assert.ok(v.titel, 'de titel van het liedje hoort erbij te zitten');
    assert.ok(v.naam, 'wie het vroeg hoort erbij te zitten');
    assert.equal(v.bericht, 'Graag vanavond!');
    assert.ok(v.gemaakt, 'het moment hoort erbij te zitten');
  } finally {
    await omgeving.stop();
  }
});

test('twee keer hetzelfde liedje vragen geeft geen dubbele regel', async () => {
  const omgeving = await hulp.start();
  try {
    await hulp.post(omgeving.basis, '/api/verzoek', { liedje: 2, bericht: 'eerst' });
    const tweede = await hulp.post(omgeving.basis, '/api/verzoek', { liedje: 2, bericht: 'en nog eens, nu met een bericht' });
    assert.equal(tweede.status, 201);
    const open = tweede.data.verzoeken.filter(v => !v.gedaan);
    assert.equal(open.length, 1, 'hetzelfde profiel + hetzelfde liedje blijft één verzoekje');
    assert.equal(open[0].bericht, 'en nog eens, nu met een bericht', 'het nieuwste bericht hoort te winnen');
  } finally {
    await omgeving.stop();
  }
});

test('een verzoekje voor een onbekend liedje wordt geweigerd', async () => {
  const omgeving = await hulp.start();
  try {
    const uit = await hulp.post(omgeving.basis, '/api/verzoek', { liedje: 999999 });
    assert.equal(uit.status, 404);
    assert.match(String(uit.data.fout), /bestaat niet/i);
  } finally {
    await omgeving.stop();
  }
});

test('alleen de beheerder ruimt verzoekjes op', async () => {
  const omgeving = await hulp.start();
  try {
    const gedaan = await hulp.post(omgeving.basis, '/api/verzoek', { liedje: 3 });
    const id = gedaan.data.verzoeken.filter(v => !v.gedaan)[0].id;

    // Zonder beheerderssessie: geweigerd.
    const geweigerd = await hulp.post(omgeving.basis, '/api/verzoeken/afvinken', { id, actie: 'gedaan' });
    assert.equal(geweigerd.status, 403, 'een gewoon profiel hoort niets af te vinken');

    // Als beheerder: afvinken laat hem staan als gedaan…
    const beheerder = await hulp.alsBeheerder(omgeving.basis);
    const af = await beheerder.post('/api/verzoeken/afvinken', { id, actie: 'gedaan' });
    assert.equal(af.status, 200, JSON.stringify(af.data));
    const na = af.data.verzoeken.find(v => v.id === id);
    assert.ok(na && na.gedaan === true, 'het verzoekje hoort nu gedaan te zijn');
    assert.ok(na.gedaanOp, 'het moment van afvinken hoort erbij te zitten');

    // …en weggooien haalt hem helemaal weg.
    const weg = await beheerder.post('/api/verzoeken/afvinken', { id, actie: 'weg' });
    assert.equal(weg.status, 200);
    assert.equal(weg.data.verzoeken.find(v => v.id === id), undefined, 'weggooien hoort hem te verwijderen');
  } finally {
    await omgeving.stop();
  }
});

test('de verzoekknop staat bij het liedje en de kaart bij de beheerder', () => {
  const html = PAGINA();
  for (const id of ['verzoek-kaart', 'verzoek-teller', 'verzoek-ververs', 'verzoek-lijst', 'verzoek-melding', 'speel-verzoek']) {
    assert.ok(html.includes('id="' + id + '"'), 'de pagina hoort ' + id + ' te hebben');
  }
  for (const fn of ['function verzoekVersturen(', 'function laadVerzoeken(', 'function verzoekAfvinken(', 'function tekenVerzoeken(']) {
    assert.ok(html.includes(fn), 'de functie hoort te bestaan: ' + fn);
  }
  assert.ok(html.includes('Verzoek'), 'de knop hoort gewoon in het Nederlands te staan');
  assert.ok(html.includes('Verzocht'), 'na het versturen hoort de knop dat te laten zien');
  // De drie verzoekaanvragen sturen profiel én app-merk mee (de huisregel in aanvragen.test.js).
  for (const stuk of ["fetch('/api/verzoeken',", "fetch('/api/verzoek',", "fetch('/api/verzoeken/afvinken',"]) {
    assert.ok(html.includes(stuk), 'aanvraag ontbreekt: ' + stuk);
  }
});
