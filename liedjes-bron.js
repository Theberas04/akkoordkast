'use strict';
// Laadt de meegeleverde liedjes-datasets en houdt de geparseerde versie bij.
//
// Elk databestand heeft zijn eigen id-bereik, zodat een liedje altijd hetzelfde
// nummer houdt ook als er later liedjes aan een ander bestand worden toegevoegd:
//   liedjes.json      1.   eigen Nederlandse liedjes
//   volkswijsjes.json 100.000+  traditionele volkswijsjes (met melodie)
//   kerkwijsjes.json  200.000+  kerkwijsjes (met melodie)
// Eigen liedjes van de gebruiker beginnen bij 900.000.
const fs = require('fs');
const path = require('path');
const chordpro = require('./lib/chordpro');
const capo = require('./lib/capo');
const theorie = require('./lib/theorie');
const grepen = require('./lib/grepen');

const BESTANDEN = process.env.LIEDJES_BESTAND
  ? [{ bestand: process.env.LIEDJES_BESTAND, vanaf: 1 }]
  : [
    { bestand: path.join(__dirname, 'song-data', 'liedjes.json'), vanaf: 1 },
    { bestand: path.join(__dirname, 'song-data', 'volkswijsjes.json'), vanaf: 100000 },
    { bestand: path.join(__dirname, 'song-data', 'kerkwijsjes.json'), vanaf: 200000 }
  ];

function leesBestand(pad) {
  try {
    const ruw = JSON.parse(fs.readFileSync(pad, 'utf8'));
    return Array.isArray(ruw) ? ruw : [];
  } catch (e) {
    console.warn('[akkoordkast] liedjes-dataset niet leesbaar:', path.basename(pad), e.message);
    return [];
  }
}

// Een liedje met een melodie hoort per maat een akkoord te hebben: gaten en
// onbekende akkoorden vullen we op, anders verschuift de hele tijdlijn.
function netteMaatakkoorden(lijst, model, maatsoort) {
  const uit = [];
  let vorige = null;
  const bron = Array.isArray(lijst) && lijst.length
    ? lijst
    : chordpro.akkoordenReeks(model, 8);
  for (let i = 0; i < bron.length; i++) {
    const naam = bron[i] && grepen.heeftGreep(bron[i]) ? bron[i] : vorige;
    uit.push(naam || null);
    if (naam) vorige = naam;
  }
  const eerste = uit.find(a => a) || null;
  return uit.map(a => a || eerste).filter(Boolean);
}

function maakLiedje(lied, id) {
  const model = chordpro.parse(lied.chordpro || '');
  const toonsoort = lied.toonsoort || model.meta.toonsoort || (model.akkoorden[0] || 'C');
  const advies = capo.advies(model.akkoorden, toonsoort);
  return {
    id,
    titel: lied.titel || model.meta.titel || `Liedje ${id}`,
    artiest: lied.artiest || '',
    taal: (lied.taal || 'nl').toLowerCase(),
    genre: lied.genre || 'Folk',
    moeilijkheid: Math.max(1, Math.min(5, parseInt(lied.moeilijkheid, 10) || 2)),
    toonsoort,
    tempo: parseInt(lied.tempo, 10) || model.meta.tempo || 84,
    strum: lied.strum || model.meta.strum || 'D DU UDU',
    bron: lied.bron || '',
    licentie: lied.licentie || '',
    youtube: lied.youtube || '',
    chordpro: lied.chordpro || '',
    // Melodie: noten in tellen vanaf het begin van het liedje, met midi-nummers.
    // Alleen liedjes met noten kunnen meespelen met de notenbalk en de tabulatuur.
    noten: Array.isArray(lied.noten) ? lied.noten : [],
    maatsoort: Math.max(2, Math.min(12, parseInt(lied.maatsoort, 10) || 4)),
    akkoordenPerMaat: netteMaatakkoorden(lied.akkoordenPerMaat, model, lied.maatsoort),
    model,
    advies
  };
}

const LIEDJES = [];
const HERKOMST = [];
for (const { bestand, vanaf } of BESTANDEN) {
  const ruw = leesBestand(bestand);
  HERKOMST.push({ bestand: path.basename(bestand), vanaf, aantal: ruw.length });
  ruw.forEach((lied, i) => LIEDJES.push(maakLiedje(lied, vanaf + i)));
}

const perId = new Map(LIEDJES.map(l => [l.id, l]));

function alle() { return LIEDJES; }
function vind(id) { return perId.get(Number(id)) || null; }
function perBestand() { return HERKOMST.slice(); }

// Zoekindex in het geheugen: titel, artiest, akkoorden en de liedtekst zelf.
const ZOEK = new Map();
for (const lied of LIEDJES) {
  ZOEK.set(lied.id, [
    lied.titel, lied.artiest, lied.genre, lied.bron,
    lied.model.akkoorden.join(' '),
    lied.chordpro.replace(/\{[^}]*\}/g, ' ').replace(/\[[^\]]*\]/g, ' ')
  ].join(' ').toLowerCase());
}

function zoekTekst(lied) {
  return ZOEK.get(lied.id) || lied.titel.toLowerCase();
}

function statistieken() {
  const talen = {};
  const genres = {};
  let metMelodie = 0;
  for (const l of LIEDJES) {
    talen[l.taal] = (talen[l.taal] || 0) + 1;
    genres[l.genre] = (genres[l.genre] || 0) + 1;
    if (l.noten.length) metMelodie++;
  }
  return { aantal: LIEDJES.length, talen, genres, metMelodie, bestanden: HERKOMST };
}

module.exports = { alle, vind, zoekTekst, statistieken, perBestand, LIEDJES, theorie };
