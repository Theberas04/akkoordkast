// Noten lezen: waar staat een noot op de notenbalk, hoe heet hij, en waar zit hij op de hals?
//
// De eerste positie op de gitaar: de open snaren en de eerste vier vakken. De app schrijft de
// noten zoals ze klinken (een noot op midi 64 staat op de onderste lijn van de balk), dus wat je
// op de balk leest, is precies de toon die je op de hals pakt.
(function (root) {
  'use strict';

  var SNAREN = [40, 45, 50, 55, 59, 64];        // de dikke E tot de dunne e, als klinkende midi
  var SNARE_NAMEN = ['E', 'A', 'D', 'G', 'B', 'e'];
  var NAMEN = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  var STAMTONEN = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  var LAAGSTE = 52;                              // E3
  var HOOGSTE = 76;                              // E5

  function naam(midi) { return NAMEN[((Number(midi) % 12) + 12) % 12]; }
  function octaaf(midi) { return Math.floor(Number(midi) / 12) - 1; }
  function metOctaaf(midi) { return naam(midi) + octaaf(midi); }
  function isStamtoon(midi) { return naam(midi).length === 1; }

  // Alle plaatsen in de eerste positie: snaar (0 = dikke E) en vak (0 = los).
  function eerstePositie(maxVak) {
    var tot = maxVak === undefined ? 4 : Number(maxVak);
    var uit = [];
    for (var s = 0; s < SNAREN.length; s++) {
      for (var v = 0; v <= tot; v++) {
        var midi = SNAREN[s] + v;
        uit.push({
          snaar: s, snaarNaam: SNARE_NAMEN[s], vak: v, midi: midi,
          naam: naam(midi), metOctaaf: metOctaaf(midi)
        });
      }
    }
    return uit;
  }

  // De noten van de eerste positie, één per klank. Zit dezelfde klank op twee snaren, dan houden
  // we de makkelijkste plaats aan: een losse snaar eerst, dan het laagste vak.
  function notenInBereik(laagste, hoogste, opties) {
    var o = opties || {};
    var van = laagste === undefined || laagste === null ? LAAGSTE : Number(laagste);
    var tot = hoogste === undefined || hoogste === null ? HOOGSTE : Number(hoogste);
    var perKlink = {};
    eerstePositie(o.maxVak).forEach(function (p) {
      if (p.midi < van || p.midi > tot) return;
      if (o.alleenStamtonen && !isStamtoon(p.midi)) return;
      var bestaand = perKlink[p.midi];
      if (!bestaand || p.vak < bestaand.vak) perKlink[p.midi] = p;
    });
    return Object.keys(perKlink).map(function (m) { return perKlink[m]; })
      .sort(function (a, b) { return a.midi - b.midi; });
  }

  // Waar zit deze klank op de hals? Alle plaatsen in de eerste positie.
  function plaatsenVan(midi) {
    var nummer = Number(midi);
    return eerstePositie().filter(function (p) { return p.midi === nummer; });
  }

  // Een reeks vragen; niet meteen twee keer dezelfde noot achter elkaar.
  function maakVragen(aantal, opties) {
    var o = opties || {};
    var noten = notenInBereik(o.laagste, o.hoogste, { alleenStamtonen: o.alleenStamtonen !== false, maxVak: o.maxVak });
    var uit = [];
    if (!noten.length) return uit;
    var vorige = -1;
    for (var i = 0; i < Number(aantal || 1); i++) {
      var kies = Math.floor(Math.random() * noten.length);
      if (noten.length > 1 && kies === vorige) kies = (kies + 1) % noten.length;
      vorige = kies;
      uit.push(noten[kies]);
    }
    return uit;
  }

  // De knoppen waaruit je kunt kiezen: de stamtonen. Is de vraag een kruis of een mol (die
  // zitten in de eerste positie wel op de hals), dan doen die namen ook mee.
  function antwoordNamen(midi) {
    if (isStamtoon(midi)) return STAMTONEN.slice();
    return STAMTONEN.concat([naam(midi)]).sort();
  }

  function isGoed(midi, antwoord) { return naam(midi) === String(antwoord || '').trim(); }

  // Hoe zeg je het als het goed of fout was?
  function uitleg(plaats) {
    if (!plaats) return '';
    var waar = plaats.vak === 0
      ? 'de losse ' + plaats.snaarNaam + '-snaar'
      : 'de ' + plaats.snaarNaam + '-snaar, vak ' + plaats.vak;
    return 'Dat is de ' + plaats.metOctaaf + ' — ' + waar + '.';
  }

  var reken = {
    naam: naam,
    octaaf: octaaf,
    metOctaaf: metOctaaf,
    isStamtoon: isStamtoon,
    eerstePositie: eerstePositie,
    notenInBereik: notenInBereik,
    plaatsenVan: plaatsenVan,
    maakVragen: maakVragen,
    antwoordNamen: antwoordNamen,
    isGoed: isGoed,
    uitleg: uitleg,
    SNARE_NAMEN: SNARE_NAMEN,
    STAMTONEN: STAMTONEN
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = reken;
  if (root) root.notenRekenen = reken;
})(typeof window !== 'undefined' ? window : null);
