'use strict';
// De koppelwizard laat de beheerder Google Drive of OneDrive aan de app hangen. De proeven dekken de
// veilige randen: alleen Admin, geen sleutel in welk antwoord dan ook, en koppelen komt nooit als
// "gelukt" terug zonder dat er echt een rclone-koppeling staat.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const hulp = require('./hulp');

// Een proefwereld met nep-programma's: een rclone die keurig antwoordt en zijn aanroepen logt, en
// een fusermount die de koppeling echt wegneemt (in het proefbestand dat de mountwereld speelt).
function maakProefwereld() {
  const wortel = fs.mkdtempSync(path.join(os.tmpdir(), 'ak-cloud-'));
  const log = path.join(wortel, 'programma-log.txt');
  const nepRclone = path.join(wortel, 'nep-rclone.sh');
  fs.writeFileSync(nepRclone, [
    '#!/bin/sh',
    'printf "%s\\n" "$*" >> "' + log + '"',
    'case "$1" in',
    '  version) echo "rclone v1.99.0-proef"; exit 0;;',
    '  lsd) echo "          -1 2026-01-01 00:00:00        -1 Muziek"; exit 0;;',
    '  mount) exec sleep 60;;',
    'esac',
    'exit 0',
    ''
  ].join('\n'), { mode: 0o755 });
  const nepFusermount = path.join(wortel, 'nep-fusermount.sh');
  fs.writeFileSync(nepFusermount, [
    '#!/bin/sh',
    'printf "fusermount %s\\n" "$*" >> "' + log + '"',
    ': > "$CLOUD_MOUNTS"',
    'exit 0',
    ''
  ].join('\n'), { mode: 0o755 });
  const mounts = path.join(wortel, 'mounts.txt');
  fs.writeFileSync(mounts, '');
  const fusePad = path.join(wortel, 'fuse-bestaat');
  fs.writeFileSync(fusePad, '');
  const fuseConf = path.join(wortel, 'fuse.conf');
  fs.writeFileSync(fuseConf, 'user_allow_other\n');
  const basis = path.join(wortel, 'thuis');
  fs.mkdirSync(path.join(basis, 'muziek'), { recursive: true });
  return { wortel, log, mounts, fusePad, fuseConf, basis, nepRclone, nepFusermount };
}

function zetOmgeving(w, extra) {
  const waarden = Object.assign({
    CLOUD_BASIS: w.basis,
    CLOUD_MOUNTS: w.mounts,
    RCLONE_PRG: w.nepRclone,
    FUSERMOUNT_PRG: w.nepFusermount,
    FUSE_PAD: w.fusePad,
    FUSE_CONF: w.fuseConf,
    CLOUD_WACHT_MS: '800'
  }, extra || {});
  const oud = {};
  for (const sleutel of Object.keys(waarden)) {
    oud[sleutel] = process.env[sleutel];
    if (waarden[sleutel] === null) delete process.env[sleutel];
    else process.env[sleutel] = String(waarden[sleutel]);
  }
  return () => {
    for (const sleutel of Object.keys(waarden)) {
      if (oud[sleutel] === undefined) delete process.env[sleutel];
      else process.env[sleutel] = oud[sleutel];
    }
  };
}

function zetConfKlaar(w, inhoud) {
  const conf = path.join(w.basis, '.config', 'rclone', 'rclone.conf');
  fs.mkdirSync(path.dirname(conf), { recursive: true });
  fs.writeFileSync(conf, inhoud || '[gdrive]\ntype = drive\n');
  return conf;
}

function zetGemount(w) {
  fs.writeFileSync(w.mounts,
    '26 25 0:44 / ' + path.join(w.basis, 'muziek') + ' rw - fuse.rclone gdrive:Muziek rw,user_id=999\n');
}

function leesLog(w) {
  return fs.existsSync(w.log) ? fs.readFileSync(w.log, 'utf8') : '';
}

test('de cloudkoppeling is alleen voor Admin', async () => {
  const w = maakProefwereld();
  const herstel = zetOmgeving(w);
  const omgeving = await hulp.start();
  try {
    const zonder = await hulp.haal(omgeving.basis, '/api/cloud');
    assert.equal(zonder.status, 403, 'de stand hoort alleen voor Admin zichtbaar te zijn');
    const wijziging = await hulp.post(omgeving.basis, '/api/cloud', { actie: 'los' });
    assert.equal(wijziging.status, 403, 'koppelen en losmaken horen achter de beheerderssessie te zitten');
  } finally {
    await omgeving.stop();
    herstel();
    fs.rmSync(w.wortel, { recursive: true, force: true });
  }
});

test('de stand vertelt eerlijk wat er ontbreekt en de waker zwijgt als er niets aanstaat', async () => {
  const w = maakProefwereld();
  const herstel = zetOmgeving(w, {
    RCLONE_PRG: path.join(w.wortel, 'bestaat-niet'),
    FUSE_PAD: path.join(w.wortel, 'geen-fuse')
  });
  const omgeving = await hulp.start();
  try {
    const baas = await hulp.alsBeheerder(omgeving.basis, 'proefwachtwoord-cloud-stand');
    const antwoord = await baas.haal('/api/cloud');
    assert.equal(antwoord.status, 200, JSON.stringify(antwoord.data));
    assert.equal(antwoord.data.rclone.aanwezig, false);
    assert.equal(antwoord.data.fuse.aanwezig, false);
    assert.equal(antwoord.data.aanmelding.klaar, false);
    assert.equal(antwoord.data.koppeling.aan, false);
    assert.equal(antwoord.data.koppeling.gemount, false);
    assert.match(antwoord.data.hostcommando, /drive-koppelen-lxc\.sh/,
      'zonder rclone of fuse hoort de app het eenmalige hostcommando te tonen');
    const waker = await omgeving.app.cloudZorg();
    assert.equal(waker.gedaan, false, 'zonder koppeling hoort de waker niets te doen');
  } finally {
    await omgeving.stop();
    herstel();
    fs.rmSync(w.wortel, { recursive: true, force: true });
  }
});

test('een geldige sleutel belandt in rclone.conf zonder de rest te slopen en zonder lek in het antwoord', async () => {
  const w = maakProefwereld();
  const herstel = zetOmgeving(w);
  const omgeving = await hulp.start();
  try {
    const baas = await hulp.alsBeheerder(omgeving.basis, 'proefwachtwoord-cloud-aanmelden');
    const conf = zetConfKlaar(w, '[nas]\ntype = smb\nhost = 192.168.1.100\n');
    const sleutel = JSON.stringify({
      access_token: 'geheim-token-xyz', refresh_token: 'ververs-xyz', token_type: 'Bearer'
    });

    const onzin = await baas.post('/api/cloud', { actie: 'aanmelden', soort: 'gdrive', token: 'geen json' });
    assert.equal(onzin.status, 400);
    assert.match(onzin.data.fout, /sleutel/i);
    assert.equal(fs.readFileSync(conf, 'utf8').includes('geheim'), false, 'een foute sleutel mag niets raken');

    const goed = await baas.post('/api/cloud', { actie: 'aanmelden', soort: 'gdrive', token: sleutel });
    assert.equal(goed.status, 200, JSON.stringify(goed.data));
    assert.equal(goed.data.bereikbaar, true, 'de nep-rclone antwoordt, dus de controle hoort te slagen');
    const inhoud = fs.readFileSync(conf, 'utf8');
    assert.ok(inhoud.includes('[nas]'), 'een bestaande remote hoort te blijven staan');
    assert.ok(inhoud.includes('[gdrive]'), 'de nieuwe remote hoort erbij te komen');
    assert.ok(inhoud.includes('scope = drive'));
    assert.ok(inhoud.includes('geheim-token-xyz'), 'de sleutel hoort in rclone.conf te staan');
    assert.equal(fs.statSync(conf).mode & 0o777, 0o600, 'het sleutelbestand hoort alleen voor de eigenaar leesbaar te zijn');
    assert.equal(JSON.stringify(goed.data).includes('geheim-token-xyz'), false,
      'de sleutel hoort nooit in het antwoord te zitten');

    const stand = await baas.haal('/api/cloud');
    assert.equal(stand.data.aanmelding.klaar, true);
    assert.equal(JSON.stringify(stand.data).includes('geheim-token-xyz'), false);
  } finally {
    await omgeving.stop();
    herstel();
    fs.rmSync(w.wortel, { recursive: true, force: true });
  }
});

test('koppelen zonder de vereisten levert een duidelijke melding, geen halve koppeling', async () => {
  const w = maakProefwereld();
  const herstel = zetOmgeving(w, { FUSE_PAD: path.join(w.wortel, 'geen-fuse') });
  const omgeving = await hulp.start();
  try {
    const baas = await hulp.alsBeheerder(omgeving.basis, 'proefwachtwoord-cloud-vereisten');
    const zonderFuse = await baas.post('/api/cloud', { actie: 'koppelen', pad: 'Muziek' });
    assert.equal(zonderFuse.status, 409, JSON.stringify(zonderFuse.data));
    assert.match(zonderFuse.data.fout, /fuse/i);

    fs.writeFileSync(path.join(w.wortel, 'geen-fuse'), '');
    const zonderAanmelding = await baas.post('/api/cloud', { actie: 'koppelen', pad: 'Muziek' });
    assert.equal(zonderAanmelding.status, 409, JSON.stringify(zonderAanmelding.data));
    assert.match(zonderAanmelding.data.fout, /(aanmelding|sleutel)/i);

    const niets = leesLog(w);
    assert.equal(niets.split('\n').some(r => r.startsWith('mount ')), false,
      'zonder de vereisten hoort er geen mount gestart te worden');
  } finally {
    await omgeving.stop();
    herstel();
    fs.rmSync(w.wortel, { recursive: true, force: true });
  }
});

test('staat de koppeling er al, dan meldt de app dat zonder een tweede mount', async () => {
  const w = maakProefwereld();
  const herstel = zetOmgeving(w);
  fs.mkdirSync(path.join(w.basis, 'muziek'), { recursive: true });
  zetConfKlaar(w);
  zetGemount(w);
  const omgeving = await hulp.start();
  try {
    const baas = await hulp.alsBeheerder(omgeving.basis, 'proefwachtwoord-cloud-algemount');
    const antwoord = await baas.post('/api/cloud', { actie: 'koppelen', pad: 'Muziek' });
    assert.equal(antwoord.status, 200, JSON.stringify(antwoord.data));
    assert.match(antwoord.data.melding, /stond al/i);
    assert.equal(antwoord.data.stand.koppeling.gemount, true);
    assert.equal(leesLog(w).split('\n').some(r => r.startsWith('mount ')), false,
      'een bestaande koppeling mag geen tweede mount starten');
    const opgeslagen = omgeving.app.db.prepare('SELECT waarde FROM instellingen WHERE sleutel = ?')
      .get('cloud_koppeling');
    assert.ok(opgeslagen && JSON.parse(opgeslagen.waarde).aan === true,
      'de koppeling hoort in de instellingen bewaard te blijven');
    assert.ok(fs.existsSync(path.join(w.basis, 'muziek', 'Gedownload')),
      'de downloadmap in de cloud hoort meteen klaar te staan');
  } finally {
    await omgeving.stop();
    herstel();
    fs.rmSync(w.wortel, { recursive: true, force: true });
  }
});

test('een koppeling die niet opkomt wordt eerlijk gemeld en niet als gelukt onthouden', async () => {
  const w = maakProefwereld();
  const herstel = zetOmgeving(w, { CLOUD_WACHT_MS: '700' });
  zetConfKlaar(w);
  const omgeving = await hulp.start();
  try {
    const baas = await hulp.alsBeheerder(omgeving.basis, 'proefwachtwoord-cloud-mislukt');
    const antwoord = await baas.post('/api/cloud', { actie: 'koppelen', pad: 'Muziek' });
    assert.equal(antwoord.status, 409, JSON.stringify(antwoord.data));
    assert.match(antwoord.data.fout, /kwam niet op/i);
    assert.equal(leesLog(w).split('\n').some(r => r.startsWith('mount ')), true,
      'de app hoort het wel echt geprobeerd te hebben');
    const opgeslagen = omgeving.app.db.prepare('SELECT waarde FROM instellingen WHERE sleutel = ?')
      .get('cloud_koppeling');
    assert.equal(JSON.parse(opgeslagen.waarde).aan, false,
      'een mislukte koppeling mag niet als "aan" bewaard blijven');
  } finally {
    await omgeving.stop();
    herstel();
    fs.rmSync(w.wortel, { recursive: true, force: true });
  }
});

test('losmaken ontkoppelt, wist de toestand en laat de aanmelding staan', async () => {
  const w = maakProefwereld();
  const herstel = zetOmgeving(w);
  const conf = zetConfKlaar(w);
  zetGemount(w);
  const omgeving = await hulp.start();
  try {
    const baas = await hulp.alsBeheerder(omgeving.basis, 'proefwachtwoord-cloud-los');
    const aan = await baas.post('/api/cloud', { actie: 'koppelen', pad: 'Muziek' });
    assert.equal(aan.status, 200, JSON.stringify(aan.data));
    const los = await baas.post('/api/cloud', { actie: 'los' });
    assert.equal(los.status, 200, JSON.stringify(los.data));
    assert.equal(los.data.stand.koppeling.gemount, false);
    assert.equal(los.data.stand.koppeling.aan, false);
    assert.match(leesLog(w), /fusermount/, 'de koppeling hoort echt losgemaakt te worden');
    assert.ok(fs.existsSync(conf), 'de aanmelding hoort te blijven staan voor een nieuwe poging');
    const opgeslagen = omgeving.app.db.prepare('SELECT waarde FROM instellingen WHERE sleutel = ?')
      .get('cloud_koppeling');
    assert.equal(JSON.parse(opgeslagen.waarde).aan, false);
  } finally {
    await omgeving.stop();
    herstel();
    fs.rmSync(w.wortel, { recursive: true, force: true });
  }
});

test('de waker probeert een weggevallen koppeling terug te zetten', async () => {
  const w = maakProefwereld();
  const herstel = zetOmgeving(w, { CLOUD_WACHT_MS: '700' });
  zetConfKlaar(w);
  zetGemount(w);
  const omgeving = await hulp.start();
  try {
    const baas = await hulp.alsBeheerder(omgeving.basis, 'proefwachtwoord-cloud-waker');
    const aan = await baas.post('/api/cloud', { actie: 'koppelen', pad: 'Muziek' });
    assert.equal(aan.status, 200, JSON.stringify(aan.data));

    // De koppeling valt weg; de waker hoort nu een poging te doen.
    fs.writeFileSync(w.mounts, '');
    const uit = await omgeving.app.cloudZorg();
    assert.equal(uit.gedaan, true, 'de waker hoort een poging te doen als de map weg is');
    assert.ok(leesLog(w).split('\n').some(r => r.startsWith('mount ')),
      'de waker hoort het mountcommando te proberen');
  } finally {
    await omgeving.stop();
    herstel();
    fs.rmSync(w.wortel, { recursive: true, force: true });
  }
});

test('de mount-opdracht draagt de veilige opties en allow-other alleen als fuse dat toestaat', async () => {
  const w = maakProefwereld();
  const herstel = zetOmgeving(w);
  const omgeving = await hulp.start();
  try {
    const argumenten = omgeving.app.cloudMountArgumenten({ soort: 'gdrive', pad: 'Muziek' });
    assert.equal(argumenten[0], 'mount');
    assert.equal(argumenten[1], 'gdrive:Muziek');
    assert.ok(argumenten.includes('--vfs-cache-mode'), 'schrijven vraagt de schrijfcache');
    assert.equal(argumenten[argumenten.indexOf('--vfs-cache-mode') + 1], 'writes');
    assert.ok(argumenten.includes('--allow-other'), 'user_allow_other staat aan, dus allow-other hoort erbij');

    fs.writeFileSync(w.fuseConf, '# niets ingesteld\n');
    const zonder = omgeving.app.cloudMountArgumenten({ soort: 'gdrive', pad: '' });
    assert.equal(zonder.includes('--allow-other'), false);
    assert.equal(zonder[1], 'gdrive:', 'zonder submap hoort de hele Drive gekoppeld te worden');
  } finally {
    await omgeving.stop();
    herstel();
    fs.rmSync(w.wortel, { recursive: true, force: true });
  }
});

test('de sleutelcontrole weigert onzin en houdt de foutmelding vriendelijk', async () => {
  const w = maakProefwereld();
  const herstel = zetOmgeving(w);
  const omgeving = await hulp.start();
  try {
    const lees = omgeving.app.leesCloudToken;
    assert.match(lees('').fout, /plak/i);
    assert.match(lees('{niet echt}').fout, /sleutel/i);
    assert.match(lees('[1,2,3]').fout, /blok|accolades|sleutel/i);
    assert.match(lees('{"iets":"anders"}').fout, /access_token/i);
    assert.ok(lees('{"access_token":"x"}').token, 'een echte sleutelvorm hoort te worden geaccepteerd');
  } finally {
    await omgeving.stop();
    herstel();
    fs.rmSync(w.wortel, { recursive: true, force: true });
  }
});

test('de mappenlijst onder de koppelkaart kan op mobiel de pagina niet breder maken', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  assert.ok(html.includes('.mappen-lijst{display:grid;grid-template-columns:minmax(0,1fr)'),
    'de mappenlijst hoort zijn kolom aan de kaart te binden, niet aan de langste inhoud');
  assert.ok(html.includes('.mappen-lijst .map-regel{min-width:0}'),
    'een rij hoort onder zijn kolombreedte te kunnen kruipen');
  assert.ok(html.includes('#mappen-lijst .map-regel{flex-wrap:wrap}'),
    'op een telefoon horen pad en knoppen onder elkaar te vallen');
});

test('het Admin-scherm heeft de koppelwizard met de juiste knoppen en uitleg', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  for (const id of ['cloud-koppel', 'cloud-rclone', 'cloud-fuse', 'cloud-aanmelding', 'cloud-koppeling',
    'cloud-melding', 'cloud-commando', 'cloud-token', 'cloud-soort', 'cloud-map', 'cloud-aanmelden',
    'cloud-koppel-aan', 'cloud-koppel-uit', 'cloud-als-muziekmap', 'cloud-als-download']) {
    assert.ok(html.includes('id="' + id + '"'), 'het koppelscherm mist ' + id);
  }
  assert.ok(html.includes('function koppelCloud()'), 'de wizard hoort zijn eigen koppelfunctie te hebben');
  assert.ok(html.includes("api('/api/cloud'"), 'de knoppen horen met de server te praten');
  assert.ok(html.includes('Cloudopslag koppelen'), 'de kaart hoort zo te heten');
  assert.ok(html.includes('rclone authorize'), 'de uitleg voor de sleutel hoort er te staan');
  assert.ok(html.indexOf('.cloud-koppel{') !== -1, 'het blok hoort een eigen visuele kaart te hebben');
});
