'use strict';
// De routekant van het ophalen: een link posten, de stand volgen tot hij klaar is, en dan
// controleren dat het bestand echt aan het liedje hangt en via de speler te beluisteren is.
// yt-dlp is ook hier een proefprogramma: geen internet, niets gedownload.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { start, haal, post } = require('./hulp');

function proefmap() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ak-dlroute-'));
}

function nepYtdlp(map) {
  const pad = path.join(map, 'yt-dlp-proef.sh');
  fs.writeFileSync(pad, [
    '#!/bin/bash',
    'uit=""',
    'vorige=""',
    'for arg in "$@"; do if [ "$vorige" = "-o" ]; then uit="$arg"; fi; vorige="$arg"; done',
    'map="$(dirname "$uit")"',
    'mkdir -p "$map"',
    'doel="$map/Proefliedje.mp3"',
    'echo "[download]  55.0% of 3.00MiB"',
    'printf "ID3proef" > "$doel"',
    'echo "[ExtractAudio] Destination: $doel"',
    'echo "[download] 100% of 3.00MiB"',
  ].join('\n') + '\n');
  fs.chmodSync(pad, 0o755);
  return pad;
}

async function wachtTotGekoppeld(basis, liedje, seconden = 10) {
  const eind = Date.now() + seconden * 1000;
  let laatste = null;
  while (Date.now() < eind) {
    laatste = (await haal(basis, '/api/download?liedje=' + liedje)).data;
    if (laatste.status === 'klaar' && laatste.gekoppeld) return laatste;
    if (laatste.status === 'fout') return laatste;
    await new Promise(r => setTimeout(r, 120));
  }
  return laatste;
}

test('een link ophalen levert een mp3 op die meteen aan het liedje hangt', async () => {
  const map = proefmap();
  process.env.YTDLP = nepYtdlp(map);
  process.env.DOWNLOAD_DIR = path.join(map, 'Gedownload');
  process.env.MUSIC_DIR = path.join(map, 'muziek');
  fs.mkdirSync(process.env.MUSIC_DIR, { recursive: true });

  const omgeving = await start();
  try {
    const lijst = await haal(omgeving.basis, '/api/liedjes?aantal=1');
    const lied = lijst.data.liedjes[0];
    assert.equal(lied.heeftMuziek, false);

    // Onbruikbare en verboden links worden geweigerd, zonder dat er iets begint.
    for (const fout of ['', 'geen link', 'file:///etc/passwd', 'http://192.168.1.100/muziek.mp3']) {
      const geweigerd = await post(omgeving.basis, '/api/download', { liedje: lied.id, url: fout });
      assert.equal(geweigerd.status, 400, 'dit hoorde geweigerd te worden: ' + fout);
      assert.ok(geweigerd.data.fout.length > 10);
    }

    // En nu een echte link.
    const gestart = await post(omgeving.basis, '/api/download', { liedje: lied.id, url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
    assert.equal(gestart.status, 200, JSON.stringify(gestart.data));
    assert.equal(gestart.data.map, process.env.DOWNLOAD_DIR);

    const klaar = await wachtTotGekoppeld(omgeving.basis, lied.id);
    assert.equal(klaar.status, 'klaar', JSON.stringify(klaar));
    assert.equal(klaar.procent, 100);
    assert.equal(klaar.bestand, 'Proefliedje.mp3');
    assert.equal(klaar.gekoppeld, true, 'het bestand hoort aan het liedje te hangen');

    // De downloadmap is er als muziekmap bijgekomen, en het liedje meldt muziek.
    const mappen = await haal(omgeving.basis, '/api/mappen');
    assert.ok(JSON.stringify(mappen.data).includes('Gedownload'), 'de downloadmap hoort erbij te staan');
    const detail = await haal(omgeving.basis, '/api/liedjes/' + lied.id);
    assert.equal(detail.data.heeftMuziek, true);
    assert.match(detail.data.muziek.url, /^\/api\/muziek\/bestand\?liedje=/);

    // En het is te beluisteren: de stream geeft de bytes van het bestand.
    const stroom = await haal(omgeving.basis, '/api/muziek/bestand?liedje=' + lied.id);
    assert.equal(stroom.status, 200);
    assert.match(stroom.type, /audio\//);
    assert.equal(stroom.data, 'ID3proef');

    // De link zelf is ook bewaard, zodat je hem terugziet.
    const yt = await haal(omgeving.basis, '/api/youtube?liedje=' + lied.id);
    assert.equal(yt.data.video, 'dQw4w9WgXcQ');
  } finally {
    await omgeving.stop();
    delete process.env.YTDLP;
    delete process.env.DOWNLOAD_DIR;
  }
});
