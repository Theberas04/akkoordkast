'use strict';
// Gitaargrepen: vaste grepen per akkoordnaam plus afgeleide barré-grepen,
// en de SVG-tekening van een greep.
// frets: 6 snaren van laag (E2) naar hoog (e4); -1 = niet aanslaan, 0 = los.
// Vingers: 1=wijs, 2=midden, 3=ring, 4=pink, 0 = geen vinger.
// De frets zijn geteld vanaf de capo: met capo 2 ziet de speler dezelfde greep.

const THEORIE = require('./theorie');

const GREPEN = {
  'C':      { frets: [-1, 3, 2, 0, 1, 0], vingers: [0, 3, 2, 0, 1, 0] },
  'C7':     { frets: [-1, 3, 2, 3, 1, 0], vingers: [0, 3, 2, 4, 1, 0] },
  'Cmaj7':  { frets: [-1, 3, 2, 0, 0, 0], vingers: [0, 3, 2, 0, 0, 0] },
  'Cm':     { frets: [-1, 3, 5, 5, 4, 3], vingers: [0, 1, 3, 4, 2, 1], barre: { fret: 3, van: 1, tot: 5 } },
  'D':      { frets: [-1, -1, 0, 2, 3, 2], vingers: [0, 0, 0, 1, 3, 2] },
  'D7':     { frets: [-1, -1, 0, 2, 1, 2], vingers: [0, 0, 0, 2, 1, 3] },
  'Dm':     { frets: [-1, -1, 0, 2, 3, 1], vingers: [0, 0, 0, 2, 3, 1] },
  'Dm7':    { frets: [-1, -1, 0, 2, 1, 1], vingers: [0, 0, 0, 2, 1, 1], barre: { fret: 1, van: 4, tot: 5 } },
  'E':      { frets: [0, 2, 2, 1, 0, 0], vingers: [0, 2, 3, 1, 0, 0] },
  'E7':     { frets: [0, 2, 0, 1, 0, 0], vingers: [0, 2, 0, 1, 0, 0] },
  'Em':     { frets: [0, 2, 2, 0, 0, 0], vingers: [0, 2, 3, 0, 0, 0] },
  'Em7':    { frets: [0, 2, 2, 0, 3, 0], vingers: [0, 2, 3, 0, 4, 0] },
  'F':      { frets: [1, 3, 3, 2, 1, 1], vingers: [1, 3, 4, 2, 1, 1], barre: { fret: 1, van: 0, tot: 5 } },
  'F7':     { frets: [1, 3, 1, 2, 1, 1], vingers: [1, 3, 1, 2, 1, 1], barre: { fret: 1, van: 0, tot: 5 } },
  'Fm':     { frets: [1, 3, 3, 1, 1, 1], vingers: [1, 3, 4, 1, 1, 1], barre: { fret: 1, van: 0, tot: 5 } },
  'Fmaj7':  { frets: [-1, -1, 3, 2, 1, 0], vingers: [0, 0, 3, 2, 1, 0] },
  'G':      { frets: [3, 2, 0, 0, 0, 3], vingers: [3, 2, 0, 0, 0, 4] },
  'G7':     { frets: [3, 2, 0, 0, 0, 1], vingers: [3, 2, 0, 0, 0, 1] },
  'Gm':     { frets: [3, 5, 5, 3, 3, 3], vingers: [1, 3, 4, 1, 1, 1], barre: { fret: 3, van: 0, tot: 5 } },
  'A':      { frets: [-1, 0, 2, 2, 2, 0], vingers: [0, 0, 1, 2, 3, 0] },
  'A7':     { frets: [-1, 0, 2, 0, 2, 0], vingers: [0, 0, 2, 0, 3, 0] },
  'Am':     { frets: [-1, 0, 2, 2, 1, 0], vingers: [0, 0, 2, 3, 1, 0] },
  'Am7':    { frets: [-1, 0, 2, 0, 1, 0], vingers: [0, 0, 2, 0, 1, 0] },
  'Bb':     { frets: [-1, 1, 3, 3, 3, 1], vingers: [0, 1, 2, 3, 4, 1], barre: { fret: 1, van: 1, tot: 5 } },
  'B7':     { frets: [-1, 2, 1, 2, 0, 2], vingers: [0, 2, 1, 3, 0, 4] },
  'Bm':     { frets: [-1, 2, 4, 4, 3, 2], vingers: [0, 1, 3, 4, 2, 1], barre: { fret: 2, van: 1, tot: 5 } }
};

const OPEN_SNAREN_MIDI = [40, 45, 50, 55, 59, 64]; // E2 A2 D3 G3 B3 E4
const MIDI_E = 4; // E op de lage E-snaar
const MIDI_A = 9; // A op de A-snaar

// Verplaatsbare vormen: frets zijn geteld vanaf de barré-fret, -1 = niet aanslaan.
const VORMEN = {
  '':     { es: [0, 2, 2, 1, 0, 0], ev: [1, 3, 4, 2, 1, 1], as: [-1, 0, 2, 2, 2, 0], av: [0, 1, 2, 3, 4, 1] },
  'm':    { es: [0, 2, 2, 0, 0, 0], ev: [1, 3, 4, 1, 1, 1], as: [-1, 0, 2, 2, 1, 0], av: [0, 1, 3, 4, 2, 1] },
  '7':    { es: [0, 2, 0, 1, 0, 0], ev: [1, 3, 1, 2, 1, 1], as: [-1, 0, 2, 0, 2, 0], av: [0, 1, 3, 1, 4, 1] },
  'm7':   { es: [0, 2, 0, 0, 0, 0], ev: [1, 3, 1, 1, 1, 1], as: [-1, 0, 2, 0, 1, 0], av: [0, 1, 3, 1, 2, 1] },
  'maj7': { es: [0, 2, 1, 1, 0, 0], ev: [1, 4, 2, 3, 1, 1], as: [-1, 0, 2, 1, 2, 0], av: [0, 1, 4, 2, 3, 1] }
};

// Een barré-greep afleiden uit een verplaatsbare vorm, zodat élk akkoord
// (ook na transponeren of een hoge capo) een diagram heeft.
function afgeleideGreep(naam) {
  const d = THEORIE.ontleed(naam);
  if (!d || d.bas) return null;
  const vorm = VORMEN[d.kwaliteit];
  if (!vorm) return null;
  const grond = THEORIE.TOONHOOGTE[d.grond];
  if (grond === undefined) return null;
  const esFret = ((grond - MIDI_E) % 12 + 12) % 12;
  const asFret = ((grond - MIDI_A) % 12 + 12) % 12;
  const gebruikEs = esFret >= 1 && esFret <= 7;
  const fret = gebruikEs ? esFret : asFret;
  if (fret < 1 || fret > 11) return null;
  const mal = gebruikEs ? vorm.es : vorm.as;
  const vingers = gebruikEs ? vorm.ev : vorm.av;
  return {
    frets: mal.map(f => (f < 0 ? -1 : (f === 0 ? fret : f + fret))),
    vingers: vingers.slice(),
    barre: { fret, van: gebruikEs ? 0 : 1, tot: 5 },
    gegenereerd: true
  };
}

function losGreep(naam) {
  if (Object.prototype.hasOwnProperty.call(GREPEN, naam)) return GREPEN[naam];
  return afgeleideGreep(naam);
}

function heeftGreep(naam) {
  return !!losGreep(naam);
}

function greep(naam) {
  return losGreep(naam) || null;
}

// Klinkende frets: greep + capo. Resulteert in dezelfde greep, hoger op de hals.
function klinkendeFrets(naam, capo) {
  const g = losGreep(naam);
  if (!g) return null;
  const c = Math.max(0, Math.min(12, Number(capo) || 0));
  return g.frets.map(f => (f < 0 ? -1 : f + c));
}

// MIDI-nummers van de klinkende snaren van een greep (voor de audio-synthesizer).
function noten(naam, capo) {
  const frets = klinkendeFrets(naam, capo);
  if (!frets) return [];
  const uit = [];
  frets.forEach((f, i) => {
    if (f >= 0) uit.push({ snaar: i, midi: OPEN_SNAREN_MIDI[i] + f });
  });
  return uit;
}

function aantalVingers(naam) {
  const g = losGreep(naam);
  if (!g) return 0;
  return g.vingers.filter(v => v > 0).length;
}

function isBarre(naam) {
  const g = losGreep(naam);
  return !!(g && g.barre);
}

// Hulpfunctie: bouw een positie-object. Het venster schuift mee als de greep
// hoger op de hals ligt (dezelfde regel die de SVG-tekening al gebruikte).
function maakPositie(akkoord, frets, vingers, barre, naam, beschrijving) {
  const gespeeld = frets.filter(f => f > 0);
  const hoogste = gespeeld.length ? Math.max.apply(null, gespeeld) : 0;
  const laagste = gespeeld.length ? Math.min.apply(null, gespeeld) : 1;
  let vanaf = hoogste > 4 ? laagste : 1;
  if (vanaf < 1) vanaf = 1;
  if (vanaf > 12) vanaf = 12;
  const noten = [];
  frets.forEach((f, i) => { if (f >= 0) noten.push(OPEN_SNAREN_MIDI[i] + f); });
  return {
    naam: naam,
    akkoord: akkoord,
    frets: frets.slice(),
    vingers: (vingers || []).slice(),
    barre: barre || null,
    vanaf: vanaf,
    noten: noten,
    beschrijving: beschrijving
  };
}

// Een barré-positie uit een verplaatsbare vorm op een gegeven fret.
function barrePositie(akkoord, vorm, vingers, fret, van, tot, soort) {
  const frets = vorm.map(f => (f < 0 ? -1 : (f === 0 ? fret : f + fret)));
  const barre = { fret: fret, van: van, tot: tot };
  const naam = 'barré, ' + soort + ' (' + fret + 'e vak)';
  const beschrijving = van === 0
    ? 'wijsvinger plat over alle snaren'
    : 'wijsvinger plat over de bovenste snaren';
  return maakPositie(akkoord, frets, vingers, barre, naam, beschrijving);
}

// Meerdere speelposities van een akkoord, van laag naar hoog op de hals.
// Positie 1 = de vaste greep (indien aanwezig), daarna barré-grepen met de
// E-vorm (grondtoon op de lage E-snaar) en de A-vorm (grondtoon op de A-snaar).
function posities(naam) {
  const d = THEORIE.ontleed(naam);
  if (!d || d.bas) return [];
  const vorm = VORMEN[d.kwaliteit];
  if (!vorm) return [];
  const grond = THEORIE.TOONHOOGTE[d.grond];
  if (grond === undefined) return [];
  const ruw = [];

  // Positie 1: de basisgreep uit GREPEN als die bestaat.
  const basis = GREPEN[naam];
  if (basis) {
    const heeftOpen = basis.frets.some(f => f === 0);
    const label = heeftOpen ? 'open positie' : 'basisgreep';
    const uitleg = heeftOpen ? 'open snaren mee laten klinken' : 'basisgreep zonder open snaren';
    ruw.push(maakPositie(naam, basis.frets, basis.vingers, basis.barre || null, label, uitleg));
  }

  // Positie 2: barré met de E-vorm op de grondtoon op de lage E-snaar.
  const esRuw = ((grond - MIDI_E) % 12 + 12) % 12;
  const esFret = esRuw === 0 ? 12 : esRuw; // fret 0 -> een octaaf hoger
  if (esFret >= 1 && esFret <= 12) {
    ruw.push(barrePositie(naam, vorm.es, vorm.ev, esFret, 0, 5, 'E-vorm'));
  }

  // Positie 3: barré met de A-vorm op de grondtoon op de A-snaar.
  const asRuw = ((grond - MIDI_A) % 12 + 12) % 12;
  const asFret = asRuw === 0 ? 12 : asRuw;
  if (asFret >= 1 && asFret <= 12) {
    ruw.push(barrePositie(naam, vorm.as, vorm.av, asFret, 1, 5, 'A-vorm'));
  }

  // Ontdubbel op frets en sorteer van laag naar hoog, maximaal vier posities.
  const gezien = new Set();
  const uniek = [];
  for (const p of ruw) {
    const sleutel = p.frets.join(',');
    if (gezien.has(sleutel)) continue;
    gezien.add(sleutel);
    uniek.push(p);
  }
  uniek.sort((a, b) => a.vanaf - b.vanaf);
  return uniek.slice(0, 4);
}

// SVG-diagram van één positie. Eén tekenroutine voor alle grepen: het venster
// schuift mee (vanaf) zodat een barré op het 8e vak frets 8-12 met cijfer 8 toont.
function svgDiagramVanGreep(positie, opties) {
  const o = Object.assign({ capo: 0, toonNaam: null }, opties || {});
  const label = o.toonNaam || positie.akkoord || positie.naam || '';
  const x0 = 14, y0 = 26, snaarAfstand = 12, fretHoogte = 17;
  const frets = positie.frets;
  const vanaf = positie.vanaf || 1;
  let svg = '<svg class="greep" viewBox="0 0 92 118" role="img" aria-label="' + label.replace(/"/g, '') + '">';
  for (let i = 0; i <= 5; i++) {
    const y = y0 + i * fretHoogte;
    svg += '<line x1="' + x0 + '" y1="' + y + '" x2="' + (x0 + 5 * snaarAfstand) + '" y2="' + y + '" stroke="#cbd5e1" stroke-width="1"/>';
  }
  for (let s = 0; s < 6; s++) {
    const x = x0 + s * snaarAfstand;
    svg += '<line x1="' + x + '" y1="' + y0 + '" x2="' + x + '" y2="' + (y0 + 5 * fretHoogte) + '" stroke="#94a3b8" stroke-width="1"/>';
  }
  if (vanaf === 1) {
    svg += '<rect x="' + x0 + '" y="' + (y0 - 4) + '" width="' + (5 * snaarAfstand) + '" height="4" fill="#e2e8f0"/>';
  } else {
    svg += '<text x="' + (x0 - 5) + '" y="' + (y0 + 12) + '" text-anchor="end" class="greep-positie">' + vanaf + '</text>';
  }
  // barré als balk onder de vingers
  if (positie.barre) {
    const y = y0 + (positie.barre.fret - vanaf + 0.5) * fretHoogte;
    const vanX = x0 + positie.barre.van * snaarAfstand;
    const totX = x0 + positie.barre.tot * snaarAfstand;
    if (y > y0 - 2 && y < y0 + 5 * fretHoogte) {
      svg += '<rect x="' + (vanX - 5.4) + '" y="' + (y - 5.4) + '" width="' + (totX - vanX + 10.8) + '" height="10.8" rx="5.4" fill="#f59e0b" opacity="0.85"/>';
    }
  }
  const capo = Number(o.capo) || 0;
  if (capo > 0) {
    svg += '<rect x="' + (x0 - 2) + '" y="' + (y0 - 6) + '" width="' + (5 * snaarAfstand + 4) + '" height="6" rx="3" fill="#f59e0b"/>';
    svg += '<text x="' + (x0 + 5 * snaarAfstand + 6) + '" y="' + (y0 - 1) + '" class="greep-capo">capo ' + capo + '</text>';
  }
  for (let s = 0; s < 6; s++) {
    const f = frets[s];
    const x = x0 + s * snaarAfstand;
    const opBarre = positie.barre && f === positie.barre.fret && s >= positie.barre.van && s <= positie.barre.tot;
    if (f === -1) {
      svg += '<text x="' + x + '" y="' + (y0 - 8) + '" text-anchor="middle" class="greep-mute">x</text>';
    } else if (f === 0) {
      svg += '<circle cx="' + x + '" cy="' + (y0 - 9) + '" r="3.4" fill="none" stroke="#64748b" stroke-width="1.4"/>';
    } else {
      const y = y0 + (f - vanaf + 0.5) * fretHoogte;
      if (!opBarre) {
        svg += '<circle cx="' + x + '" cy="' + y + '" r="5.2" fill="#0ea5e9"/>';
        if (positie.vingers[s] > 0) {
          svg += '<text x="' + x + '" y="' + (y + 3.2) + '" text-anchor="middle" class="greep-vinger">' + positie.vingers[s] + '</text>';
        }
      }
    }
  }
  svg += '<text x="46" y="112" text-anchor="middle" class="greep-naam">' + label + '</text>';
  svg += '</svg>';
  return svg;
}

// SVG-diagram van een greep. capo verschuift alleen het capo-streepje:
// de frets blijven staan zodat de speler de greep onder de capo ziet.
function svgDiagram(naam, opties) {
  const o = Object.assign({ capo: 0, toonNaam: null }, opties || {});
  const g = losGreep(naam);
  const label = o.toonNaam || naam;
  if (!g) {
    return '<svg class="greep" viewBox="0 0 92 118" role="img" aria-label="' + label.replace(/"/g, '') + ' (geen diagram)">' +
      '<text x="46" y="60" text-anchor="middle" class="greep-geen">' + label + '</text>' +
      '<text x="46" y="78" text-anchor="middle" class="greep-geen-klein">geen diagram</text></svg>';
  }
  const gespeeld = g.frets.filter(f => f > 0);
  const hoogste = gespeeld.length ? Math.max.apply(null, gespeeld) : 0;
  const laagste = gespeeld.length ? Math.min.apply(null, gespeeld) : 1;
  const vanaf = hoogste > 4 ? laagste : 1;
  const positie = {
    naam: naam,
    akkoord: naam,
    frets: g.frets,
    vingers: g.vingers,
    barre: g.barre || null,
    vanaf: vanaf
  };
  return svgDiagramVanGreep(positie, opties);
}

function alleGrepen() {
  return Object.keys(GREPEN);
}

module.exports = {
  GREPEN, VORMEN, OPEN_SNAREN_MIDI,
  heeftGreep, greep, afgeleideGreep, klinkendeFrets, noten, aantalVingers, isBarre,
  posities, svgDiagramVanGreep, svgDiagram, alleGrepen
};
