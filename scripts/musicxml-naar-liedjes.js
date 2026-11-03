#!/usr/bin/env node
'use strict';
// Zet de MusicXML-bestanden van The Public Domain Song Anthology om naar een
// liedjes-dataset voor AkkoordKast.
//
// Gebruik:
//   node scripts/musicxml-naar-liedjes.js
//      [--bron song-data/anthology/raw] [--uit song-data/anthology-liedjes.json]
//
// Elk bestand heeft een <work-title>, een of meer <creator>, per maat <harmony>
// (akkoorden) en in de noten <lyric> (de liedtekst). De melodie is de gezongen
// stem (de stem met de liedtekst); haar noten komen in "noten", haar lettergrepen
// in de ChordPro-regel met de akkoorden tussen vierkante haken erboven.
//
// Net als bij de ABC-omzetter (scripts/abc-naar-liedjes.js) wordt elk akkoord
// gekeurd met lib/grepen.js (heeftGreep). Een <harmony> die niet in de whitelist
// past, wordt eerst naar een speelbare kwaliteit teruggebracht; past een liedje
// daarna nog niet, dan zoeken we met dezelfde aanpak als besteTranspositie() de
// dichtstbijzijnde toonsoort waarin alle akkoorden speelbaar zijn.

const fs = require('fs');
const path = require('path');
const theorie = require('../lib/theorie');
const grepen = require('../lib/grepen');
const abc = require('./abc-naar-liedjes');

// ------------------------------------------------------------------ XML lezen ---

function ontsnap(tekst) {
  return String(tekst)
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&');
}

// Kleine, toereikende XML-lezer: bouwt een boom van elementen met hun attributen
// en tekst. MusicXML is netjes genest, dus een stapel volstaat. Commentaar, de
// prolog en de DOCTYPE-regel gooien we weg.
function leesXml(tekst) {
  const schoon = String(tekst)
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(/<!DOCTYPE[\s\S]*?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  const root = { naam: '#root', attributen: {}, kinderen: [], tekst: '' };
  const stapel = [root];
  const stukken = schoon.split(/(<[^>]*>)/);
  for (const stuk of stukken) {
    if (!stuk) continue;
    if (stuk[0] === '<') {
      if (stuk.startsWith('</')) {
        if (stapel.length > 1) stapel.pop();
      } else if (stuk.startsWith('<!')) {
        // declaratie, al weggefilterd
      } else {
        const zelfsluitend = stuk.endsWith('/>');
        const binnen = stuk.slice(1, zelfsluitend ? -2 : -1).trim();
        const m = binnen.match(/^([^\s]+)([\s\S]*)$/);
        const naam = m ? m[1] : '';
        const knoop = { naam, attributen: leesAttributen(m ? m[2] : ''), kinderen: [], tekst: '' };
        stapel[stapel.length - 1].kinderen.push(knoop);
        if (!zelfsluitend) stapel.push(knoop);
      }
    } else {
      const t = stuk.trim();
      if (t) stapel[stapel.length - 1].tekst += ontsnap(t);
    }
  }
  return root;
}

function leesAttributen(tekst) {
  const uit = {};
  const re = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(tekst))) uit[m[1]] = ontsnap(m[2] !== undefined ? m[2] : m[3]);
  return uit;
}

function kinderen(knoop, naam) {
  return knoop.kinderen.filter(k => k.naam === naam);
}

function eerste(knoop, naam) {
  return knoop.kinderen.find(k => k.naam === naam) || null;
}

function tekstVan(knoop, naam) {
  const k = knoop && eerste(knoop, naam);
  return k ? k.tekst.trim() : '';
}

// -------------------------------------------------------------- toonhoogtes ---

const STAP_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

// midi-nummer uit <step>, <alter> en <octave>; C4 = 60.
function midiVan(step, alter, octave) {
  return 12 * (Number(octave) + 1) + STAP_PC[step] + Number(alter || 0);
}

// ------------------------------------------------------ akkoorden (harmony) ---

// De whitelist-kwaliteiten van lib/grepen.js. Alles wat hier niet in past wordt
// teruggebracht tot de dichtstbijzijnde speelbare drieklank of vierklank.
const KIND_NAAR_KWALITEIT = {
  major: '', maj: '',
  minor: 'm', min: 'm',
  dominant: '7', dom: '7',
  'minor-seventh': 'm7', min7: 'm7',
  'major-seventh': 'maj7', maj7: 'maj7',
  'major-minor': '7',
  'dominant-ninth': '7', 'dominant-11th': '7', 'dominant-13th': '7',
  'major-sixth': '', 'major-ninth': '',
  'minor-sixth': 'm', 'minor-ninth': 'm', 'minor-11th': 'm', 'minor-13th': 'm',
  'suspended-fourth': '', 'suspended-second': '',
  augmented: '', 'augmented-seventh': '7',
  diminished: 'm', 'diminished-seventh': 'm7', 'half-diminished': 'm7',
  power: ''
};

function akkoordNaamVanHarmony(harmony) {
  const root = eerste(harmony, 'root');
  if (!root) return null;
  const step = tekstVan(root, 'root-step');
  if (!step) return null;
  const alter = Number(tekstVan(root, 'root-alter') || 0);
  const letters = { C: 'C', D: 'D', E: 'E', F: 'F', G: 'G', A: 'A', B: 'B' };
  if (!Object.prototype.hasOwnProperty.call(letters, step)) return null;
  let grond = letters[step];
  if (alter > 0) grond += '#'.repeat(alter);
  else if (alter < 0) grond += 'b'.repeat(-alter);
  const ruweKind = tekstVan(harmony, 'kind') || 'major';
  const kwaliteit = Object.prototype.hasOwnProperty.call(KIND_NAAR_KWALITEIT, ruweKind)
    ? KIND_NAAR_KWALITEIT[ruweKind]
    : '';
  return grond + kwaliteit;
}

// ------------------------------------------------------------------ toonsoort ---

const MAJ_TOONSOORT = { 0: 'C', 1: 'G', 2: 'D', 3: 'A', 4: 'E', 5: 'B', 6: 'F#', 7: 'C#', '-1': 'F', '-2': 'Bb', '-3': 'Eb', '-4': 'Ab', '-5': 'Db', '-6': 'Gb', '-7': 'Cb' };
const MIN_TOONSOORT = { 0: 'Am', 1: 'Em', 2: 'Bm', 3: 'F#m', 4: 'C#m', 5: 'G#m', 6: 'D#m', 7: 'A#m', '-1': 'Dm', '-2': 'Gm', '-3': 'Cm', '-4': 'Fm', '-5': 'Bbm', '-6': 'Ebm', '-7': 'Abm' };

function toonsoortVan(fifths, mode) {
  const n = Number(fifths);
  const klein = /min/i.test(mode || '');
  const tabel = klein ? MIN_TOONSOORT : MAJ_TOONSOORT;
  if (Object.prototype.hasOwnProperty.call(tabel, n)) return tabel[n];
  return klein ? 'Am' : 'C';
}

// ---------------------------------------------------------------- omzetten ---

function rond(x) { return Math.round(x * 1000) / 1000; }

function liedjeVanMusicXml(tekst, bestandsnaam, opties) {
  const root = leesXml(tekst);
  const score = root.kinderen.find(k => k.naam === 'score-partwise') || root;
  const werk = eerste(score, 'work');
  let titel = tekstVan(werk, 'work-title');
  if (!titel) titel = path.basename(bestandsnaam, '.xml').replace(/_/g, ' ');

  const id = eerste(score, 'identification');
  let artiest = '';
  if (id) {
    const makers = kinderen(id, 'creator');
    if (makers.length) artiest = makers[0].tekst.trim();
  }
  if (!artiest) artiest = opties.bronNaam;

  // Kies het deel met de liedtekst (de gezongen melodie), anders het eerste deel.
  const delen = kinderen(score, 'part');
  if (!delen.length) return { fout: 'geen part gevonden' };
  let deel = delen[0];
  for (const d of delen) {
    if (kinderen(d, 'measure').some(m => kinderen(m, 'note').some(n => eerste(n, 'lyric')))) { deel = d; break; }
  }

  const maten = kinderen(deel, 'measure');
  if (!maten.length) return { fout: 'geen maten gevonden' };

  let divisies = 256;
  let maatBeats = 4;
  let maatBeatType = 4;
  let fifths = 0;
  let mode = 'major';
  let maatsoortGezien = false;

  const alleNoten = [];          // { voice, start, duur, midi, lyricTekst, syllabic }
  const akkoordPerMaat = [];     // per maat: akkoordnaam of null
  let globaleTijd = 0;           // in tellen vanaf het begin

  // Een gebonden noot (tie) loopt door in de volgende noot: die twee zijn samen
  // één toon. We onthouden de laatst toegevoegde noot om de duur op te tellen.
  let vorigeNoot = null;
  let vorigeMidi = null;

  for (const maat of maten) {
    let positie = 0;             // in divisies, vanaf het begin van de maat
    let eersteHarmony = null;
    let laatsteStart = 0;

    for (const kind of maat.kinderen) {
      if (kind.naam === 'attributes') {
        const dv = tekstVan(kind, 'divisions');
        if (dv) divisies = Number(dv) || divisies;
        const time = eerste(kind, 'time');
        if (time) {
          const b = tekstVan(time, 'beats');
          const bt = tekstVan(time, 'beat-type');
          if (b && bt && !maatsoortGezien) { maatBeats = Number(b); maatBeatType = Number(bt); maatsoortGezien = true; }
        }
        const key = eerste(kind, 'key');
        if (key) {
          const f = tekstVan(key, 'fifths');
          if (f !== '') fifths = Number(f);
          const mo = tekstVan(key, 'mode');
          if (mo) mode = mo;
        }
        continue;
      }
      if (kind.naam === 'harmony') {
        if (!eersteHarmony) eersteHarmony = kind;
        continue;
      }
      if (kind.naam === 'backup') {
        positie -= Number(tekstVan(kind, 'duration') || 0);
        continue;
      }
      if (kind.naam === 'forward') {
        positie += Number(tekstVan(kind, 'duration') || 0);
        continue;
      }
      if (kind.naam !== 'note') continue;

      // rust of siernoot: geen echte toonhoogte
      const rust = eerste(kind, 'rest');
      const sier = eerste(kind, 'grace');
      const isAkkoordNoot = !!eerste(kind, 'chord');
      const duurDiv = Number(tekstVan(kind, 'duration') || 0);
      const voice = tekstVan(kind, 'voice') || '1';

      if (sier) continue;                 // siernoten overslaan
      if (rust) { if (!isAkkoordNoot) positie += duurDiv; continue; }

      const pitch = eerste(kind, 'pitch');
      if (!pitch) { if (!isAkkoordNoot) positie += duurDiv; continue; }

      const step = tekstVan(pitch, 'step');
      const alter = tekstVan(pitch, 'alter');
      const octave = tekstVan(pitch, 'octave');
      if (!step || octave === '') return { fout: 'noot zonder toonhoogte' };
      const midi = midiVan(step, alter || 0, octave);

      let startDiv;
      if (isAkkoordNoot) {
        startDiv = laatsteStart;          // zelfde begin als de vorige noot
      } else {
        startDiv = positie;
        laatsteStart = positie;
        positie += duurDiv;
      }

      const tellenFactor = maatBeatType / (divisies * 4);
      const duurTellen = duurDiv * tellenFactor;
      const startTellen = globaleTijd + startDiv * tellenFactor;

      // tie: een noot die stopt hoort bij de vorige en verlengt die
      const tieEl = eerste(kind, 'tie');
      const tieSoort = tieEl ? tieEl.attributen.type : null;
      if (tieSoort === 'stop' && vorigeNoot && vorigeMidi === midi) {
        vorigeNoot.duur = rond(vorigeNoot.duur + duurTellen);
        continue;
      }

      const lyric = eerste(kind, 'lyric');
      let lyricTekst = '';
      let syllabic = '';
      if (lyric) {
        // vierkante haken horen niet in de tekst: die zijn voor de akkoorden
        lyricTekst = tekstVan(lyric, 'text').replace(/[[\]]/g, ' ').replace(/\s+/g, ' ').trim();
        syllabic = tekstVan(lyric, 'syllabic');
      }

      const noot = { voice, start: rond(startTellen), duur: rond(duurTellen), midi, lyricTekst, syllabic };
      alleNoten.push(noot);
      vorigeNoot = noot;
      vorigeMidi = midi;
    }

    akkoordPerMaat.push(eersteHarmony ? akkoordNaamVanHarmony(eersteHarmony) : null);

    // de maat is zoveel tellen lang als er echt in de noten staat (pickup-maten
    // zijn korter); zo blijft de tijdlijn kloppen met de muziek.
    globaleTijd += positie * (maatBeatType / (divisies * 4));
  }

  // De melodie is de gezongen stem: de stem met de meeste liedtekst.
  const perVoice = new Map();
  for (const n of alleNoten) {
    if (!n.lyricTekst) continue;
    perVoice.set(n.voice, (perVoice.get(n.voice) || 0) + 1);
  }
  let melodieStem = '1';
  let meest = -1;
  for (const [v, c] of perVoice) if (c > meest) { meest = c; melodieStem = v; }

  let melodie = alleNoten.filter(n => n.voice === melodieStem && n.duur > 0);
  if (melodie.length < 8) {
    // geen duidelijke gezongen stem: gebruik alle noten van de hoogste stem
    const uniek = [...new Set(alleNoten.map(n => n.voice))];
    let beste = null;
    for (const v of uniek) {
      const noten = alleNoten.filter(n => n.voice === v && n.duur > 0);
      if (!noten.length) continue;
      const gem = noten.reduce((a, n) => a + n.midi, 0) / noten.length;
      if (!beste || gem > beste.gem) beste = { v, gem };
    }
    melodie = beste ? alleNoten.filter(n => n.voice === beste.v && n.duur > 0) : [];
  }
  if (melodie.length < 8) return { fout: 'te weinig noten (' + melodie.length + ')' };
  if (!melodie.some(n => n.lyricTekst)) return { fout: 'geen liedtekst' };

  // gaten in de akkoorden opvullen: elke maat erft het vorige akkoord.
  const eersteBekend = akkoordPerMaat.find(a => a) || null;
  if (!eersteBekend) return { fout: 'geen akkoorden herkend' };
  let vorigeAkkoord = eersteBekend;
  const akkoordenPerMaat = akkoordPerMaat.map(a => { if (a) { vorigeAkkoord = a; return a; } return vorigeAkkoord; });

  // keuren en zo nodig transponeren naar een speelbare toonsoort
  const gewenst = toonsoortVan(fifths, mode);
  const trans = abc.besteTranspositie(akkoordenPerMaat, gewenst);
  if (trans.onbekend && trans.onbekend.length) {
    return { fout: 'geen speelbare toonsoort (' + trans.onbekend.join(',') + ')' };
  }
  const stappen = trans.stappen || 0;
  // De toonsoort bepaalt de spelling: een mol-toonsoort spelt met mollen (Bb, niet
  // A#), zodat de akkoorden de grepen uit de whitelist van lib/grepen.js raken.
  const gebruikMol = theorie.toonsoortVoorkeur(gewenst, stappen);
  const omgezet = (trans.omgezet || akkoordenPerMaat).map(a => theorie.transponeer(a, 0, gebruikMol));
  const toonsoort = stappen ? theorie.transponeerToonsoort(gewenst, stappen) : gewenst;

  // noten: de melodie, in tellen vanaf het begin (zo nodig meegetransponeerd)
  const noten = melodie
    .filter(n => n.duur > 0)
    .sort((a, b) => a.start - b.start)
    // Een aangehouden hele noot kan in een langzame hymne langer dan twee maten
    // duren; de app gaat uit van hoogstens twee maten per noot, dus we kappen af
    // (de toon klinkt dan twee maten door, wat muzikaal klopt).
    .map(n => ({ start: rond(n.start), duur: rond(Math.min(n.duur, maatBeats * 2)), midi: n.midi + stappen }));
  if (noten.length < 8) return { fout: 'te weinig noten (' + noten.length + ')' };

  // De app leidt het aantal maten af uit de noten (ceil van de laatste noot). Houd
  // daarom precies zoveel akkoorden aan: één akkoord te veel of te weinig laat de
  // maten, de noten en het akkoordschema uit de pas lopen.
  const laatsteNoot = noten[noten.length - 1];
  const aantalMaten = Math.max(1, Math.ceil((laatsteNoot.start + laatsteNoot.duur) / maatBeats - 1e-6));
  const passend = omgezet.slice(0, aantalMaten);
  while (passend.length < aantalMaten) passend.push(passend[passend.length - 1]);

  // ChordPro: per regel vier maten, de akkoorden tussen haken boven de tekst.
  // Een maat is precies maatBeats tellen lang (de tel is de nootwaarde van de
  // maatsoort), dus de maat waarin een lettergreep valt is start / maatBeats.
  const perMaatSyllaben = new Map();
  for (const n of melodie) {
    if (!n.lyricTekst) continue;
    const maatIndex = Math.min(passend.length - 1, Math.max(0,
      Math.floor((n.start + 1e-6) / maatBeats)));
    if (!perMaatSyllaben.has(maatIndex)) perMaatSyllaben.set(maatIndex, []);
    perMaatSyllaben.get(maatIndex).push(n);
  }
  const regels = [];
  for (let i = 0; i < passend.length; i += 4) {
    const stukken = [];
    for (let j = i; j < Math.min(i + 4, passend.length); j++) {
      const syl = perMaatSyllaben.get(j) || [];
      let woorden = '';
      for (const n of syl) {
        woorden += n.lyricTekst;
        if (n.syllabic === 'single' || n.syllabic === 'end' || !n.syllabic) woorden += ' ';
      }
      woorden = woorden.replace(/\s+/g, ' ').trim();
      stukken.push('[' + passend[j] + ']' + (woorden || '\u2014\u2014'));
    }
    regels.push(stukken.join('  '));
    regels.push('');
  }
  const chordpro = '{title: ' + titel + '}\n{key: ' + toonsoort + '}\n{tempo: ' + opties.tempo + '}\n\n' + regels.join('\n').trim();

  return {
    liedje: {
      titel,
      artiest,
      taal: 'en',
      genre: opties.genre,
      moeilijkheid: moeilijkheidVan(passend),
      toonsoort,
      tempo: opties.tempo,
      maatsoort: Math.max(2, Math.min(12, maatBeats)),
      strum: opties.strum,
      bron: opties.bronNaam,
      licentie: opties.licentie,
      chordpro,
      akkoordenPerMaat: passend,
      noten,
      _melodieStem: melodieStem,
      _stappen: stappen,
      _bestand: path.basename(bestandsnaam)
    }
  };
}

const MOEILIJK_SIMPEL = ['C', 'F', 'G', 'G7', 'Am', 'Dm', 'Em'];

function moeilijkheidVan(akkoorden) {
  const uniek = [...new Set(akkoorden)];
  if (uniek.every(a => MOEILIJK_SIMPEL.indexOf(a) >= 0)) return 1;
  const barres = uniek.filter(a => grepen.isBarre(a));
  if (barres.length >= 3) return 4;
  if (barres.length) return 3;
  return 2;
}

// ---------------------------------------------------------------------- main ---

function main() {
  const args = process.argv.slice(2);
  const optie = (naam, standaard) => {
    const i = args.indexOf('--' + naam);
    return i >= 0 && args[i + 1] ? args[i + 1] : standaard;
  };
  const bronMap = optie('bron', 'song-data/anthology/raw');
  const uitPad = optie('uit', 'song-data/anthology-liedjes.json');
  const opties = {
    genre: 'Liedje',
    bronNaam: 'The Public Domain Song Anthology',
    licentie: 'CC0 1.0 (publieke-domein-toewijding, Aperio Press)',
    strum: 'D DU UDU',
    tempo: 84
  };
  const wortel = path.resolve(__dirname, '..');
  const map = path.resolve(wortel, bronMap);
  const bestanden = fs.readdirSync(map).filter(f => f.endsWith('.xml')).sort();
  const uit = [];
  const fouten = {};
  let getransponeerd = 0;
  for (const bestand of bestanden) {
    const tekst = fs.readFileSync(path.join(map, bestand), 'utf8');
    let resultaat;
    try {
      resultaat = liedjeVanMusicXml(tekst, bestand, opties);
    } catch (e) {
      const sleutel = 'uitzondering: ' + e.message;
      fouten[sleutel] = (fouten[sleutel] || 0) + 1;
      continue;
    }
    if (resultaat.fout) {
      const sleutel = resultaat.fout.replace(/\(\d+\)/, '(n)');
      fouten[sleutel] = (fouten[sleutel] || 0) + 1;
      continue;
    }
    if (resultaat.liedje._stappen) getransponeerd += 1;
    uit.push(resultaat.liedje);
  }
  const schoon = uit.map(l => {
    const kopie = Object.assign({}, l);
    delete kopie._melodieStem; delete kopie._stappen; delete kopie._bestand;
    return kopie;
  });
  const uitBestand = path.resolve(wortel, uitPad);
  fs.writeFileSync(uitBestand, JSON.stringify(schoon, null, 1));

  // keuring: elk akkoord moet een greep hebben
  let overtredingen = 0;
  const akkoorden = {};
  let notenTotaal = 0, matenTotaal = 0;
  for (const l of schoon) {
    notenTotaal += l.noten.length;
    matenTotaal += l.akkoordenPerMaat.length;
    for (const a of new Set(l.akkoordenPerMaat)) {
      akkoorden[a] = (akkoorden[a] || 0) + 1;
      if (!grepen.heeftGreep(a)) overtredingen += 1;
    }
  }
  console.log('gelezen bestanden : ' + bestanden.length);
  console.log('omgezet           : ' + uit.length + ' -> ' + uitPad);
  console.log('afgewezen         : ' + JSON.stringify(fouten));
  console.log('getransponeerd    : ' + getransponeerd + ' liedjes');
  console.log('akkoord-overtredingen (moet 0): ' + overtredingen);
  console.log('noten / maten     : ' + notenTotaal + ' / ' + matenTotaal);
  console.log('verschillende akkoorden: ' + Object.keys(akkoorden).sort().join(' '));
  console.log('bestandsgrootte   : ' + Math.round(fs.statSync(uitBestand).size / 1024) + ' kB');
}

if (require.main === module) main();
module.exports = { liedjeVanMusicXml, leesXml, akkoordNaamVanHarmony, midiVan };
