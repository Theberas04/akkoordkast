'use strict';
// De rekenkant van de metronoom: tik-tempo en wanneer de klikken vallen. Puur rekenwerk,
// zodat het te testen is zonder geluid. De app laat de klikken horen via WebAudio.

const MIN_BPM = 40;
const MAX_BPM = 220;

function klem(waarde, min, max) {
  return Math.max(min, Math.min(max, waarde));
}

// Tik-tempo: je tikt een paar keer mee en de app rekent het tempo uit.
// Een lange stilte betekent opnieuw beginnen, en een dubbeltik (minder dan 120 ms) telt
// niet mee — anders zit je tempo ineens twee keer zo hoog.
function tapTempo(tijden, opties) {
  const o = opties || {};
  const maxTikken = o.maxTikken || 8;
  const stilteMs = o.stilteMs || 2500;
  const minMs = o.minMs || 120;
  const lijst = (tijden || []).map(Number).filter(t => Number.isFinite(t)).sort((a, b) => a - b);
  if (!lijst.length) return { bpm: 0, tikken: 0, tussenpozen: [] };

  const laatste = lijst[lijst.length - 1];
  const kort = [];
  for (let i = lijst.length - 1; i >= 0; i--) {
    if (laatste - lijst[i] > stilteMs) break;
    kort.unshift(lijst[i]);
    if (kort.length >= maxTikken) break;
  }

  const tussen = [];
  for (let i = 1; i < kort.length; i++) {
    const dt = kort[i] - kort[i - 1];
    if (dt >= minMs) tussen.push(dt);
  }
  if (!tussen.length) return { bpm: 0, tikken: kort.length, tussenpozen: [] };

  // Het gemiddelde van de tussenpozen, maar zonder uitschieters aan de hoge kant: wie
  // één keer te laat tikt, moet het tempo niet meteen laten zakken.
  const gesorteerd = tussen.slice().sort((a, b) => a - b);
  const midden = gesorteerd.slice(0, Math.max(1, Math.ceil(gesorteerd.length * 0.75)));
  const gemiddeld = midden.reduce((a, b) => a + b, 0) / midden.length;
  const bpm = Math.round(klem(60000 / gemiddeld, MIN_BPM, MAX_BPM) * 10) / 10;
  return { bpm, tikken: kort.length, tussenpozen: tussen };
}

// Wanneer vallen de klikken? Relatief ten opzichte van de starttijd, in seconden.
// Elke maatsoort klikt de eerste tel zwaarder (voor het aftellen en het gevoel van de maat).
function klikTijden(startSeconden, bpm, aantal, maatsoort) {
  const start = Number(startSeconden) || 0;
  if (!(Number(bpm) > 0)) return [];
  const tempo = klem(Number(bpm), MIN_BPM, MAX_BPM);
  const n = Math.max(0, Math.floor(Number(aantal) || 0));
  const maat = Math.max(1, Math.floor(Number(maatsoort) || 4));
  if (!tempo || !n) return [];
  const perTel = 60 / tempo;
  const uit = [];
  for (let i = 0; i < n; i++) {
    uit.push({
      tel: i,
      wanneer: start + i * perTel,
      zwaar: i % maat === 0
    });
  }
  return uit;
}

// Hoeveel tellen aftellen? Vier tellen is het gewone aanloopje; bij een langzame maat is
// één maat aftellen (of twee bij 3/4) prettiger dan vier losse tellen.
function aftelTellen(bpm, maatsoort) {
  const maat = Math.max(1, Math.floor(Number(maatsoort) || 4));
  if (!(Number(bpm) > 0)) return 4;
  const tempo = klem(Number(bpm), MIN_BPM, MAX_BPM);
  // In 4/4 is één maat aftellen genoeg (vier tellen); in een andere maatsoort telt de app
  // twee maten zodat het gevoel van de maat er ook in zit. Bij een langzaam tempo idem.
  const tellen = maat === 4 ? 4 : maat * 2;
  return tempo < 60 ? tellen * 2 : tellen;
}

const reken = { MIN_BPM, MAX_BPM, tapTempo, klikTijden, aftelTellen };

// Dezelfde rekenkunde gebruikt de app in de browser (zie public/index.html); daar is
// geen module.exports maar een gewoon object op window.
if (typeof module !== 'undefined' && module.exports) module.exports = reken;
if (typeof window !== 'undefined') window.metronoomRekenen = reken;
