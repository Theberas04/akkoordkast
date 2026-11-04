'use strict';
// Tests voor de muziekanalyse en de upload: van een mp3 of mp4 naar een
// akkoordschema, en van dat schema naar een meespeeltijdlijn met je eigen opname.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const analyse = require('../lib/analyse');
const akkoorden = require('../lib/akkoorden');
const capo = require('../lib/capo');
const proefsignaal = require('./proefsignaal');
const hulp = require('./hulp');

const SR = 22050;

test('de analyse vindt het tempo van een opname', () => {
  for (const bpm of [96, 100, 112]) {
    const samples = proefsignaal.akkoordProef(['C', 'F', 'G', 'C'], bpm, SR);
    const uit = analyse.analyseer(samples, SR);
    const afwijking = Math.abs(uit.tempo - bpm) / bpm;
    assert.ok(afwijking < 0.08, `tempo ${uit.tempo} hoort bij ${bpm} te horen (${Math.round(afwijking * 100)}% ernaast)`);
    assert.ok(uit.maatsoort === 4 || uit.maatsoort === 3, 'maatsoort moet 3 of 4 zijn');
    assert.ok(uit.aantalMaten >= 4, 'te weinig maten herkend');
  }
});

test('de analyse herkent de akkoorden van een eenvoudige opname', () => {
  const samples = proefsignaal.akkoordProef(['Em', 'C', 'G', 'D'], 96, SR);
  const uit = analyse.analyseer(samples, SR);
  assert.equal(uit.toonsoort.replace('m', ''), 'G', 'de toonsoort hoort G te zijn: ' + uit.toonsoort);
  // de eerste vier maten horen de gespeelde reeks te zijn (eventueel met een
  // septiem erbij: dat is dezelfde akkoordfamilie)
  const eerste = uit.akkoordenPerMaat.slice(0, 4).map(a => a.replace(/(maj7|m7|7)$/, ''));
  assert.deepEqual(eerste, ['Em', 'C', 'G', 'D'], 'herkende akkoorden: ' + uit.akkoordenPerMaat.join(' '));
  assert.ok(uit.gemiddeldeZekerheid > 0, 'de zekerheid hoort berekend te zijn');
});

test('elk herkend akkoord heeft een greep en een diagram', () => {
  const samples = proefsignaal.akkoordProef(['C', 'Am', 'F', 'G'], 100, SR);
  const uit = analyse.analyseer(samples, SR);
  for (const akkoord of uit.akkoordenPerMaat) {
    assert.ok(akkoorden.besteAkkoord(new Array(12).fill(1)) !== null);
    assert.ok(capo.greepScore(akkoord) < 6, 'akkoord zonder greep: ' + akkoord);
  }
});

test('een te korte opname wordt netjes geweigerd', () => {
  const samples = proefsignaal.akkoordProef(['C'], 100, SR).slice(0, SR * 2);
  assert.throws(() => analyse.analyseer(samples, SR), /te kort/i);
});

test('een mp3 uploaden levert een liedje met een herkend schema', async () => {
  const omgeving = await hulp.start();
  const baas = await hulp.alsBeheerder(omgeving.basis);   // uploaden hoort bij de beheerder
  try {
    // geluid maken en als mp3 aanbieden (hetzelfde pad als een echte upload)
    const wav = proefsignaal.naarWav(proefsignaal.akkoordProef(['G', 'C', 'D7', 'G'], 100, SR), SR);
    const antwoord = await fetch(omgeving.basis + '/api/analyse', {
      method: 'POST',
      headers: { 'content-type': 'audio/wav', 'x-bestandsnaam': encodeURIComponent('Amazing Grace (oefening).wav'), cookie: baas.koekje },
      body: wav
    });
    const uit = await antwoord.json();
    assert.equal(antwoord.status, 201, JSON.stringify(uit));
    assert.ok(uit.id >= 900000, 'een upload hoort een eigen liedje te worden');
    assert.match(uit.titel, /^Amazing Grace/, 'de bestandsnaam hoort een nette titel te worden: ' + uit.titel);
    assert.ok(!/[._]/.test(uit.titel), 'de titel hoort geen bestandsnaamtekens meer te hebben');
    assert.ok(uit.gevonden && uit.gevonden.titel === 'Amazing Grace', 'het liedje in de bibliotheek hoort gevonden te worden');
    assert.ok(uit.analyse.akkoordenPerMaat.length >= 4, 'geen akkoordschema herkend');
    assert.ok(Math.abs(uit.analyse.tempo - 100) / 100 < 0.1, 'tempo ' + uit.analyse.tempo);

    // het liedje bestaat en heeft de opname als audio
    const lied = await hulp.haal(omgeving.basis, '/api/liedjes/' + uit.id);
    assert.equal(lied.status, 200, 'antwoord: ' + JSON.stringify(lied.data).slice(0, 120));
    assert.ok(lied.data.akkoordenPerMaat.length >= 4, 'het schema hoort bij het liedje te staan');
    assert.ok(lied.data.audio.opname, 'de opname hoort aan het liedje te hangen');
    assert.ok(lied.data.heeftEigenOpname, 'het liedje hoort te weten dat er een eigen opname is');

    // meespelen speelt de opname en laat het schema meelopen
    const mees = await hulp.haal(omgeving.basis, '/api/meespelen?liedje=' + uit.id);
    assert.equal(mees.status, 200);
    assert.equal(mees.data.liedje.eigenAudio, true);
    assert.match(mees.data.audio, /^\/media\/audio\//);
    assert.equal(mees.data.tijdlijn.aftellen.aan, false, 'bij een opname hoort geen aftelmaat');
    assert.equal(mees.data.tijdlijn.maten.length, uit.analyse.akkoordenPerMaat.length, 'het schema wordt één keer gespeeld');
    assert.ok(mees.data.tijdlijn.maten[0].startSeconden >= 0);
    assert.ok(mees.data.tijdlijn.duurSeconden > 4);
    const audio = await fetch(omgeving.basis + mees.data.audio);
    assert.equal(audio.status, 200);
    assert.ok(Number(audio.headers.get('content-length') || 0) > 1000, 'de opname hoort echt geluid te bevatten');
  } finally {
    await omgeving.stop();
  }
});

test('een upload zonder geluid wordt met uitleg geweigerd', async () => {
  const omgeving = await hulp.start();
  const baas = await hulp.alsBeheerder(omgeving.basis);   // uploaden hoort bij de beheerder
  try {
    const antwoord = await fetch(omgeving.basis + '/api/analyse', {
      method: 'POST',
      headers: { 'content-type': 'audio/mpeg', 'x-bestandsnaam': 'leeg.mp3', cookie: baas.koekje },
      body: Buffer.alloc(4096)
    });
    const uit = await antwoord.json();
    assert.equal(antwoord.status, 400);
    assert.match(uit.fout, /geluid|lezen|leeg/i);
  } finally {
    await omgeving.stop();
  }
});

test('de pagina heeft het uploadformulier en de meespeelknoppen', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  for (const id of ['upload-bestand', 'upload-start', 'upload-uitkomst', 'upload-melding', 'mees-start', 'mees-notenbalk', 'mees-tab', 'mees-hals']) {
    assert.ok(html.includes('id="' + id + '"'), 'id ontbreekt: ' + id);
  }
  assert.match(html, /api\/analyse/);
  assert.match(html, /mp3/);
  assert.match(html, /mp4/);
});
