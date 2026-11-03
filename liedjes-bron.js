'use strict';
// Laadt de meegeleverde liedjes-dataset en houdt de geparseerde versie bij.
const fs = require('fs');
const path = require('path');
const chordpro = require('./lib/chordpro');
const capo = require('./lib/capo');
const theorie = require('./lib/theorie');

const BESTAND = path.join(__dirname, 'song-data', 'liedjes.json');

let ruw = [];
try {
  ruw = JSON.parse(fs.readFileSync(BESTAND, 'utf8'));
  if (!Array.isArray(ruw)) ruw = [];
} catch (e) {
  console.warn('[akkoordkast] liedjes-dataset niet leesbaar:', e.message);
  ruw = [];
}

// Meegeleverde liedjes krijgen vaste ids vanaf 1; eigen liedjes beginnen bij 900000.
const LIEDJES = ruw.map((lied, i) => {
  const model = chordpro.parse(lied.chordpro || '');
  const toonsoort = lied.toonsoort || model.meta.toonsoort || (model.akkoorden[0] || 'C');
  const advies = capo.advies(model.akkoorden, toonsoort);
  return {
    id: i + 1,
    titel: lied.titel || model.meta.titel || `Liedje ${i + 1}`,
    artiest: lied.artiest || '',
    taal: (lied.taal || 'nl').toLowerCase(),
    genre: lied.genre || 'Folk',
    moeilijkheid: Math.max(1, Math.min(5, parseInt(lied.moeilijkheid, 10) || 2)),
    toonsoort,
    tempo: parseInt(lied.tempo, 10) || model.meta.tempo || 84,
    strum: lied.strum || model.meta.strum || 'D DU UDU',
    bron: lied.bron || '',
    youtube: lied.youtube || '',
    chordpro: lied.chordpro || '',
    model,
    advies
  };
});

const perId = new Map(LIEDJES.map(l => [l.id, l]));

function alle() { return LIEDJES; }
function vind(id) { return perId.get(Number(id)) || null; }

// Zoekindex in het geheugen: titel, artiest, akkoorden en de liedtekst zelf.
const ZOEK = new Map();
for (const lied of LIEDJES) {
  ZOEK.set(lied.id, [
    lied.titel, lied.artiest, lied.genre, lied.bron,
    lied.akkoorden ? lied.akkoorden.join(' ') : lied.model.akkoorden.join(' '),
    lied.chordpro.replace(/\{[^}]*\}/g, ' ').replace(/\[[^\]]*\]/g, ' ')
  ].join(' ').toLowerCase());
}

function zoekTekst(lied) {
  return ZOEK.get(lied.id) || lied.titel.toLowerCase();
}

function statistieken() {
  const talen = {};
  const genres = {};
  for (const l of LIEDJES) {
    talen[l.taal] = (talen[l.taal] || 0) + 1;
    genres[l.genre] = (genres[l.genre] || 0) + 1;
  }
  return { aantal: LIEDJES.length, talen, genres };
}

module.exports = { alle, vind, zoekTekst, statistieken, LIEDJES, theorie };
