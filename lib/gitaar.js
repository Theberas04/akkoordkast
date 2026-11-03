'use strict';
// Gitaar-synthesizer: Karplus-Strong tokkels naar een WAV-bestand.
// Hiermee krijgt elk liedje echte begeleidingsaudio van de akkoordenreeks,
// zonder dat er auteursrechtelijk beschermde opnames nodig zijn.
const grepen = require('./grepen');

const SAMPLE_RATE = 44100;

function frequentie(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// Eén tokkel: ruisbuffer die zichzelf door de snaar heen dempt.
function tokkel(midi, duurSeconden, amplitude, sr) {
  const n = Math.max(1, Math.round(duurSeconden * sr));
  const uit = new Float32Array(n);
  const freq = frequentie(midi);
  const lengte = Math.max(2, Math.round(sr / freq));
  const ring = new Float32Array(lengte);
  // Beginruis met een lichte demping voor een ronde aanslag.
  let vorige = 0;
  for (let i = 0; i < lengte; i++) {
    const ruis = Math.random() * 2 - 1;
    vorige = vorige * 0.35 + ruis * 0.65;
    ring[i] = vorige;
  }
  // Snaardemping: hoe hoger de noot, hoe sneller hij wegvalt.
  const demping = Math.min(0.9995, 0.9965 + freq / 200000);
  let idx = 0;
  for (let i = 0; i < n; i++) {
    const huidige = ring[idx];
    const volgende = ring[(idx + 1) % lengte];
    uit[i] = huidige;
    // Gemiddelde van twee buurmonsters = laagdoorlaatfilter in de snaar.
    ring[idx] = (huidige + volgende) * 0.5 * demping;
    idx = (idx + 1) % lengte;
  }
  // Aanslag-envelope: korte attack, dan de natuurlijke snaardemping volgen.
  const attack = Math.round(0.004 * sr);
  for (let i = 0; i < n; i++) {
    let env = 1;
    if (i < attack) env = i / attack;
    // lichte body-resonantie: tweede orde nabootsing van de klankkast
    uit[i] = uit[i] * env * amplitude;
  }
  return uit;
}

// Lichte klankkast-resonantie en ruisonderdrukking over het hele signaal.
function klankkast(signaal, sr) {
  const uit = new Float32Array(signaal.length);
  // één-pole laagdoorlaat (dempt de scherpe rand van de ruis)
  const alpha = 0.55;
  let laag = 0;
  // korte kamer-achtige nagalm via twee combs
  const comb1 = new Float32Array(Math.round(0.029 * sr));
  const comb2 = new Float32Array(Math.round(0.037 * sr));
  let i1 = 0, i2 = 0;
  for (let i = 0; i < signaal.length; i++) {
    laag = laag * (1 - alpha) + signaal[i] * alpha;
    const n1 = comb1[i1];
    const n2 = comb2[i2];
    const nat = (n1 + n2) * 0.5;
    comb1[i1] = laag * 0.35 + n1 * 0.62;
    comb2[i2] = laag * 0.28 + n2 * 0.66;
    uit[i] = laag * 0.82 + nat * 0.34;
    i1 = (i1 + 1) % comb1.length;
    i2 = (i2 + 1) % comb2.length;
  }
  // normaliseren tegen clipping en om te zacht geluid op te tillen
  let piek = 0;
  for (let i = 0; i < uit.length; i++) piek = Math.max(piek, Math.abs(uit[i]));
  if (piek > 0) {
    const schaal = Math.min(3, 0.9 / piek);
    for (let i = 0; i < uit.length; i++) uit[i] *= schaal;
  }
  return uit;
}

// Patroon "D DU UDU" -> ['D','-','D','U','-','U','D','U'] (8 achtste noten per maat).
// Een spatie in het patroon is een rust: de achtste noot waarop niet geslagen wordt.
function patroonTokens(strum, lengte) {
  const ruw = String(strum || 'D DU UDU').toUpperCase().replace(/\s/g, '-').split('').filter(t => 'DU-'.includes(t));
  const aantal = Math.max(1, Number(lengte) || 8);
  const uit = [];
  for (let i = 0; i < aantal; i++) uit.push(ruw[i % Math.max(1, ruw.length)] || 'D');
  return uit;
}

// Bouwt de begeleiding van een akkoordenreeks en levert een WAV-buffer.
function maakWav(opties) {
  const o = Object.assign({
    akkoorden: ['C', 'G', 'Am', 'F'],
    capo: 0,
    bpm: 84,
    strum: 'D DU UDU',
    rondes: 2,
    sampleRate: SAMPLE_RATE,
    volume: 0.85
  }, opties || {});
  const sr = o.sampleRate;
  const akkoorden = (o.akkoorden || []).filter(a => grepen.heeftGreep(a));
  if (!akkoorden.length) throw new Error('Geen bekende akkoorden om te spelen');
  const bpm = Math.max(40, Math.min(200, Number(o.bpm) || 84));
  const achtste = (60 / bpm) / 2;               // duur van één achtste noot
  const maatDuur = achtste * 8;                 // 4/4 maat
  const rondes = Math.max(1, Math.min(8, Number(o.rondes) || 2));
  const tokens = patroonTokens(o.strum);
  const totaal = Math.round((maatDuur * akkoorden.length * rondes + 1.2) * sr);
  const mix = new Float32Array(totaal);

  const telMaat = Math.round(achtste * sr);

  let positie = Math.round(0.1 * sr); // korte stilte vooraan
  for (let ronde = 0; ronde < rondes; ronde++) {
    for (const akkoord of akkoorden) {
      const noten = grepen.noten(akkoord, o.capo);
      for (let t = 0; t < tokens.length; t++) {
        const token = tokens[t];
        if (token === '-' || token === ' ') continue;
        const start = positie + t * telMaat;
        const volgorde = token === 'U' ? noten.slice().reverse() : noten;
        // rustige aanslag: 90 ms tussen de snaren, korter bij een upstroke
        const spreiding = Math.round(0.09 * sr);
        volgorde.forEach((noot, i) => {
          const duur = Math.max(0.35, maatDuur * 1.6);
          const klank = tokkel(noot.midi, duur, 0.22, sr);
          const van = start + i * spreiding;
          for (let k = 0; k < klank.length; k++) {
            const p = van + k;
            if (p >= mix.length) break;
            mix[p] += klank[k];
          }
        });
      }
      positie += telMaat * 8;
    }
  }

  const af = klankkast(mix, sr);
  return naarWav(af, sr, o.volume);
}

// ---------------------------------------------------------------- meespelen ---
// De meespeelmodus speelt precies het plan uit lib/tijdlijn.js af, zodat het beeld
// (de meelopende noten en grepen) en het geluid uit dezelfde tijden komen.

function mengTokkel(mix, startSeconden, midi, duurSeconden, amplitude, sr) {
  const klank = tokkel(midi, duurSeconden, amplitude, sr);
  const van = Math.round(startSeconden * sr);
  for (let k = 0; k < klank.length; k++) {
    const p = van + k;
    if (p < 0) continue;
    if (p >= mix.length) break;
    mix[p] += klank[k];
  }
}

// Korte klik als maat- en aftelklank: korte sinus met snelle demping.
function mengKlik(mix, startSeconden, sr, hoog, amplitude) {
  const freq = hoog ? 1568 : 1046;   // G6 / C6
  const lengte = Math.round(0.045 * sr);
  const van = Math.round(startSeconden * sr);
  const vol = amplitude == null ? 0.5 : amplitude;
  for (let i = 0; i < lengte; i++) {
    const p = van + i;
    if (p < 0) continue;
    if (p >= mix.length) break;
    const demping = Math.exp(-i / (lengte * 0.22));
    mix[p] += Math.sin(2 * Math.PI * freq * i / sr) * demping * vol;
  }
}

// Rendert een plan (uit lib/tijdlijn.js) naar een WAV-buffer.
function maakPlanWav(plan, opties) {
  const o = Object.assign({ sampleRate: SAMPLE_RATE, volume: 0.85, melodieVolume: 0.3, begeleidingVolume: 0.22 }, opties || {});
  const sr = o.sampleRate;
  if (!plan || !plan.maten || !plan.maten.length) throw new Error('Geen plan om te spelen');
  const totaal = Math.max(1, Math.round((plan.duurSeconden + 1.2) * sr));
  const mix = new Float32Array(totaal);

  // aftellen en (desgewenst) de maatklik
  for (const tik of plan.tikken || []) {
    mengKlik(mix, tik.startSeconden, sr, tik.hoog, tik.soort === 'aftellen' ? 0.5 : 0.34);
  }

  // begeleiding: elke slag uit het plan, snaar voor snaar
  for (const slag of plan.slagen || []) {
    const duur = Math.max(0.35, plan.maatSeconden * 1.6);
    for (const noot of slag.noten) {
      mengTokkel(mix, slag.startSeconden + (noot.offset || 0), noot.midi, duur, o.begeleidingVolume, sr);
    }
  }

  // de melodie: hoorbaar bovenop de begeleiding
  for (const noot of plan.noten || []) {
    const duur = Math.max(0.3, (noot.duurSeconden || plan.telSeconden) * 1.4);
    mengTokkel(mix, noot.startSeconden, noot.midi, duur, o.melodieVolume, sr);
  }

  const af = klankkast(mix, sr);
  return naarWav(af, sr, o.volume);
}

// 16-bits mono WAV-buffer.
function naarWav(signaal, sr, volume) {
  const n = signaal.length;
  const buffer = Buffer.alloc(44 + n * 2);
  const vol = typeof volume === 'number' ? volume : 0.85;
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + n * 2, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sr, 24);
  buffer.writeUInt32LE(sr * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    let s = signaal[i] * vol;
    if (s > 1) s = 1; else if (s < -1) s = -1;
    buffer.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  return buffer;
}

module.exports = { maakWav, maakPlanWav, mengTokkel, mengKlik, naarWav, frequentie, patroonTokens, SAMPLE_RATE };
