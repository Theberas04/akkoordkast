// De rekenkant van de stemmer: uit een stukje geluid de toonhoogte halen en zeggen bij welke
// snaar die hoort. Puur rekenwerk, zodat het te testen is zonder microfoon. De app haalt het
// geluid op via WebAudio en laat de uitslag zien; hier staat alleen het rekenen.
//
// Dezelfde rekenkunde gebruikt de app in de browser (zie public/index.html); daar is geen
// module.exports maar een gewoon object op window, net als bij de metronoom.

// Let op: dit bestand draait ook als script in de pagina, naast de code van de app zelf. Alles
// staat daarom in een eigen afsluiting: de app heeft zelf al een SNAREN (de knoppen van de
// stemhulp) en een tweede aangifte op het hoogste niveau laat het hele bestand stuklopen.
(function (root) {
'use strict';

// De snaren van een gitaar in standaardstemming, van dik naar dun.
const SNAREN = [
  { naam: 'E', dik: 'dikste snaar', midi: 40 },
  { naam: 'A', dik: 'tweede snaar', midi: 45 },
  { naam: 'D', dik: 'derde snaar', midi: 50 },
  { naam: 'G', dik: 'vierde snaar', midi: 55 },
  { naam: 'B', dik: 'vijfde snaar', midi: 59 },
  { naam: 'e', dik: 'dunste snaar', midi: 64 }
];

// Hoeveel cent iemand er naast zit om nog "gestemd" te heten. Vijf cent hoort bijna niemand,
// dus dat is streng genoeg om goed te stemmen en ruim genoeg om niet te blijven wiebelen.
const GOED_CENTEN = 5;

function frequentieVanMidi(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// Het verschil in cent tussen twee frequenties. Honderd cent is een halve toon.
function centenTussen(frequentie, doel) {
  return 1200 * Math.log2(frequentie / doel);
}

// Hoe hard klinkt het stukje? Stilte levert geen toonhoogte op, dus dit is de eerste zeef.
function sterkteVan(monsters) {
  if (!monsters || !monsters.length) return 0;
  let som = 0;
  for (let i = 0; i < monsters.length; i++) som += monsters[i] * monsters[i];
  return Math.sqrt(som / monsters.length);
}

// De toonhoogte uit een stukje geluid halen met een genormaliseerde autocorrelatie: we zoeken
// hoelang het geluid erover doet om zichzelf te herhalen. Dat is de periode van de toon, en
// daaruit volgt de frequentie.
//
// Twee dingen die er echt toe doen bij een gitaar:
// - we nemen de *eerste* sterke piek, niet de hoogste. Anders pakt de app een boventoon (het
//   octaaf erboven) als die toevallig sterker is, en dat is precies de fout die een stemmer
//   onbruikbaar maakt;
// - tussen twee monsters door rekenen we de piek bij (parabolisch), anders is de uitslag per
//   snaar al snel een paar cent te grof.
function toonhoogteUit(monsters, sampleRate, opties) {
  opties = opties || {};
  if (!monsters || !monsters.length || !sampleRate) return null;
  const minFrequentie = opties.minFrequentie || 60;      // lager dan de dikste E kan niet
  const maxFrequentie = opties.maxFrequentie || 1400;    // hoger dan de dunste e kan niet
  const drempel = opties.drempel || 0.9;                 // hoe sterk de piek moet zijn
  const minSterkte = opties.minSterkte || 0.008;         // hieronder is het stilte of geruis

  const sterkte = sterkteVan(monsters);
  if (sterkte < minSterkte) return null;

  // De gelijkspanning eraf halen, anders verstoort een gelijkstroompje de correlatie.
  const n = monsters.length;
  let gemiddelde = 0;
  for (let i = 0; i < n; i++) gemiddelde += monsters[i];
  gemiddelde /= n;
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) x[i] = monsters[i] - gemiddelde;

  const minLag = Math.max(2, Math.floor(sampleRate / maxFrequentie));
  const maxLag = Math.min(n - 2, Math.ceil(sampleRate / minFrequentie));
  if (maxLag <= minLag) return null;

  // Genormaliseerde autocorrelatie: 1 betekent "precies hetzelfde als hiervoor", 0 niet.
  const acf = new Float64Array(maxLag + 2);
  for (let lag = minLag; lag <= maxLag + 1; lag++) {
    let som = 0, links = 0, rechts = 0;
    for (let i = 0; i + lag < n; i++) {
      som += x[i] * x[i + lag];
      links += x[i] * x[i];
      rechts += x[i + lag] * x[i + lag];
    }
    acf[lag] = (links > 0 && rechts > 0) ? som / Math.sqrt(links * rechts) : 0;
  }

  let hoogste = 0;
  for (let lag = minLag; lag <= maxLag; lag++) if (acf[lag] > hoogste) hoogste = acf[lag];
  if (hoogste < drempel) return null;

  // De eerste piek die boven de drempel uitkomt is de periode van de grondtoon.
  const grens = hoogste * drempel;
  let lag = -1;
  for (let l = minLag + 1; l < maxLag; l++) {
    if (acf[l] >= acf[l - 1] && acf[l] >= acf[l + 1] && acf[l] >= grens) { lag = l; break; }
  }
  if (lag < 0) return null;

  // Tussen twee monsters door de top opzoeken (parabolisch), voor een scherper resultaat.
  const y1 = acf[lag - 1], y2 = acf[lag], y3 = acf[lag + 1];
  const noemer = 2 * (2 * y2 - y1 - y3);
  const verschuiving = noemer ? Math.max(-1, Math.min(1, (y3 - y1) / noemer)) : 0;
  const frequentie = sampleRate / (lag + verschuiving);
  if (!isFinite(frequentie) || frequentie <= 0) return null;
  return { frequentie: frequentie, duidelijkheid: y2, sterkte: sterkte };
}

// Bij welke snaar hoort deze toon, en hoeveel zit hij ernaast?
function snaarBij(frequentie, snaren) {
  const lijst = snaren || SNAREN;
  let beste = null;
  lijst.forEach(function (snaar) {
    const centen = centenTussen(frequentie, frequentieVanMidi(snaar.midi));
    if (!beste || Math.abs(centen) < Math.abs(beste.centen)) beste = { snaar: snaar, centen: centen };
  });
  return beste;
}

// De hele uitslag in één keer: welke snaar, hoeveel cent ernaast, en of het goed genoeg is.
function uitslagVan(monsters, sampleRate, opties) {
  opties = opties || {};
  const toon = toonhoogteUit(monsters, sampleRate, opties);
  if (!toon) return null;
  const bij = snaarBij(toon.frequentie, opties.snaren);
  if (!bij) return null;
  const centen = bij.centen;
  return {
    frequentie: toon.frequentie,
    duidelijkheid: toon.duidelijkheid,
    sterkte: toon.sterkte,
    snaar: bij.snaar,
    centen: centen,
    gestemd: Math.abs(centen) <= (opties.goedCenten || GOED_CENTEN)
  };
}

const reken = {
  SNAREN: SNAREN,
  GOED_CENTEN: GOED_CENTEN,
  frequentieVanMidi: frequentieVanMidi,
  centenTussen: centenTussen,
  sterkteVan: sterkteVan,
  toonhoogteUit: toonhoogteUit,
  snaarBij: snaarBij,
  uitslagVan: uitslagVan
};

if (typeof module !== 'undefined' && module.exports) module.exports = reken;
if (root) root.stemmenRekenen = reken;

})(typeof window !== 'undefined' ? window : null);
