'use strict';
// Tests voor meerdere muziekmappen: een map toevoegen, terugzien, weghalen, en één
// ronde over alle mappen (ook via de wachter). Dit is wat je nodig hebt als je muziek
// op een NAS staat die als koppeling in de container hangt.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const hulp = require('./hulp');
const tijdlijn = require('../lib/tijdlijn');
const gitaar = require('../lib/gitaar');

// Een echte (korte) opname zodat de herkenning iets te doen heeft.
function maakMuziekmap(voorvoegsel, akkoorden) {
  const map = fs.mkdtempSync(path.join(os.tmpdir(), voorvoegsel));
  const plan = tijdlijn.maakPlan({
    akkoordenPerMaat: akkoorden,
    toonsoort: akkoorden[0],
    maatsoort: 4,
    tempo: 96,
    herhalingen: 1
  });
  fs.writeFileSync(path.join(map, 'nummer.wav'), gitaar.maakPlanWav(plan));
  return map;
}

test('een map toevoegen, terugzien in de lijst, en weer weghalen', async () => {
  const omgeving = await hulp.start();
  const baas = await hulp.alsBeheerder(omgeving.basis);
  const map = maakMuziekmap('map-een-', ['G', 'C', 'G', 'D7']);
  try {
    const leeg = await hulp.haal(omgeving.basis, '/api/mappen');
    assert.equal(leeg.status, 200, JSON.stringify(leeg.data));
    assert.deepEqual(leeg.data.mappen, [], 'nog geen mappen');

    const toe = await baas.post('/api/mappen', { pad: map });
    assert.equal(toe.status, 201, JSON.stringify(toe.data));
    assert.equal(toe.data.mappen.length, 1);
    assert.equal(toe.data.mappen[0].pad, path.resolve(map));
    assert.equal(toe.data.mappen[0].bestaat, true);
    assert.equal(toe.data.mappen[0].aantal, 1, 'het proefbestand hoort gevonden te worden');
    assert.equal(toe.data.mappen[0].nieuw, 1);

    const nogEens = await hulp.haal(omgeving.basis, '/api/mappen');
    assert.equal(nogEens.data.mappen.length, 1, 'de map is onthouden');

    const weg = await baas.post('/api/mappen/weg', { pad: map });
    assert.equal(weg.status, 200);
    assert.deepEqual(weg.data.mappen, []);
  } finally {
    await omgeving.stop();
    fs.rmSync(map, { recursive: true, force: true });
  }
});

test('zonder volledig pad, met een niet-bestaande map en met een bestand: duidelijke uitleg', async () => {
  const omgeving = await hulp.start();
  const baas = await hulp.alsBeheerder(omgeving.basis);
  try {
    const leeg = await baas.post('/api/mappen', {});
    assert.equal(leeg.status, 400);
    assert.match(leeg.data.fout, /Geef een map op/);

    const betrekkelijk = await baas.post('/api/mappen', { pad: 'muziek' });
    assert.equal(betrekkelijk.status, 400);
    assert.match(betrekkelijk.data.fout, /volledig pad/);

    // Een NAS-pad dat nog niet gekoppeld is: dat is precies het geval waarin je wilt
    // weten dat de koppeling er niet staat.
    const niet = await baas.post('/api/mappen', { pad: '/mnt/Nas/Nas-Opslag/Muziek' });
    if (fs.existsSync('/mnt/Nas/Nas-Opslag/Muziek')) {
      assert.equal(niet.status, 201, 'bestaat de map hier wel, dan mag hij toegevoegd worden');
    } else {
      assert.equal(niet.status, 400);
      assert.match(niet.data.fout, /Staat de koppeling naar de NAS er wel/);
    }

    const bestand = path.join(os.tmpdir(), 'map-test-bestand.txt');
    fs.writeFileSync(bestand, 'x');
    const geenMap = await baas.post('/api/mappen', { pad: bestand });
    assert.equal(geenMap.status, 400);
    assert.match(geenMap.data.fout, /geen map/);
    fs.rmSync(bestand, { force: true });
  } finally {
    await omgeving.stop();
  }
});

test('twee keer dezelfde map geeft geen dubbele regel', async () => {
  const omgeving = await hulp.start();
  const baas = await hulp.alsBeheerder(omgeving.basis);
  const map = maakMuziekmap('map-dubbel-', ['C', 'F', 'G7', 'C']);
  try {
    await baas.post('/api/mappen', { pad: map });
    const tweede = await baas.post('/api/mappen', { pad: map });
    assert.equal(tweede.status, 201);
    assert.equal(tweede.data.mappen.length, 1, 'dezelfde map hoort maar één keer in de lijst te staan');
  } finally {
    await omgeving.stop();
    fs.rmSync(map, { recursive: true, force: true });
  }
});

test('een ronde zonder map doet alle mappen die in de app staan', async () => {
  const omgeving = await hulp.start();
  const baas = await hulp.alsBeheerder(omgeving.basis);
  const een = maakMuziekmap('map-ronde-a-', ['G', 'D', 'Em', 'C']);
  const twee = maakMuziekmap('map-ronde-b-', ['C', 'Am', 'F', 'G']);
  try {
    await baas.post('/api/mappen', { pad: een });
    await baas.post('/api/mappen', { pad: twee });

    const uit = await baas.post('/api/scan', { limiet: 4 });
    assert.equal(uit.status, 201, JSON.stringify(uit.data));
    assert.equal(uit.data.mappen.length, 2, 'beide mappen horen langs te komen');
    assert.equal(uit.data.gedaan, 2, 'één nummer per map');
    assert.equal(uit.data.rest, 0);
    assert.equal(uit.data.klaar, true);
    const paden = uit.data.liedjes.map(l => l.pad).join('|');
    assert.ok(paden.includes(een) && paden.includes(twee), 'uit beide mappen een liedje: ' + paden);
  } finally {
    await omgeving.stop();
    fs.rmSync(een, { recursive: true, force: true });
    fs.rmSync(twee, { recursive: true, force: true });
  }
});

test('de wachter loopt alle mappen langs en meldt een map die ontbreekt', async () => {
  const omgeving = await hulp.start();
  const baas = await hulp.alsBeheerder(omgeving.basis);
  const map = maakMuziekmap('map-wachter-', ['Am', 'Dm', 'E7', 'Am']);
  const wegMap = path.join(os.tmpdir(), 'akkoordkast-bestaat-niet-' + Date.now());
  try {
    const gezet = await baas.post('/api/wachter', { aan: true, mappen: [map, wegMap], perRonde: 5 });
    assert.equal(gezet.status, 200, JSON.stringify(gezet.data));
    assert.equal(gezet.data.wachter.mappen.length, 2);

    const nu = await baas.post('/api/wachter/nu', {});
    assert.equal(nu.status, 200, JSON.stringify(nu.data));
    const verslag = nu.data.wachter.verslag;
    assert.match(verslag, /1 omgezet/, 'uit de bestaande map: ' + verslag);
    assert.match(verslag, /Let op/, 'de ontbrekende map hoort gemeld te worden: ' + verslag);
    assert.match(verslag, /is er niet/, 'met de reden erbij: ' + verslag);
  } finally {
    await omgeving.stop();
    fs.rmSync(map, { recursive: true, force: true });
  }
});

test('de omgeving (MUSIC_DIR) is de map die de app zelf voorstelt', async () => {
  const map = maakMuziekmap('map-omgeving-', ['G', 'C', 'D7', 'G']);
  process.env.MUSIC_DIR = map;
  const omgeving = await hulp.start();
  const baas = await hulp.alsBeheerder(omgeving.basis);
  try {
    const uit = await hulp.haal(omgeving.basis, '/api/mappen');
    assert.equal(uit.data.standaard, map);
    assert.equal(uit.data.mappen.length, 1, 'de omgevingsmap hoort meteen in de lijst te staan');
    assert.equal(uit.data.mappen[0].pad, path.resolve(map));
    assert.equal(uit.data.voorstel, '', 'hij staat er al, dus geen los voorstel meer');
  } finally {
    await omgeving.stop();
    delete process.env.MUSIC_DIR;
    fs.rmSync(map, { recursive: true, force: true });
  }
});
