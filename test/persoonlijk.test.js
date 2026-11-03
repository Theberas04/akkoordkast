'use strict';
// Profielen, favorieten, labels, speelgeschiedenis en oefencijfers.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { start, haal, post } = require('./hulp');

let omgeving;
const metProfiel = (id, extra) => Object.assign({ headers: { 'x-profiel': String(id) } }, extra || {});

test.before(async () => { omgeving = await start(); });
test.after(async () => { if (omgeving) await omgeving.stop(); });

test('er is altijd een profiel en je kunt er een bijmaken', async () => {
  const leeg = await haal(omgeving.basis, '/api/profielen');
  assert.equal(leeg.status, 200);
  assert.ok(leeg.data.profielen.length >= 1, 'er hoort minstens één profiel te zijn');
  assert.equal(leeg.data.profielen[0].naam, 'Standaard');
  assert.ok(leeg.data.actief >= 1);

  const nieuw = await post(omgeving.basis, '/api/profielen', { naam: 'Anna' });
  assert.equal(nieuw.status, 201);
  assert.equal(nieuw.data.profiel.naam, 'Anna');
  assert.ok(nieuw.data.profiel.id > 1);
  assert.ok(nieuw.data.profielen.some(p => p.naam === 'Anna'));

  // dezelfde naam nog eens: dat weigeren we met uitleg
  const dubbel = await post(omgeving.basis, '/api/profielen', { naam: 'anna' });
  assert.equal(dubbel.status, 409);
  assert.match(dubbel.data.fout, /al een profiel/i);

  const leeg2 = await post(omgeving.basis, '/api/profielen', { naam: '   ' });
  assert.equal(leeg2.status, 400);

  // het laatste profiel kan er niet uit
  const eerste = await haal(omgeving.basis, '/api/profielen');
  const idAnna = eerste.data.profielen.find(p => p.naam === 'Anna').id;
  const idStandaard = eerste.data.profielen.find(p => p.naam === 'Standaard').id;
  const weg = await haal(omgeving.basis, '/api/profielen/' + idAnna, { method: 'DELETE' });
  assert.equal(weg.status, 200);
  const laatste = await haal(omgeving.basis, '/api/profielen/' + idStandaard, { method: 'DELETE' });
  assert.equal(laatste.status, 400, 'het laatste profiel mag niet weg');
  assert.match(laatste.data.fout, /laatste profiel/i);
});

test('favorieten horen bij één profiel en zijn te filteren', async () => {
  const lied = await haal(omgeving.basis, '/api/liedjes?compact=1&aantal=3');
  const eerste = lied.data.liedjes[0].id;

  const aan = await post(omgeving.basis, '/api/favoriet', { liedje: eerste, aan: true });
  assert.equal(aan.status, 200);
  assert.equal(aan.data.favoriet, true);

  const filters = await haal(omgeving.basis, '/api/liedjes?compact=1&aantal=5&favoriet=1');
  assert.equal(filters.status, 200);
  assert.ok(filters.data.totaal >= 1, 'het favorietenfilter werkt niet');
  assert.ok(filters.data.liedjes.every(l => l.favoriet), 'er zitten niet-favorieten in de lijst');
  assert.ok(filters.data.liedjes.some(l => l.id === eerste));

  // een tweede profiel ziet die favoriet niet
  const ander = await post(omgeving.basis, '/api/profielen', { naam: 'Buurman' });
  const buur = await haal(omgeving.basis, '/api/liedjes?compact=1&aantal=5&favoriet=1', metProfiel(ander.data.profiel.id));
  assert.equal(buur.data.totaal, 0, 'profielen mogen elkaars favorieten niet zien');

  // en het liedje zelf weet het ook
  const een = await haal(omgeving.basis, '/api/liedjes/' + eerste);
  assert.equal(een.data.favoriet, true);

  const uit = await post(omgeving.basis, '/api/favoriet', { liedje: eerste, aan: false });
  assert.equal(uit.data.favoriet, false);
  const na = await haal(omgeving.basis, '/api/liedjes?compact=1&aantal=5&favoriet=1');
  assert.equal(na.data.totaal, 0);

  const onzin = await post(omgeving.basis, '/api/favoriet', { liedje: 123456789, aan: true });
  assert.equal(onzin.status, 404);
});

test('labels maak je zelf en hang je aan liedjes', async () => {
  const lied = await haal(omgeving.basis, '/api/liedjes?compact=1&aantal=3');
  const eerste = lied.data.liedjes[0].id;
  const tweede = lied.data.liedjes[1].id;

  const nieuw = await post(omgeving.basis, '/api/labels', { naam: 'Bruiloft' });
  assert.equal(nieuw.status, 201);
  const labelId = nieuw.data.id;
  assert.equal(nieuw.data.labels.length, 1);
  assert.equal(nieuw.data.labels[0].naam, 'Bruiloft');

  const aan = await post(omgeving.basis, '/api/liedje-label', { liedje: eerste, label: labelId, aan: true });
  assert.equal(aan.status, 200);
  // hetzelfde label nog eens: geen dubbele rij, wel nog steeds gekoppeld
  await post(omgeving.basis, '/api/liedje-label', { liedje: eerste, label: labelId, aan: true });
  const lijst = await haal(omgeving.basis, '/api/labels');
  assert.equal(lijst.data.labels[0].aantal, 1, 'het label is dubbel geteld');

  // het label meteen bij het liedje noemen maakt hem ook aan
  const snel = await post(omgeving.basis, '/api/liedje-label', { liedje: tweede, naam: 'Kroeg', aan: true });
  assert.equal(snel.status, 200);
  assert.equal(snel.data.labels.length, 2);

  // filteren op label
  const opLabel = await haal(omgeving.basis, '/api/liedjes?compact=1&aantal=5&label=' + labelId);
  assert.equal(opLabel.data.totaal, 1);
  assert.equal(opLabel.data.liedjes[0].id, eerste);
  assert.deepEqual(opLabel.data.liedjes[0].labels, ['Bruiloft']);

  // en het liedje zelf geeft de labels met hun id
  const een = await haal(omgeving.basis, '/api/liedjes/' + eerste);
  assert.ok(een.data.labels.some(l => l.id === labelId && l.naam === 'Bruiloft'));

  const eraf = await post(omgeving.basis, '/api/liedje-label', { liedje: eerste, label: labelId, aan: false });
  assert.equal(eraf.status, 200);
  const nog = await haal(omgeving.basis, '/api/liedjes?compact=1&aantal=5&label=' + labelId);
  assert.equal(nog.data.totaal, 0);

  const weg = await haal(omgeving.basis, '/api/labels/' + labelId, { method: 'DELETE' });
  assert.equal(weg.status, 200);
  assert.ok(!weg.data.labels.some(l => l.id === labelId));

  const leeg = await post(omgeving.basis, '/api/labels', { naam: '' });
  assert.equal(leeg.status, 400);
  const onbekend = await post(omgeving.basis, '/api/liedje-label', { liedje: eerste, label: 999999, aan: true });
  assert.equal(onbekend.status, 404);
});

test('laatst gespeeld houdt bij wat je onder handen had', async () => {
  const lied = await haal(omgeving.basis, '/api/liedjes?compact=1&aantal=5');
  const eerste = lied.data.liedjes[0].id;
  const derde = lied.data.liedjes[2].id;

  assert.equal((await post(omgeving.basis, '/api/gespeeld', { liedje: eerste })).status, 200);
  await new Promise(r => setTimeout(r, 12));
  assert.equal((await post(omgeving.basis, '/api/gespeeld', { liedje: derde })).status, 200);
  // nog eens spelen telt op, maar zet hem niet voor de nieuwste
  await post(omgeving.basis, '/api/gespeeld', { liedje: eerste });
  await new Promise(r => setTimeout(r, 12));
  await post(omgeving.basis, '/api/gespeeld', { liedje: derde });

  const gesorteerd = await haal(omgeving.basis, '/api/liedjes?compact=1&aantal=5&sorteer=gespeeld');
  assert.equal(gesorteerd.status, 200);
  assert.equal(gesorteerd.data.totaal, 2, 'alleen gespeelde liedjes horen hier te staan');
  assert.equal(gesorteerd.data.liedjes[0].id, derde, 'het laatst gespeelde liedje staat niet vooraan');
  assert.ok(gesorteerd.data.liedjes[0].gespeeld, 'de speeldatum ontbreekt');

  const stats = await haal(omgeving.basis, '/api/oefenen/statistieken');
  assert.equal(stats.status, 200);
  assert.equal(stats.data.gespeeldeLiedjes.length, 2);
  assert.equal(stats.data.gespeeldeLiedjes[0].id, derde);

  const onzin = await post(omgeving.basis, '/api/gespeeld', { liedje: 123456789 });
  assert.equal(onzin.status, 404);
});

test('oefensessies komen in de cijfers terecht', async () => {
  const leeg = await haal(omgeving.basis, '/api/oefenen/statistieken');
  const voor = leeg.data.statistieken.totaalSeconden;

  const niets = await post(omgeving.basis, '/api/oefenen', { soort: 'trainer', seconden: 0, wissels: 0 });
  assert.equal(niets.status, 400);

  const sessie = await post(omgeving.basis, '/api/oefenen', {
    soort: 'trainer', seconden: 95, wissels: 22, akkoorden: ['Em', 'Am', 'C', 'Em']
  });
  assert.equal(sessie.status, 201);
  assert.ok(sessie.data.statistieken, 'de cijfers horen meteen mee te komen');

  const na = await haal(omgeving.basis, '/api/oefenen/statistieken?dagen=14');
  const st = na.data.statistieken;
  assert.equal(st.totaalSeconden, voor + 95);
  assert.equal(st.totaalWissels, 22);
  assert.ok(st.reeksDagen >= 1, 'vandaag geoefend hoort de reeks op minstens 1 te zetten');
  assert.equal(st.dagen.length, 14, 'de grafiek hoort veertien dagen te hebben');
  assert.ok(st.dagen[st.dagen.length - 1].seconden >= 95, 'vandaag staat niet in de reeks');
  assert.ok(st.geoefendeAkkoorden.length >= 3);
  assert.equal(st.geoefendeAkkoorden[0].akkoord, 'Em');
  assert.equal(st.geoefendeAkkoorden[0].aantal, 2);

  // en een andere soort sessie telt ook mee
  await post(omgeving.basis, '/api/oefenen', { soort: 'ritme', seconden: 60, wissels: 0 });
  const nog = await haal(omgeving.basis, '/api/oefenen/statistieken');
  assert.equal(nog.data.statistieken.totaalSeconden, voor + 155);
});

test('de pagina heeft de profielkiezer, de sterren, de labels en de oefencijfers', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  for (const id of ['profiel-kies', 'profiel-nieuw', 'filter-bijzonder', 'filter-label', 'speel-labels',
    'oefencijfers', 'speel-ster']) {
    assert.ok(html.includes('id="' + id + '"'), 'id ontbreekt: ' + id);
  }
  assert.match(html, /function actiefProfiel\(\)/);
  assert.match(html, /'x-profiel': String\(actiefProfiel\(\)\)/);
  assert.match(html, /function zetFavoriet\(id, aan\)/);
  assert.match(html, /function laadOefencijfers\(\)/);
  assert.match(html, /function bewaarOefensessie\(soort, seconden, wissels, akkoorden\)/);
  assert.match(html, /function voegLabelToe\(liedje, naam\)/);
  assert.match(html, /p\.set\('favoriet', '1'\)/);
  assert.match(html, /p\.set\('sorteer', 'gespeeld'\)/);
  assert.match(html, /class="knop ster/);
  assert.match(html, /chip label/);
  assert.match(html, /laadProfielen\(\);\s*\nlaadLabels\(\);/);
});

test('de app vertelt welke versie er draait en hoe je bijwerkt', async () => {
  const versie = await haal(omgeving.basis, '/api/versie');
  assert.equal(versie.status, 200);
  assert.ok(versie.data.versie, 'de versie ontbreekt');
  assert.ok(versie.data.liedjes > 1000, 'het aantal liedjes ontbreekt');
  assert.ok(versie.data.gestart, 'het startmoment ontbreekt');
  assert.equal(versie.data.updateMogelijk, false, 'zonder update-script hoort bijwerken niet te kunnen');
  assert.match(versie.data.updateCommando, /update-from-github\.sh/);
  assert.match(versie.data.updateCommando, /CTID/);

  // bijwerken zonder script: uitleg plus het commando, geen halve poging
  const update = await post(omgeving.basis, '/api/update', {});
  assert.equal(update.status, 400);
  assert.match(update.data.fout, /Proxmox-host/);
  assert.match(update.data.commando, /update-from-github\.sh/);

  // en de controle op GitHub mag best mislukken: dan zeggen we dat gewoon
  const controle = await haal(omgeving.basis, '/api/versie/controle');
  assert.equal(controle.status, 200);
  assert.ok(controle.data.laatste.sha || controle.data.laatste.fout, 'geen sha en geen foutmelding');
  assert.equal(typeof controle.data.nieuwer, 'boolean');
});

test('de pagina heeft meescrollen, podiummodus, oefentempo, de lus, de microfoon en beheer', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  for (const id of ['scroll-knop', 'scroll-sneller', 'scroll-langzamer', 'scroll-terug', 'scroll-verder',
    'podium-knop', 'boek-printen', 'boek-nu-printen', 'boek-sluiten', 'oefen-tempo', 'lus-a', 'lus-b', 'lus-aan',
    'trein-luister', 'trein-gehoord', 'versie-nummer', 'versie-controle', 'versie-update', 'printboek']) {
    assert.ok(html.includes('id="' + id + '"'), 'id ontbreekt: ' + id);
  }
  assert.match(html, /function startScroll\(\)/);
  assert.match(html, /function zetPodium\(aan\)/);
  assert.match(html, /function maakBoek\(\)/);
  assert.match(html, /function pasOefenTempoToe\(l, herstart\)/);
  assert.match(html, /function zetLusPunt\(welk\)/);
  assert.match(html, /function gehoordAkkoord\(analyser, ctx, akkoorden\)/);
  assert.match(html, /getUserMedia\(\{ audio:/);
  assert.match(html, /function controleerVersie\(\)/);
  // de meescrollen bewaart de halve pixels, anders schuift de pagina nooit
  assert.match(html, /scroll\.rest = \(scroll\.rest \|\| 0\) \+ scroll\.snelheid \* seconden/);
  // de lus springt in de animatielus terug
  assert.match(html, /a\.currentTime = lus\.a\.seconden/);
  // het boek is het enige wat op papier komt
  assert.match(html, /html\.boek-zichtbaar #printboek\{display:block!important/);
  // de akkoordherkenning gebruikt de grepen uit de API
  assert.match(html, /greepVan\(naam\)/);
  assert.match(html, /toonklassenVanMidi/);
});
