'use strict';
// De downloadbestemming is een beheerderskeuze. Externe locaties moeten al gekoppeld en schrijfbaar
// zijn; een ontbrekende Drive- of NAS-mount mag nooit stilzwijgend naar de lokale map uitwijken.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const hulp = require('./hulp');

const OMGEVINGSLEUTELS = ['MUSIC_DIR', 'DOWNLOAD_DIR', 'YTDLP'];
function bewaarOmgeving() {
  const oud = {};
  for (const sleutel of OMGEVINGSLEUTELS) {
    oud[sleutel] = process.env[sleutel];
    delete process.env[sleutel];
  }
  return () => {
    for (const sleutel of OMGEVINGSLEUTELS) {
      if (oud[sleutel] === undefined) delete process.env[sleutel];
      else process.env[sleutel] = oud[sleutel];
    }
  };
}

async function wachtOpMp3(map) {
  const tot = Date.now() + 8000;
  while (Date.now() < tot) {
    const gevonden = fs.readdirSync(map).find(naam => naam.endsWith('.mp3'));
    if (gevonden) return path.join(map, gevonden);
    await new Promise(resolve => setTimeout(resolve, 60));
  }
  return '';
}

test('alleen Admin kan bestemmingen bekijken en de lokale map staat altijd klaar', async () => {
  const herstel = bewaarOmgeving();
  const omgeving = await hulp.start();
  try {
    const zonder = await hulp.haal(omgeving.basis, '/api/downloadbestemmingen');
    assert.equal(zonder.status, 403, 'de bestemmingen horen alleen voor Admin zichtbaar te zijn');
    const wijzigingZonderLogin = await hulp.post(omgeving.basis, '/api/downloadbestemmingen', {
      actie: 'selecteer', id: 'lokaal'
    });
    assert.equal(wijzigingZonderLogin.status, 403, 'wijzigen hoort achter de beheerderssessie te zitten');

    const baas = await hulp.alsBeheerder(omgeving.basis, 'proefwachtwoord-bestemming');
    const antwoord = await baas.haal('/api/downloadbestemmingen');
    assert.equal(antwoord.status, 200, JSON.stringify(antwoord.data));
    assert.equal(antwoord.data.actief, 'lokaal');
    assert.ok(antwoord.data.bestemmingen.some(b => b.id === 'lokaal' && b.beschikbaar),
      'de lokale opslag hoort altijd als beschikbare keuze te bestaan');
  } finally {
    await omgeving.stop();
    herstel();
  }
});

test('Admin kan een schrijfbare map toevoegen, kiezen en de keuze wordt de downloadmap', async () => {
  const herstel = bewaarOmgeving();
  const omgeving = await hulp.start();
  try {
    const baas = await hulp.alsBeheerder(omgeving.basis, 'proefwachtwoord-bestemming-kiezen');
    const map = path.join(omgeving.wortel, 'extra-downloads');
    fs.mkdirSync(map);

    const toegevoegd = await baas.post('/api/downloadbestemmingen', {
      actie: 'toevoegen', naam: 'Google Drive proef', type: 'lokaal', pad: map
    });
    assert.equal(toegevoegd.status, 201, JSON.stringify(toegevoegd.data));
    const doel = toegevoegd.data.bestemmingen.find(b => b.naam === 'Google Drive proef');
    assert.ok(doel && doel.id, 'de nieuwe bestemming hoort terug te komen met een id');

    const gekozen = await baas.post('/api/downloadbestemmingen', { actie: 'selecteer', id: doel.id });
    assert.equal(gekozen.status, 200, JSON.stringify(gekozen.data));
    assert.equal(gekozen.data.actief, doel.id);
    const opgeslagen = omgeving.app.db.prepare('SELECT waarde FROM instellingen WHERE sleutel = ?')
      .get('download_bestemming_actief');
    assert.equal(opgeslagen.waarde, doel.id, 'de keuze hoort buiten de werkbalk in de database bewaard te blijven');

    const stand = await baas.haal('/api/download?los=1');
    assert.equal(stand.status, 200);
    assert.equal(stand.data.map, map, 'nieuwe downloads horen naar de gekozen map te gaan');
    assert.equal(stand.data.gevraagd, map);
    assert.equal(stand.data.terugval, false, 'een gekozen map mag niet ongemerkt lokaal terugvallen');

    fs.rmSync(map, { recursive: true, force: true });
    const onbereikbaar = await baas.post('/api/download', {
      reeks: true, url: 'https://www.youtube.com/@Proef', max: 1
    });
    assert.equal(onbereikbaar.status, 400, 'een verdwenen expliciete bestemming hoort de download te stoppen');
    assert.match(onbereikbaar.data.fout, /niet beschikbaar/i);
    assert.equal(fs.readdirSync(path.join(omgeving.wortel, 'gedownload')).some(naam => naam.endsWith('.mp3')), false);

    const wissen = await baas.post('/api/downloadbestemmingen', { actie: 'verwijderen', id: doel.id });
    assert.equal(wissen.status, 409, 'de actieve bestemming mag niet worden verwijderd');
  } finally {
    await omgeving.stop();
    herstel();
  }
});

test('een ontbrekende map of niet-gemounte clouddoelmap kan niet worden toegevoegd', async () => {
  const herstel = bewaarOmgeving();
  const omgeving = await hulp.start();
  try {
    const baas = await hulp.alsBeheerder(omgeving.basis, 'proefwachtwoord-bestemming-validatie');
    const ontbreekt = path.join(omgeving.wortel, 'bestaat-niet');
    const missend = await baas.post('/api/downloadbestemmingen', {
      actie: 'toevoegen', naam: 'Missende map', type: 'lokaal', pad: ontbreekt
    });
    assert.equal(missend.status, 400);
    assert.equal(fs.existsSync(ontbreekt), false, 'valideren mag geen lokale terugvalmap aanmaken');

    const lokaleSchijn = path.join(omgeving.wortel, 'lege-cloudmap');
    fs.mkdirSync(lokaleSchijn);
    const cloud = await baas.post('/api/downloadbestemmingen', {
      actie: 'toevoegen', naam: 'Drive nog niet gekoppeld', type: 'google-drive', pad: lokaleSchijn
    });
    assert.equal(cloud.status, 400, 'een gewone lokale map mag niet als gekoppelde Drive worden aangemerkt');
    assert.match(cloud.data.fout, /(koppeling|gekoppeld|rclone|mount)/i);
  } finally {
    await omgeving.stop();
    herstel();
  }
});

test('een ingestelde externe muzieklocatie zonder mount wordt als niet beschikbaar gemeld', async () => {
  const herstel = bewaarOmgeving();
  process.env.DOWNLOAD_DIR = '/sys';
  const omgeving = await hulp.start();
  try {
    const baas = await hulp.alsBeheerder(omgeving.basis, 'proefwachtwoord-bestemming-muziekmap');
    const antwoord = await baas.haal('/api/downloadbestemmingen');
    assert.equal(antwoord.status, 200, JSON.stringify(antwoord.data));
    const serverMap = antwoord.data.bestemmingen.find(doel => doel.id === 'server');
    assert.ok(serverMap, 'de ingestelde bestemming hoort in de keuzelijst te staan');
    assert.equal(serverMap.beschikbaar, false);
    assert.match(serverMap.fout, /actieve.*(koppeling|mount)/i,
      'een gewone systeemmap mag niet voor een gekoppelde muzieklocatie doorgaan');
  } finally {
    await omgeving.stop();
    herstel();
  }
});

test('een niet-schrijfbare map wordt geweigerd zonder lokale terugval', async () => {
  const herstel = bewaarOmgeving();
  const omgeving = await hulp.start();
  try {
    const baas = await hulp.alsBeheerder(omgeving.basis, 'proefwachtwoord-bestemming-rechten');
    const antwoord = await baas.post('/api/downloadbestemmingen', {
      actie: 'toevoegen', naam: 'Alleen-lezen systeemmap', type: 'lokaal', pad: '/sys'
    });
    assert.equal(antwoord.status, 400, JSON.stringify(antwoord.data));
    assert.match(antwoord.data.fout, /kan niet in deze map schrijven/i);
    const noodmap = path.join(omgeving.wortel, 'gedownload');
    assert.equal(fs.existsSync(noodmap) && fs.readdirSync(noodmap).some(naam => naam.endsWith('.mp3')), false,
      'een afgewezen bestemming mag geen bestand naar de lokale map sturen');
  } finally {
    await omgeving.stop();
    herstel();
  }
});

test('een downloadbestand landt echt in de gekozen map', async () => {
  const herstel = bewaarOmgeving();
  const proefWortel = fs.mkdtempSync(path.join(os.tmpdir(), 'ak-bestemming-'));
  const nep = path.join(proefWortel, 'nep-ytdlp.sh');
  fs.writeFileSync(nep, [
    '#!/bin/sh',
    'vorige=""; doel=""',
    'for a in "$@"; do if [ "$vorige" = "-o" ]; then doel="$a"; fi; vorige="$a"; done',
    'bestand=$(printf "%s" "$doel" | sed "s/%(title)s/Doelproef/; s/%(ext)s/mp3/; s/%(playlist_index)02d/01/")',
    'mkdir -p "$(dirname "$bestand")"',
    'printf "ID3" > "$bestand"',
    'echo "[ExtractAudio] Destination: $bestand"',
    'echo "[download] 100% of 1MiB"',
    'exit 0',
    ''
  ].join('\n'), { mode: 0o755 });
  process.env.YTDLP = nep;
  const omgeving = await hulp.start();
  try {
    const baas = await hulp.alsBeheerder(omgeving.basis, 'proefwachtwoord-bestemming-download');
    const map = path.join(omgeving.wortel, 'gekozen-map');
    fs.mkdirSync(map);
    const toegevoegd = await baas.post('/api/downloadbestemmingen', {
      actie: 'toevoegen', naam: 'Proefmap', type: 'lokaal', pad: map
    });
    assert.equal(toegevoegd.status, 201, JSON.stringify(toegevoegd.data));
    const doel = toegevoegd.data.bestemmingen.find(b => b.naam === 'Proefmap');
    const gekozen = await baas.post('/api/downloadbestemmingen', { actie: 'selecteer', id: doel.id });
    assert.equal(gekozen.status, 200, JSON.stringify(gekozen.data));

    const gestart = await baas.post('/api/download', {
      liedje: 1, url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    });
    assert.equal(gestart.status, 200, JSON.stringify(gestart.data));
    assert.equal(gestart.data.map, map);
    const arquivo = await wachtOpMp3(map);
    assert.ok(arquivo, 'yt-dlp hoort het mp3-bestand in de gekozen map te schrijven');
    assert.ok(fs.existsSync(arquivo));
    const terugval = path.join(omgeving.wortel, 'gedownload');
    if (fs.existsSync(terugval)) {
      assert.equal(fs.readdirSync(terugval).some(naam => naam.endsWith('.mp3')), false,
        'een expliciete keuze hoort niet stiekem lokaal te downloaden');
    }
    let koppeling = null;
    const eind = Date.now() + 8000;
    while (Date.now() < eind) {
      koppeling = omgeving.app.db.prepare('SELECT pad FROM liedje_muziek WHERE liedje_id = ?').get(1);
      if (koppeling && koppeling.pad === arquivo) break;
      await new Promise(resolve => setTimeout(resolve, 80));
    }
    assert.ok(koppeling && koppeling.pad === arquivo,
      'het liedje hoort naar precies het bestand in de gekozen map te verwijzen');
  } finally {
    await omgeving.stop();
    fs.rmSync(proefWortel, { recursive: true, force: true });
    herstel();
  }
});

test('de gekozen bestemming blijft na herstart staan en een ontbrekende opgeslagen keuze valt niet terug', async () => {
  const herstel = bewaarOmgeving();
  let omgeving;
  let app;
  let basis;
  let koekje = '';
  let adminId = 0;
  let wachtwoord = 'proefwachtwoord-bestemming-herstart';
  const sluit = async () => {
    if (!app) return;
    if (app.server.listening) await new Promise(resolve => app.server.close(resolve));
    try { app.db.close(); } catch (e) {}
  };
  const herstart = async () => {
    await sluit();
    delete require.cache[require.resolve('../server')];
    delete require.cache[require.resolve('../liedjes-bron')];
    app = require('../server');
    await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
    basis = 'http://127.0.0.1:' + app.server.address().port;
  };
  try {
    omgeving = await hulp.start();
    app = omgeving.app;
    basis = omgeving.basis;
    const baas = await hulp.alsBeheerder(basis, wachtwoord);
    koekje = baas.koekje;
    adminId = baas.profiel;
    const map = path.join(omgeving.wortel, 'blijvende-map');
    fs.mkdirSync(map);
    const toegevoegd = await baas.post('/api/downloadbestemmingen', {
      actie: 'toevoegen', naam: 'Blijvende map', type: 'lokaal', pad: map
    });
    assert.equal(toegevoegd.status, 201, JSON.stringify(toegevoegd.data));
    const doel = toegevoegd.data.bestemmingen.find(b => b.naam === 'Blijvende map');
    const gekozen = await baas.post('/api/downloadbestemmingen', { actie: 'selecteer', id: doel.id });
    assert.equal(gekozen.status, 200, JSON.stringify(gekozen.data));

    await herstart();
    const koppen = { cookie: koekje, 'x-profiel': String(adminId) };
    const herlezen = await hulp.haal(basis, '/api/downloadbestemmingen', { headers: koppen });
    assert.equal(herlezen.status, 200, JSON.stringify(herlezen.data));
    assert.equal(herlezen.data.actief, doel.id);
    assert.equal(herlezen.data.download.map, map);

    // Simuleer een verdwenen/gewiste configuratie, maar laat de opgeslagen keuze staan.
    const ontbrekendId = 'extra-' + 'f'.repeat(16);
    app.db.prepare('UPDATE instellingen SET waarde = ? WHERE sleutel = ?')
      .run('[]', 'download_bestemmingen');
    app.db.prepare('UPDATE instellingen SET waarde = ? WHERE sleutel = ?')
      .run(ontbrekendId, 'download_bestemming_actief');
    await herstart();
    const achterhaald = await hulp.haal(basis, '/api/downloadbestemmingen', { headers: koppen });
    assert.equal(achterhaald.status, 200, JSON.stringify(achterhaald.data));
    assert.equal(achterhaald.data.actief, ontbrekendId,
      'de app mag een opgeslagen maar ontbrekende keuze niet naar lokaal omzetten');
    assert.equal(achterhaald.data.download.bestemmingBeschikbaar, false);
    assert.match(achterhaald.data.download.bestemmingFout, /bestemming|keuzelijst/i);

    const geweigerd = await hulp.haal(basis, '/api/download', {
      method: 'POST', headers: Object.assign({}, koppen, { 'content-type': 'application/json' }),
      body: JSON.stringify({ reeks: true, url: 'https://www.youtube.com/@Proef', max: 1 })
    });
    assert.equal(geweigerd.status, 400, JSON.stringify(geweigerd.data));
    assert.match(geweigerd.data.fout, /bestemming.*(ontbreekt|niet meer|keuzelijst)/i);
    const noodmap = path.join(omgeving.wortel, 'gedownload');
    assert.equal(fs.existsSync(noodmap) && fs.readdirSync(noodmap).some(naam => naam.endsWith('.mp3')), false,
      'een oude keuze mag niet stilzwijgend naar lokaal uitwijken');
  } finally {
    await sluit();
    if (omgeving) fs.rmSync(omgeving.wortel, { recursive: true, force: true });
    herstel();
  }
});

test('de mountcontrole herkent Drive onder een rclone-koppelpunt en kiest de diepste mount', async () => {
  const herstel = bewaarOmgeving();
  const omgeving = await hulp.start();
  try {
    const zoekMount = omgeving.app.mountpuntVoor;
    assert.equal(typeof zoekMount, 'function', 'de server hoort de mountcontrole testbaar te maken');
    const gegevens = [
      '24 1 0:20 / / rw - overlay overlay rw,lowerdir=/laag',
      '25 24 0:31 / /mnt rw - ext4 /dev/sda1 rw',
      '26 25 0:44 / /mnt/gdrive rw - fuse.rclone gdrive: rw,user_id=999'
    ].join('\n');
    const mount = zoekMount('/mnt/gdrive/Gedownload', gegevens);
    assert.equal(mount.pad, '/mnt/gdrive');
    assert.equal(mount.type, 'fuse.rclone');
  } finally {
    await omgeving.stop();
    herstel();
  }
});

test('het bestemmingsmenu legt uit dat het alleen nieuwe bestanden raakt en schaalt mee op mobiel', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  assert.ok(html.includes('bestaande bestanden worden niet verplaatst.'),
    'de selectie mag niet de indruk wekken bestaande muziek te verhuizen');
  assert.ok(html.includes('<label for="download-bestemming-gebruik">Actie</label>'),
    'de knop hoort een zichtbare, gekoppelde label te hebben');
  assert.ok(/Nieuwe downloads gaan naar '\s*\+\s*\(actief\.naam/.test(html),
    'de status hoort de duidelijke naam te tonen, niet een serverpad');
  assert.ok(/Nieuwe downloads worden opgeslagen in '\s*\+\s*\(doel \? doel\.naam/.test(html),
    'de bevestiging hoort de mapnaam te tonen, niet een serverpad');
  assert.ok(/\.download-bestemmingen\s*\{/.test(html),
    'de opslagkeuze hoort een eigen visuele kaart te hebben');
  assert.ok(/\.download-bestemmingen\s+\.map-regel\s*\{/.test(html),
    'toegevoegde mappen horen op desktop als nette, leesbare rijen te staan');
  assert.ok(html.includes('.download-bestemmingen .map-regel{grid-template-columns:minmax(0,1fr) auto;gap:6px 10px}'),
    'op een smal scherm moet de naam en status links staan en de knop rechts');
  assert.ok(!html.includes("esc(d.pad)"),
    'de beheerdersweergave hoort geen intern absoluut serverpad te tonen');
});

test('lange beheerknop blijft op mobiel binnen de viewport zonder tekst af te knippen', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  assert.ok(html.includes('#opname-kaart .rij .knop{flex:1 1 auto;min-width:0;white-space:normal;height:auto;min-height:44px;line-height:1.35}'),
    'de lange opnameknop hoort op mobiel te krimpen en over meerdere regels te lopen');
  assert.ok(/\.melding\{[^}]*overflow-wrap:anywhere/s.test(html),
    'een melding met een lang serverpad hoort af te breken en mag de pagina niet breder maken');
});

test('het Admin-scherm heeft de keuze, opslagsoort en API-handlers voor bestemmingen', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  for (const id of [
    'download-bestemmingen', 'download-bestemming-keuze', 'download-bestemming-gebruik',
    'download-bestemming-naam', 'download-bestemming-type', 'download-bestemming-pad',
    'download-bestemming-toevoegen'
  ]) assert.ok(html.includes('id="' + id + '"'), 'het keuzescherm mist ' + id);
  assert.ok(html.includes('Google Drive via rclone'));
  assert.ok(html.includes('OneDrive via rclone'));
  assert.ok(html.includes('function koppelDownloadBestemmingen()'));
  assert.ok(html.includes("api('/api/downloadbestemmingen'"), 'de knoppen horen de serverkeuze op te slaan');
  assert.ok(html.includes("actie: 'selecteer'"));
  assert.ok(html.includes("actie: 'toevoegen'"));
});
