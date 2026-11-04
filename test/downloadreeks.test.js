'use strict';
// Een hele reeks (afspeellijst of kanaal) ophalen: elk nummer wordt een eigen liedje. yt-dlp is ook
// hier een proefprogramma: geen internet, niets gedownload.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { start, haal, alsBeheerder } = require('./hulp');

function proefmap() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ak-reeks-'));
}

// Het proefprogramma doet of het een afspeellijst van drie nummers is: het meldt de nummers, de
// video-id's en schrijft drie mp3's met de nummering die yt-dlp ook gebruikt.
function nepYtdlp(map) {
  const pad = path.join(map, 'yt-dlp-proef.sh');
  const regels = [
    '#!/bin/bash',
    'printf "%s\\n" "$@" > "' + path.join(map, 'argumenten.txt') + '"',
    'uit=""',
    'vorige=""',
    'for arg in "$@"; do if [ "$vorige" = "-o" ]; then uit="$arg"; fi; vorige="$arg"; done',
    'map="$(dirname "$uit")"',
    'mkdir -p "$map"',
    'echo "[download] Downloading item 1 of 3"',
    'echo "[youtube] aaaaaaaaaaa: Downloading webpage"',
    'printf ID3een > "$map/01 - Eerste liedje.mp3"',
    'echo "[ExtractAudio] Destination: $map/01 - Eerste liedje.mp3"',
    'echo "[download] Downloading item 2 of 3"',
    'echo "[youtube] bbbbbbbbbbb: Downloading webpage"',
    'printf ID3twee > "$map/02 - Tweede liedje.mp3"',
    'echo "[ExtractAudio] Destination: $map/02 - Tweede liedje.mp3"',
    'echo "[download] Downloading item 3 of 3"',
    'echo "[youtube] ccccccccccc: Downloading webpage"',
    'printf ID3drie > "$map/03 - Derde liedje.mp3"',
    'echo "[ExtractAudio] Destination: $map/03 - Derde liedje.mp3"',
  ];
  fs.writeFileSync(pad, regels.join('\n') + '\n');
  fs.chmodSync(pad, 0o755);
  return pad;
}

async function wachtTotReeksKlaar(basis, seconden = 15) {
  const eind = Date.now() + seconden * 1000;
  let laatste = null;
  while (Date.now() < eind) {
    laatste = (await haal(basis, '/api/download?los=1')).data;
    if (laatste.status === 'klaar' || laatste.status === 'fout') return laatste;
    await new Promise(r => setTimeout(r, 130));
  }
  return laatste;
}

test('een afspeellijst ophalen levert per nummer een eigen liedje op', async () => {
  const map = proefmap();
  process.env.YTDLP = nepYtdlp(map);
  process.env.DOWNLOAD_DIR = path.join(map, 'Gedownload');
  process.env.MUSIC_DIR = path.join(map, 'muziek');
  fs.mkdirSync(process.env.MUSIC_DIR, { recursive: true });

  const omgeving = await start();
  const baas = await alsBeheerder(omgeving.basis);
  try {
    const voor = await haal(omgeving.basis, '/api/liedjes?aantal=1');
    const aantalVoor = voor.data.totaal;

    // Zonder inloggen mag het niet.
    const zonder = await haal(omgeving.basis, '/api/download', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reeks: true, url: 'https://www.youtube.com/@test/videos' })
    });
    assert.equal(zonder.status, 403);

    const gestart = await baas.post('/api/download', {
      reeks: true, url: 'https://www.youtube.com/@test/videos', max: 3
    });
    assert.equal(gestart.status, 200, JSON.stringify(gestart.data));
    assert.equal(gestart.data.reeks, true);

    const klaar = await wachtTotReeksKlaar(omgeving.basis);
    assert.equal(klaar.status, 'klaar', JSON.stringify(klaar).slice(0, 300));
    assert.equal(klaar.gedaan, 3, 'er horen drie bestanden verwerkt te zijn');
    assert.equal(klaar.mislukt, 0);

    // yt-dlp is aangeroepen met de bovengrens en zónder de vlag voor één nummer.
    const argumenten = fs.readFileSync(path.join(map, 'argumenten.txt'), 'utf8').split('\n');
    assert.ok(argumenten.includes('--playlist-end'), 'de bovengrens hoort meegegeven te worden');
    assert.ok(argumenten.includes('3'), 'en wel het aantal dat de app vroeg');
    assert.ok(!argumenten.includes('--no-playlist'), 'bij een reeks hoort de afspeellijst gevolgd te worden');

    // Drie liedjes erbij, elk met de muziek eraan en de titel zonder de nummering.
    const na = await haal(omgeving.basis, '/api/liedjes?aantal=1');
    assert.equal(na.data.totaal, aantalVoor + 3, 'de bibliotheek hoort drie liedjes rijker te zijn');
    const titels = [];
    for (const stuk of klaar.nieuweLiedjes) {
      const detail = await haal(omgeving.basis, '/api/liedjes/' + stuk.id);
      assert.equal(detail.status, 200);
      titels.push(detail.data.titel);
      assert.equal(detail.data.heeftMuziek, true, 'het liedje hoort muziek te hebben');
      assert.equal(detail.data.eigen, true);
    }
    assert.deepEqual(titels.sort(), ['Derde liedje', 'Eerste liedje', 'Tweede liedje']);
    assert.equal(klaar.nieuweLiedjes.length, 3);

    // En de muziek van het eerste liedje is echt te beluisteren.
    const eerste = klaar.nieuweLiedjes.filter(l => l.titel === 'Eerste liedje')[0];
    const stroom = await haal(omgeving.basis, '/api/muziek/bestand?liedje=' + (eerste ? eerste.id : klaar.nieuweLiedjes[0].id));
    assert.equal(stroom.status, 200);

    // De video-id uit de uitvoer is aan het liedje gehangen.
    const eenVanDe = klaar.nieuweLiedjes[0];
    const yt = await haal(omgeving.basis, '/api/youtube?liedje=' + eenVanDe.id);
    assert.match(yt.data.video || '', /^[abc]{11}$/, 'de video-id hoort bewaard te zijn');
  } finally {
    await omgeving.stop();
    delete process.env.YTDLP;
    delete process.env.DOWNLOAD_DIR;
  }
});
