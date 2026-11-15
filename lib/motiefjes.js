// De rekenkant van "Nazingen & naspelen": een kort motiefje bedenken en beoordelen wat er
// terugkwam uit de microfoon. Puur rekenwerk, zodat het te testen is zonder geluid.
// Dezelfde rekenkunde gebruikt de app in de browser (zie public/index.html); daar is geen
// module.exports maar een gewoon object op window, net als bij de stemmer en de ritme-trainer.
(function (root) {
'use strict';

// De toonsoorten waaruit je kunt kiezen: de majeurtoonladder van die grondtoon, rond het midden
// van de gitaar (C4 = 60). Alleen natuurtonen, zodat er geen kruizen of mollen langskomen.
var TOONSOORTEN = { C: 60, D: 62, E: 64, G: 67, A: 69 };
var TRAPPEN = [0, 2, 4, 5, 7, 9, 11, 12];   // majeur
var NAMEN = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function naamVan(midi) {
  var m = Math.round(Number(midi));
  return NAMEN[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
}

// Van frequentie naar de dichtstbijzijnde noot.
function midiVanFrequentie(frequentie) {
  var f = Number(frequentie);
  if (!f || f <= 0) return null;
  return Math.round(69 + 12 * Math.log2(f / 440));
}

// Klein, vast toeval (mulberry32): dezelfde kiem geeft altijd hetzelfde motiefje — daarmee
// kunnen de proeven en de demo een motiefje vooraf kennen.
function toeval(kiem) {
  var s = (Math.floor(Number(kiem)) || 1) >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    var t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Een motiefje: stappen over de ladder, meestal één trap op of af en af en toe een sprong van
// twee — zo klinkt het muzikaal en blijft het nazingbaar. Zonder kiem wordt het elke keer anders.
function motiefNoten(opties) {
  var o = opties || {};
  var grond = TOONSOORTEN[o.toonsoort] || TOONSOORTEN.C;
  var ladder = TRAPPEN.map(function (t) { return grond + t; });
  var aantal = Math.max(2, Math.min(6, Number(o.aantal) || 4));
  var kiem = (o.seed === undefined || o.seed === null) ? ((Date.now() % 100000) + 1) : o.seed;
  var rnd = toeval(kiem);
  var uit = [];
  var plek = Math.floor(rnd() * 4);
  uit.push(ladder[plek]);
  for (var i = 1; i < aantal; i++) {
    var stap = rnd() < 0.72 ? (rnd() < 0.5 ? -1 : 1) : (rnd() < 0.5 ? -2 : 2);
    plek = plek + stap;
    if (plek < 0) plek = Math.min(1, ladder.length - 1);
    if (plek > ladder.length - 1) plek = Math.max(0, ladder.length - 2);
    uit.push(ladder[plek]);
  }
  return uit;
}

// Wat hoorde de app terug? Per doel-noot kijken we of er in het gehoorde rijtje — op of na de
// vorige treffer, en hooguit twee plekken verder — een noot zit die er hooguit een halve toon
// naast zit. Zo telt een uitglijder niet meteen als fout, maar een verkeerde volgorde wel.
//
// Eén plek overslaan (een snaar die je extra aantikt) mag — maar alleen als die twee aanslagen
// dicht bij elkaar zitten. Zonder die tijdsgrens zou een nieuwe poging de fout van de vorige
// toedekken: de eerste noot van een tweede ronde "paste" dan op de gemiste noot van de eerste.
var SKIP_MAX_SECONDEN = 1.2;

function kernVan(rij) {
  return (Array.isArray(rij) ? rij : []).map(function (x) {
    if (x && typeof x === 'object') {
      return { midi: x.midi, tijd: (typeof x.tijd === 'number') ? x.tijd : null };
    }
    return { midi: x, tijd: null };
  });
}

function vergelijk(doel, gehoord) {
  var d = Array.isArray(doel) ? doel : [];
  var g = kernVan(gehoord);
  var per = [];
  var goed = 0;
  var zoek = 0;
  for (var i = 0; i < d.length; i++) {
    var treffer = -1;
    for (var j = zoek; j < g.length && j < zoek + 2; j++) {
      if (Math.abs(g[j].midi - d[i]) > 1) continue;
      // Overslaan? Dan moeten de twee aanslagen bij elkaar in de buurt liggen (dezelfde frase).
      if (j > zoek && g[zoek].tijd !== null && g[j].tijd !== null &&
          (g[j].tijd - g[zoek].tijd) > SKIP_MAX_SECONDEN) continue;
      treffer = j; break;
    }
    if (treffer >= 0) { per.push({ doel: d[i], goed: true }); goed++; zoek = treffer + 1; }
    else per.push({ doel: d[i], goed: false });
  }
  var oordeel = !d.length ? 'opnieuw'
    : goed === d.length ? 'goed'
    : goed >= Math.ceil(d.length * 0.6) ? 'bijna' : 'opnieuw';
  return { goed: goed, totaal: d.length, per: per, oordeel: oordeel };
}

var reken = {
  TOONSOORTEN: TOONSOORTEN,
  TRAPPEN: TRAPPEN,
  SKIP_MAX_SECONDEN: SKIP_MAX_SECONDEN,
  naamVan: naamVan,
  midiVanFrequentie: midiVanFrequentie,
  toeval: toeval,
  motiefNoten: motiefNoten,
  vergelijk: vergelijk
};

if (typeof module !== 'undefined' && module.exports) module.exports = reken;
if (root) root.motiefRekenen = reken;

})(typeof window !== 'undefined' ? window : null);
