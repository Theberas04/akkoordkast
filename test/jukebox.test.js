'use strict';
// Jukebox: liedjes achter elkaar, met de begeleiding van de app. De kaart staat op het tabblad
// Liedjes; deze proef bewaakt de bedrading en de afspraken: profiel en app-merk op elke aanvraag
// (zie aanvragen.test.js), liedjes zonder akkoorden overslaan, geheugen opruimen en netjes stoppen.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const lees = (naam) => fs.readFileSync(path.join(__dirname, '..', naam), 'utf8');

test('de jukebox staat op het tabblad liedjes', () => {
  const html = lees('public/index.html');
  for (const id of ['jukebox-kaart', 'jukebox-bron', 'jukebox-start', 'jukebox-stop', 'jukebox-vorige',
    'jukebox-volgende', 'jukebox-stand', 'jukebox-nu', 'jukebox-nu-titel', 'jukebox-balk', 'jukebox-tijd',
    'jukebox-open', 'jukebox-audio', 'jukebox-melding']) {
    assert.ok(html.includes('id="' + id + '"'), 'de pagina hoort ' + id + ' te hebben');
  }
  assert.ok(html.includes('mijn favorieten') && html.includes('wat er nu in de lijst staat'),
    'de twee bronnen horen in gewone taal te staan');
  for (const fn of ['function jukeboxStart(', 'function jukeboxStop(', 'function jukeboxStartItem(',
    'function jukeboxBegeleiding(', 'function jukeboxSnoei(', 'function jukeboxEinde(']) {
    assert.ok(html.includes(fn), fn + ' hoort te bestaan');
  }
});

test('de jukebox vraagt de begeleiding met profiel en app-merk en werkt vooruit', () => {
  const html = lees('public/index.html');
  const plek = html.indexOf("fetch('/api/audio/preview?liedje='");
  assert.ok(plek > 0, 'de begeleiding hoort per liedje opgevraagd te worden');
  const stuk = html.slice(plek, plek + 500);
  assert.ok(stuk.includes('x-profiel') && stuk.includes('x-akkoordkast'),
    'de huisregel van aanvragen.test.js geldt ook voor de jukebox');
  assert.ok(html.includes('jukeboxBegeleiding(volgend.id)'), 'het volgende liedje hoort alvast gemaakt te worden');
  assert.ok(html.includes('zonderAkkoorden'), 'zonder akkoorden hoort de jukebox over te slaan');
  assert.ok(html.includes("addEventListener('ended'"), 'aan het eind van een liedje hoort het volgende te beginnen');
});

test('de jukebox houdt het geheugen klein en zegt het gewoon als er niets te spelen valt', () => {
  const html = lees('public/index.html');
  assert.ok(html.includes('revokeObjectURL'), 'opgeslagen begeleiding hoort vrijgegeven te worden');
  assert.ok(html.includes("toonMelding('jukebox-melding', '', '')"),
    'de wachtrij-melding hoort te verdwijnen zodra er gespeeld wordt');
  assert.ok(html.includes('nog geen favorieten'), 'zonder favorieten hoort de app dat gewoon te zeggen');
  assert.ok(html.includes('Er staat nu niets in de lijst om te spelen'), 'en ook als de lijst leeg is');
});
