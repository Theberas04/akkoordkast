'use strict';
// Setlists (en de optredenmodus die daarop draait), het akkoordenboek met alle
// posities en de wachter die de muziekmap bijhoudt.
const test = require('node:test');
const assert = require('node:assert');
const { start, haal, post } = require('./hulp');

let omgeving;
// Een POST met een profiel erbij: de setlists hangen aan het profiel.
const postProfiel = (id, pad, lichaam) => haal(omgeving.basis, pad, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-profiel': String(id) },
  body: JSON.stringify(lichaam || {})
});
const haalProfiel = (id, pad, extra) => haal(omgeving.basis, pad, Object.assign({ headers: { 'x-profiel': String(id) } }, extra || {}));
const ids = [];

test.before(async () => {
  omgeving = await start();
  const lijst = await haal(omgeving.basis, '/api/liedjes?compact=1&aantal=5');
  assert.equal(lijst.status, 200);
  lijst.data.liedjes.slice(0, 4).forEach(l => ids.push(l.id));
  assert.ok(ids.length >= 3, 'we hebben een paar liedjes nodig voor de setlist');
});

test.after(async () => { if (omgeving) await omgeving.stop(); });

test('een setlist maken, vullen en weer lezen', async () => {
  const leeg = await haal(omgeving.basis, '/api/setlists');
  assert.equal(leeg.status, 200);
  assert.deepEqual(leeg.data.setlists, []);

  const nieuw = await post(omgeving.basis, '/api/setlists', { naam: 'Kroeg vrijdag' });
  assert.equal(nieuw.status, 201);
  assert.equal(nieuw.data.setlist.naam, 'Kroeg vrijdag');
  assert.equal(nieuw.data.setlist.aantal, 0);
  const id = nieuw.data.setlist.id;

  const bij = await post(omgeving.basis, `/api/setlists/${id}/liedjes`, { liedje: ids[0], actie: 'bij' });
  assert.equal(bij.status, 200);
  assert.equal(bij.data.setlist.aantal, 1);
  assert.equal(bij.data.setlist.liedjes[0].id, ids[0]);
  assert.ok(bij.data.setlist.liedjes[0].titel, 'een liedje in de setlist heeft een titel');
  assert.ok(Array.isArray(bij.data.setlist.liedjes[0].akkoorden), 'en de akkoorden erbij');
  assert.ok(typeof bij.data.setlist.liedjes[0].tempo === 'number');

  // twee keer hetzelfde liedje levert geen dubbele regel op
  const nogmaals = await post(omgeving.basis, `/api/setlists/${id}/liedjes`, { liedje: ids[0], actie: 'bij' });
  assert.equal(nogmaals.data.setlist.aantal, 1, 'hetzelfde liedje komt er niet twee keer in');

  for (const liedje of ids.slice(1, 4)) {
    await post(omgeving.basis, `/api/setlists/${id}/liedjes`, { liedje, actie: 'bij' });
  }
  const vol = await haal(omgeving.basis, `/api/setlists/${id}`);
  assert.equal(vol.data.aantal, ids.length);
  assert.deepEqual(vol.data.liedjes.map(l => l.id), ids);

  const lijst = await haal(omgeving.basis, '/api/setlists');
  const gevonden = lijst.data.setlists.find(s => s.id === id);
  assert.ok(gevonden, 'de setlist staat in de lijst');
  assert.equal(gevonden.aantal, ids.length);
});

test('de volgorde kun je veranderen en liedjes kun je eruit halen', async () => {
  const nieuw = await post(omgeving.basis, '/api/setlists', { naam: 'Optreden' });
  const id = nieuw.data.setlist.id;
  for (const liedje of ids.slice(0, 3)) {
    await post(omgeving.basis, `/api/setlists/${id}/liedjes`, { liedje, actie: 'bij' });
  }

  const omlaag = await post(omgeving.basis, `/api/setlists/${id}/liedjes`, { liedje: ids[0], actie: 'omlaag' });
  assert.deepEqual(omlaag.data.setlist.liedjes.map(l => l.id), [ids[1], ids[0], ids[2]]);
  const omhoog = await post(omgeving.basis, `/api/setlists/${id}/liedjes`, { liedje: ids[0], actie: 'omhoog' });
  assert.deepEqual(omhoog.data.setlist.liedjes.map(l => l.id), [ids[0], ids[1], ids[2]]);

  // bovenaan zetten en er weer uit halen
  const boven = await post(omgeving.basis, `/api/setlists/${id}/liedjes`, { liedje: ids[2], actie: 'boven' });
  assert.deepEqual(boven.data.setlist.liedjes.map(l => l.id), [ids[2], ids[0], ids[1]]);
  const af = await post(omgeving.basis, `/api/setlists/${id}/liedjes`, { liedje: ids[0], actie: 'af' });
  assert.deepEqual(af.data.setlist.liedjes.map(l => l.id), [ids[2], ids[1]]);

  // iets onmogelijks levert uitleg op
  const onbekend = await post(omgeving.basis, `/api/setlists/${id}/liedjes`, { liedje: ids[0], actie: 'ondersteboven' });
  assert.equal(onbekend.status, 400);
  assert.match(onbekend.data.fout, /Onbekende actie/i);
  const spook = await post(omgeving.basis, `/api/setlists/${id}/liedjes`, { liedje: 987654321, actie: 'bij' });
  assert.equal(spook.status, 404);
});

test('een setlist hoort bij één profiel en kun je weer weggooien', async () => {
  const anna = await post(omgeving.basis, '/api/profielen', { naam: 'Anna setlist' });
  const annaId = anna.data.profiel.id;

  const vanAnna = await postProfiel(annaId, '/api/setlists', { naam: 'Anna\'s lijstje' });
  assert.equal(vanAnna.status, 201);
  const annaSetlist = vanAnna.data.setlist.id;

  const bijAnna = await postProfiel(annaId, `/api/setlists/${annaSetlist}/liedjes`, { liedje: ids[0], actie: 'bij' });
  assert.equal(bijAnna.status, 200);

  // het standaardprofiel ziet die setlist niet
  const standaard = await haal(omgeving.basis, '/api/setlists');
  assert.ok(!standaard.data.setlists.some(s => s.id === annaSetlist), 'setlists zijn persoonlijk');
  const andermans = await haal(omgeving.basis, `/api/setlists/${annaSetlist}`);
  assert.equal(andermans.status, 404);

  const eigen = await haalProfiel(annaId, `/api/setlists/${annaSetlist}`);
  assert.equal(eigen.status, 200);
  assert.equal(eigen.data.aantal, 1);

  const weg = await haalProfiel(annaId, `/api/setlists/${annaSetlist}`, { method: 'DELETE' });
  assert.equal(weg.status, 200);
  const na = await haalProfiel(annaId, `/api/setlists/${annaSetlist}`);
  assert.equal(na.status, 404, 'de setlist is echt weg');
});

test('het akkoordenboek geeft van elk akkoord alle posities met een tekening', async () => {
  const boek = await haal(omgeving.basis, '/api/akkoordenboek');
  assert.equal(boek.status, 200);
  assert.ok(boek.data.akkoorden.length >= 26, 'minstens de 26 grepen');

  for (const akkoord of boek.data.akkoorden) {
    assert.ok(akkoord.naam, 'elk akkoord heeft een naam');
    assert.ok(akkoord.posities.length >= 1, akkoord.naam + ' heeft minstens één positie');
    assert.ok(akkoord.posities.length <= 4, akkoord.naam + ' heeft hoogstens vier posities');
    const gezien = new Set();
    for (const p of akkoord.posities) {
      assert.ok(p.naam, 'een positie heeft een Nederlandse naam');
      assert.match(p.svg, /^<svg/, 'de positie heeft een tekening');
      assert.ok(p.vanaf >= 1 && p.vanaf <= 12, 'het venster begint tussen vak 1 en 12');
      assert.equal(p.frets.length, 6, 'zes snaren');
      const openSnaren = [40, 45, 50, 55, 59, 64];
      const verwacht = [];
      p.frets.forEach((f, i) => {
        if (f < 0) return;
        assert.ok(f < p.vanaf + 5, 'geen fret buiten het venster bij ' + akkoord.naam);
        verwacht.push(openSnaren[i] + f);
      });
      assert.deepEqual(p.noten.slice().sort((a, b) => a - b), verwacht.sort((a, b) => a - b),
        'de klinkende noten horen bij de frets van ' + akkoord.naam);
      const sleutel = p.frets.join(',');
      assert.ok(!gezien.has(sleutel), 'dezelfde greep komt niet twee keer voor bij ' + akkoord.naam);
      gezien.add(sleutel);
    }
  }

  const een = await haal(omgeving.basis, '/api/akkoordenboek?akkoord=F');
  assert.equal(een.status, 200);
  assert.equal(een.data.naam, 'F');
  assert.ok(een.data.posities.length >= 2, 'F heeft meer dan één positie');
  const geen = await haal(omgeving.basis, '/api/akkoordenboek?akkoord=Zx');
  assert.equal(geen.status, 404);
});

test('de wachter staat standaard uit en is in te stellen', async () => {
  const eerste = await haal(omgeving.basis, '/api/wachter');
  assert.equal(eerste.status, 200);
  assert.equal(eerste.data.aan, false);
  assert.equal(eerste.data.minuten, 360);
  assert.ok(typeof eerste.data.updateMogelijk === 'boolean');

  const aan = await post(omgeving.basis, '/api/wachter', { aan: true, minuten: 30, map: '/tmp/bestaat-niet-als-map' });
  assert.equal(aan.status, 200);
  assert.equal(aan.data.wachter.aan, true);
  assert.equal(aan.data.wachter.minuten, 30, 'de tijd wordt bewaard');
  assert.equal(aan.data.wachter.map, '/tmp/bestaat-niet-als-map');

  // te korte of te lange tijden worden bijgesteld
  const kort = await post(omgeving.basis, '/api/wachter', { minuten: 1 });
  assert.ok(kort.data.wachter.minuten >= 5, 'sneller dan vijf minuten doen we niet');
  const lang = await post(omgeving.basis, '/api/wachter', { minuten: 99999 });
  assert.equal(lang.data.wachter.minuten, 24 * 60, 'langer dan een dag doen we niet');

  // een ronde met een map die niet bestaat levert een eerlijke melding op
  const ronde = await post(omgeving.basis, '/api/wachter/nu', {});
  assert.equal(ronde.status, 200);
  assert.match(ronde.data.wachter.verslag, /bestaat niet|Let op/i);

  const uit = await post(omgeving.basis, '/api/wachter', { aan: false });
  assert.equal(uit.data.wachter.aan, false);
});

test('een map zonder muziek levert geen omzetting op', async () => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const leeg = fs.mkdtempSync(path.join(os.tmpdir(), 'akkoordkast-leeg-'));
  await post(omgeving.basis, '/api/wachter', { aan: true, map: leeg });
  const ronde = await post(omgeving.basis, '/api/wachter/nu', {});
  assert.equal(ronde.status, 200);
  assert.match(ronde.data.wachter.verslag, /Niets nieuws/i);
  await post(omgeving.basis, '/api/wachter', { aan: false, map: '' });
  fs.rmSync(leeg, { recursive: true, force: true });
});
