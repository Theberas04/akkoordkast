'use strict';
// Muziektheorie: akkoordnamen ontleden, transponeer-ren en toonsoort-info.
// Puur (geen database, geen server) zodat het los te testen is.

const KRUIS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const MOL = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

const TOONHOOGTE = {
  'C': 0, 'B#': 0,
  'C#': 1, 'Db': 1,
  'D': 2,
  'D#': 3, 'Eb': 3,
  'E': 4, 'Fb': 4,
  'F': 5, 'E#': 5,
  'F#': 6, 'Gb': 6,
  'G': 7,
  'G#': 8, 'Ab': 8,
  'A': 9,
  'A#': 10, 'Bb': 10,
  'B': 11, 'Cb': 11
};

// Toonsoorten die traditioneel met kruizen of met mollen worden geschreven.
const KRUIS_TOONSOORTEN = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'Am', 'Em', 'Bm', 'F#m', 'C#m', 'G#m', 'D#m', 'A#m'];
const MOL_TOONSOORTEN = ['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb', 'Dm', 'Gm', 'Cm', 'Fm', 'Bbm', 'Ebm', 'Abm'];

const AKKOORD_PATROON = /^([A-G][#b]?)(.*)$/;

function isAkkoord(naam) {
  return typeof naam === 'string' && AKKOORD_PATROON.test(naam.trim());
}

// Splitst "F#m7/B" in grondtoon, kwaliteit en optionele basnoot.
function ontleed(naam) {
  const schoon = String(naam || '').trim();
  const delen = schoon.split('/');
  const m = AKKOORD_PATROON.exec(delen[0]);
  if (!m) return null;
  return {
    grond: m[1],
    kwaliteit: m[2] || '',
    bas: delen[1] ? (AKKOORD_PATROON.exec(delen[1]) || [, delen[1]])[1] : null,
    ruw: schoon
  };
}

function kiesSpelling(toonhoogte, gebruikMol) {
  const index = ((toonhoogte % 12) + 12) % 12;
  return gebruikMol ? MOL[index] : KRUIS[index];
}

function transponeer(naam, stappen, gebruikMol) {
  const d = ontleed(naam);
  if (!d) return naam;
  const basis = TOONHOOGTE[d.grond];
  if (basis === undefined) return naam;
  const nieuw = kiesSpelling(basis + Number(stappen || 0), !!gebruikMol);
  const bas = d.bas && TOONHOOGTE[d.bas] !== undefined
    ? '/' + kiesSpelling(TOONHOOGTE[d.bas] + Number(stappen || 0), !!gebruikMol)
    : (d.bas ? '/' + d.bas : '');
  return nieuw + d.kwaliteit + bas;
}

// Bij een toonsoort hoort een voorkeur voor mollen of kruizen.
function toonsoortVoorkeur(toonsoort, stappen) {
  const d = ontleed(toonsoort || 'C');
  if (!d) return false;
  if (d.grond.includes('b')) return true; // een mol-toonsoort blijft mol
  const n = Number(stappen) || 0;
  const metKruis = transponeer(d.grond, n, false) + d.kwaliteit;
  const metMol = transponeer(d.grond, n, true) + d.kwaliteit;
  if (KRUIS_TOONSOORTEN.includes(metKruis)) return false;
  if (MOL_TOONSOORTEN.includes(metMol)) return true;
  return false;
}

function transponeerToonsoort(toonsoort, stappen) {
  return transponeer(toonsoort || 'C', stappen, toonsoortVoorkeur(toonsoort, stappen));
}

// Alle unieke akkoorden in een lijst, in volgorde van eerste optreden.
function uniek(lijst) {
  const gezien = new Set();
  const uit = [];
  for (const a of lijst || []) {
    const d = ontleed(a);
    if (!d) continue;
    const sleutel = d.grond + d.kwaliteit;
    if (gezien.has(sleutel)) continue;
    gezien.add(sleutel);
    uit.push(a);
  }
  return uit;
}

module.exports = {
  KRUIS, MOL, TOONHOOGTE, MOL_TOONSOORTEN,
  isAkkoord, ontleed, transponeer, transponeerToonsoort, toonsoortVoorkeur, uniek
};
