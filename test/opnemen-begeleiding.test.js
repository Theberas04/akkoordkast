'use strict';
// Opnemen mét begeleiding: op het liedblad een opname die de begeleiding en de microfoon samen
// vastlegt (via de mengtafel van de WebAudio-kaart). De proef bewaakt de bedrading in de pagina
// en dat de opname-upload zijn koppen op één plek heeft.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const lees = (naam) => fs.readFileSync(path.join(__dirname, '..', naam), 'utf8');

test('het blad biedt opnemen met de begeleiding aan', () => {
  const html = lees('public/index.html');
  for (const id of ['opnb-start', 'opnb-stop', 'opnb-tijd', 'opnb-stand', 'opnb-speel', 'opnb-bewaar', 'opnb-weg', 'opnb-audio', 'opnb-melding']) {
    assert.ok(html.includes('id="' + id + '"'), 'de pagina hoort ' + id + ' te hebben');
  }
  assert.ok(html.includes('Neem jezelf op met deze begeleiding'), 'de knop hoort gewone taal te spreken');
  assert.ok(html.includes('oordopjes'), 'de tip over oordopjes hoort erbij te staan');
  for (const fn of ['function opnbStart(', 'function opnbStop(', 'function opnbKlaar(', 'function opnbSpeel(',
    'function opnbWeg(', 'function begeleidingZonderSpelen(']) {
    assert.ok(html.includes(fn), fn + ' hoort te bestaan');
  }
});

test('de opname mengt de begeleiding en de microfoon via de mengtafel', () => {
  const html = lees('public/index.html');
  assert.ok(html.includes('createMediaElementSource'), 'de begeleiding hoort aan de mengtafel te hangen');
  assert.ok(html.includes('createMediaStreamDestination'), 'de microfoon en de begeleiding horen samen in de opname');
  assert.ok(html.includes('OPNB.bronVoor !== sp'), 'een nieuw blad hoort een nieuw element aan te haken');
  assert.ok(html.includes("addEventListener('ended'"), 'de opname hoort te stoppen als de begeleiding klaar is');
  assert.ok(html.includes('mixGain.connect(mix)') && html.includes('micGain.connect(mix)'),
    'de mengtafel hoort op de stream-bestemming zelf aan te sluiten (mix.destination bestaat niet)');
  assert.ok(!html.includes('connect(mix.destination)'), 'mix.destination bestaat niet en liet de opname stuklopen');
});

test('een lopende opname stopt als je een ander liedje opent', () => {
  const html = lees('public/index.html');
  const blad = html.slice(html.indexOf('function tekenLiedje('), html.indexOf('function tekenLiedje(') + 500);
  assert.ok(blad.includes('opnbStop()'), 'het oude blad hoort de opname netjes te stoppen');
});

test('de opname-upload stuurt al zijn koppen in één lijst', () => {
  const html = lees('public/index.html');
  // Let op: hetzelfde adres bestaat ook als DELETE (geluid weghalen); dit is de upload-fetch zelf.
  const plek = html.indexOf("fetch('/api/liedjes/' + l.id + '/audio'");
  assert.ok(plek > 0, 'de upload hoort te bestaan');
  const stuk = html.slice(plek, plek + 420);
  const koppen = (stuk.match(/headers:/g) || []).length;
  assert.equal(koppen, 1, 'twee headers-blokken overschrijven elkaar (x-profiel en x-akkoordkast verdwenen zo)');
  assert.ok(stuk.includes('x-profiel'), 'het profiel hoort mee te gaan');
  assert.ok(stuk.includes('x-bestandsnaam'), 'de bestandsnaam hoort mee te gaan');
});
