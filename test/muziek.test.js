'use strict';
// Muziektheorie, grepen, ChordPro-parser en capo-advies: puur rekenwerk.
const test = require('node:test');
const assert = require('node:assert');
const theorie = require('../lib/theorie');
const grepen = require('../lib/grepen');
const chordpro = require('../lib/chordpro');
const capo = require('../lib/capo');
const gitaar = require('../lib/gitaar');
const tijdlijn = require('../lib/tijdlijn');
const bron = require('../liedjes-bron');

const WHITELIST = ['C', 'C7', 'Cm', 'Cmaj7', 'D', 'D7', 'Dm', 'Dm7', 'E', 'E7', 'Em', 'Em7',
  'F', 'F7', 'Fm', 'Fmaj7', 'G', 'G7', 'Gm', 'A', 'A7', 'Am', 'Am7', 'Bb', 'B7', 'Bm'];

test('transponeren houdt de kwaliteit en de basnoot', () => {
  assert.equal(theorie.transponeer('G', 2, false), 'A');
  assert.equal(theorie.transponeer('Am', 2, false), 'Bm');
  assert.equal(theorie.transponeer('F#m', 2, false), 'G#m');
  assert.equal(theorie.transponeer('C', -1, false), 'B');
  assert.equal(theorie.transponeer('Am', -2, false), 'Gm');
  assert.equal(theorie.transponeer('Bb', 2, true), 'C');
  assert.equal(theorie.transponeer('G', 3, true), 'Bb');
  assert.equal(theorie.transponeer('C', 0, false), 'C');
});

test('toonsoort kiest mollen waar dat hoort', () => {
  assert.equal(theorie.transponeerToonsoort('F', 0), 'F');
  assert.equal(theorie.transponeerToonsoort('G', 3), 'Bb');
  assert.equal(theorie.transponeerToonsoort('C', 3), 'Eb');
  assert.equal(theorie.transponeerToonsoort('G', 2), 'A');
});

test('elke whitelist-greep heeft een compleet diagram', () => {
  for (const naam of WHITELIST) {
    assert.ok(grepen.heeftGreep(naam), `greep ontbreekt: ${naam}`);
    const g = grepen.greep(naam);
    assert.equal(g.frets.length, 6, `${naam}: zes snaren`);
    assert.ok(g.frets.some(f => f >= 0), `${naam}: minstens één klinkende snaar`);
    const svg = grepen.svgDiagram(naam);
    assert.match(svg, /^<svg /, `${naam}: svg`);
    assert.ok(svg.includes(`${naam}</text>`), `${naam}: naam in het diagram`);
  }
});

test('greep met barré wordt als barré herkend', () => {
  assert.equal(grepen.isBarre('F'), true);
  assert.equal(grepen.isBarre('C'), false);
  assert.equal(grepen.isBarre('Bm'), true);
});

test('capo verschuift de klinkende frets, niet de greep', () => {
  const zonder = grepen.klinkendeFrets('G', 0);
  const met = grepen.klinkendeFrets('G', 2);
  assert.deepEqual(zonder, [3, 2, 0, 0, 0, 3]);
  assert.deepEqual(met, [5, 4, 2, 2, 2, 5]);
  assert.deepEqual(grepen.noten('C', 0).map(n => n.midi), [48, 52, 55, 60, 64]);
});

test('ChordPro-parser leest richtlijnen, refrein en tabblok', () => {
  const model = chordpro.parse([
    '{title: Proefliedje}',
    '{key: G}',
    '{tempo: 96}',
    '{comment: Couplet 1}',
    '[G]eerste regel [C]tweede',
    '{soc}',
    '[D]refrein hier',
    '{eoc}',
    '{sot}',
    '3 2 0 0 0 3',
    '{eot}'
  ].join('\n'));
  assert.equal(model.meta.titel, 'Proefliedje');
  assert.equal(model.meta.toonsoort, 'G');
  assert.equal(model.meta.tempo, 96);
  assert.deepEqual(model.akkoorden.sort(), ['C', 'D', 'G']);
  assert.equal(model.regels.filter(r => r.soort === 'label').length, 1);
  assert.equal(model.regels.filter(r => r.soort === 'sectie-start').length, 1);
  const tab = model.regels.find(r => r.soort === 'tab');
  assert.deepEqual(tab.regels, ['3 2 0 0 0 3']);
  const tekst = model.regels.find(r => r.soort === 'tekst');
  assert.deepEqual(tekst.segmenten.map(s => s.akkoord), ['G', 'C']);
  assert.equal(tekst.segmenten[1].tekst, 'tweede');
});

test('transponeren van een model raakt akkoorden en toonsoort', () => {
  const model = chordpro.parse('{key: G}\n[G]een [Em]twee [C]drie');
  const omhoog = chordpro.transponeerModel(model, 2, false);
  assert.deepEqual(omhoog.akkoorden.sort(), ['A', 'D', 'F#m'].sort());
  assert.equal(omhoog.meta.toonsoort, 'A');
  assert.equal(omhoog.regels.find(r => r.soort === 'tekst').segmenten[0].akkoord, 'A');
  // het origineel blijft ongemoeid
  assert.equal(model.regels.find(r => r.soort === 'tekst').segmenten[0].akkoord, 'G');
});

test('capo-advies: A-majeur liedje wordt capo 2 met G-grepen', () => {
  const advies = capo.advies(['A', 'D', 'E', 'F#m', 'Bm'], 'A');
  assert.equal(advies.capo, 2);
  assert.equal(advies.vormToonsoort, 'G');
  assert.deepEqual(advies.akkoorden.map(a => a.vorm), ['G', 'C', 'D', 'Em', 'Am']);
  assert.equal(advies.zonderCapo, false);
  assert.match(advies.tekst, /Capo op 2/);
});

test('capo-advies laat een open toonsoort met rust', () => {
  const advies = capo.advies(['C', 'G', 'Am', 'F'], 'C');
  assert.equal(advies.capo, 0);
  assert.equal(advies.zonderCapo, true);
  assert.match(advies.tekst, /Zonder capo/);
  // F is een barré; dat wordt benoemd
  assert.match(advies.tekst, /barré/);
});

test('capo-advies zonder akkoorden valt niet om', () => {
  const advies = capo.advies([], 'C');
  assert.equal(advies.capo, 0);
  assert.deepEqual(advies.akkoorden, []);
  assert.match(advies.tekst, /Geen akkoorden/);
});

test('gitaarsynthesizer levert een geldige WAV van de juiste lengte', () => {
  const wav = gitaar.maakWav({ akkoorden: ['G', 'C'], capo: 0, bpm: 120, strum: 'D DU UDU', rondes: 1 });
  assert.equal(wav.slice(0, 4).toString(), 'RIFF');
  assert.equal(wav.slice(8, 12).toString(), 'WAVE');
  const sampleRate = wav.readUInt32LE(24);
  assert.equal(sampleRate, 44100);
  const samples = (wav.length - 44) / 2;
  // één ronde van twee akkoorden op 120 BPM = 4 seconden + staart
  assert.ok(samples / sampleRate > 3.5, 'duur te kort: ' + (samples / sampleRate));
  let piek = 0;
  for (let i = 0; i < samples; i++) piek = Math.max(piek, Math.abs(wav.readInt16LE(44 + i * 2)));
  assert.ok(piek > 3000, 'signaal te zacht: ' + piek);
  assert.ok(piek <= 32767, 'clipping: ' + piek);
});

test('gitaarsynthesizer weigert onbekende akkoorden', () => {
  assert.throws(() => gitaar.maakWav({ akkoorden: ['Xyz'] }), /Geen bekende akkoorden/);
});

test('patroon "D DU UDU" wordt acht achtste noten met rusten', () => {
  assert.deepEqual(gitaar.patroonTokens('D DU UDU'), ['D', '-', 'D', 'U', '-', 'U', 'D', 'U']);
  assert.deepEqual(gitaar.patroonTokens(''), ['D', '-', 'D', 'U', '-', 'U', 'D', 'U']);
  assert.deepEqual(gitaar.patroonTokens('DDDDDDDD'), ['D', 'D', 'D', 'D', 'D', 'D', 'D', 'D']);
  assert.deepEqual(gitaar.patroonTokens('U'), ['U', 'U', 'U', 'U', 'U', 'U', 'U', 'U']);
  assert.equal(gitaar.patroonTokens('D DU UDU').length, 8);
});

test('de meegeleverde liedjes-dataset is compleet en houdt zich aan de whitelist', () => {
  const liedjes = bron.alle();
  assert.ok(liedjes.length >= 20, 'te weinig liedjes: ' + liedjes.length);
  const titels = new Set();
  // Elk databestand heeft zijn eigen id-bereik; titels mogen tussen bestanden
  // samenvallen (twee keer 'Amazing Grace' is een andere bewerking), binnen één
  // bestand niet.
  const perBestand = new Map();
  for (const lied of liedjes) {
    assert.ok(lied.titel && lied.titel.length > 1, 'titel ontbreekt');
    const vak = Math.floor(lied.id / 100000);
    if (!perBestand.has(vak)) perBestand.set(vak, new Set());
    // twee versies van dezelfde wijs mogen naast elkaar bestaan; een exacte
    // herhaling (zelfde titel én zelfde noten) is een fout in de omzetting
    const vingerafdruk = lied.titel + '|' + lied.noten.map(n => n.midi).join(',');
    assert.ok(!perBestand.get(vak).has(vingerafdruk), 'dubbel liedje in hetzelfde bestand: ' + lied.titel);
    perBestand.get(vak).add(vingerafdruk);
    titels.add(lied.titel);
    assert.ok(['nl', 'en', 'de', 'af', 'li', 'instrumentaal'].includes(lied.taal), 'taal onbekend: ' + lied.taal);
    assert.ok(lied.moeilijkheid >= 1 && lied.moeilijkheid <= 5, 'moeilijkheid buiten bereik');
    // Een liedtekst zonder muziek heeft geen tempo en geen akkoorden: dat is geen
    // fout maar een eigenschap van de bron (van die liedjes is geen melodie overgeleverd).
    const alleenTekst = !lied.noten.length && !lied.model.akkoorden.length;
    if (alleenTekst) {
      // Het databestand heeft tempo 0; de lezer zet er een werkbaar standaardtempo
      // neer omdat de speler nu eenmaal een getal nodig heeft. In het bestand zelf
      // staat geen tempo, en dat is wat de keuring in het bronbestand controleert.
      assert.ok(lied.tempo >= 40, 'onwerkbaar tempo: ' + lied.titel);
    } else {
      assert.ok(lied.tempo >= 40 && lied.tempo <= 200, 'tempo onrealistisch');
    }
    assert.ok(lied.maatsoort >= 2 && lied.maatsoort <= 12, 'maatsoort onrealistisch: ' + lied.titel);
    if (lied.noten.length) {
      assert.ok(lied.noten.length >= 8, 'te weinig noten: ' + lied.titel);
    } else {
      assert.ok(lied.model.regels.length >= 8, 'te weinig regels: ' + lied.titel);
    }
    // een instrumentaal wijsje mag één akkoord hebben (een ronde bijvoorbeeld),
    // een liedje met tekst hoort er minstens twee te hebben
    if (alleenTekst) {
      assert.equal(lied.toonsoort, '', 'een liedtekst hoort geen toonsoort te hebben: ' + lied.titel);
      assert.match(lied.licentie || '', /Publiek domein/, 'licentie niet onderbouwd: ' + lied.titel);
    } else {
      assert.ok(lied.model.akkoorden.length >= (lied.noten.length ? 1 : 2), 'te weinig akkoorden: ' + lied.titel);
    }
    for (const akkoord of lied.model.akkoorden) {
      const toegestaan = lied.noten.length ? grepen.heeftGreep(akkoord) : WHITELIST.includes(akkoord);
      assert.ok(toegestaan, `${lied.titel}: akkoord zonder greep: ${akkoord}`);
    }
    assert.ok(lied.bron && lied.bron.length > 2, 'bronvermelding ontbreekt: ' + lied.titel);
  }
  // ids van meegeleverde liedjes blijven onder het bereik van eigen liedjes
  assert.ok(Math.max(...liedjes.map(l => l.id)) < 900000);
});

test('elk liedje met een melodie heeft per maat een speelbaar akkoord en nette noten', () => {
  // De meegeleverde liedjes zijn Nederlandstalige liedjes met akkoorden; de bundels met melodieën
  // (Iers, Engels, Schots) zijn er op verzoek uit gehaald. Zit er nog wel een melodie bij, dan moet
  // die aan dezelfde eisen voldoen — vandaar de controle zonder minimumaantal.
  const metMelodie = bron.alle().filter(l => l.noten.length);
  for (const lied of metMelodie) {
    const laatste = lied.noten[lied.noten.length - 1];
    const maten = Math.ceil((laatste.start + laatste.duur) / lied.maatsoort - 1e-6);
    assert.equal(lied.akkoordenPerMaat.length, maten, `${lied.titel}: ${lied.akkoordenPerMaat.length} akkoorden voor ${maten} maten`);
    for (const akkoord of lied.akkoordenPerMaat) {
      assert.ok(grepen.heeftGreep(akkoord), `${lied.titel}: maatakkoord zonder greep: ${akkoord}`);
    }
    const vorigeStart = -1;
    let start = vorigeStart;
    for (const noot of lied.noten) {
      assert.ok(Number.isFinite(noot.midi) && noot.midi >= 36 && noot.midi <= 96, `${lied.titel}: noot buiten bereik: ${noot.midi}`);
      // een noot mag over de maatstreep heen doorlopen (verbindingsboog), maar niet eindeloos
      assert.ok(noot.duur > 0 && noot.duur <= lied.maatsoort * 2, `${lied.titel}: rare nootduur: ${noot.duur}`);
      assert.ok(noot.start >= start, `${lied.titel}: noten niet op volgorde`);
      start = noot.start;
    }
  }
});

test('de tijdlijn van een liedje met melodie past bij de maten en de noten', () => {
  // Er zit geen liedje met melodie meer in de verzameling, dus maken we er hier zelf een: vier maten
  // met zestien noten. Zo blijft de tijdlijnberekening voor melodieën getest.
  const lied = {
    titel: 'Proefwijsje', tempo: 100, maatsoort: 4, strum: 'D DU UDU',
    akkoordenPerMaat: ['C', 'G', 'Am', 'F'], noten: []
  };
  for (let i = 0; i < 16; i++) {
    lied.noten.push({ start: i * 0.5, duur: 0.5, midi: 60 + (i % 5), naam: 'C', snaar: 1, fret: 1 + (i % 4) });
  }
  assert.ok(lied.noten.length > 12);
  const plan = tijdlijn.maakPlan({
    akkoorden: lied.akkoordenPerMaat,
    rondes: 1,
    capo: 0,
    bpm: lied.tempo,
    maatsoort: lied.maatsoort,
    strum: lied.strum,
    noten: lied.noten
  });
  assert.equal(plan.maten.length, lied.akkoordenPerMaat.length);
  assert.equal(plan.rondes, 1, 'een liedje met melodie wordt één keer gespeeld');
  assert.equal(plan.aftellen.seconden, plan.maatSeconden, 'het aftellen duurt precies één maat');
  for (const slag of plan.slagen) {
    assert.ok(slag.startSeconden < plan.duurSeconden, 'slag valt buiten het liedje');
    assert.ok(slag.noten.length >= 3, 'een slag zonder akkoordnoten');
    for (const noot of slag.noten) assert.ok(noot.snaar >= 0 && noot.snaar <= 5, 'snaar buiten bereik');
  }
  for (const noot of plan.noten) {
    assert.ok(noot.startSeconden >= plan.aftellen.seconden - 1e-6, 'melodienoot valt in het aftellen');
    assert.ok(noot.startSeconden + noot.duurSeconden <= plan.duurSeconden + 1e-6);
    assert.ok(noot.snaar >= 0 && noot.snaar <= 5 && noot.fret >= 0, 'melodienoot zonder halspositie');
  }
  const wav = gitaar.maakPlanWav(plan);
  const verwacht = Math.round((plan.duurSeconden + 1.2) * gitaar.SAMPLE_RATE);
  assert.ok(Math.abs(wav.length - (44 + verwacht * 2)) <= 2, 'audiobuffer heeft niet de lengte van het plan');
});

test('grepen zijn speelbaar: elke greep heeft frets en vingers van dezelfde lengte', () => {
  for (const naam of grepen.alleGrepen()) {
    const g = grepen.greep(naam);
    assert.ok(g, 'geen greep voor ' + naam);
    assert.equal(g.frets.length, 6, naam + ': geen zes snaren');
    assert.equal(g.vingers.length, 6, naam + ': geen zes vingerposities');
    for (const fret of g.frets) assert.ok(fret >= -1 && fret <= 14, naam + ': fret buiten bereik');
  }
});

test('zoekindex van de meegeleverde liedjes bevat akkoorden en tekst', () => {
  const lied = bron.alle().find(l => l.titel === 'Amazing Grace');
  assert.ok(lied, 'Amazing Grace ontbreekt');
  const index = bron.zoekTekst(lied);
  assert.match(index, /amazing grace/);
  assert.match(index, /grace/);
  assert.ok(index.length > 100, 'zoekindex te mager');
});

test('Limburgse liedteksten zonder melodie komen mee en blijven eerlijk', () => {
  const liedjes = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '..', 'song-data', 'limburg-liedjes.json'), 'utf8'));
  const teksten = liedjes.filter(l => l.genre === 'Liedtekst' || l.chordpro.includes('Alleen de liedtekst'));
  assert.ok(teksten.length >= 18, 'verwacht minstens achttien liedteksten, gevonden: ' + teksten.length);
  for (const l of teksten) {
    // geen akkoorden, geen toonsoort, geen tempo: er is geen muziek in de bron
    assert.equal(l.toonsoort, '', l.titel + ': hoort geen toonsoort te hebben');
    assert.equal(l.tempo, 0, l.titel + ': hoort geen tempo te hebben');
    assert.ok(!/\[[A-G][^]]*\]/.test(l.chordpro), l.titel + ': hoort geen akkoorden in de tekst te hebben');
    // wel: de volledige tekst, de dichter met sterfjaar en een bron
    assert.ok(l.chordpro.includes('{title: ' + l.titel + '}'), l.titel + ': titel ontbreekt');
    assert.match(l.artiest, /†\d{4}|Anoniem/, l.titel + ': dichter zonder sterfjaar');
    assert.match(l.bron, /https?:\/\//, l.titel + ': bron zonder adres');
    assert.match(l.licentie, /Publiek domein/, l.titel + ': licentie niet onderbouwd');
    const regels = l.chordpro.split('\n').filter(r => r.trim() && !r.startsWith('{'));
    assert.ok(regels.length >= 4, l.titel + ': te weinig tekstregels');
  }
  // de liedjes met muziek blijven zoals ze waren
  const metMuziek = liedjes.filter(l => l.toonsoort);
  assert.ok(metMuziek.length >= 4, 'de vier liedjes met muziek horen er nog te zijn');
  for (const l of metMuziek) assert.match(l.chordpro, /\[[A-G][^]]*\]/, l.titel + ': akkoorden ontbreken');
});

test('de app zegt het als er alleen een tekst is', () => {
  const html = require('fs').readFileSync(require('path').join(__dirname, '..', 'public', 'index.html'), 'utf8');
  assert.match(html, /'<span class="chip geen">alleen tekst<\/span>'/);
  assert.match(html, /Van dit liedje is alleen de tekst overgeleverd/);
  const server = require('fs').readFileSync(require('path').join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(server, /er is geen melodie of ' \+\s*\n\s*'akkoordschema om mee te spelen/);
});
