'use strict';
// Het beheerdersaccount: zonder inloggen kan niemand iets toevoegen, en de gewone dingen
// (zoeken, spelen, leren, je eigen favorieten) blijven voor iedereen werken.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { start, haal, post, alsBeheerder, zetHandleiding } = require('./hulp');
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

    // Leeswerk blijft open: liedjes zoeken, een liedje openen, de handleiding (die uit de
    // gegevensmap komt; hij zit niet meer in het repo).
    zetHandleiding(omgeving.wortel);
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

test('het gereedschap hoort bij het beheerdersprofiel en niet bij je gewone profielen', async () => {
  const omgeving = await start();
  try {
    const profielen = await haal(omgeving.basis, '/api/profielen');
    const bazen = profielen.data.profielen.filter(p => p.beheer);
    assert.equal(bazen.length, 1, 'er hoort precies één beheerdersprofiel te zijn');
    assert.equal(bazen[0].naam, 'Admin');
    const gewoon = profielen.data.profielen.find(p => !p.beheer);
    assert.ok(gewoon, 'er hoort ook een gewoon profiel te bestaan');

    const ingelogd = await alsBeheerder(omgeving.basis);
    const lied = (await haal(omgeving.basis, '/api/liedjes?aantal=1')).data.liedjes[0];

    // Ingelogd zijn is niet genoeg: het moet ook het beheerdersprofiel zijn.
    const inGewoonProfiel = await haal(omgeving.basis, '/api/download', {
      method: 'POST',
      headers: { cookie: ingelogd.koekje, 'x-profiel': String(gewoon.id), 'content-type': 'application/json' },
      body: JSON.stringify({ liedje: lied.id, url: 'https://youtu.be/dQw4w9WgXcQ' })
    });
    assert.equal(inGewoonProfiel.status, 403, 'in een gewoon profiel hoort dit geweigerd te worden');
    assert.match(inGewoonProfiel.data.fout, /beheerdersprofiel/i);
    assert.equal(inGewoonProfiel.data.ingelogd, true, 'de app vertelt dat je wel bent ingelogd');

    // In het beheerdersprofiel mag het wel.
    const inBaasProfiel = await ingelogd.post('/api/mappen', { pad: '/tmp' });
    assert.ok([200, 201].includes(inBaasProfiel.status), JSON.stringify(inBaasProfiel.data));

    // En de app hoort te weten in welk profiel je zit (dan kan hij het tabblad weglaten).
    const detailGewoon = await haal(omgeving.basis, '/api/liedjes/' + lied.id,
      { headers: { cookie: ingelogd.koekje, 'x-profiel': String(gewoon.id) } });
    assert.equal(detailGewoon.data.beheer, true, 'je bent ingelogd');
    assert.equal(detailGewoon.data.beheerProfiel, false, 'maar niet in het beheerdersprofiel');
    const detailBaas = await ingelogd.haal('/api/liedjes/' + lied.id);
    assert.equal(detailBaas.data.beheerProfiel, true);
  } finally {
    await omgeving.stop();
  }
});

test('het beheerdersprofiel komt niet in beeld zonder het wachtwoord', async () => {
  const omgeving = await start();
  try {
    const profielen = await haal(omgeving.basis, '/api/profielen');
    const baas = profielen.data.profielen.find(p => p.beheer);
    const gewoon = profielen.data.profielen.find(p => !p.beheer);

    // Zonder inloggen: ook al vraag je met zoveel woorden om Admin, je krijgt een gewoon profiel.
    const zonder = await haal(omgeving.basis, '/api/persoonlijk', { headers: { 'x-profiel': String(baas.id) } });
    assert.equal(zonder.data.profiel, gewoon.id, 'zonder wachtwoord val je terug op een gewoon profiel');
    const lijstZonder = await haal(omgeving.basis, '/api/profielen', { headers: { 'x-profiel': String(baas.id) } });
    assert.equal(lijstZonder.data.actief, gewoon.id);

    // En met het wachtwoord mag het wel.
    const ingelogd = await alsBeheerder(omgeving.basis);
    const met = await ingelogd.haal('/api/persoonlijk');
    assert.equal(met.data.profiel, baas.id, 'ingelogd kom je wél in het beheerdersprofiel');
  } finally {
    await omgeving.stop();
  }
});

test('het beheerdersprofiel zit achter een wachtwoordkaartje in de pagina', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  for (const id of ['profiel-slot', 'slot-kop', 'slot-wachtwoord', 'slot-herhaal', 'slot-inloggen', 'slot-annuleren']) {
    assert.ok(html.includes('id="' + id + '"'), 'id ontbreekt: ' + id);
  }
  assert.match(html, /function slotOpen\(doel\)/);
  assert.match(html, /function slotInloggen\(\)/);
  assert.match(html, /function sluitBeheerProfiel\(\)/);
  assert.match(html, /p\.beheer && !BEHEER\.ingelogd/, 'het slotje hoort in de profielkiezer');
  assert.match(html, /if \(profiel && profiel\.beheer && !BEHEER\.ingelogd\)/, 'het slot hoort vóór het wisselen');
  // Het kaartje moet vóór het script staan dat de knoppen koppelt; anders bestaat het nog niet als
  // de pagina het script uitvoert en valt de hele app om.
  const kaart = html.indexOf('id="profiel-slot"');
  const script = html.indexOf('<script>\n');
  assert.ok(kaart > 0 && script > 0 && kaart < script, 'het kaartje hoort vóór het grote script te staan');
});

test('het gereedschap "Downloaden als mp3" staat in het tabblad Toevoegen', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  for (const id of ['mp3-kaart', 'mp3-wijze', 'mp3-nieuw-vak', 'mp3-titel', 'mp3-bestaand-vak',
    'mp3-zoek', 'mp3-uitkomst', 'mp3-gekozen', 'mp3-url', 'mp3-start', 'mp3-melding', 'mp3-stand']) {
    assert.ok(html.includes('id="' + id + '"'), 'id ontbreekt: ' + id);
  }
  // Een link kan als nieuwe muziek (nieuw liedje) of bij een bestaand liedje.
  assert.match(html, /Als nieuwe muziek/);
  assert.match(html, /Bij een liedje dat er al staat/);
  assert.match(html, /function volgNieuweMuziek\(\)/);
  assert.match(html, /function toonMp3Openen\(liedjeId\)/);
  assert.match(html, /Downloaden als mp3/);
  assert.match(html, /function koppelMp3Tool\(\)/);
  assert.match(html, /function startMp3Download\(\)/);
  assert.match(html, /function kiesMp3Liedje\(id\)/);
  // De kaart hoort in het beheerdersgedeelte te zitten: hij is een direct kind van het paneel,
  // waardoor de regel #paneel-toevoegen:not(.beheer) > .kaart hem verbergt zonder inloggen.
  const i = html.indexOf('id="paneel-toevoegen"');
  const j = html.indexOf('id="paneel-casten"');
  assert.ok(html.indexOf('id="mp3-kaart"') > i && html.indexOf('id="mp3-kaart"') < j, 'de kaart hoort in Toevoegen');
  // En de zoek- en startknop moeten gekoppeld worden bij het opstarten.
  assert.match(html, /koppelMp3Tool\(\);/, 'het gereedschap wordt niet gekoppeld bij het opstarten');
});

test('op een telefoon blijft de profielkiezer staan', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  // De regel met de mobiele stijl van de kop opzoeken (er zijn meer media-blokken).
  const i = html.indexOf('.onderkop > span:first-child{display:none}');
  assert.ok(i > 0, 'de ondertitel hoort op een telefoon weg te blijven, de kiezer te blijven');
  const blok = html.slice(i, i + 800);
  assert.ok(!/\.onderkop\{display:none\}/.test(html), 'de onderkop mag niet meer verborgen worden');
  assert.match(blok, /\.profiel-rij\{display:flex/, 'de profielrij hoort op een telefoon zichtbaar te zijn');
  assert.match(blok, /\.lied\{grid-template-columns:1fr/, 'de liedjeskaartjes horen op een telefoon onder elkaar te staan');
});

test('de kaart voor een hele artiest of afspeellijst staat in het gereedschap', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  for (const id of ['reeks-kaart', 'reeks-url', 'reeks-max', 'reeks-start', 'reeks-melding',
    'reeks-stand', 'reeks-lijst']) {
    assert.ok(html.includes('id="' + id + '"'), 'id ontbreekt: ' + id);
  }
  assert.match(html, /Een hele artiest of afspeellijst/);
  assert.match(html, /function startReeks\(\)/);
  assert.match(html, /function volgReeks\(\)/);
  assert.match(html, /koppelReeks\(\);/, 'de kaart hoort gekoppeld te worden bij het opstarten');
  // En de filters horen de eigen liedjes mee te nemen.
  assert.match(html, /a\.aantal >= 2 \|\| a\.eigen/, 'eigen artiesten horen in het filter te blijven staan');
  assert.match(html, /function vulKeuzelijst\(sel, paren\)/, 'de keuzelijsten horen opnieuw gevuld te worden');
});
