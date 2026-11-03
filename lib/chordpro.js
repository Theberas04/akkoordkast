'use strict';
// ChordPro-parser: tekst met [akkoorden] en {richtlijnen} wordt een renderbaar model.
const theorie = require('./theorie');

const RICHTLIJN = /^\{\s*([a-zA-Z_]+)\s*:?\s*([^}]*)\}\s*$/;
const AKKOORD_IN_TEKST = /\[([^\[\]{}]+)\]/g;

function leesRichtlijnen(regel) {
  const m = RICHTLIJN.exec(regel.trim());
  if (!m) return null;
  return { naam: m[1].toLowerCase(), waarde: (m[2] || '').trim() };
}

// Splitst een regel tekst met [akkoorden] in segmenten: akkoord + de tekst erachter.
function splitSegmenten(regel) {
  const segmenten = [];
  let laatste = 0;
  let akkoord = null;
  AKKOORD_IN_TEKST.lastIndex = 0;
  let m;
  while ((m = AKKOORD_IN_TEKST.exec(regel)) !== null) {
    const voor = regel.slice(laatste, m.index);
    if (voor || akkoord) segmenten.push({ akkoord, tekst: voor });
    akkoord = m[1].trim();
    laatste = m.index + m[0].length;
  }
  segmenten.push({ akkoord, tekst: regel.slice(laatste) });
  return segmenten;
}

function akkoordenVanSegmenten(segmenten) {
  return segmenten.map(s => s.akkoord).filter(a => a && theorie.isAkkoord(a));
}

function parse(tekst) {
  const uit = {
    meta: { titel: '', toonsoort: '', tempo: 0, capo: 0, strum: '', artiest: '' },
    regels: [],
    akkoorden: []
  };
  const gezien = new Set();
  const regelLijst = String(tekst || '').replace(/\r\n?/g, '\n').split('\n');

  let sectie = null;
  let inTab = false;
  let tabRegels = [];

  const voegAkkoordToe = a => {
    const d = theorie.ontleed(a);
    if (!d) return;
    const sleutel = d.grond + d.kwaliteit;
    if (!gezien.has(sleutel)) { gezien.add(sleutel); uit.akkoorden.push(d.grond + d.kwaliteit); }
  };

  const sluitTab = () => {
    if (inTab && tabRegels.length) {
      uit.regels.push({ soort: 'tab', sectie, regels: tabRegels.slice() });
    }
    inTab = false;
    tabRegels = [];
  };

  for (const ruweRegel of regelLijst) {
    const regel = ruweRegel.replace(/\s+$/, '');
    const richtlijn = leesRichtlijnen(regel);
    if (richtlijn) {
      switch (richtlijn.naam) {
        case 'title': case 't': uit.meta.titel = richtlijn.waarde; break;
        case 'subtitle': if (!uit.meta.artiest) uit.meta.artiest = richtlijn.waarde; break;
        case 'key': uit.meta.toonsoort = richtlijn.waarde; break;
        case 'tempo': uit.meta.tempo = parseInt(richtlijn.waarde, 10) || 0; break;
        case 'capo': uit.meta.capo = parseInt(richtlijn.waarde, 10) || 0; break;
        case 'strum': uit.meta.strum = richtlijn.waarde; break;
        case 'soc': case 'start_of_chorus':
          sluitTab(); sectie = 'refrein';
          uit.regels.push({ soort: 'sectie-start', sectie: 'refrein', label: 'Refrein' });
          break;
        case 'eoc': case 'end_of_chorus':
          sluitTab(); uit.regels.push({ soort: 'sectie-eind' }); sectie = null; break;
        case 'comment': case 'c':
          sluitTab();
          if (richtlijn.waarde) uit.regels.push({ soort: 'label', tekst: richtlijn.waarde, sectie });
          break;
        case 'sot': case 'start_of_tab':
          sluitTab(); inTab = true; break;
        case 'eot': case 'end_of_tab':
          sluitTab(); break;
        default:
          break; // onbekende richtlijn stil negeren
      }
      continue;
    }
    if (inTab) {
      if (regel.trim()) tabRegels.push(regel.trim());
      continue;
    }
    if (!regel.trim()) { uit.regels.push({ soort: 'leeg' }); continue; }
    const segmenten = splitSegmenten(regel);
    akkoordenVanSegmenten(segmenten).forEach(voegAkkoordToe);
    uit.regels.push({ soort: 'tekst', sectie, segmenten });
  }
  sluitTab();
  return uit;
}

// Transponeert een geparseerd liedje; geeft een nieuw object terug.
// Alleen de woorden: akkoorden en richtlijnen eruit, zodat de tekst los te lezen is.
function zonderAkkoorden(tekst) {
  const regels = [];
  for (const ruwe of String(tekst || '').split(/\r?\n/)) {
    const richtlijn = ruwe.match(RICHTLIJN);
    if (richtlijn) {
      const naam = richtlijn[1].toLowerCase();
      if (naam === 'comment' || naam === 'c' || naam === 'soc' || naam === 'eoc') {
        const inhoud = (richtlijn[2] || '').trim();
        if (inhoud) regels.push(inhoud.replace(/^[,:.\s]+|[,:.\s]+$/g, '') + (naam === 'comment' || naam === 'c' ? ':' : ''));
      }
      continue;
    }
    const zonder = ruwe.replace(AKKOORD_IN_TEKST, '').replace(/\s+$/, '');
    if (zonder.trim()) regels.push(zonder);
  }
  // nooit meer dan twee lege regels achter elkaar
  const uit = [];
  for (const regel of regels) {
    if (!regel.trim() && uit.length && !uit[uit.length - 1].trim()) continue;
    uit.push(regel);
  }
  return uit.join('\n').trim();
}

function transponeerModel(model, stappen, gebruikMol) {
  const n = Number(stappen) || 0;
  const kopie = JSON.parse(JSON.stringify(model));
  kopie.transpositie = n;
  kopie.akkoorden = model.akkoorden.map(a => theorie.transponeer(a, n, gebruikMol));
  kopie.meta.toonsoort = model.meta.toonsoort ? theorie.transponeer(model.meta.toonsoort, n, gebruikMol) : '';
  for (const regel of kopie.regels) {
    if (regel.soort === 'tekst') {
      for (const seg of regel.segmenten) {
        if (seg.akkoord && theorie.isAkkoord(seg.akkoord)) seg.akkoord = theorie.transponeer(seg.akkoord, n, gebruikMol);
      }
    }
  }
  return kopie;
}

// De akkoordenreeks van het eerste blok (meestal het couplet): bruikbaar als begeleiding.
function akkoordenReeks(model, max) {
  const limiet = max || 8;
  const reeks = [];
  for (const regel of model.regels) {
    if (regel.soort !== 'tekst') continue;
    for (const seg of regel.segmenten) {
      if (!seg.akkoord) continue;
      if (reeks[reeks.length - 1] !== seg.akkoord) reeks.push(seg.akkoord);
      if (reeks.length >= limiet) return reeks;
    }
  }
  return reeks;
}

// Alleen de akkoorden van één regel, voor de "akkoorden om af te spelen"-regel in de UI.
function akkoordenPerRegel(model) {
  return model.regels
    .filter(r => r.soort === 'tekst')
    .map(r => akkoordenVanSegmenten(r.segmenten))
    .filter(l => l.length);
}

module.exports = { parse, transponeerModel, akkoordenReeks, akkoordenPerRegel, splitSegmenten, zonderAkkoorden };
