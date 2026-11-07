'use strict';
// Een setlist delen: een link waarmee iemand anders alleen die setlist kan lezen.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const hulp = require('./hulp.js');

const PAGINA = fs.readFileSync(path.join(__dirname, '..', 'public', 'delen.html'), 'utf8');

async function maakSetlistMetLiedjes(basis) {
  const gemaakt = await hulp.post(basis, '/api/setlists', { naam: 'Proefset voor delen' });
  assert.equal(gemaakt.status, 201, JSON.stringify(gemaakt.data));
  const id = Number(gemaakt.data.setlist.id);
  for (const liedje of [1, 2]) {
    const bij = await hulp.post(basis, `/api/setlists/${id}/liedjes`, { liedje, actie: 'bij' });
    assert.equal(bij.status, 200, JSON.stringify(bij.data));
  }
  return id;
}

test('een deellink geeft alleen die setlist, zonder profiel', async () => {
  const omgeving = await hulp.start();
  try {
    const setlist = await maakSetlistMetLiedjes(omgeving.basis);
    const deel = await hulp.post(omgeving.basis, '/api/delen', { setlist });
    assert.equal(deel.status, 201, JSON.stringify(deel.data));
    assert.match(deel.data.token, /^[a-f0-9]{18}$/);
    assert.ok(deel.data.url.indexOf('/d/' + deel.data.token) !== -1, 'de url hoort naar /d/ te wijzen');
    assert.equal(deel.data.liedjes, 2);

    // Zonder profielkoppen lezen: dat is precies wat iemand met de link doet.
    const uit = await hulp.haal(omgeving.basis, '/api/delen/' + deel.data.token);
    assert.equal(uit.status, 200, JSON.stringify(uit.data));
    assert.equal(uit.data.naam, 'Proefset voor delen');
    assert.equal(uit.data.aantal, 2);
    assert.equal(uit.data.liedjes.length, 2, 'alleen de liedjes van deze setlist');

    for (const lied of uit.data.liedjes) {
      assert.ok(lied.titel, 'de titel hoort erbij');
      assert.ok(lied.capoTekst, 'de capo hoort erbij');
      assert.ok(lied.toonsoort, 'de toonaard hoort erbij');
      assert.ok(Array.isArray(lied.regels) && lied.regels.length > 0, 'de akkoordenregels horen erbij');
      const metAkkoord = lied.regels.filter(r => (r.segmenten || []).some(s => s.akkoord));
      assert.ok(metAkkoord.length > 0, 'er hoort minstens één akkoord in te zitten');
      // Geen muziek, geen bestanden, geen geschiedenis: alleen wat je op papier nodig hebt.
      const plat = JSON.stringify(lied);
      for (const woord of ['audio', 'bestand', 'muziek', 'media', 'geschiedenis', 'profiel']) {
        assert.ok(plat.toLowerCase().indexOf(woord) === -1, `"${woord}" hoort niet in een gedeelde setlist`);
      }
    }
  } finally {
    await omgeving.stop();
  }
});

test('een lege setlist kun je niet delen', async () => {
  const omgeving = await hulp.start();
  try {
    const gemaakt = await hulp.post(omgeving.basis, '/api/setlists', { naam: 'Nog leeg' });
    const deel = await hulp.post(omgeving.basis, '/api/delen', { setlist: Number(gemaakt.data.setlist.id) });
    assert.equal(deel.status, 400);
  } finally {
    await omgeving.stop();
  }
});

test('een onbekende of ingetrokken link werkt niet meer', async () => {
  const omgeving = await hulp.start();
  try {
    const onbekend = await hulp.haal(omgeving.basis, '/api/delen/abcdef123456789abc');
    assert.equal(onbekend.status, 404);
    const pagina = await hulp.haal(omgeving.basis, '/d/abcdef123456789abc');
    assert.equal(pagina.status, 404);
    const rare = await hulp.haal(omgeving.basis, '/api/delen/onzin');
    assert.equal(rare.status, 404);

    const setlist = await maakSetlistMetLiedjes(omgeving.basis);
    const deel = await hulp.post(omgeving.basis, '/api/delen', { setlist });
    const token = deel.data.token;
    const werkt = await hulp.haal(omgeving.basis, '/api/delen/' + token);
    assert.equal(werkt.status, 200);
    const paginaWerkt = await hulp.haal(omgeving.basis, '/d/' + token);
    assert.equal(paginaWerkt.status, 200);
    assert.ok(String(paginaWerkt.data).indexOf('AkkoordKast') !== -1, 'de pagina hoort de app te noemen');

    const ingetrokken = await hulp.haal(omgeving.basis, '/api/delen', {
      method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token })
    });
    assert.equal(ingetrokken.status, 200);
    const na = await hulp.haal(omgeving.basis, '/api/delen/' + token);
    assert.equal(na.status, 404, 'een ingetrokken link hoort niets meer te geven');
    const paginaNa = await hulp.haal(omgeving.basis, '/d/' + token);
    assert.equal(paginaNa.status, 404);
  } finally {
    await omgeving.stop();
  }
});

test('de deelpagina staat op zichzelf en vraagt geen profiel', () => {
  assert.ok(PAGINA.indexOf('/api/delen/') !== -1, 'de pagina haalt de setlist op');
  assert.ok(PAGINA.indexOf("x-profiel") === -1, 'de deelpagina hoort geen profiel te sturen');
  assert.ok(PAGINA.indexOf('window.print') !== -1, 'de pagina hoort te kunnen printen');
  assert.ok(PAGINA.indexOf('@media print') !== -1, 'de pagina hoort een printfine opmaak te hebben');
});
