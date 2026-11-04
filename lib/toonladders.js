// De rekenkant van de toonladders: uit een grondtoon en een ladder de noten halen, en die
// noten op de gitaarhals aanwijzen. Puur rekenwerk, zodat het te testen is zonder gitaar.
// De app laat de uitslag op de hals zien; hier staat alleen het rekenen zelf.
//
// Dezelfde rekenkunde gebruikt de app in de browser (zie public/index.html); daar is geen
// module.exports maar een gewoon object op window, net als bij de stemmer en de metronoom.

// Let op: dit bestand draait ook als script in de pagina, naast de code van de app zelf. Alles
// staat daarom in een eigen afsluiting: een aangifte op het hoogste niveau botst met de namen
// van de app en laat dan het hele bestand stuklopen.
(function (root) {
'use strict';

// De twaalf toonnamen met kruizen. Mollen (Bb, Eb en zo) worden naar deze namen teruggerekend,
// zodat een noot altijd één vaste naam heeft.
var TOONNAMEN = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// De snaren van een gitaar in standaardstemming, van dik naar dun. Snaar 0 is de dikste E.
var STANDAARD_STEMMING = [40, 45, 50, 55, 59, 64];

// De vijf ladders die de app kent. Stappen zijn halve tonen boven de grondtoon.
var LADDERS = [
  { naam: 'majeur', kort: 'De gewone ladder: vrolijk en volledig.', stappen: [0, 2, 4, 5, 7, 9, 11] },
  { naam: 'mineur', kort: 'De treurige ladder, met een kleine terts en een kleine sext.', stappen: [0, 2, 3, 5, 7, 8, 10] },
  { naam: 'pentatonisch majeur', kort: 'Vijf noten uit majeur, makkelijk om overheen te spelen.', stappen: [0, 2, 4, 7, 9] },
  { naam: 'pentatonisch mineur', kort: 'Vijf noten uit mineur: de ladder voor blues en rock.', stappen: [0, 3, 5, 7, 10] },
  { naam: 'blues', kort: 'Pentatonisch mineur met een extra blauwe noot erbij.', stappen: [0, 3, 5, 6, 7, 10] }
];

// Welke toonklasse hoort bij een letter. De klasse is het aantal halve tonen boven de C.
var LETTERKLASSE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

// De toonnaam van een midi-noot, zonder octaaf, altijd met kruizen.
function naamVan(midi) {
  if (typeof midi !== 'number' || !isFinite(midi)) return '';
  var i = ((Math.round(midi) % 12) + 12) % 12;
  return TOONNAMEN[i];
}

// De toonklasse van een grondtoonnaam. We accepteren kruizen én mollen, en hoofdletter of
// kleine letter maakt niet uit. Een naam die we niet kennen levert null op.
function grondtoonNaarKlasse(naam) {
  if (typeof naam !== 'string') return null;
  var schoon = naam.trim();
  if (!schoon) return null;
  var letter = schoon.charAt(0).toUpperCase();
  if (!(letter in LETTERKLASSE)) return null;
  var rest = schoon.slice(1).toLowerCase();
  var klasse = LETTERKLASSE[letter];
  var i;
  for (i = 0; i < rest.length; i++) {
    if (rest.charAt(i) === '#') klasse += 1;
    else if (rest.charAt(i) === 'b') klasse -= 1;
    else return null;
  }
  return ((klasse % 12) + 12) % 12;
}

// De ladder met deze naam, of null als we hem niet kennen.
function ladderVan(naam) {
  for (var i = 0; i < LADDERS.length; i++) {
    if (LADDERS[i].naam === naam) return LADDERS[i];
  }
  return null;
}

// Alle noten van een ladder op een grondtoon, oplopend, van octaaf 3 (C3 is midi 48) tot en met
// de grondtoon `octaven` octaven hoger. In het midden komen de ladderstappen er per octaaf bij.
// De lengte is dus precies stappen maal octaven plus één. Onbekende grondtoon of ladder: leeg.
function notenVan(grondtoon, ladderNaam, octaven) {
  var klasse = grondtoonNaarKlasse(grondtoon);
  if (klasse === null) return [];
  var ladder = ladderVan(ladderNaam);
  if (!ladder) return [];

  var aantal = (octaven === undefined || octaven === null) ? 2 : Math.floor(octaven);
  if (!isFinite(aantal) || aantal < 1) aantal = 1;   // minimaal één octaaf
  if (aantal > 4) aantal = 4;                          // en nooit meer dan vier

  var start = 48 + klasse;
  var noten = [];
  var o, s;
  for (o = 0; o < aantal; o++) {
    for (s = 0; s < ladder.stappen.length; s++) {
      noten.push(start + o * 12 + ladder.stappen[s]);
    }
  }
  noten.push(start + aantal * 12);
  return noten;
}

// Waar liggen deze noten op de hals? Elke noot wordt op elke snaar gezocht; alleen een vak dat
// tussen nul en hoogsteVak past telt mee. Uitkomst: gesorteerd op snaar en dan op vak, en elk
// (snaar, vak)-paar maar één keer.
function positiesOpHals(noten, opties) {
  opties = opties || {};
  var hoogsteVak = (opties.hoogsteVak === undefined) ? 12 : opties.hoogsteVak;
  var stemming = opties.stemming || STANDAARD_STEMMING;
  var uit = [];
  var gezien = {};
  if (!noten || !noten.length || !stemming || !stemming.length) return uit;

  var n, snaar, midi, vak, sleutel;
  for (n = 0; n < noten.length; n++) {
    midi = noten[n];
    if (typeof midi !== 'number' || !isFinite(midi) || Math.floor(midi) !== midi) continue;
    for (snaar = 0; snaar < stemming.length; snaar++) {
      vak = midi - stemming[snaar];
      if (vak < 0 || vak > hoogsteVak) continue;
      sleutel = snaar + ':' + vak;
      if (gezien[sleutel]) continue;
      gezien[sleutel] = true;
      uit.push({ snaar: snaar, vak: vak, midi: midi, naam: naamVan(midi) });
    }
  }

  uit.sort(function (a, b) { return a.snaar - b.snaar || a.vak - b.vak; });
  return uit;
}

var reken = {
  TOONNAMEN: TOONNAMEN,
  STANDAARD_STEMMING: STANDAARD_STEMMING,
  LADDERS: LADDERS,
  naamVan: naamVan,
  grondtoonNaarKlasse: grondtoonNaarKlasse,
  ladderVan: ladderVan,
  notenVan: notenVan,
  positiesOpHals: positiesOpHals
};

if (typeof module !== 'undefined' && module.exports) module.exports = reken;
if (root) root.toonladderRekenen = reken;

})(typeof window !== 'undefined' ? window : null);
