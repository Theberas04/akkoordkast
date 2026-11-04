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
var STILTE = 0.012;     // onder dit niveau is het niet meer dan kamerruis
var SPRONG = 0.6;       // de sterkte moet in één stukje minstens dit deel groter worden
var LANG_SPRONG = 0.25; // en ook over een lang venster (vier stukjes) nog dit deel groter worden
var LANG_VENSTER = 4;   // aantal stukjes waarover het lange venster loopt (vier keer 512 monsters)
var FLUX_DREMPEL = 2.2; // een aanslag moet dit deel boven het omgevingsniveau in het spectrum uitkomen
var FLUX_VENSTER = 30;  // aantal beeldjes waarover we het omgevingsniveau in het spectrum meten
var FLUX_STILTE = 1.5; // onder dit niveau in het spectrum is het niet meer dan kamerruis
var FLUX_MINIMAAL = 5;  // zoveel beeldjes geschiedenis hebben we nodig voor het omgevingsniveau
var FLUX_PIEK = 0.3;    // een aanslag moet minstens dit deel zijn van de sterkste aanslag van net
var FLUX_OMHOOG = 2;    // aantal beeldjes links en rechts waarbinnen de aanslag de hoogste moet zijn
var FLUX_TERUG = 12;    // aantal beeldjes waarover we naar de sterkste aanslag van net kijken
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

// Dezelfde sterkte, maar gemiddeld over een langer venster (LANG_VENSTER stukjes). Dit is het
// venster waarop we beslissen of er echt iets gebeurt: laag geluid dat in het korte venster heen
// en weer springt, staat hier vlak.
function langVensterVan(energie) {
  var uit = new Float32Array(energie.length);
  var som = 0;
  for (var i = 0; i < energie.length; i++) {
    som += energie[i] * energie[i];
    if (i >= LANG_VENSTER) som -= energie[i - LANG_VENSTER] * energie[i - LANG_VENSTER];
    var aantal = Math.min(i + 1, LANG_VENSTER);
    uit[i] = Math.sqrt(som / aantal);
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

  // Een slag herkennen we op twee vensters tegelijk. Het korte venster (een stukje van 512
  // monsters, elf milliseconden) vertelt wanneer je sloeg; het lange venster (vier stukjes, zevenen-
  // veertig milliseconden) vertelt of het echt een slag was.
  //
  // Dat tweede venster is nodig tegen laag geluid: een brom van vijftig hertz past bijna twee keer
  // in het korte venster, waardoor de sterkte per stukje heen en weer springt zonder dat er iets
  // gebeurt. In het lange venster middelt dat weg, terwijl een aangeslagen snaar of een klap ook
  // daar een flinke sprong maakt. Gewone ruis wiebelt in geen van beide vensters meer dan een paar
  // procent. Een slag die je zacht slaat in een rumoerige kamer halen we er niet uit, en dat is
  // eerlijk: die is boven het lawaai ook niet te horen.
  var lang = langVensterVan(energie);
  var kandidaten = [];
  for (var k = LANG_VENSTER; k < energie.length; k++) {
    if (energie[k] < STILTE) continue;
    var ervoor = energie[k - 1];
    if ((energie[k] - ervoor) / Math.max(ervoor, STILTE) < SPRONG) continue;
    var langErvoor = lang[k - 1];
    if ((lang[k] - langErvoor) / Math.max(langErvoor, STILTE) < LANG_SPRONG) continue;
    var sterkte = Math.round(energie[k] / hoogste * 1000) / 1000;
    if (sterkte > 1) sterkte = 1;
    kandidaten.push({ tijd: k * BLOK / sampleRate, sterkte: sterkte });
  }
  // Een snaar die precies op het eerste stukje al klinkt heeft geen stukje ervoor om mee te
  // vergelijken; die pikken we er los uit als hij duidelijk boven de stukjes daarna uitkomt.
  if (energie[0] >= STILTE && energie.length > LANG_VENSTER) {
    var somDaarna = 0;
    for (var d = 1; d <= LANG_VENSTER; d++) somDaarna += energie[d];
    if (energie[0] >= 2 * (somDaarna / LANG_VENSTER)) {
      kandidaten.unshift({ tijd: 0, sterkte: Math.min(1, Math.round(energie[0] / hoogste * 1000) / 1000) });
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

// ------------------------------------------- slagen in het spectrum ---
// De sterkte alleen is niet genoeg. Bij een snel slagpatroon klinkt de vorige snaar nog door als je
// de volgende al slaat, en dan verandert de sterkte bijna niet: met een drempel op de sterkte miste
// de app drie van de acht slagen. Een aanslag is wel goed te zien in het spectrum, want een
// plectrum of nagel zet er breedbandige energie bij: over bijna alle frequenties komt er wat bij.
//
// De browser geeft het spectrum per beeldje als getallen van 0 tot 255 (de analyser van de
// WebAudio-kaart). Het verschil tussen twee beeldjes noemen we de flux: alleen de stijgingen tellen
// mee, want een klank die uitsterft is geen nieuwe slag.

// De flux tussen twee spectrumbeeldjes: alles wat er per frequentiebak bijkomt, gedeeld door het
// aantal bakken. Stilte en ruis schommelen maar een beetje; een aanslag geeft een flinke sprong.
function fluxTussen(nu, vorige) {
  if (!nu || !nu.length) return 0;
  var som = 0;
  for (var i = 0; i < nu.length; i++) {
    var verschil = nu[i] - (vorige && vorige.length === nu.length ? vorige[i] : 0);
    if (verschil > 0) som += verschil;
  }
  return som / nu.length;
}

// Waar zaten de aanslagen? We vergelijken elk beeldje met het omgevingsniveau van de beeldjes
// ervoor (de middelste waarde, zodat één uitschieter het niveau niet meteen opjaagt). Een aanslag
// moet daar FLUX_DREMPEL keer bovenuit komen, boven het kamerruis uitkomen en een stijging zijn.
// Twee aanslagen dichter dan MIN_AFSTAND bij elkaar horen bij elkaar: houd de sterkste.
function slagenUitFlux(punten) {
  if (!punten || punten.length <= FLUX_MINIMAAL) return [];
  var kandidaten = [];
  for (var i = FLUX_MINIMAAL; i < punten.length; i++) {
    var waarde = punten[i].flux;
    if (waarde < FLUX_STILTE) continue;
    // Een aanslag is een plaatselijke piek: de beeldjes direct links en rechts mogen niet hoger
    // zijn. Zonder deze eis leverde de naklank van een aangeslagen snaar nog fluxpieken op, en dan
    // telt de app één slag twee keer.
    var piek = true;
    for (var o = Math.max(0, i - FLUX_OMHOOG); o <= i + FLUX_OMHOOG && o < punten.length; o++) {
      if (punten[o].flux > waarde) { piek = false; break; }
    }
    if (!piek) continue;
    // Het omgevingsniveau: de middelste waarde van de beeldjes ervoor (zodat één uitschieter het
    // niveau niet meteen opjaagt).
    var venster = [];
    for (var k = Math.max(0, i - FLUX_VENSTER); k < i; k++) venster.push(punten[k].flux);
    venster.sort(function (a, b) { return a - b; });
    var midden = venster[Math.floor(venster.length / 2)];
    var niveau = Math.max(midden, 0.0001);
    if (waarde < niveau * FLUX_DREMPEL) continue;
    // En hij moet in de buurt komen van de sterkste aanslag van net: een aanslag is veel harder dan
    // de naklank die er nog staat.
    var sterkste = 0;
    for (var m = Math.max(0, i - FLUX_TERUG); m < i; m++) if (punten[m].flux > sterkste) sterkste = punten[m].flux;
    if (sterkste > 0 && waarde < sterkste * FLUX_PIEK) continue;
    var sterkte = Math.round(waarde / niveau / 4 * 1000) / 1000;
    if (sterkte > 1) sterkte = 1;
    kandidaten.push({ tijd: punten[i].tijd, sterkte: sterkte });
  }
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
  STILTE: STILTE,
  SPRONG: SPRONG,
  LANG_SPRONG: LANG_SPRONG,
  LANG_VENSTER: LANG_VENSTER,
  FLUX_DREMPEL: FLUX_DREMPEL,
  FLUX_VENSTER: FLUX_VENSTER,
  FLUX_STILTE: FLUX_STILTE,
  FLUX_PIEK: FLUX_PIEK,
  langVensterVan: langVensterVan,
  fluxTussen: fluxTussen,
  slagenUitFlux: slagenUitFlux,
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
