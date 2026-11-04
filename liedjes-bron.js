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
const voorstel = require('./lib/voorstel');
const capo = require('./lib/capo');
const theorie = require('./lib/theorie');
const grepen = require('./lib/grepen');

// De lijst met datasets staat in song-data/datasets.json, zodat een nieuwe bron
// toevoegen een regel in dat bestand is (plus het bestand zelf). Valt die index
// weg, dan gebruiken we deze vaste lijst; een test controleert dat de index alle
// datasetbestanden dekt en dat de installatiescripts ze allemaal meenemen.
const VAST = [
  { bestand: path.join(__dirname, 'song-data', 'liedjes.json'), vanaf: 1 },
  { bestand: path.join(__dirname, 'song-data', 'volkswijsjes.json'), vanaf: 100000 },
  { bestand: path.join(__dirname, 'song-data', 'kerkwijsjes.json'), vanaf: 200000 }
];

function leesIndex() {
  const pad = path.join(__dirname, 'song-data', 'datasets.json');
  try {
    const index = JSON.parse(fs.readFileSync(pad, 'utf8'));
    const lijst = (index.datasets || [])
      .filter(d => d && d.bestand && Number(d.vanaf) >= 0)
      .map(d => ({ bestand: path.join(__dirname, d.bestand), vanaf: Number(d.vanaf) }));
    return lijst.length ? lijst : null;
  } catch (e) {
    return null;
  }
}

const BESTANDEN = process.env.LIEDJES_BESTAND
  ? [{ bestand: process.env.LIEDJES_BESTAND, vanaf: 1 }]
  : (leesIndex() || VAST);

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
    : ((model.regels && model.regels.length) ? chordpro.akkoordenReeks(model, 8) : (model.akkoorden || []).slice());
  for (let i = 0; i < bron.length; i++) {
    const naam = bron[i] && grepen.heeftGreep(bron[i]) ? bron[i] : vorige;
    uit.push(naam || null);
    if (naam) vorige = naam;
  }
  const eerste = uit.find(a => a) || null;
  return uit.map(a => a || eerste).filter(Boolean);
}

// Het liedje zoals de app het gebruikt. Het zware werk — de ChordPro ontleden, de
// capo-adviesberekening en het netmaken van de maatakkoorden — gebeurt pas als er
// echt om gevraagd wordt. Met ruim achtduizend liedjes scheelt dat bij het starten
// seconden en honderden megabytes: de server leest alleen de titels en de teksten in.
function maakLiedje(lied, id) {
  let model = null;
  let advies = null;
  let maatakkoorden = null;
  let voorstelGebruikt = false;
  let voorstelToonsoort = '';
  const hetModel = () => {
    if (!model) {
      model = chordpro.parse(lied.chordpro || '');
      // Heeft de bron geen akkoorden, dan stellen we een schema voor in de toonaard van het liedje
      // (lib/voorstel.js). Zo kan elk liedje tóch getekend, gelezen en meegespeeld worden; de app
      // zegt er zelf bij dat het een voorstel is en niet uit de bron komt.
      if (!model.akkoorden.length) {
        const v = voorstel.voorstelReeks(lied.toonsoort || '');
        model = { meta: model.meta, regels: [], akkoorden: v.akkoorden.slice() };
        voorstelGebruikt = true;
        voorstelToonsoort = v.toonsoort;
      }
    }
    return model;
  };
  const liedje = {
    id,
    titel: lied.titel || hetModel().meta.titel || `Liedje ${id}`,
    artiest: lied.artiest || '',
    taal: (lied.taal || 'nl').toLowerCase(),
    genre: lied.genre || 'Folk',
    moeilijkheid: Math.max(1, Math.min(5, parseInt(lied.moeilijkheid, 10) || 2)),
    tempo: parseInt(lied.tempo, 10) || hetModel().meta.tempo || 84,
    bron: lied.bron || '',
    licentie: lied.licentie || '',
    youtube: lied.youtube || '',
    chordpro: lied.chordpro || '',
    // Melodie: noten in tellen vanaf het begin van het liedje, met midi-nummers.
    // Alleen liedjes met noten kunnen meespelen met de notenbalk en de tabulatuur.
    noten: Array.isArray(lied.noten) ? lied.noten : [],
    // Een liedje met noten heeft per maat een akkoord nodig; de controle daarop zit
    // in de tests. We vullen pas aan als iemand de maatakkoorden echt opvraagt.
    maatsoort: Math.max(2, Math.min(12, parseInt(lied.maatsoort, 10) || 4))
  };
  // Toonsoort en slagpatroon: uit het databestand als het er staat, anders afgeleid uit het
  // akkoordschema. Een liedje zonder eigen akkoorden krijgt een voorgesteld schema (zie boven), in
  // de toonaard van het liedje als die bekend is.
  Object.defineProperty(liedje, 'toonsoort', {
    enumerable: true,
    get: () => {
      if (lied.toonsoort) return lied.toonsoort;
      const m = hetModel();
      if (!m.akkoorden.length) return '';
      if (voorstelGebruikt) return voorstelToonsoort || 'C';
      return m.meta.toonsoort || m.akkoorden[0] || 'C';
    }
  });
  Object.defineProperty(liedje, 'strum', {
    enumerable: true,
    get: () => {
      if (lied.strum) return lied.strum;
      return hetModel().akkoorden.length ? 'D DU UDU' : '';
    }
  });
  Object.defineProperty(liedje, 'model', {
    enumerable: true,
    get: hetModel
  });
  // Komt het akkoordschema uit het liedje zelf of is het een voorstel van de app?
  Object.defineProperty(liedje, 'akkoordenBron', {
    enumerable: true,
    get: () => (voorstelGebruikt ? 'voorstel' : 'bron')
  });
  Object.defineProperty(liedje, 'advies', {
    enumerable: true,
    get: () => {
      if (!advies) advies = capo.advies(hetModel().akkoorden, liedje.toonsoort);
      return advies;
    }
  });
  Object.defineProperty(liedje, 'akkoordenPerMaat', {
    enumerable: true,
    get: () => {
      if (!maatakkoorden) maatakkoorden = netteMaatakkoorden(lied.akkoordenPerMaat, hetModel(), lied.maatsoort);
      return maatakkoorden;
    }
  });
  return liedje;
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

// De artiesten met hun aantal liedjes, van veel naar weinig. In de grote bundels is
// de "artiest" de verzameling waar het wijsje uit komt; dat is precies waarop je wilt
// kunnen filteren. Lege artiesten laten we weg.
function artiesten() {
  const telling = new Map();
  for (const l of LIEDJES) {
    const naam = String(l.artiest || '').trim();
    if (!naam) continue;
    telling.set(naam, (telling.get(naam) || 0) + 1);
  }
  return [...telling.entries()]
    .map(([naam, aantal]) => ({ naam, aantal }))
    .sort((a, b) => b.aantal - a.aantal || a.naam.localeCompare(b.naam, 'nl'));
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

module.exports = { alle, vind, zoekTekst, statistieken, artiesten, perBestand, LIEDJES, theorie };
