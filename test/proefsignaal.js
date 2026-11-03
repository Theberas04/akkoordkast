'use strict';
// Deterministisch proefsignaal: een akkoord per maat, met een aanslag op elke
// achtste tel (zoals een gitaar die meespeelt). Geen ruis, dus altijd dezelfde uitkomst.
function toon(midi, duurSeconden, sr, amplitude, fase) {
  const freq = 440 * Math.pow(2, (midi - 69) / 12);
  const n = Math.max(1, Math.round(duurSeconden * sr));
  const uit = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let s = 0;
    for (let h = 1; h <= 4; h++) s += Math.sin(2 * Math.PI * freq * h * t + h * fase) / h;
    uit[i] = s * Math.exp(-t * 3.2) * amplitude;
  }
  return uit;
}
function akkoordProef(akkoorden, bpm, sr) {
  const grepen = require('../lib/grepen');
  const maat = 60 / bpm * 4;
  const achtste = maat / 8;
  const totaal = new Float32Array(Math.round((maat * akkoorden.length + 1) * sr));
  akkoorden.forEach((naam, i) => {
    const noten = grepen.noten(naam, 0);
    for (let a = 0; a < 8; a++) {
      const start = Math.round((i * maat + a * achtste) * sr);
      noten.forEach((noot, k) => {
        const klank = toon(noot.midi, achtste * 3, sr, 0.14, a * 0.3 + k * 0.7);
        for (let x = 0; x < klank.length; x++) {
          const p = start + Math.round(k * 0.01 * sr) + x;
          if (p < totaal.length) totaal[p] += klank[x];
        }
      });
    }
  });
  return totaal;
}
// Het proefsignaal als WAV-buffer, zodat een test een upload kan nabootsen.
function naarWav(samples, rate) {
  const gitaar = require('../lib/gitaar');
  return gitaar.naarWav(samples, rate, 0.9);
}
module.exports = { akkoordProef, toon, naarWav };
