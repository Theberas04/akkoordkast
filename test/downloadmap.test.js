'use strict';
// De map waarin opgehaalde muziek terechtkomt. Valt de NAS-koppeling weg (of is de map er niet
// meer), dan hoort de app niet met een rauwe systeemfout te stoppen: hij hoort de muziek in zijn
// eigen map te zetten en er zelf bij te zeggen waar. Dit is de fout die een gebruiker zag:
//   ENOENT: no such file or directory, mkdir '/mnt/Nas/Nas-Opslag/Muziek/Gedownload'
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const hulp = require('./hulp');

const GEVRAAGD = '/dev/null/Gedownload';

test('een onbereikbare downloadmap: de app valt terug en zegt waar de muziek komt', async () => {
  process.env.DOWNLOAD_DIR = GEVRAAGD;
  const omgeving = await hulp.start();
  try {
    const baas = await hulp.alsBeheerder(omgeving.basis, 'proefwachtwoord-downloadmap');
    const mappen = await baas.haal('/api/mappen');
    assert.equal(mappen.status, 200);
    const dl = mappen.data.download || {};
    assert.equal(dl.terugval, true, 'de app hoort te melden dat hij terugvalt');
    assert.equal(dl.gevraagd, GEVRAAGD, 'de gevraagde map hoort in het antwoord te staan');
    assert.notEqual(dl.map, GEVRAAGD, 'er hoort een andere map gebruikt te worden');
    assert.ok(dl.map.endsWith(path.sep + 'gedownload'), 'de terugvalmap is de eigen map van de app: ' + dl.map);
    assert.ok(fs.existsSync(dl.map), 'de terugvalmap hoort te bestaan');
    assert.match(dl.fout || '', /mkdir|ENOTDIR|ENOENT|EACCES/, 'de systeemmelding hoort bewaard te blijven');

    // En de download zelf hoort te werken in die terugvalmap, zonder rauwe fout.
    // Een reeks hoeft niet aan een bestaand liedje te hangen; hij zegt meteen waar hij gaat
    // ophalen. (Het ophalen zelf mislukt hier — er is geen yt-dlp — maar de map hoort goed te
    // zijn en er hoort geen rauwe systeemfout terug te komen.)
    const gestart = await baas.post('/api/download', { reeks: true, url: 'https://www.youtube.com/@Proef', max: 1 });
    assert.equal(gestart.status, 200);
    assert.equal(gestart.data.map, dl.map, 'het ophalen hoort in de terugvalmap te gebeuren');
    assert.equal(gestart.data.terugval, true);
    assert.equal(gestart.data.gevraagd, GEVRAAGD);
    assert.ok(!/ENOENT/.test(JSON.stringify(gestart.data)), 'geen rauwe ENOENT in het antwoord');
  } finally {
    delete process.env.DOWNLOAD_DIR;
    await omgeving.stop();
  }
});

test('de pagina zegt het zelf: waar nieuwe muziek terechtkomt, en wat je moet doen', async () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  assert.match(html, /id="mappen-download"/);
  assert.match(html, /is niet bereikbaar, dus nieuwe muziek/);
  assert.match(html, /nas-koppelen\.sh/, 'de reparatiestap hoort erbij te staan');
  assert.match(html, /Nieuwe muziek die je ophaalt komt in/);
  // De melding wordt bij het laden van de mappen gevuld (en bij het starten van een reeks).
  assert.match(html, /var waar = \$\('mappen-download'\)/);
  const bron = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(bron, /DOWNLOAD_DIR_GEVRAAGD/);
  assert.match(bron, /function mapSchrijfFout\(/);
  assert.match(bron, /var DOWNLOAD_TERUGVAL = null;/);
  assert.match(bron, /Nieuwe muziek komt in .* terecht/);
});

// De koppeling kan ook tijdens het draaien wegvallen: bij het starten was de map er nog, bij het
// ophalen niet meer. Dan hoort de downloader zelf uit te wijken naar de eigen map van de app.
test('de downloader wijkt zelf uit als de map pas later onbruikbaar wordt', async () => {
  const os = require('os');
  const { maakDownloader } = require('../lib/downloader');
  const wortel = fs.mkdtempSync(path.join(os.tmpdir(), 'ak-nood-'));
  const noodmap = path.join(wortel, 'gedownload');
  const nep = path.join(wortel, 'nep-ytdlp.sh');
  fs.writeFileSync(nep, [
    '#!/bin/sh',
    'vorige=""; doel=""',
    'for a in "$@"; do if [ "$vorige" = "-o" ]; then doel="$a"; fi; vorige="$a"; done',
    'geen=$(printf "%s" "$doel" | sed "s/%(title)s/Proefnummer/; s/%(ext)s/mp3/; s/%(playlist_index)02d/01/")',
    'mkdir -p "$(dirname "$geen")"',
    ': > "$geen"',
    'echo "[ExtractAudio] Destination: $geen"',
    'exit 0',
    ''
  ].join('\n'), { mode: 0o755 });

  const dl = maakDownloader({ map: '/dev/null/Gedownload', noodmap, ytdlp: nep });
  const r = dl.start('https://www.youtube.com/watch?v=proef');
  assert.equal(r.ok, true, 'de download hoort te starten: ' + r.fout);

  for (let i = 0; i < 60 && dl.standVan().status === 'bezig'; i++) {
    await new Promise(r2 => setTimeout(r2, 100));
  }
  const stand = dl.standVan();
  assert.equal(stand.status, 'klaar', 'de download hoort klaar te zijn, niet: ' + stand.status + ' / ' + stand.fout);
  assert.equal(stand.terugval, true, 'de downloader hoort te melden dat hij uitweek');
  assert.equal(stand.map, noodmap, 'het bestand hoort in de eigen map van de app te staan');
  assert.ok(fs.readdirSync(noodmap).some(n => n.endsWith('.mp3')), 'er hoort een mp3 in de eigen map te staan');
  fs.rmSync(wortel, { recursive: true, force: true });
});

// Precies waar een gebruiker tegenaan liep: een liedje dat uit een link is opgehaald heeft wel
// muziek maar geen akkoorden. Dan hoort Meespelen de muziek te spelen in plaats van te weigeren met
// 'Van dit liedje is alleen de tekst overgeleverd'.
test('meespelen zonder akkoorden maar met muziek speelt gewoon de muziek', async () => {
  const os = require('os');
  const wortel = fs.mkdtempSync(path.join(os.tmpdir(), 'ak-mees-'));
  const nep = path.join(wortel, 'nep-ytdlp.sh');
  fs.writeFileSync(nep, [
    '#!/bin/sh',
    'vorige=""; doel=""',
    'for a in "$@"; do if [ "$vorige" = "-o" ]; then doel="$a"; fi; vorige="$a"; done',
    'geen=$(printf "%s" "$doel" | sed "s/%(title)s/Proefnummer/; s/%(ext)s/mp3/; s/%(playlist_index)02d/01/")',
    'mkdir -p "$(dirname "$geen")"',
    ': > "$geen"',
    'echo "[ExtractAudio] Destination: $geen"',
    'exit 0',
    ''
  ].join('\n'), { mode: 0o755 });
  process.env.YTDLP = nep;
  process.env.DOWNLOAD_DIR = path.join(wortel, 'Gedownload');

  const omgeving = await hulp.start();
  try {
    const baas = await hulp.alsBeheerder(omgeving.basis, 'proefwachtwoord-meespelen');
    const gestart = await baas.post('/api/download', { reeks: true, url: 'https://www.youtube.com/@Proef', max: 1 });
    assert.equal(gestart.status, 200, JSON.stringify(gestart.data));

    // Wachten tot het opgehaalde bestand een liedje met muziek is geworden.
    let liedje = null;
    for (let i = 0; i < 100 && !liedje; i++) {
      await new Promise(r => setTimeout(r, 150));
      const lijst = await hulp.haal(omgeving.basis + '/api/liedjes?zoek=Proefnummer&limiet=5');
      const items = (lijst.data && (lijst.data.liedjes || lijst.data.items)) || [];
      liedje = items.find(x => x.heeftMuziek) || null;
    }
    assert.ok(liedje, 'het opgehaalde nummer hoort een liedje met muziek te zijn');

    const mees = await hulp.haal(omgeving.basis + `/api/meespelen?liedje=${liedje.id}&capo=0`);
    assert.equal(mees.status, 200, 'meespelen hoort te lukken met muziek: ' + JSON.stringify(mees.data));
    assert.equal(mees.data.alleenMuziek, true, 'de app hoort te melden dat er alleen muziek is');
    assert.equal(mees.data.tijdlijn, null, 'er is geen akkoordschema om mee te laten lopen');
    assert.match(String(mees.data.audio), /muziek\/bestand\?liedje=/, 'de muziek van het liedje wordt gespeeld');
    assert.match(String(mees.data.melding || ''), /akkoorden/i, 'de app legt uit waarom er niets meeloopt');

    // Een gewoon liedje met akkoorden doet het nog steeds zoals het hoorde.
    const gewoon = await hulp.haal(omgeving.basis + '/api/meespelen?liedje=1&capo=0');
    assert.equal(gewoon.status, 200, JSON.stringify(gewoon.data));
    assert.ok(gewoon.data.tijdlijn && gewoon.data.tijdlijn.maten, 'een liedje met akkoorden hoort een tijdlijn te hebben');
  } finally {
    delete process.env.YTDLP;
    delete process.env.DOWNLOAD_DIR;
    await omgeving.stop();
    fs.rmSync(wortel, { recursive: true, force: true });
  }
});
