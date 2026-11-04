'use strict';
// Het ophalen van een link naar een mp3. yt-dlp wordt hier vervangen door een klein
// proefprogramma dat doet alsof: zo test ik de hele machinerie (starten, voortgang lezen,
// bestand vinden, fouten doorgeven) zonder internet en zonder iets te downloaden.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { maakDownloader, linkOk, percentageUit, bestandUit } = require('../lib/downloader');

function proefmap() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ak-download-'));
}

function nepYtdlp(map, { faal = false, niets = false, vertraag = 0 } = {}) {
  const pad = path.join(map, 'yt-dlp-proef.sh');
  const regels = [
    '#!/bin/bash',
    'uit=""',
    'vorige=""',
    'for arg in "$@"; do if [ "$vorige" = "-o" ]; then uit="$arg"; fi; vorige="$arg"; done',
    'map="$(dirname "$uit")"',
    'mkdir -p "$map"',
    'doel="$map/Proefliedje.mp3"',
    'echo "[download]   0.0% of 3.00MiB"',
    'echo "[download]  42.5% of 3.00MiB"',
    vertraag ? `sleep ${vertraag}` : 'true',
    faal ? 'echo "ERROR: Video unavailable" >&2' : 'true',
    faal ? 'exit 1' : 'true',
    niets ? 'echo "[download] 100% of 3.00MiB"' : 'printf "ID3" > "$doel"',
    niets ? 'true' : 'echo "[ExtractAudio] Destination: $doel"',
    'echo "[download] 100% of 3.00MiB"',
  ];
  fs.writeFileSync(pad, regels.join('\n') + '\n');
  fs.chmodSync(pad, 0o755);
  return pad;
}

async function wachtTot(stand, seconden = 8) {
  const eind = Date.now() + seconden * 1000;
  while (Date.now() < eind) {
    const nu = stand();
    if (nu.status !== 'bezig') return nu;
    await new Promise(r => setTimeout(r, 60));
  }
  throw new Error('de download wilde niet klaar worden');
}

test('alleen http- en https-links, en nooit een adres in je eigen netwerk', () => {
  const goed = [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ',
    'http://example.com/liedje',
  ];
  for (const link of goed) {
    const uit = linkOk(link);
    assert.equal(uit.ok, true, 'deze link hoorde te mogen: ' + link);
    assert.ok(uit.url.startsWith('http'), 'het adres hoort een volledig adres te zijn');
  }
  assert.equal(linkOk('https://youtu.be/dQw4w9WgXcQ').youtube, true);
  assert.equal(linkOk('https://example.com/liedje').youtube, false);

  const fout = [
    '', '   ', 'geen link',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'http://localhost:8090/liedjes.json',
    'http://127.0.0.1/',
    'http://192.168.1.100/muziek.mp3',
    'http://10.0.0.5/',
    'http://172.16.4.9/',
    'http://169.254.1.1/',
    'http://nas.local/muziek.mp3',
    'http://router.internal/',
    'x'.repeat(600),
  ];
  for (const link of fout) {
    const uit = linkOk(link);
    assert.equal(uit.ok, false, 'deze link hoorde geweigerd te worden: ' + link);
    assert.ok(uit.fout.length > 10, 'er hoort een uitleg bij te staan');
  }
});

test('de uitvoer van yt-dlp wordt goed gelezen', () => {
  assert.equal(percentageUit('[download]  42.5% of 3.00MiB at 1.2MiB/s'), 42.5);
  assert.equal(percentageUit('[download] 100% of 3.00MiB'), 100);
  assert.equal(percentageUit('[download] 250% onzin'), 100, 'nooit meer dan honderd');
  assert.equal(percentageUit('iets anders'), null);
  assert.equal(bestandUit('[ExtractAudio] Destination: /muziek/Het Dorp.mp3'), '/muziek/Het Dorp.mp3');
  assert.equal(bestandUit('has already been downloaded: /muziek/Oud.mp3'), '/muziek/Oud.mp3');
  assert.equal(bestandUit('[ExtractAudio] Destination: /muziek/verslag.txt'), '');
  assert.equal(bestandUit('gewoon een regel'), '');
});

test('een link wordt omgezet naar een mp3 in de map die je aanwees', async () => {
  const map = proefmap();
  const ytdlp = nepYtdlp(map);
  const d = maakDownloader({ map, ytdlp });

  const begin = d.standVan();
  assert.equal(begin.status, 'leeg');

  const gestart = d.start('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal(gestart.ok, true);

  const klaar = await wachtTot(d.standVan);
  assert.equal(klaar.status, 'klaar', JSON.stringify(klaar));
  assert.equal(klaar.procent, 100);
  assert.equal(path.basename(klaar.bestand), 'Proefliedje.mp3');
  assert.ok(fs.existsSync(klaar.bestand), 'het bestand hoort er echt te staan');
  assert.ok(klaar.log.length >= 2, 'de voortgang hoort bewaard te blijven');
});

test('een link die niet lukt geeft een duidelijke melding, zonder bestand', async () => {
  const map = proefmap();
  const d = maakDownloader({ map, ytdlp: nepYtdlp(map, { faal: true }) });
  d.start('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  const klaar = await wachtTot(d.standVan);
  assert.equal(klaar.status, 'fout');
  assert.match(klaar.fout, /niet gelukt/i);
  assert.match(klaar.fout, /Video unavailable/i, 'de melding van yt-dlp hoort erin te staan');
  assert.equal(klaar.bestand, '');
});

test('een link waar niets uit komt wordt als fout gemeld', async () => {
  const map = proefmap();
  const d = maakDownloader({ map, ytdlp: nepYtdlp(map, { niets: true }) });
  d.start('https://example.com/geen-muziek');
  const klaar = await wachtTot(d.standVan);
  assert.equal(klaar.status, 'fout');
  assert.equal(klaar.bestand, '');
  assert.match(klaar.fout, /niets opgeslagen/i);
});

test('er loopt maar één download tegelijk', async () => {
  const map = proefmap();
  const d = maakDownloader({ map, ytdlp: nepYtdlp(map, { vertraag: 1 }) });
  assert.equal(d.start('https://youtu.be/dQw4w9WgXcQ').ok, true);
  const tweede = d.start('https://youtu.be/aaaaaaaaaaa');
  assert.equal(tweede.ok, false);
  assert.match(tweede.fout, /loopt al een download/i);
  await wachtTot(d.standVan, 12);
});

test('een ontbrekend ophaalprogramma wordt netjes gemeld', async () => {
  const map = proefmap();
  const d = maakDownloader({ map, ytdlp: path.join(map, 'bestaat-niet') });
  const gestart = d.start('https://youtu.be/dQw4w9WgXcQ');
  assert.equal(gestart.ok, true);
  const klaar = await wachtTot(d.standVan);
  assert.equal(klaar.status, 'fout');
  assert.match(klaar.fout, /yt-dlp/i);
});

test('een link naar je eigen netwerk wordt niet eens gestart', () => {
  const map = proefmap();
  const d = maakDownloader({ map, ytdlp: nepYtdlp(map) });
  const uit = d.start('http://192.168.1.100/muziek.mp3');
  assert.equal(uit.ok, false);
  assert.equal(d.standVan().status, 'leeg', 'er hoort geen download te zijn begonnen');
});
