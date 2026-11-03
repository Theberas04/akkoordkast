#!/usr/bin/env node
'use strict';
// Zet ABC-bestanden om naar een liedjes-dataset voor AkkoordKast.
//
// Gebruik:
//   node scripts/abc-naar-liedjes.js --bron song-data/hymnen/raw --uit song-data/kerkwijsjes.json \
//        --genre "Kerkwijsje" --bron-naam "Open Hymnal Project" --licentie "Publiek domein" [--max 300]
//
// De omzetter leest de melodie uit de eerste stem en haalt de akkoorden uit de
// akkoordsymbolen ("C") als die er zijn, of anders uit de begeleidende stemmen
// (zoals bij vierstemmige kerkliederen). Die akkoorden worden met de app zelf
// gecontroleerd: elk akkoord moet een greepdiagram hebben (lib/grepen.js), en
// anders wordt er een toonsoort gezocht waarin dat wel lukt.

const fs = require('fs');
const path = require('path');
const theorie = require('../lib/theorie');
const grepen = require('../lib/grepen');
const capo = require('../lib/capo');

const LETTERS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const KWALITEITEN = ['', 'm', '7', 'm7', 'maj7'];
const MOEILIJK_SIMpel = ['C', 'F', 'G', 'G7', 'Am', 'Dm', 'Em'];

// ---------------------------------------------------------------- ABC lezen ---

function splitKopEnLijf(tekst) {
  const regels = tekst.split(/\r?\n/);
  const kop = {};
  const muziek = [];
  let inLijf = false;
  for (const regel of regels) {
    if (/^\s*%/.test(regel)) continue;                 // commentaar
    const m = regel.match(/^([A-Za-z]):\s*(.*)$/);
    if (m && !inLijf) {
      const sleutel = m[1].toUpperCase();
      if (sleutel === 'K') inLijf = true;              // na de toonsoort begint de muziek
      if (!kop[sleutel]) kop[sleutel] = [];
      kop[sleutel].push(m[2].trim());
      continue;
    }
    if (inLijf || /^\[?V:/.test(regel) || /^w:/.test(regel)) muziek.push(regel);
  }
  return { kop, muziek };
}

// De voortekens van een toonsoort. In ABC-notatie staat het verhogen of verlagen
// NIET bij de noten zelf: het zit in de toonsoort (K: Bb betekent dat elke B een
// Bes is). Zonder dit klinkt elk liedje een halve toon naast de bedoeling.
const KRUIS_VOLGORDE = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
const MOL_VOLGORDE = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];
const AANTAL_KRUIS = { C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, 'F#': 6, 'C#': 7, Am: 0, Em: 1, Bm: 2, 'F#m': 3, 'C#m': 4, 'G#m': 5, 'D#m': 6, 'A#m': 7 };
const AANTAL_MOL = { F: 1, Bb: 2, Eb: 3, Ab: 4, Db: 5, Gb: 6, Cb: 7, Dm: 1, Gm: 2, Cm: 3, Fm: 4, Bbm: 5, Ebm: 6, Abm: 7 };

function voortekens(vanToonsoort) {
  const naam = String(vanToonsoort || 'C').trim().split(/\s|%/)[0];
  const uit = { C: 0, D: 0, E: 0, F: 0, G: 0, A: 0, B: 0 };
  const mol = MOL_VOLGORDE.slice(0, AANTAL_MOL[naam] || 0);
  for (const letter of mol) uit[letter] = -1;
  const kruis = KRUIS_VOLGORDE.slice(0, AANTAL_KRUIS[naam] || 0);
  for (const letter of kruis) uit[letter] = 1;
  return uit;
}

// De losse regels van één stem: de melodie is de eerste stem met noten.
function leesStemmen(regels) {
  const stemmen = new Map();
  const volgorde = [];
  let huidig = null;
  for (const regel of regels) {
    const w = regel.match(/^\s*(?:\[V:\s*([^\]]+)\]|V:\s*([^\s%]+))(.*)$/);
    if (w && !/^w:/.test(regel)) {
      const naam = (w[1] || w[2] || '').trim();
      if (!stemmen.has(naam)) { stemmen.set(naam, { naam, regels: [] }); volgorde.push(naam); }
      huidig = naam;
      const rest = w[3] || '';
      if (rest.trim()) stemmen.get(naam).regels.push(rest);
      continue;
    }
    if (huidig !== null && !/^\s*w:/.test(regel)) stemmen.get(huidig).regels.push(regel);
  }
  const uit = volgorde.map(naam => stemmen.get(naam)).filter(s => s.regels.join(' ').match(/[A-Ga-g]/));
  if (!uit.length && regels.length) {
    // geen V:-regels: het hele bestand is één stem
    return [{ naam: '1', regels: regels.slice() }];
  }
  return uit;
}

// Eén stem omzetten naar noten met een tijd in kwartslagen.
function leesNoten(regels, eenheidsLengte, vanToonsoort) {
  const standaard = typeof vanToonsoort === 'object' && vanToonsoort !== null
    ? vanToonsoort
    : voortekens(vanToonsoort);
  let maatAccidentalen = {};
  const noten = [];
  const maten = [];
  const akkoorden = [];
  let tijd = 0;
  let maatStart = 0;
  const L = eenheidsLengte;   // in hele noten (1/4 = kwartnoot)
  let vorige = null;
  let wachtOpTie = false;     // na een '-' hoort de volgende noot bij de vorige

  const leesDuur = (tekst, i) => {
    let m = /^(\d+)\/(\d+)/.exec(tekst.slice(i));
    if (m) return { duur: (Number(m[1]) / Number(m[2])) * L * 4, lengte: m[0].length };
    m = /^(\d+)/.exec(tekst.slice(i));
    if (m) return { duur: Number(m[1]) * L * 4, lengte: m[0].length };
    m = /^\/\/(\d*)/.exec(tekst.slice(i));
    if (m) return { duur: (m[1] ? L * 4 / Number(m[1]) : L * 2), lengte: m[0].length };
    m = /^\//.exec(tekst.slice(i));
    if (m) return { duur: L * 2, lengte: 1 };
    return { duur: L * 4, lengte: 0 };
  };

  for (const regel of regels) {
    let i = 0;
    const tekst = regel.replace(/\{[^}]*\}/g, ' ').replace(/![^!]*!/g, ' ').replace(/~/g, ' ');
    while (i < tekst.length) {
      const teken = tekst[i];
      if (/\s/.test(teken)) { i++; continue; }
      if (teken === '|' || teken === ':' || teken === '[' || teken === ']') {
        if (teken === '|' || teken === ']') {
          maten.push({ start: maatStart, duur: tijd - maatStart, einde: tijd });
          maatStart = tijd;
          maatAccidentalen = {};   // een kruis of mol geldt tot het eind van de maat
        }
        i++;
        continue;
      }
      if (teken === '"') {                       // akkoordsymbool bij deze plek
        const eind = tekst.indexOf('"', i + 1);
        if (eind === -1) { i++; continue; }
        const naam = tekst.slice(i + 1, eind).trim();
        if (naam) akkoorden.push({ naam, start: tijd });
        i = eind + 1;
        continue;
      }
      if (teken === '-' || teken === '>' || teken === '<') {  // verbinding of gebroken ritme
        if (teken === '-') wachtOpTie = true;
        i++;
        continue;
      }
      const noot = teken.match(/^(\^+|_+|=)?([A-Ga-g])([',]*)/);
      if (noot) {
        const letter = noot[2].toUpperCase();
        let midi = LETTERS[letter] + 12 * (noot[2] === noot[2].toLowerCase() ? 5 : 4) + 12;
        let verschuiving;
        if (noot[1] === '^') verschuiving = noot[1].length;
        else if (noot[1] === '_') verschuiving = -noot[1].length;
        else if (noot[1] === '=') verschuiving = 0;
        else verschuiving = Object.prototype.hasOwnProperty.call(maatAccidentalen, letter) ? maatAccidentalen[letter] : standaard[letter] || 0;
        if (noot[1]) maatAccidentalen[letter] = verschuiving;
        midi += verschuiving;
        for (const teken2 of noot[3]) midi += teken2 === "'" ? 12 : -12;
        i += noot[0].length;
        const d = leesDuur(tekst, i);
        i += d.lengte;
        if (wachtOpTie && vorige) {
          // dezelfde toon loopt door: hij hoort bij de vorige noot
          vorige.duur += d.duur;
          tijd += d.duur;
          wachtOpTie = false;
          continue;
        }
        wachtOpTie = false;
        noten.push({ midi, start: tijd, duur: d.duur });
        vorige = noten[noten.length - 1];
        tijd += d.duur;
        continue;
      }
      if (teken === '[') {                        // akkoord [CEG]: de hoogste noot is de melodie
        const eind = tekst.indexOf(']', i);
        if (eind === -1) { i++; continue; }
        const binnen = tekst.slice(i + 1, eind);
        const losse = [...binnen.matchAll(/(\^+|_+|=)?([A-Ga-g])([',]*)/g)];
        let hoogste = null;
        for (const l of losse) {
          let midi = LETTERS[l[2].toUpperCase()] + 12 * (l[2] === l[2].toLowerCase() ? 5 : 4) + 12;
          if (l[1] === '^') midi += 1; else if (l[1] === '_') midi -= 1;
          for (const t of l[3]) midi += t === "'" ? 12 : -12;
          if (hoogste === null || midi > hoogste) hoogste = midi;
        }
        i = eind + 1;
        const d = leesDuur(tekst, i);
        i += d.lengte;
        if (hoogste !== null) {
          noten.push({ midi: hoogste, start: tijd, duur: d.duur });
          vorige = noten[noten.length - 1];
        }
        tijd += d.duur;
        continue;
      }
      if (teken === 'z' || teken === 'x' || teken === 'Z' || teken === 'X') {
        i++;
        const d = leesDuur(tekst, i);
        i += d.lengte;
        tijd += d.duur;
        continue;
      }
      i++;
    }
  }
  if (tijd > maatStart) maten.push({ start: maatStart, duur: tijd - maatStart, einde: tijd });
  return { noten, maten, akkoorden };
}

// Akkoordsymbolen uit de melodieregels ("C", "G7", "Am").
function leesAkkoordsymbolen(regels) {
  const uit = [];
  for (const regel of regels) {
    const zonder = regel.replace(/\{[^}]*\}/g, ' ').replace(/![^!]*!/g, ' ');
    let i = 0;
    while (i < zonder.length) {
      if (zonder[i] === '"') {
        const eind = zonder.indexOf('"', i + 1);
        if (eind === -1) break;
        const naam = zonder.slice(i + 1, eind).trim();
        // alleen de noten vóór dit punt tellen: de tijd schatten we met de tekens ervoor
        const voor = zonder.slice(0, i).replace(/"[^"]*"/g, '');
        uit.push({ naam, naTekens: voor.length });
        i = eind + 1;
        continue;
      }
      i++;
    }
  }
  return uit;
}

// ------------------------------------------------------- akkoorden herkennen ---

function akkoordtonen(grondPc, kwaliteit) {
  const terts = kwaliteit === 'm' || kwaliteit === 'm7' ? 3 : 4;
  const tonen = [grondPc, (grondPc + terts) % 12, (grondPc + 7) % 12];
  if (kwaliteit === '7') tonen.push((grondPc + 10) % 12);
  if (kwaliteit === 'm7') tonen.push((grondPc + 10) % 12);
  if (kwaliteit === 'maj7') tonen.push((grondPc + 11) % 12);
  return tonen;
}

// Alleen akkoorden die echt bestaan én die wij kunnen spelen. Een los woord als
// "Choir" of een akkoord dat wij niet kennen valt af in plaats van iets verkeerds
// te worden (C met een onzin-kwaliteit zou anders als C doorgaan).
const KWALITEIT_ALIAS = {
  '': '', m: 'm', min: 'm', '7': '7', dom7: '7', m7: 'm7', min7: 'm7',
  maj7: 'maj7', M7: 'maj7', maj: '', sus: '', sus2: '', sus4: '', '5': '',
  '6': '', m6: 'm', add9: '', '9': '', dim: '', aug: ''
};

function leesBaarAkkoord(naam) {
  const m = String(naam || '').trim().match(/^([A-G][#b]?)([A-Za-z0-9+]*)(?:\/([A-G][#b]?))?$/);
  if (!m) return null;
  const kwaliteit = m[2] || '';
  if (!Object.prototype.hasOwnProperty.call(KWALITEIT_ALIAS, kwaliteit)) return null;
  const uit = m[1] + KWALITEIT_ALIAS[kwaliteit];
  return grepen.heeftGreep(uit) ? uit : null;
}

function naamVan(grondPc, kwaliteit) {
  return theorie.KRUIS[grondPc] + kwaliteit;
}

// Zoek bij een reeks noten (alle stemmen) het akkoord dat het beste past.
function besteAkkoord(noten, maat) {
  const gewicht = new Array(12).fill(0);
  let bas = null, basGewicht = -1;
  for (const noot of noten) {
    const pc = ((noot.midi % 12) + 12) % 12;
    const w = Math.min(noot.duur, maat.duur || noot.duur);
    gewicht[pc] += w;
    if (w > basGewicht || (w === basGewicht && bas !== null && noot.midi < bas)) { basGewicht = w; bas = noot.midi; }
  }
  const totaal = gewicht.reduce((a, b) => a + b, 0);
  if (!totaal) return null;
  // een vierklank moet echt klinken; kerkharmonie is meestal een drieklank
  const extraKosten = { '': 0, m: 0, 7: 0.02, m7: 0.02, maj7: 0.07 };
  let beste = null;
  for (let grond = 0; grond < 12; grond++) {
    for (const kw of KWALITEITEN) {
      const naam = naamVan(grond, kw);
      if (!grepen.heeftGreep(naam)) continue;
      const tonen = akkoordtonen(grond, kw);
      let binnen = 0;
      for (let pc = 0; pc < 12; pc++) if (tonen.indexOf(pc) >= 0) binnen += gewicht[pc];
      let score = binnen / totaal;
      if (bas !== null) {
        const basPc = ((bas % 12) + 12) % 12;
        if (basPc === grond) score += 0.08;
        else if (tonen.indexOf(basPc) >= 0) score += 0.02;
        else score -= 0.06;
      }
      // een grondtoon of terts die helemaal niet klinkt, is meestal mis
      if (!gewicht[grond]) score -= 0.12;
      if (!gewicht[(grond + (kw === 'm' || kw === 'm7' ? 3 : 4)) % 12]) score -= 0.12;
      score -= extraKosten[kw];
      if (!beste || score > beste.score) beste = { naam, score, grond, kwaliteit: kw };
    }
  }
  return beste;
}

// --------------------------------------------------------- toonsoort zoeken ---

// De geschreven toonsoort blijft staan. Alleen als een akkoord helemaal geen
// diagram heeft, zoeken we de dichtstbijzijnde verschuiving waarin dat wel lukt:
// anders zou een liedje zomaar een paar tonen verhuizen zonder dat de speler er
// iets aan heeft (de capo-adviezen vangen moeilijke grepen al op).
function besteTranspositie(akkoorden, gewenst) {
  const mol = /b/.test(gewenst || '');
  const origineel = akkoorden.map(a => theorie.transponeer(a, 0, mol));
  const onbekendOrigineel = [...new Set(origineel.filter(a => !grepen.heeftGreep(a)))];
  if (!onbekendOrigineel.length) return { stappen: 0, onbekend: [], omgezet: origineel };
  let beste = { stappen: 0, onbekend: onbekendOrigineel, omgezet: origineel, score: onbekendOrigineel.length };
  for (let afstand = 1; afstand <= 6; afstand++) {
    for (const stappen of [afstand, -afstand]) {
      const omgezet = akkoorden.map(a => theorie.transponeer(a, stappen, mol));
      const uniek = [...new Set(omgezet.filter(a => !grepen.heeftGreep(a)))];
      if (!uniek.length) return { stappen, onbekend: [], omgezet };
      if (uniek.length < beste.score) beste = { stappen, onbekend: uniek, omgezet, score: uniek.length };
    }
  }
  return beste;
}

function moeilijkheidVan(akkoorden) {
  const uniek = [...new Set(akkoorden)];
  if (uniek.every(a => MOEILIJK_SIMpel.indexOf(a) >= 0)) return 1;
  const barres = uniek.filter(a => grepen.isBarre(a));
  if (barres.length >= 3) return 4;
  if (barres.length) return 3;
  return 2;
}

function toonsoortNaam(kopK) {
  const m = String(kopK || 'C').trim().match(/^([A-G][#b]?)/);
  if (!m) return 'C';
  return m[1] + (/\bmin|m\b|^[A-G][#b]?m/i.test(String(kopK)) ? 'm' : '');
}

// ------------------------------------------------------------------ omzetten ---

function liedjeVanAbc(tekst, bestandsnaam, opties) {
  const { kop, muziek } = splitKopEnLijf(tekst);
  const titel = (kop.T && kop.T[0]) || path.basename(bestandsnaam, '.abc').replace(/_/g, ' ');
  const onderdelen = (kop.T || []).slice(1).join(' ');
  const L = (() => {
    const m = String((kop.L && kop.L[0]) || '1/8').match(/^(\d+)\/(\d+)/);
    return m ? Number(m[1]) / Number(m[2]) : 1 / 8;
  })();
  const maat = String((kop.M && kop.M[0]) || '4/4').split('%')[0].trim();
  const maatDelen = (() => {
    if (maat === 'C') return [4, 4];
    if (maat === 'C|') return [2, 2];
    const m = maat.match(/^(\d+)\s*\/\s*(\d+)/);
    return m ? [Number(m[1]), Number(m[2])] : [4, 4];
  })();
  const tellenPerMaat = Math.max(2, Math.round(maatDelen[0] * 4 / maatDelen[1]));
  const toonsoortSleutel = (kop.K && kop.K[0]) || 'C';
  // Soms staat er geen wijsje in een bundel maar een inhoudsopgave of legenda die
  // toevallig ook een X:-regel heeft. Die hoort niet in een liedjesboek.
  if (/^\s*(appendix|index|contents|legend|introduction|preface|foreword|notes?|the end)\b/i.test(titel)) {
    return { fout: 'geen wijsje maar een inhoudsopgave of legenda' };
  }
  const stemmen = leesStemmen(muziek);
  if (!stemmen.length) return { fout: 'geen noten gevonden' };
  const melodie = leesNoten(stemmen[0].regels, L, toonsoortSleutel);
  if (melodie.noten.length < 8) return { fout: 'te weinig noten (' + melodie.noten.length + ')' };

  // tempo uit [Q:1/4=120]
  let bpm = 84;
  const q = tekst.match(/Q:\s*(\d+)\/(\d+)\s*=\s*(\d+)/);
  if (q) bpm = Math.max(40, Math.min(200, Number(q[3])));
  else {
    const q2 = tekst.match(/\[Q:([^\]]*)\]/);
    const m2 = q2 && q2[1].match(/=\s*(\d+)/);
    if (m2) bpm = Math.max(40, Math.min(200, Number(m2[1])));
  }

  // akkoorden: eerst uit de symbolen, anders uit alle stemmen samen
  const symbolen = (melodie.akkoorden || [])
    .map(s => ({ naam: leesBaarAkkoord(s.naam), start: s.start }))
    .filter(s => s.naam);
  const alleStemmen = stemmen.map(s => leesNoten(s.regels, L, toonsoortSleutel).noten);
  const laatsteNoot = melodie.noten[melodie.noten.length - 1];
  const aantalMaten = Math.max(1, Math.ceil((laatsteNoot.start + laatsteNoot.duur) / tellenPerMaat - 1e-9));
  const maten = [];
  for (let m = 0; m < aantalMaten; m++) {
    const van = m * tellenPerMaat;
    const tot = van + tellenPerMaat;
    const inMaat = [];
    for (const stem of alleStemmen) {
      for (const noot of stem) {
        if (noot.start >= van - 0.001 && noot.start < tot - 0.001) inMaat.push(noot);
      }
    }
    maten.push({ nummer: m + 1, start: van, duur: tellenPerMaat, noten: inMaat });
  }

  let akkoordenPerMaat;
  let herkomst;
  if (symbolen.length >= 2) {
    // elk symbool hoort bij de maat waarin het in de noten staat
    akkoordenPerMaat = [];
    for (const s of symbolen) {
      const maat = Math.min(aantalMaten - 1, Math.max(0, Math.floor(s.start / tellenPerMaat)));
      akkoordenPerMaat[maat] = s.naam;
    }
    herkomst = 'akkoordsymbolen';
  } else {
    akkoordenPerMaat = maten.map(m => {
      const b = besteAkkoord(m.noten, m);
      return b ? b.naam : null;
    });
    herkomst = 'harmonie';
  }
  // Elk maat krijgt een akkoord: gaten erven het vorige akkoord, en als er nog
  // geen akkoord is (een lege plek vooraan) het eerste dat we wel kennen.
  const eersteBekend = akkoordenPerMaat.find(a => a) || null;
  let vorige = eersteBekend;
  akkoordenPerMaat = Array.from({ length: aantalMaten }, (_, i) => {
    const a = akkoordenPerMaat[i];
    if (a) { vorige = a; return a; }
    return vorige || eersteBekend;
  });
  if (akkoordenPerMaat.some(a => !a)) return { fout: 'geen akkoorden herkend' };

  const gewenst = toonsoortNaam((kop.K && kop.K[0]) || 'C');
  const trans = besteTranspositie(akkoordenPerMaat, gewenst);
  const omgezet = trans.omgezet || akkoordenPerMaat;
  const toonsoort = theorie.transponeerToonsoort(gewenst, trans.stappen);
  // Onmogelijke noten eruit. In de handschriftbundels zitten wijsjes met een noot die
  // veel langer duurt dan een maat (vergeten maatstreep of een fermate in de bron) of
  // juist korter dan een duizendste tel (een siernoot die naar nul afrondt). Zulke
  // noten laten de tijdlijn ontsporen, dus we wijzen het hele liedje af. Let op: dit
  // keurt de AFGERONDE waarden, want dat zijn de waarden die de app te zien krijgt.
  const noten = melodie.noten.map(n => ({ start: rond(n.start), duur: rond(n.duur), midi: n.midi - 0 * 12 }));
  const rareNoot = noten.find(n => !(n.duur > 0) || n.duur > tellenPerMaat * 2);
  if (rareNoot) return { fout: 'nootduur buiten de maat (' + rareNoot.duur + ')' };

  // ChordPro: een akkoordschema van vier maten per regel (geen tekst: instrumentaal)
  const regels = [];
  for (let i = 0; i < omgezet.length; i += 4) {
    const blok = omgezet.slice(i, i + 4).map(a => '[' + a + ']\u2014\u2014').join('  ');
    regels.push(blok);
    regels.push('');
  }
  const chordpro = '{title: ' + titel + '}\n{key: ' + toonsoort + '}\n{tempo: ' + bpm + '}\n\n' + regels.join('\n').trim();

  return {
    liedje: {
      titel,
      artiest: ((kop.C || [])[0] || '').split('Words:')[0].split('Music')[0].trim() || opties.bronNaam,
      taal: 'instrumentaal',
      genre: opties.genre,
      moeilijkheid: moeilijkheidVan(omgezet),
      toonsoort,
      tempo: bpm,
      maatsoort: tellenPerMaat,
      strum: opties.strum,
      bron: opties.bronNaam + (onderdelen ? ' \u00b7 ' + onderdelen.slice(0, 120) : ''),
      licentie: opties.licentie,
      chordpro,
      akkoordenPerMaat: omgezet,
      noten,
      _herkomst: herkomst,
      _onbekend: trans.onbekend || [],
      _bestand: path.basename(bestandsnaam)
    }
  };
}

function rond(x) { return Math.round(x * 1000) / 1000; }

// ---------------------------------------------------------------------- main ---

function main() {
  const args = process.argv.slice(2);
  const optie = (naam, standaard) => {
    const i = args.indexOf('--' + naam);
    return i >= 0 && args[i + 1] ? args[i + 1] : standaard;
  };
  const bronMap = optie('bron', 'song-data/hymnen/raw');
  const uitPad = optie('uit', 'song-data/kerkwijsjes.json');
  const max = Number(optie('max', '9999'));
  const meerdere = args.includes('--meerdere');
  const opties = {
    genre: optie('genre', 'Kerkwijsje'),
    bronNaam: optie('bron-naam', 'Open Hymnal Project'),
    licentie: optie('licentie', 'Publiek domein'),
    strum: optie('strum', 'D DU UDU')
  };
  const wortel = path.resolve(__dirname, '..');
  const map = path.resolve(wortel, bronMap);
  const bestanden = fs.readdirSync(map).filter(f => f.endsWith('.abc')).sort();
  const uit = [];
  const fouten = {};
  const gezien = new Set();
  let zonderDiagram = 0;
  // Een ABC-bestand kan meerdere wijsjes bevatten (bundels zoals Kerr's Merry
  // Melodies en Ryan's Mammoth Collection): met --meerdere splitsen we die op
  // elke X:-regel, anders zou alleen het eerste wijsje van een bundel meetellen.
  const taken = [];
  for (const bestand of bestanden) {
    const ruw = fs.readFileSync(path.join(map, bestand), 'utf8');
    if (!meerdere) { taken.push({ bestand, tekst: ruw }); continue; }
    const delen = ruw.split(/^(?=X:\s*\d)/m).filter(d => /\S/.test(d));
    delen.forEach((deel, i) => taken.push({ bestand: bestand + '#' + (i + 1), tekst: deel }));
  }
  for (const { bestand, tekst } of taken) {
    if (uit.length >= max) break;
    let resultaat;
    try {
      resultaat = liedjeVanAbc(tekst, bestand, opties);
    } catch (e) {
      fouten['uitzondering: ' + e.message] = (fouten['uitzondering: ' + e.message] || 0) + 1;
      continue;
    }
    if (resultaat.fout) {
      fouten[resultaat.fout.replace(/\(\d+\)/, '(n)')] = (fouten[resultaat.fout.replace(/\(\d+\)/, '(n)')] || 0) + 1;
      continue;
    }
    const lied = resultaat.liedje;
    // exact hetzelfde liedje twee keer in de dataset is een fout, geen keuze
    const vingerafdruk = lied.titel.toLowerCase() + '|' + lied.noten.map(n => n.midi).join(',');
    if (gezien.has(vingerafdruk)) {
      fouten['dubbel: ' + lied.titel] = (fouten['dubbel: ' + lied.titel] || 0) + 1;
      continue;
    }
    gezien.add(vingerafdruk);
    if (lied._onbekend.length) zonderDiagram++;
    uit.push(lied);
  }
  const schoon = uit.map(l => {
    const kopie = Object.assign({}, l);
    delete kopie._herkomst; delete kopie._onbekend; delete kopie._bestand;
    return kopie;
  });
  const uitBestand = path.resolve(wortel, uitPad);
  fs.writeFileSync(uitBestand, JSON.stringify(schoon, null, 1));
  const perHerkomst = {};
  for (const l of uit) perHerkomst[l._herkomst] = (perHerkomst[l._herkomst] || 0) + 1;
  const akkoorden = {};
  let maten = 0, noten = 0;
  for (const l of uit) {
    maten += l.akkoordenPerMaat.length;
    noten += l.noten.length;
    for (const a of new Set(l.akkoordenPerMaat)) akkoorden[a] = (akkoorden[a] || 0) + 1;
  }
  console.log('gelezen bestanden : ' + bestanden.length + ' (' + taken.length + ' wijsjes na splitsen)');
  console.log('omgezet           : ' + uit.length + ' -> ' + uitPad);
  console.log('afgewezen         : ' + JSON.stringify(fouten));
  console.log('akkoorden uit     : ' + JSON.stringify(perHerkomst));
  console.log('zonder diagram    : ' + zonderDiagram + ' liedjes (na transponeren)');
  console.log('noten / maten     : ' + noten + ' / ' + maten);
  console.log('akkoorden         : ' + Object.keys(akkoorden).sort().join(' '));
  console.log('bestandsgrootte   : ' + Math.round(fs.statSync(uitBestand).size / 1024) + ' kB');
}

if (require.main === module) main();
module.exports = { liedjeVanAbc, leesNoten, leesStemmen, splitKopEnLijf, besteAkkoord, besteTranspositie, akkoordtonen };
