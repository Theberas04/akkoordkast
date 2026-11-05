'use strict';
// Akkoordherkenning uit klankkleur (chroma). Zowel de ABC-omzetter als de
// muziekanalyse gebruikt deze tabellen, zodat er één waarheid is over wat een
// akkoord is en hoe zwaar een toon meetelt.
const theorie = require('./theorie');
const grepen = require('./grepen');

const KWALITEITEN = ['', 'm', '7', 'm7', 'maj7'];
// een drieklank is de standaard; een vierklank moet echt klinken om te winnen
const EXTRA_KOSTEN = { '': 0, m: 0, 7: 0.05, m7: 0.05, maj7: 0.09 };

// De pitch classes van een akkoord.
function akkoordtonen(grondPc, kwaliteit) {
  const terts = kwaliteit === 'm' || kwaliteit === 'm7' ? 3 : 4;
  const tonen = [grondPc, (grondPc + terts) % 12, (grondPc + 7) % 12];
  if (kwaliteit === '7' || kwaliteit === 'm7') tonen.push((grondPc + 10) % 12);
  if (kwaliteit === 'maj7') tonen.push((grondPc + 11) % 12);
  return tonen;
}

function naamVan(grondPc, kwaliteit) {
  return theorie.KRUIS[((grondPc % 12) + 12) % 12] + kwaliteit;
}

// Welk akkoord past het beste bij deze chroma? `bas` is de laagste klinkende
// toon (pitch class) als die bekend is: de grondtoon in de bas weegt zwaar mee,
// want een akkoord waarvan de grondtoon niet in de bas ligt is meestal een
// omkering — en dan kiezen we liever het akkoord dat er wél bij past.
//
// Belangrijk verschil met een simpele telling: het akkoord met de meeste tonen
// wint hier niet automatisch. Er gaat juist vanaf als er klank buiten het akkoord
// zit, zodat een wazige klankkleur niet overal hetzelfde vierklank-akkoord oplevert.
function besteAkkoord(chroma, opties) {
  const o = opties || {};
  const bas = o.bas === undefined || o.bas === null ? null : o.bas;
  const basTweede = o.basTweede === undefined || o.basTweede === null ? null : o.basTweede;
  const totaal = chroma.reduce((a, b) => a + b, 0);
  if (!totaal) return null;
  const genormeerd = chroma.map(x => x / totaal);
  let beste = null;
  let tweede = null;
  for (let grond = 0; grond < 12; grond++) {
    for (const kwaliteit of KWALITEITEN) {
      const naam = naamVan(grond, kwaliteit);
      if (!grepen.heeftGreep(naam)) continue;
      // gewicht per toonrol: grondtoon zwaarst, dan de terts, dan de kwint, dan de septiem
      const gewicht = new Array(12).fill(0);
      const terts = (grond + (kwaliteit === 'm' || kwaliteit === 'm7' ? 3 : 4)) % 12;
      gewicht[grond] = 1;
      gewicht[terts] = 0.85;
      gewicht[(grond + 7) % 12] = 0.7;
      if (kwaliteit === '7' || kwaliteit === 'm7') gewicht[(grond + 10) % 12] = 0.45;
      if (kwaliteit === 'maj7') gewicht[(grond + 11) % 12] = 0.45;
      let binnen = 0;
      let buiten = 0;
      for (let pc = 0; pc < 12; pc++) {
        if (gewicht[pc]) binnen += genormeerd[pc] * gewicht[pc];
        else buiten += genormeerd[pc];
      }
      // hoe meer van de klank dit akkoord verklaart, hoe beter; klank die er niet bij
      // hoort telt zwaar mee tegen
      let score = (binnen - 0.85 * buiten) * 1.3;
      // een vierklank moet echt klinken om te winnen: anders wordt een gewone drieklank
      // zomaar een septiemakkoord
      if (kwaliteit === '7' || kwaliteit === 'm7') score -= genormeerd[(grond + 10) % 12] ? 0.02 : 0.13;
      if (kwaliteit === 'maj7') score -= genormeerd[(grond + 11) % 12] ? 0.02 : 0.16;
      if (bas !== null) {
        if (bas === grond) score += 0.12;
        else if (bas === terts || bas === (grond + 7) % 12) score += 0.03;
        else score -= 0.14;
        if (basTweede !== null && basTweede === grond) score += 0.04;
      }
      // een akkoord waarvan de grondtoon of terts helemaal niet klinkt, klopt zelden
      if (!genormeerd[grond]) score -= 0.12;
      if (!genormeerd[terts]) score -= 0.12;
      const kandidaat = { naam, grond, kwaliteit, score };
      if (!beste || score > beste.score) {
        if (beste && beste.grond !== grond) tweede = beste;
        beste = kandidaat;
      } else if (!tweede && (!beste || grond !== beste.grond)) {
        // de beste kandidaat met een ándere grondtoon: daartegen meten we de marge, want
        // C tegen C7 zegt weinig, C tegen G wel
        tweede = kandidaat;
      } else if (tweede && grond !== beste.grond && score > tweede.score) {
        tweede = kandidaat;
      }
    }
  }
  if (beste) {
    beste.marge = Math.max(0, beste.score - (tweede ? tweede.score : 0));
    beste.tweede = tweede ? tweede.naam : '';
  }
  return beste;
}

// Krumhansl-achtige profielen: welke toonsoort past bij deze chroma?
const MAJOOR_PROFIEL = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINEUR_PROFIEL = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function correlatie(chroma, profiel, verschuiving) {
  let a = 0, b = 0, c = 0;
  for (let i = 0; i < 12; i++) {
    const p = profiel[(i - verschuiving + 12) % 12];
    a += chroma[i] * p;
    b += chroma[i] * chroma[i];
    c += p * p;
  }
  return c && b ? a / Math.sqrt(b * c) : 0;
}

function schatToonsoort(chroma) {
  let beste = { naam: 'C', score: -1, mol: false };
  for (let grond = 0; grond < 12; grond++) {
    for (const mineur of [false, true]) {
      const score = correlatie(chroma, mineur ? MINEUR_PROFIEL : MAJOOR_PROFIEL, grond);
      const naam = theorie.KRUIS[grond] + (mineur ? 'm' : '');
      if (score > beste.score) beste = { naam, score, mol: false, grond, mineur };
    }
  }
  return beste;
}

module.exports = { akkoordtonen, besteAkkoord, naamVan, schatToonsoort, KWALITEITEN };
