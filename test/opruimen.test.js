'use strict';
// Opruimen: eerst kijken wat er op te ruimen valt, dan pas opruimen. De meegeleverde verzameling
// blijft altijd ongemoeid, en er verdwijnt niets wat niet in het overzicht stond.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const hulp = require('./hulp');
const backup = require('../lib/backup');

async function maakLiedje(baas, gegevens) {
  const uit = await baas.haal('/api/liedjes', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(gegevens)
  });
  assert.ok([200, 201].includes(uit.status), 'liedje maken lukte niet: ' + uit.status + ' ' + JSON.stringify(uit.data));
  return uit.data.id;
}

test('opruimen vindt dubbelen, lege liedjes, dode verwijzingen, losse bestanden, oude back-ups en verlopen sessies', async () => {
  // Waar de app zijn back-ups bewaart, zetten we op een eigen map (zo doet de installer dat ook).
  const backmapProef = fs.mkdtempSync(path.join(require('os').tmpdir(), 'akkoordkast-backup-'));
  process.env.BACKUP_DIR = backmapProef;
  const omgeving = await hulp.start();
  try {
    const baas = await hulp.alsBeheerder(omgeving.basis, 'proefwachtwoord-opruimen');

    // Twee liedjes met dezelfde titel en artiest: een met akkoorden, een zonder. De versie met
    // akkoorden hoort te blijven.
    const kaal = await maakLiedje(baas, { titel: 'Dubbel liedje', artiest: 'Dezelfde zanger', chordpro: '{title: Dubbel liedje}\n\nregel een\nregel twee' });
    const metAkkoorden = await maakLiedje(baas, { titel: 'Dubbel liedje', artiest: 'Dezelfde zanger', chordpro: '{title: Dubbel liedje}\n\n[C]regel een [G]regel twee' });
    assert.notEqual(kaal, metAkkoorden);

    // Een eigen liedje zonder akkoorden en zonder tekst.
    const leeg = await maakLiedje(baas, { titel: 'Leeg liedje', artiest: 'Niemand', chordpro: '{title: Leeg liedje}\n' });

    // Een liedje waarvan de muziek niet meer bestaat.
    const db = omgeving.app.db;
    db.prepare('INSERT INTO liedje_muziek (liedje_id, pad, titel, wanneer) VALUES (?,?,?,?)')
      .run(700001, path.join(omgeving.wortel, 'weg', 'bestaat-niet.mp3'), 'Weg', new Date().toISOString());

    // Losse bestanden die bij geen enkel liedje horen.
    const map = path.join(omgeving.wortel, 'gedownload');
    fs.mkdirSync(path.join(map, 'Zomaar'), { recursive: true });
    const wees1 = path.join(map, 'wees-een.mp3');
    const wees2 = path.join(map, 'Zomaar', 'wees-twee.mp3');
    fs.writeFileSync(wees1, Buffer.alloc(2048));
    fs.writeFileSync(wees2, Buffer.alloc(4096));
    // Een bestand dat wél bij een liedje hoort mag niet verdwijnen.
    const hoort = path.join(map, 'hoort-bij-liedje.mp3');
    fs.writeFileSync(hoort, Buffer.alloc(1024));
    db.prepare('INSERT INTO liedje_muziek (liedje_id, pad, titel, wanneer) VALUES (?,?,?,?)')
      .run(700002, hoort, 'Hoort', new Date().toISOString());

    // Een verlopen beheerderssessie.
    db.prepare('INSERT INTO sessies (token, tot, wanneer) VALUES (?,?,?)').run('verlopen-proef', 1, '');

    const eerste = await baas.haal('/api/opruimen');
    assert.equal(eerste.status, 200, JSON.stringify(eerste.data));
    const scan = eerste.data;

    assert.ok(scan.dubbelen.length >= 1, 'er hoort een dubbel gevonden te worden');
    const dubbel = scan.dubbelen.find(g => g.titel === 'Dubbel liedje');
    assert.ok(dubbel, 'het dubbele liedje hoort erbij te staan');
    assert.equal(dubbel.bewaren, metAkkoorden, 'het liedje met akkoorden hoort te blijven');
    assert.deepEqual(dubbel.weg, [kaal]);
    assert.ok(scan.leeg.some(l => l.id === leeg), 'het lege liedje hoort erbij te staan');
    assert.ok(scan.zonderMuziek.some(z => z.id === 700001), 'de dode verwijzing hoort erbij te staan');
    assert.equal(scan.wees.aantal, 2, 'twee losse bestanden: ' + JSON.stringify(scan.wees));
    assert.ok(scan.sessies.aantal >= 1, 'de verlopen sessie hoort geteld te worden');

    // Oude back-ups klaarzetten: acht stuks, waarvan er vijf mogen blijven.
    const backmap = scan.backups.map || backmapProef;
    fs.mkdirSync(backmap, { recursive: true });
    const bewaren = (await baas.haal('/api/opruimen')).data.backups.bewaren || 10;
    for (let i = 0; i < bewaren + 4; i++) {
      const naam = backup.bestandsnaam(new Date(Date.UTC(2020, 0, 1 + i, 12, 0, 0)));
      fs.writeFileSync(path.join(backmap, naam), '{}');
    }
    const scan2 = (await baas.haal('/api/opruimen')).data;
    assert.ok(scan2.backups.aantal >= 3, 'er horen oude back-ups gevonden te worden: ' + scan2.backups.aantal);

    // Nu opruimen.
    const gedaan = (await baas.post('/api/opruimen', { wat: ['dubbelen', 'leeg', 'zonderMuziek', 'wees', 'backups', 'sessies'] })).data;
    assert.equal(gedaan.ok, true, JSON.stringify(gedaan));
    assert.ok(gedaan.gedaan.dubbelen >= 1, JSON.stringify(gedaan));
    assert.ok(gedaan.gedaan.leeg >= 1, JSON.stringify(gedaan));
    assert.ok(gedaan.gedaan.zonderMuziek >= 1, JSON.stringify(gedaan));
    assert.equal(gedaan.gedaan.wees, 2, 'de twee losse bestanden horen weg te zijn: ' + JSON.stringify(gedaan));
    assert.ok(gedaan.gedaan.backups >= 3, JSON.stringify(gedaan));
    assert.ok(gedaan.gedaan.sessies >= 1, JSON.stringify(gedaan));

    // En het resultaat klopt ook echt.
    assert.equal(fs.existsSync(wees1), false, 'het losse bestand hoort weg te zijn');
    assert.equal(fs.existsSync(wees2), false, 'het losse bestand in de submap hoort weg te zijn');
    assert.equal(fs.existsSync(hoort), true, 'een bestand dat bij een liedje hoort mag niet verdwijnen');

    const kaartKaal = await baas.haal('/api/liedjes/' + kaal);
    assert.ok([403, 404].includes(kaartKaal.status), 'het dubbele liedje hoort weg te zijn');
    const kaartGoed = await baas.haal('/api/liedjes/' + metAkkoorden);
    assert.equal(kaartGoed.status, 200, 'het liedje met akkoorden hoort te blijven');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM liedje_muziek WHERE liedje_id = ?').get(700001).n, 0,
      'de dode verwijzing hoort opgeruimd te zijn');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sessies WHERE token = ?').get('verlopen-proef').n, 0);

    const over = fs.readdirSync(backmap).filter(n => /^akkoordkast-backup-/.test(n));
    assert.equal(over.length, bewaren, 'het ingestelde aantal back-ups hoort te blijven staan (' + bewaren + '): ' + over.join(', '));

    // Nog eens kijken: het is nu rustig.
    const na = (await baas.haal('/api/opruimen')).data;
    assert.equal(na.wees.aantal, 0, JSON.stringify(na.wees));
    assert.equal(na.dubbelen.length, 0, JSON.stringify(na.dubbelen));
    assert.equal(na.leeg.length, 0, JSON.stringify(na.leeg));
    assert.equal(na.zonderMuziek.length, 0, JSON.stringify(na.zonderMuziek));
    assert.ok(na.backups.aantal <= 0, 'er horen geen oude back-ups meer te zijn: ' + na.backups.aantal);
    fs.rmSync(backmapProef, { recursive: true, force: true });
  } finally {
    await omgeving.stop();
  }
});

test('opruimen hoort bij de beheerder', async () => {
  const omgeving = await hulp.start();
  try {
    const kijk = await hulp.haal(omgeving.basis + '/api/opruimen');
    assert.ok([403, 404].includes(kijk.status), 'zonder beheerder hoort dit niet te kunnen: ' + kijk.status);
    const doe = await hulp.post(omgeving.basis, '/api/opruimen', { wat: ['wees'] });
    assert.ok([403, 404].includes(doe.status), 'zonder beheerder hoort opruimen niet te kunnen: ' + doe.status);
  } finally {
    await omgeving.stop();
  }
});
