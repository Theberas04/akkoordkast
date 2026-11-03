'use strict';
// Speelposities over de hals: meerdere grepen per akkoord plus SVG per positie.
const test = require('node:test');
const assert = require('node:assert');
const theorie = require('../lib/theorie');
const grepen = require('../lib/grepen');

const AKKOORDEN = Object.keys(grepen.GREPEN);

// Toonklassen (0..11) per kwaliteit: grondtoon, terts, kwint, septiem.
const INTERVALLEN = {
  '': [0, 4, 7],
  'm': [0, 3, 7],
  '7': [0, 4, 7, 10],
  'm7': [0, 3, 7, 10],
  'maj7': [0, 4, 7, 11]
};

function akkoordToonklassen(naam) {
  const d = theorie.ontleed(naam);
  assert.ok(d, `niet te ontleden: ${naam}`);
  const grond = theorie.TOONHOOGTE[d.grond];
  const intervallen = INTERVALLEN[d.kwaliteit];
  assert.ok(intervallen, `onbekende kwaliteit: ${naam}`);
  return intervallen.map(i => (grond + i) % 12);
}

test('posities: elk akkoord heeft 2 tot 4 posities', () => {
  assert.equal(AKKOORDEN.length, 26, 'de 26 basisgrepen');
  for (const naam of AKKOORDEN) {
    const pos = grepen.posities(naam);
    assert.ok(Array.isArray(pos), `${naam}: array`);
    assert.ok(pos.length >= 2, `${naam}: minstens 2 posities (kreeg ${pos.length})`);
    assert.ok(pos.length <= 4, `${naam}: hoogstens 4 posities (kreeg ${pos.length})`);
  }
});

test('posities: elke aangeslagen snaar klinkt op een akkoordtoon', () => {
  for (const naam of AKKOORDEN) {
    const klassen = akkoordToonklassen(naam);
    for (const p of grepen.posities(naam)) {
      p.frets.forEach((f, i) => {
        if (f < 0) return;
        const midi = grepen.OPEN_SNAREN_MIDI[i] + f;
        assert.ok(
          klassen.includes(midi % 12),
          `${naam} (${p.naam}): snaar ${i} fret ${f} klinkt toonklasse ${midi % 12}, ` +
          `niet in [${klassen.join(', ')}]`
        );
      });
      // het noten-veld moet dezelfde klinkende snaren geven
      const verwacht = [];
      p.frets.forEach((f, i) => { if (f >= 0) verwacht.push(grepen.OPEN_SNAREN_MIDI[i] + f); });
      assert.deepEqual(p.noten, verwacht, `${naam} (${p.naam}): noten`);
    }
  }
});

test('posities: Nederlandse naam, venster en vanaf-waarde kloppen', () => {
  for (const naam of AKKOORDEN) {
    for (const p of grepen.posities(naam)) {
      assert.equal(typeof p.naam, 'string', `${naam}: naam is tekst`);
      assert.ok(p.naam.trim().length > 0, `${naam}: naam niet leeg`);
      assert.equal(typeof p.beschrijving, 'string', `${naam}: beschrijving is tekst`);
      assert.ok(p.beschrijving.trim().length > 0, `${naam}: beschrijving niet leeg`);
      assert.ok(p.vanaf >= 1 && p.vanaf <= 12, `${naam} (${p.naam}): vanaf ${p.vanaf}`);
      assert.equal(p.frets.length, 6, `${naam} (${p.naam}): zes snaren`);
      p.frets.forEach((f, i) => {
        if (f === -1) return;
        if (f === 0) {
          assert.equal(p.vanaf, 1, `${naam} (${p.naam}): losse snaar ${i} maar vanaf ${p.vanaf}`);
        } else {
          assert.ok(
            f >= p.vanaf && f <= p.vanaf + 5,
            `${naam} (${p.naam}): fret ${f} valt buiten venster ${p.vanaf}..${p.vanaf + 5}`
          );
        }
      });
    }
  }
});

test('posities: gesorteerd van laag naar hoog zonder duplicaten', () => {
  for (const naam of AKKOORDEN) {
    const pos = grepen.posities(naam);
    for (let i = 1; i < pos.length; i++) {
      assert.ok(pos[i].vanaf >= pos[i - 1].vanaf, `${naam}: niet gesorteerd op vanaf`);
    }
    const sleutels = pos.map(p => p.frets.join(','));
    assert.equal(new Set(sleutels).size, sleutels.length, `${naam}: dubbele posities`);
  }
});

test('svgDiagramVanGreep levert een geldig diagram per positie', () => {
  for (const naam of AKKOORDEN) {
    for (const p of grepen.posities(naam)) {
      const svg = grepen.svgDiagramVanGreep(p);
      assert.equal(typeof svg, 'string', `${naam}: svg is tekst`);
      assert.ok(svg.includes('<svg'), `${naam} (${p.naam}): opent met svg`);
      assert.ok(svg.includes('</svg>'), `${naam} (${p.naam}): sluit met svg`);
      assert.ok(svg.includes(naam), `${naam} (${p.naam}): akkoordnaam erin`);
      assert.ok(svg.includes('class="greep-naam"'), `${naam} (${p.naam}): naam-label`);
    }
  }
});

test('svgDiagram blijft werken voor alle 26 akkoorden', () => {
  for (const naam of AKKOORDEN) {
    const svg = grepen.svgDiagram(naam);
    assert.match(svg, /^<svg /, `${naam}: svg`);
    assert.ok(svg.includes(`${naam}</text>`), `${naam}: naam in het diagram`);
  }
});
