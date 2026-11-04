'use strict';
// Het beheerdersaccount: zonder inloggen kan niemand iets toevoegen, en de gewone dingen
// (zoeken, spelen, leren, je eigen favorieten) blijven voor iedereen werken.
const test = require('node:test');
const assert = require('node:assert');
const { start, haal, post, alsBeheerder } = require('./hulp');
const beheer = require('../lib/beheer');

test('een wachtwoord wordt nooit bewaard, alleen een afdruk die je kunt controleren', () => {
  const afdruk = beheer.hashWachtwoord('mijn-gitaar-2026');
  assert.ok(afdruk.startsWith('scrypt$'), 'de afdruk hoort met scrypt te beginnen');
  assert.ok(!afdruk.includes('mijn-gitaar-2026'), 'het wachtwoord zelf mag er niet in staan');
  assert.equal(beheer.controleerWachtwoord('mijn-gitaar-2026', afdruk), true);
  assert.equal(beheer.controleerWachtwoord('mijn-gitaar-202', afdruk), false);
  assert.equal(beheer.controleerWachtwoord('', afdruk), false);
  // Twee keer hetzelfde wachtwoord geeft twee verschillende afdrukken (eigen zout per keer).
  assert.notEqual(beheer.hashWachtwoord('mijn-gitaar-2026'), afdruk);
  // Onzin in de opgeslagen waarde mag geen fout geven.
  for (const rommel of ['', 'geen afdruk', 'scrypt$1$2$3', 'anders$1$2$3$aa$bb']) {
    assert.equal(beheer.controleerWachtwoord('wat dan ook', rommel), false);
  }
  assert.equal(beheer.sterkGenoeg('kort'), false);
  assert.equal(beheer.sterkGenoeg('lang genoeg'), true);
});

test('zonder inloggen kan niemand muziek of liedjes toevoegen', async () => {
  const omgeving = await start();
  try {
    const stand = await haal(omgeving.basis, '/api/beheer');
    assert.equal(stand.status, 200);
    assert.equal(stand.data.ingesteld, false, 'er is nog geen wachtwoord');
    assert.equal(stand.data.ingelogd, false);

    // Alles wat iets toevoegt of verandert, wordt geweigerd.
    const verboden = [
      ['/api/download', { liedje: 1, url: 'https://youtu.be/dQw4w9WgXcQ' }],
      ['/api/youtube', { liedje: 1, url: 'https://youtu.be/dQw4w9WgXcQ' }],
      ['/api/muziek', { liedje: 1, pad: '/tmp/x.mp3' }],
      ['/api/mappen', { pad: '/tmp' }],
      ['/api/scan', { pad: '/tmp' }],
      ['/api/liedjes', { titel: 'Zomaar', chordpro: '[C]Test' }],
      ['/api/backup/nu', {}],
      ['/api/update', {}],
      ['/api/spotify/instellingen', { client_id: 'x', client_secret: 'y' }],
    ];
    for (const [pad, lichaam] of verboden) {
      const uit = await post(omgeving.basis, pad, lichaam);
      assert.equal(uit.status, 403, pad + ' hoorde geweigerd te worden');
      assert.match(uit.data.fout, /beheerder/i);
    }

    // Leeswerk blijft open: liedjes zoeken, een liedje openen, de handleiding.
    const eersteLied = (await haal(omgeving.basis, '/api/liedjes?aantal=1')).data.liedjes[0];
    for (const pad of ['/api/liedjes?aantal=1', '/api/liedjes/' + eersteLied.id, '/api/beheer', '/handleiding/']) {
      const uit = await haal(omgeving.basis, pad);
      assert.equal(uit.status, 200, pad + ' hoort gewoon te werken');
    }

    // En de beheerder mag het wel.
    const baas = await alsBeheerder(omgeving.basis);
    assert.equal(baas.eerste.status, 200, JSON.stringify(baas.eerste.data));
    assert.ok(baas.koekje.startsWith('ak_beheer='), 'de app hoort een sessiekoekje te zetten');
    const nu = await baas.haal('/api/beheer');
    assert.equal(nu.data.ingesteld, true);
    assert.equal(nu.data.ingelogd, true);
    const lied = await haal(omgeving.basis, '/api/liedjes?aantal=1');
    const gelukt = await baas.post('/api/mappen', { pad: '/tmp' });
    assert.ok([200, 201].includes(gelukt.status), JSON.stringify(gelukt.data));
    const detail = await baas.haal('/api/liedjes/' + lied.data.liedjes[0].id);
    assert.equal(detail.data.beheer, true, 'de app hoort te weten dat dit de beheerder is');
  } finally {
    await omgeving.stop();
  }
});

test('inloggen, een verkeerd wachtwoord en uitloggen', async () => {
  const omgeving = await start();
  try {
    const teKort = await post(omgeving.basis, '/api/beheer/wachtwoord', { wachtwoord: 'kort' });
    assert.equal(teKort.status, 400);
    assert.match(teKort.data.fout, /minstens/i);

    const baas = await alsBeheerder(omgeving.basis, 'mijn-lange-wachtwoord');

    const fout = await post(omgeving.basis, '/api/beheer/inloggen', { wachtwoord: 'verkeerd-geraden' });
    assert.equal(fout.status, 401);
    assert.match(fout.data.fout, /klopt niet/i);

    const goed = await post(omgeving.basis, '/api/beheer/inloggen', { wachtwoord: 'mijn-lange-wachtwoord' });
    assert.equal(goed.status, 200);
    const nieuwKoekje = String(goed.headers.get('set-cookie') || '').split(';')[0];
    assert.ok(nieuwKoekje.startsWith('ak_beheer='));
    const metNieuw = await haal(omgeving.basis, '/api/beheer', { headers: { cookie: nieuwKoekje } });
    assert.equal(metNieuw.data.ingelogd, true);

    // Uitloggen maakt die sessie ongeldig.
    const uit = await haal(omgeving.basis, '/api/beheer/uitloggen',
      { method: 'POST', headers: { cookie: nieuwKoekje } });
    assert.equal(uit.status, 200);
    const daarna = await haal(omgeving.basis, '/api/beheer', { headers: { cookie: nieuwKoekje } });
    assert.equal(daarna.data.ingelogd, false);

    // Het wachtwoord veranderen kan alleen met het oude erbij.
    const zonderOud = await baas.post('/api/beheer/wachtwoord', { wachtwoord: 'nog-een-lang-wachtwoord' });
    assert.equal(zonderOud.status, 401);
    assert.match(zonderOud.data.fout, /oude wachtwoord/i);
    const metOud = await baas.post('/api/beheer/wachtwoord',
      { oud: 'mijn-lange-wachtwoord', wachtwoord: 'nog-een-lang-wachtwoord' });
    assert.equal(metOud.status, 200, JSON.stringify(metOud.data));

    // Na het veranderen is de oude sessie weg en werkt alleen het nieuwe wachtwoord.
    const oudeSessie = await haal(omgeving.basis, '/api/beheer', { headers: { cookie: baas.koekje } });
    assert.equal(oudeSessie.data.ingelogd, false);
    assert.equal((await post(omgeving.basis, '/api/beheer/inloggen', { wachtwoord: 'mijn-lange-wachtwoord' })).status, 401);
    assert.equal((await post(omgeving.basis, '/api/beheer/inloggen', { wachtwoord: 'nog-een-lang-wachtwoord' })).status, 200);
  } finally {
    await omgeving.stop();
  }
});
