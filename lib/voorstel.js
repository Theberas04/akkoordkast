// Een voorgesteld akkoordschema voor liedjes die zelf geen akkoorden hebben overgeleverd.
//
// Waarom dit bestaat: een liedje dat uit een link is opgehaald (of een liedje waarvan de bron alleen
// tekst heeft) heeft geen akkoorden. Dan kon de app niets: geen grepen, geen begeleiding, geen
// meespelen. Hier staat een gewoon, zingbaar schema in de toonaard van het liedje — de bekende
// ronde I-V-vi-IV en verwanten — zodat er altijd iets speelbaars is. De app zegt er zelf bij dat het
// een VOORSTEL is: het liedje had geen eigen akkoorden, dus wat je hoort is niet uit de bron.
//
// Alle akkoorden in de tabel zijn na tekenen: de proef in test/voorstel.test.js controleert dat voor
// elke toonaard elk akkoord een greep heeft (desnoods met capo, zoals de app dat zelf uitrekent).
(function (root) {
  'use strict';

  var MAJOR = {
    C: ['C', 'G', 'Am', 'F'],
    G: ['G', 'D', 'Em', 'C'],
    D: ['D', 'A', 'Bm', 'G'],
    A: ['A', 'E', 'F#m', 'D'],
    E: ['E', 'B7', 'A', 'E'],
    F: ['F', 'C', 'Dm', 'Bb'],
    Bb: ['Bb', 'F', 'Gm', 'Bb'],
    B: ['B7', 'E', 'A', 'B7']
  };

  var MINEUR = {
    Am: ['Am', 'F', 'C', 'G'],
    Em: ['Em', 'C', 'G', 'D'],
    Dm: ['Dm', 'Bb', 'F', 'C'],
    Gm: ['Gm', 'Bb', 'F', 'Gm'],
    Cm: ['Cm', 'Fm', 'Bb', 'Cm'],
    Bm: ['Bm', 'G', 'D', 'A'],
    Fm: ['Fm', 'Bb', 'Cm', 'Fm'],
    'F#m': ['F#m', 'D', 'A', 'E']
  };

  // 'C', 'c', 'C majeur', 'a mineur', 'Am', 'A min' → 'C' of 'Am'.
  function schoonToonsoort(naam) {
    var t = String(naam || '').trim();
    if (!t) return '';
    var mineur = /m|mineur|min|minor/i.test(t.replace(/^[A-Ga-g][#b]?/, ''));
    var grond = t.match(/^[A-Ga-g][#b]?/);
    if (!grond) return '';
    var letter = grond[0].charAt(0).toUpperCase() + grond[0].slice(1);
    return mineur ? letter + 'm' : letter;
  }

  function tabelVoor(toonsoort) {
    var t = schoonToonsoort(toonsoort);
    if (!t) return { reeks: MAJOR.C, toonsoort: 'C', mineur: false };
    if (MINEUR[t]) return { reeks: MINEUR[t], toonsoort: t, mineur: true };
    if (MAJOR[t]) return { reeks: MAJOR[t], toonsoort: t, mineur: false };
    // Staat de toonaard niet in de tabel (bijvoorbeeld Es of As): dan een schema in de
    // verwante, wel tekenen toonaard. De app laat de capo-advies zelf zien.
    var verwant = { Eb: 'Bb', Ab: 'F', Db: 'D', Gb: 'G', 'C#': 'D', 'F#': 'G', Gb_: 'G' };
    var naar = verwant[t.replace(/m$/, '')];
    if (naar && MAJOR[naar]) {
      return { reeks: MAJOR[naar], toonsoort: naar, mineur: false, van: t };
    }
    return { reeks: MAJOR.C, toonsoort: 'C', mineur: false, van: t };
  }

  // Het voorstel: een korte ronde van vier akkoorden die het liedje kan herhalen.
  function voorstelReeks(toonsoort) {
    var t = tabelVoor(toonsoort);
    return {
      akkoorden: t.reeks.slice(),
      toonsoort: t.toonsoort,
      mineur: !!t.mineur,
      gevraagd: schoonToonsoort(toonsoort) || '',
      verwisseld: !!t.van,
      voorstel: true
    };
  }

  // Is dit akkoord te tekenen zoals de app dat doet? (Als hulp bij het onderhoud van de tabel.)
  function tekenbaar(naam, grepen, theorie, capo) {
    try {
      var advies = capo.advies([naam], naam.replace(/m$/, ''));
      return (advies.akkoorden || []).every(function (a) { return a.heeftDiagram; });
    } catch (e) {
      return false;
    }
  }

  var reken = {
    voorstelReeks: voorstelReeks,
    schoonToonsoort: schoonToonsoort,
    tekenbaar: tekenbaar,
    MAJOR: MAJOR,
    MINEUR: MINEUR
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = reken;
  if (root) root.voorstelRekenen = reken;
})(typeof window !== 'undefined' ? window : null);
