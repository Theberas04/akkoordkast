// De rekenkant van de ritme-trainer: uit een stukje geluid de slagen halen en zeggen of je
// op de maat speelt. Puur rekenwerk, zodat het te testen is zonder microfoon. De app haalt
// het geluid op via WebAudio en laat de uitslag zien; hier staat alleen het rekenen.
//
// Dezelfde rekenkunde gebruikt de app in de browser (zie public/index.html); daar is geen
// module.exports maar een gewoon object op window, net als bij de stemmer en de metronoom.

// Let op: dit bestand draait ook als script in de pagina, naast de code van de app zelf. Alles
// staat daarom in een eigen afsluiting: een aangifte op het hoogste niveau botst met de pagina
// die dit bestand ook als gewoon script laadt.
(function (root) {
'use strict';

// De vaste getallen van de ritme-trainer.
var DREMPEL = 0.018;    // minimale sprong in geluidssterkte voor een slag
var MIN_AFSTAND = 0.12; // seconden: twee slagen dichter bij elkaar tellen als één slag
var GOED_MS = 90;       // binnen hoeveel milliseconden een slag "op de maat" is
var BLOK = 512;         // aantal monsters per stukje waarover we de sterkte meten

// De sterkte per stukje: de wortel uit het gemiddelde kwadraat (RMS) van elk blok van BLOK
// monsters. Zo zie je in één oogopslag waar er geslagen wordt.
function energieVan(mono) {
  var lengte = (mono && mono.length) ? Math.floor(mono.length / BLOK) : 0;
  var uit = new Float32Array(lengte);
  for (var i = 0; i < lengte; i++) {
    var begin = i * BLOK;
    var som = 0;
    for (var j = 0; j < BLOK; j++) {
      var monster = mono[begin + j];
      som += monster * monster;
    }
    uit[i] = Math.sqrt(som / BLOK);
  }
  return uit;
}

// De momenten waarop je slaat. We kijken per stukje of de sterkte ineens omhoog schiet ten
// opzichte van het stukje ervoor; dat is het begin van een slag.
function slagenVan(mono, sampleRate) {
  var energie = energieVan(mono);
  if (!energie.length) return [];

  var hoogste = 0;
  for (var i = 0; i < energie.length; i++) if (energie[i] > hoogste) hoogste = energie[i];
  if (hoogste === 0) return [];

  // Een stukje is een slag als de sterkte minstens DREMPEL * hoogste boven die van het stukje
  // ervoor uitkomt (een stijging dus) en zelf niet te zacht is.
  var kandidaten = [];
  for (var k = 1; k < energie.length; k++) {
    var sprong = energie[k] - energie[k - 1];
    if (sprong >= DREMPEL * hoogste && energie[k] >= 0.08 * hoogste) {
      var sterkte = Math.round(energie[k] / hoogste * 1000) / 1000;
      if (sterkte > 1) sterkte = 1;
      kandidaten.push({ tijd: k * BLOK / sampleRate, sterkte: sterkte });
    }
  }

  // Twee slagen dichter dan MIN_AFSTAND seconden bij elkaar horen bij elkaar: houd de sterkste.
  var uit = [];
  for (var m = 0; m < kandidaten.length; m++) {
    var laatste = uit.length ? uit[uit.length - 1] : null;
    if (laatste && kandidaten[m].tijd - laatste.tijd < MIN_AFSTAND) {
      if (kandidaten[m].sterkte > laatste.sterkte) uit[uit.length - 1] = kandidaten[m];
    } else {
      uit.push(kandidaten[m]);
    }
  }
  return uit;
}

// Bij welke tel hoort dit tijdstip? Tel 1 valt op het tijdstip vanaf en daarna elke 60/bpm
// seconden; na maat tellen we weer bij 1 verder.
function telVan(tijd, opties) {
  opties = opties || {};
  var bpm = opties.bpm || 60;
  var maat = opties.maat || 4;
  var vanaf = opties.vanaf || 0;
  var interval = 60 / bpm;
  var n = Math.round((tijd - vanaf) / interval);
  return ((n % maat) + maat) % maat + 1;
}

// Hoeveel milliseconden zit dit tijdstip naast de dichtstbijzijnde tel? Positief is te laat.
function afwijkingVan(tijd, opties) {
  opties = opties || {};
  var bpm = opties.bpm || 60;
  var vanaf = opties.vanaf || 0;
  var interval = 60 / bpm;
  var n = Math.round((tijd - vanaf) / interval);
  return (tijd - vanaf - n * interval) * 1000;
}

// De hele uitslag in één keer: per slag de tel en de afwijking, en daaruit hoeveel je op de
// maat zit, hoe ver je gemiddeld ernaast zit en of je vooral te vroeg of te laat bent.
function uitslagVan(slagen, opties) {
  opties = opties || {};
  var bpm = opties.bpm || 60;
  var maat = opties.maat || 4;
  var vanaf = opties.vanaf || 0;
  var goed = (opties.goed === undefined) ? GOED_MS : opties.goed;

  if (!slagen || !slagen.length) {
    return { aantal: 0, opMaat: 0, gemiddelde: 0, spreiding: 0, vroeg: 0, laat: 0, slagen: [] };
  }

  var interval = 60 / bpm;
  var lijst = [];
  var som = 0;
  var opMaatAantal = 0;
  var vroeg = 0;
  var laat = 0;
  for (var i = 0; i < slagen.length; i++) {
    var tijd = slagen[i].tijd;
    var n = Math.round((tijd - vanaf) / interval);
    var afwijking = Math.round((tijd - vanaf - n * interval) * 1000);
    var tel = ((n % maat) + maat) % maat + 1;
    lijst.push({ tijd: tijd, tel: tel, afwijking: afwijking });
    som += afwijking;
    if (Math.abs(afwijking) <= goed) opMaatAantal++;
    if (afwijking < -1) vroeg++;
    if (afwijking > 1) laat++;
  }

  var gemiddelde = som / lijst.length;
  var kwadraat = 0;
  for (var j = 0; j < lijst.length; j++) {
    var verschil = lijst[j].afwijking - gemiddelde;
    kwadraat += verschil * verschil;
  }

  return {
    aantal: lijst.length,
    opMaat: Math.round(opMaatAantal * 100 / lijst.length),
    gemiddelde: Math.round(gemiddelde),
    spreiding: Math.round(Math.sqrt(kwadraat / lijst.length)),
    vroeg: vroeg,
    laat: laat,
    slagen: lijst
  };
}

var reken = {
  DREMPEL: DREMPEL,
  MIN_AFSTAND: MIN_AFSTAND,
  GOED_MS: GOED_MS,
  BLOK: BLOK,
  energieVan: energieVan,
  slagenVan: slagenVan,
  uitslagVan: uitslagVan,
  telVan: telVan,
  afwijkingVan: afwijkingVan
};

if (typeof module !== 'undefined' && module.exports) module.exports = reken;
if (root) root.ritmeRekenen = reken;

})(typeof window !== 'undefined' ? window : null);
