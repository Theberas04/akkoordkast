'use strict';
// Een link ophalen als *nieuwe muziek*: er is nog geen liedje, en het liedje komt er pas als het
// bestand binnen is. yt-dlp is ook hier een proefprogramma: geen internet, niets gedownload.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { start, haal, alsBeheerder } = require('./hulp');

function proefmap() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ak-dlnieuw-'));
}

// Het proefprogramma schrijft een mp3, in de map die de app als downloadmap gebruikt, met de
// titel die yt-dlp normaal uit het filmpje haalt.
function nepYtdlp(map, bestandsnaam) {
  const pad = path.join(map, 'yt-dlp-proef.sh');
  fs.writeFileSync(pad, [
    '#!/bin/bash',
    'uit=""',
    'vorige=""',
    'for arg in "$@"; do if [ "$vorige" = "-o" ]; then uit="$arg"; fi; vorige="$arg"; done',
    'map="$(dirname "$uit")"',
    'mkdir -p "$map"',
    'doel="$map/' + bestandsnaam + '"',
    'echo "[download]  70.0% of 3.00MiB"',
    'printf "ID3nieuw" > "$doel"',
    'echo "[ExtractAudio] Destination: $doel"',
    'echo "[download] 100% of 3.00MiB"',
  ].join('\n') + '\n');
  fs.chmodSync(pad, 0o755);
  return pad;
}

async function wachtTotLosKlaar(basis, seconden = 12) {
  const eind = Date.now() + seconden * 1000;
  let laatste = null;
  while (Date.now() < eind) {
    laatste = (await haal(basis, '/api/download?los=1')).data;
    if (laatste.status === 'klaar' || laatste.status === 'fout') return laatste;
    await new Promise(r => setTimeout(r, 120));
  }
  return laatste;
}

test('een link als nieuwe muziek wordt een eigen liedje met de muziek eraan', async () => {
  const map = proefmap();
  process.env.YTDLP = nepYtdlp(map, 'Nieuwe Muziek.mp3');
  process.env.DOWNLOAD_DIR = path.join(map, 'Gedownload');
  process.env.MUSIC_DIR = path.join(map, 'muziek');
  fs.mkdirSync(process.env.MUSIC_DIR, { recursive: true });

  const omgeving = await start();
  const baas = await alsBeheerder(omgeving.basis);
  try {
    const voor = await haal(omgeving.basis, '/api/liedjes?aantal=1');
    const aantalVoor = voor.data.totaal;

    // Zonder inloggen mag het niet, en een verboden link ook niet.
    const zonder = await haal(omgeving.basis, '/api/download', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nieuw: true, url: 'https://youtu.be/dQw4w9WgXcQ' })
    });
    assert.equal(zonder.status, 403);
    const verboden = await baas.post('/api/download', { nieuw: true, url: 'http://192.168.1.100/lied.mp3' });
    assert.equal(verboden.status, 400);

    // En nu een echte link, als nieuwe muziek.
    const gestart = await baas.post('/api/download', { nieuw: true, url: 'https://youtu.be/dQw4w9WgXcQ' });
    assert.equal(gestart.status, 200, JSON.stringify(gestart.data));
    assert.equal(gestart.data.status, 'bezig');

    const klaar = await wachtTotLosKlaar(omgeving.basis);
    assert.equal(klaar.status, 'klaar', JSON.stringify(klaar));
    assert.equal(klaar.procent, 100);
    assert.equal(klaar.bestand, 'Nieuwe Muziek.mp3');
    assert.ok(klaar.nieuwLiedje >= 900000, 'er hoort een nieuw eigen liedje te zijn: ' + klaar.nieuwLiedje);

    // Het nieuwe liedje staat in de bibliotheek, met de muziek eraan en de titel uit het bestand.
    const na = await haal(omgeving.basis, '/api/liedjes?aantal=1');
    assert.equal(na.data.totaal, aantalVoor + 1, 'de bibliotheek hoort één liedje rijker te zijn');
    const detail = await haal(omgeving.basis, '/api/liedjes/' + klaar.nieuwLiedje);
    assert.equal(detail.status, 200, JSON.stringify(detail.data).slice(0, 200));
    assert.equal(detail.data.titel, 'Nieuwe Muziek');
    assert.equal(detail.data.heeftMuziek, true);
    assert.equal(detail.data.eigen, true);
    assert.equal(detail.data.youtube, 'dQw4w9WgXcQ');

    // En de muziek is echt te beluisteren via de speler.
    const stroom = await haal(omgeving.basis, '/api/muziek/bestand?liedje=' + klaar.nieuwLiedje);
    assert.equal(stroom.status, 200);
    assert.equal(stroom.data, 'ID3nieuw');

    // Een eigen titel meegeven mag ook.
    const tweede = await baas.post('/api/download', { nieuw: true, titel: 'Mijn eigen titel', url: 'https://youtu.be/dQw4w9WgXcQ' });
    assert.equal(tweede.status, 200);
    const klaar2 = await wachtTotLosKlaar(omgeving.basis);
    assert.equal(klaar2.status, 'klaar', JSON.stringify(klaar2));
    assert.notEqual(klaar2.nieuwLiedje, klaar.nieuwLiedje, 'het tweede liedje is een nieuw liedje');
    const detail2 = await haal(omgeving.basis, '/api/liedjes/' + klaar2.nieuwLiedje);
    assert.equal(detail2.data.titel, 'Mijn eigen titel');
  } finally {
    await omgeving.stop();
    delete process.env.YTDLP;
    delete process.env.DOWNLOAD_DIR;
  }
});
