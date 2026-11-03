'use strict';
// Tests voor het in één keer doorlopen van een hele muziekmap: wat zit erin,
// wat is al gedaan, en worden de bestandsnamen aan de bibliotheek gekoppeld?
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const hulp = require('./hulp');
const tijdlijn = require('../lib/tijdlijn');
const gitaar = require('../lib/gitaar');

const AKKOORDEN = {
  'Amazing Grace (official video).mp3': { akkoorden: ['G', 'C', 'G', 'D7', 'G'], maatsoort: 3, tempo: 92 },
  '07 - Stille nacht.mp3': { akkoorden: ['C', 'F', 'C', 'G7', 'C'], maatsoort: 3, tempo: 84 }
};

// Een korte proefopname (wav) zodat de test geen lange bestanden hoeft te maken.
function maakWav(pad, akkoorden, maatsoort, tempo) {
  const plan = tijdlijn.maakPlan({ akkoordenPerMaat: akkoorden, toonsoort: akkoorden[0], maatsoort, tempo, herhalingen: 1 });
  fs.writeFileSync(pad, gitaar.maakPlanWav(plan));
}

function maakMuziekmap() {
  const map = fs.mkdtempSync(path.join(os.tmpdir(), 'muziekmap-'));
  for (const [naam, gegevens] of Object.entries(AKKOORDEN)) {
    maakWav(path.join(map, naam.replace(/\.mp3$/, '.wav')), gegevens.akkoorden, gegevens.maatsoort, gegevens.tempo);
  }
  fs.mkdirSync(path.join(map, 'Oefen'), { recursive: true });
  maakWav(path.join(map, 'Oefen', 'proef 01.wav'), ['D', 'A7', 'D'], 4, 120);
  fs.writeFileSync(path.join(map, 'lees-mij.txt'), 'geen muziek');
  fs.writeFileSync(path.join(map, 'te-klein.mp3'), 'x');
  return map;
}

test('de muziekmap wordt gevonden, met onderliggende mappen en zonder onzin', async () => {
  const omgeving = await hulp.start();
  const map = maakMuziekmap();
  try {
    const uit = await hulp.haal(omgeving.basis, '/api/scan?map=' + encodeURIComponent(map));
    assert.equal(uit.status, 200, JSON.stringify(uit.data));
    assert.equal(uit.data.aantal, 3, 'twee in de map zelf en één in een onderliggende map');
    assert.equal(uit.data.nieuw, 3);
    assert.equal(uit.data.alGedaan, 0);
    assert.ok(uit.data.grootteTotaal > 1000);
    const namen = uit.data.bestanden.map(b => b.naam).join('|');
    assert.match(namen, /Amazing Grace \(official video\)\.wav/, 'haakjes en spaties horen te werken');
    assert.match(namen, /proef 01\.wav/, 'onderliggende mappen horen mee te gaan');
    assert.ok(!namen.includes('lees-mij'), 'geen muziek overslaan');
    assert.ok(!namen.includes('te-klein'), 'te kleine bestanden overslaan');
  } finally {
    await omgeving.stop();
    fs.rmSync(map, { recursive: true, force: true });
  }
});

test('een niet-bestaande map geeft een duidelijke uitleg', async () => {
  const omgeving = await hulp.start();
  try {
    const uit = await hulp.haal(omgeving.basis, '/api/scan?map=' + encodeURIComponent('/bestaat/niet/hier'));
    assert.equal(uit.status, 400);
    assert.match(uit.data.fout, /bestaat niet/);
    const leeg = await hulp.post(omgeving.basis, '/api/scan', {});
    assert.equal(leeg.status, 400);
    assert.match(leeg.data.fout, /map/i);
  } finally {
    await omgeving.stop();
  }
});

test('een hele map omzetten: herkennen, liedje maken, en niets twee keer doen', async () => {
  const omgeving = await hulp.start();
  const map = maakMuziekmap();
  try {
    // één voor één, zodat we het tussenrapport zien zoals de pagina dat ook doet
    let klaar = false;
    let rondes = 0;
    const gemaakt = [];
    while (!klaar && rondes < 6) {
      const uit = await hulp.post(omgeving.basis, '/api/scan', { map, limiet: 1 });
      assert.equal(uit.status, 201, JSON.stringify(uit.data));
      assert.equal(uit.data.gedaan, 1);
      assert.equal(uit.data.mislukt, 0, JSON.stringify(uit.data.fouten));
      assert.equal(uit.data.totaal, 3);
      gemaakt.push(uit.data.liedjes[0]);
      klaar = uit.data.klaar;
      rondes += 1;
    }
    assert.equal(gemaakt.length, 3, 'alle drie de bestanden horen omgezet te zijn');
    assert.ok(klaar, 'na alle bestanden is de map klaar');

    const gezongen = gemaakt.find(l => /Amazing Grace/.test(l.bestand));
    assert.ok(gezongen.titel.startsWith('Amazing Grace'), 'de titel komt uit de bestandsnaam: ' + gezongen.titel);
    assert.ok(!/official|video/i.test(gezongen.titel), 'vulwoorden horen eruit te gaan: ' + gezongen.titel);
    assert.equal(gezongen.gevonden, 'Amazing Grace', 'het liedje uit de bibliotheek hoort erbij gezocht te worden');
    // 3/4 is voor de tikherkenning lastiger dan 4/4; binnen 15% is voor een voorstel goed genoeg
    assert.ok(gezongen.tempo > 78 && gezongen.tempo < 106, 'tempo in de buurt van 92: ' + gezongen.tempo);
    assert.equal(gezongen.heeftAudio, true);
    assert.ok(gezongen.akkoorden.length >= 4);
    assert.ok(gezongen.id >= 900000, 'eigen liedjes blijven boven de eigen grens');
    assert.match(gezongen.akkoorden[0], /^[A-G][#b]?(m|maj)?7?$/, 'alleen akkoorden met een greep: ' + gezongen.akkoorden[0]);
    assert.ok(gezongen.woorden > 2, 'de woorden van het gevonden liedje horen erbij te komen');

    // het liedje is echt op te vragen, met bladmuziek en meespeelbestand
    const lied = await hulp.haal(omgeving.basis, '/api/liedjes/' + gezongen.id);
    assert.equal(lied.status, 200);
    assert.match(lied.data.bladmuziek || lied.data.chordpro, /Amazing Grace/);
    assert.ok(lied.data.akkoordenPerMaat && lied.data.akkoordenPerMaat.length >= 4);
    // de tekst van het liedje uit de bibliotheek komt mee, zonder akkoorden erin
    assert.match(lied.data.tekst, /amazing grace/i);
    assert.ok(!/\[[A-G]/.test(lied.data.tekst), 'de woorden horen geen akkoorden te bevatten');
    assert.match(lied.data.tekstVan, /Amazing Grace \(\d+\)/);

    // een tweede ronde doet niets meer
    const nog = await hulp.post(omgeving.basis, '/api/scan', { map, limiet: 5 });
    assert.equal(nog.status, 200);
    assert.equal(nog.data.gedaan, 0);
    assert.equal(nog.data.rest, 0);
    assert.equal(nog.data.klaar, true);

    const overzicht = await hulp.haal(omgeving.basis, '/api/scan?map=' + encodeURIComponent(map));
    assert.equal(overzicht.data.nieuw, 0);
    assert.equal(overzicht.data.alGedaan, 3);
  } finally {
    await omgeving.stop();
    fs.rmSync(map, { recursive: true, force: true });
  }
});

test('de pagina heeft de onderdelen om een map te kiezen en te volgen', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  for (const id of ['scan-map', 'scan-kijk', 'scan-start', 'scan-melding', 'scan-vort', 'scan-lijst']) {
    assert.ok(html.includes('id="' + id + '"'), 'id ontbreekt: ' + id);
  }
  assert.match(html, /\/api\/scan/);
});
