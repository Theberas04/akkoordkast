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
// toon (pitch class) als die bekend is: de grondtoon in de bas weegt mee.
function besteAkkoord(chroma, opties) {
  const o = opties || {};
  const bas = o.bas === undefined || o.bas === null ? null : o.bas;
  const totaal = chroma.reduce((a, b) => a + b, 0);
  if (!totaal) return null;
  let beste = null;
  for (let grond = 0; grond < 12; grond++) {
    for (const kwaliteit of KWALITEITEN) {
      const naam = naamVan(grond, kwaliteit);
      if (!grepen.heeftGreep(naam)) continue;
      const tonen = akkoordtonen(grond, kwaliteit);
      let binnen = 0;
      for (let pc = 0; pc < 12; pc++) if (tonen.indexOf(pc) >= 0) binnen += chroma[pc];
      let score = binnen / totaal - EXTRA_KOSTEN[kwaliteit];
      if (bas !== null) {
        if (bas === grond) score += 0.08;
        else if (tonen.indexOf(bas) >= 0) score += 0.02;
        else score -= 0.06;
      }
      // een akkoord waarvan de grondtoon of terts helemaal niet klinkt, klopt zelden
      if (!chroma[grond]) score -= 0.12;
      if (!chroma[(grond + (kwaliteit === 'm' || kwaliteit === 'm7' ? 3 : 4)) % 12]) score -= 0.12;
      if (!beste || score > beste.score) beste = { naam, grond, kwaliteit, score };
    }
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
