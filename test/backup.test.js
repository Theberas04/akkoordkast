'use strict';
// Tests voor de automatische back-up: het bestand zelf, de rechten, wat er wel en niet
// in hoort te staan (geen wachtwoorden), en het opruimen van oude bestanden.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const hulp = require('./hulp');
const backup = require('../lib/backup');

test('geheimen gaan niet mee in een back-up', () => {
  assert.ok(backup.isGeheim('spotify_client_secret'));
  assert.ok(backup.isGeheim('spotify_token'));
  assert.ok(backup.isGeheim('nas_wachtwoord'));
  assert.ok(backup.isGeheim('iets_api_key'));
  assert.ok(!backup.isGeheim('scan_map'));
  assert.ok(!backup.isGeheim('wacht_map_minuten'));

  const schoon = backup.schonInstellingen([
    { sleutel: 'scan_map', waarde: '/mnt/Nas/Nas-Opslag/Muziek' },
    { sleutel: 'spotify_client_secret', waarde: 'geheim123' },
    { sleutel: 'wacht_map_minuten', waarde: '360' }
  ]);
  assert.deepEqual(Object.keys(schoon).sort(), ['scan_map', 'wacht_map_minuten']);
  assert.ok(!JSON.stringify(schoon).includes('geheim123'));
});

test('de bestandsnaam is sorteerbaar en het opruimen bewaart de nieuwste', () => {
  const naam = backup.bestandsnaam(new Date(2026, 10, 3, 19, 5, 7));
  assert.equal(naam, 'akkoordkast-backup-2026-11-03-190507.json');

  const namen = [
    'akkoordkast-backup-2026-11-01-090000.json',
    'akkoordkast-backup-2026-11-03-090000.json',
    'akkoordkast-backup-2026-11-02-090000.json'
  ];
  assert.deepEqual(backup.teVerwijderen(namen, 2), ['akkoordkast-backup-2026-11-01-090000.json']);
  assert.deepEqual(backup.teVerwijderen(namen, 10), []);
  assert.equal(backup.teVerwijderen(namen, 0).length, 2, 'minstens één bewaren');
});

test('een back-up maken levert een bestand met de gegevens en zonder geheimen', async () => {
  const omgeving = await hulp.start();
  const baas = await hulp.alsBeheerder(omgeving.basis);
  const map = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-'));
  try {
    // Een geheim in de instellingen zetten: dat hoort niet in het bestand te belanden.
    await baas.post('/api/spotify/instellingen', { client_secret: 'streng-geheim-123' });
    await baas.post('/api/mappen', { pad: os.tmpdir() });

    const gezet = await baas.post('/api/backup', { aan: true, map, bewaren: 2 });
    assert.equal(gezet.status, 200, JSON.stringify(gezet.data));
    assert.equal(gezet.data.backup.aan, true);
    assert.equal(gezet.data.backup.map, path.resolve(map));

    const nu = await baas.post('/api/backup/nu', {});
    assert.equal(nu.status, 201, JSON.stringify(nu.data));
    const bestand = path.join(map, nu.data.uitkomst.bestand);
    assert.ok(fs.existsSync(bestand), 'het back-upbestand staat er');

    const inhoud = JSON.parse(fs.readFileSync(bestand, 'utf8'));
    assert.equal(inhoud.soort, 'akkoordkast-backup');
    assert.ok(Array.isArray(inhoud.liedjes), 'de liedjestabel zit erin (de eigen liedjes)');
    assert.ok(Array.isArray(inhoud.profielen) && inhoud.profielen.length >= 1);
    assert.ok(inhoud.instellingen && inhoud.instellingen.scan_map, 'de instellingen zitten erin');
    assert.ok(!JSON.stringify(inhoud).includes('streng-geheim-123'), 'geen wachtwoorden of sleutels');
    assert.equal(nu.data.uitkomst.samenvatting.liedjes, inhoud.liedjes.length);

    const lijst = await hulp.haal(omgeving.basis, '/api/backup');
    assert.equal(lijst.data.bestanden.length, 1);
    assert.equal(lijst.data.bestanden[0].naam, nu.data.uitkomst.bestand);
  } finally {
    await omgeving.stop();
    fs.rmSync(map, { recursive: true, force: true });
  }
});

test('oude back-ups worden opgeruimd als je er maar twee wilt bewaren', async () => {
  const omgeving = await hulp.start();
  const baas = await hulp.alsBeheerder(omgeving.basis);
  const map = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-opruim-'));
  try {
    await baas.post('/api/backup', { aan: false, map, bewaren: 2 });
    for (let i = 0; i < 3; i++) {
      const uit = await baas.post('/api/backup/nu', {});
      assert.equal(uit.status, 201, JSON.stringify(uit.data));
      await new Promise(r => setTimeout(r, 1100));   // de naam heeft seconden, dus even wachten
    }
    const over = fs.readdirSync(map).filter(n => n.endsWith('.json'));
    assert.equal(over.length, 2, 'er blijven twee bestanden staan: ' + over.join(', '));
    const nieuwste = over.sort().slice(-1)[0];
    const lijst = await hulp.haal(omgeving.basis, '/api/backup');
    assert.equal(lijst.data.bestanden[0].naam, nieuwste, 'de nieuwste staat bovenaan');
  } finally {
    await omgeving.stop();
    fs.rmSync(map, { recursive: true, force: true });
  }
});

test('zonder map of met een map die niet kan: een eerlijke melding', async () => {
  const omgeving = await hulp.start();
  const baas = await hulp.alsBeheerder(omgeving.basis);
  try {
    const zonder = await baas.post('/api/backup', { map: '' });
    assert.equal(zonder.status, 200);
    const nu = await baas.post('/api/backup/nu', {});
    assert.equal(nu.status, 400);
    assert.match(nu.data.fout, /geen map gekozen/);

    const foutPad = await baas.post('/api/backup', { map: 'backup-map' });
    assert.equal(foutPad.status, 400);
    assert.match(foutPad.data.fout, /volledig pad/);
  } finally {
    await omgeving.stop();
  }
});
