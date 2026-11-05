'use strict';
// Muziekanalyse: van een opname (of het geluidsspoor van een video) naar een
// akkoordschema. Geen internetdienst en geen extra pakketten: eerst een FFT en
// een chromagram, dan maat- en tempoherkenning, en per maat het akkoord dat het
// beste bij de klankkleur past.
//
// De uitkomst is een voorstel, geen waarheid: bij een drukke opname met drums en
// zang zit er ruis op. Daarom geven we per maat ook een zekerheid mee, zodat de
// app kan zeggen waar je beter zelf even luistert.
const akkoorden = require('./akkoorden');

// -------------------------------------------------------------- WAV inlezen ---

// Alleen 16-bits mono of stereo PCM; de server laat ffmpeg altijd zo omzetten.
function leesWav(buffer) {
  if (buffer.length < 44 || buffer.toString('ascii', 0, 4) !== 'RIFF') throw new Error('Geen WAV-bestand');
  let offset = 12;
  let fmt = null;
  let data = null;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const lengte = buffer.readUInt32LE(offset + 4);
    const begin = offset + 8;
    if (id === 'fmt ') {
      fmt = {
        kanaal: buffer.readUInt16LE(begin + 2),
        rate: buffer.readUInt32LE(begin + 4),
        bits: buffer.readUInt16LE(begin + 14)
      };
    } else if (id === 'data') {
      data = { begin, lengte: Math.min(lengte, buffer.length - begin) };
    }
    offset = begin + lengte + (lengte % 2);
  }
  if (!fmt || !data) throw new Error('Onvolledig WAV-bestand');
  if (fmt.bits !== 16) throw new Error('Alleen 16-bits WAV wordt gelezen');
  const aantal = Math.floor(data.lengte / 2);
  const samples = new Float32Array(aantal);
  const kanaal = fmt.kanaal || 1;
  for (let i = 0; i < aantal; i++) samples[i] = buffer.readInt16LE(data.begin + i * 2) / 32768;
  if (kanaal > 1) {
    // naar mono: het gemiddelde van de kanalen
    const mono = new Float32Array(Math.floor(aantal / kanaal));
    for (let i = 0; i < mono.length; i++) {
      let som = 0;
      for (let k = 0; k < kanaal; k++) som += samples[i * kanaal + k];
      mono[i] = som / kanaal;
    }
    return { samples: mono, rate: fmt.rate };
  }
  return { samples, rate: fmt.rate };
}

// --------------------------------------------------------------------- FFT ---

// Iteratieve radix-2 FFT (geen pakketten nodig).
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const hoek = -2 * Math.PI / len;
    const wr = Math.cos(hoek);
    const wi = Math.sin(hoek);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

// ------------------------------------------------------------------ chroma ---

const FRAME = 4096;
const HOP = 512;

// Frequentie naar een toon binnen een octaaf (0-11).
function pitchClass(freq) {
  const midi = Math.round(69 + 12 * Math.log2(freq / 440));
  return ((midi % 12) + 12) % 12;
}

// Per frame de klankkleur: hoe sterk is elke van de twaalf tonen aanwezig?
function chromagram(samples, rate, opties) {
  const o = Object.assign({ laag: 65, hoog: 2100 }, opties || {});
  const frames = Math.max(0, Math.floor((samples.length - FRAME) / HOP) + 1);
  const uit = new Float32Array(frames * 12);
  const energie = new Float32Array(frames);
  // de lage tonen apart: die vertellen welke toon in de bas ligt, en dat is
  // meestal de grondtoon van het akkoord
  const bas = new Float32Array(frames * 12);
  const venster = new Float32Array(FRAME);
  for (let i = 0; i < FRAME; i++) venster[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (FRAME - 1));
  const re = new Float32Array(FRAME);
  const im = new Float32Array(FRAME);
  for (let f = 0; f < frames; f++) {
    const van = f * HOP;
    for (let i = 0; i < FRAME; i++) {
      re[i] = samples[van + i] * venster[i];
      im[i] = 0;
    }
    fft(re, im);
    let som = 0;
    let somLaag = 0;
    for (let b = 1; b < FRAME / 2; b++) {
      const freq = b * rate / FRAME;
      if (freq < o.laag || freq > o.hoog) continue;
      const sterkte = Math.sqrt(re[b] * re[b] + im[b] * im[b]);
      const pc = pitchClass(freq);
      uit[f * 12 + pc] += sterkte;
      som += sterkte;
      if (freq <= 260) { bas[f * 12 + pc] += sterkte; somLaag += sterkte; }
    }
    energie[f] = som;
    if (som > 0) {
      for (let pc = 0; pc < 12; pc++) uit[f * 12 + pc] /= som;
      // De vloer eraf: bij echte muziek is er in elke frame wel wat energie op elke toon, en dan
      // past elk akkoord ongeveer even goed. Door het gemiddelde van deze frame af te trekken
      // blijven de pieken over — de tonen die echt klinken.
      let gemiddelde = 0;
      for (let pc = 0; pc < 12; pc++) gemiddelde += uit[f * 12 + pc];
      gemiddelde /= 12;
      for (let pc = 0; pc < 12; pc++) {
        const schoon = uit[f * 12 + pc] - 0.6 * gemiddelde;
        uit[f * 12 + pc] = schoon > 0 ? schoon : 0;
      }
    }
    if (somLaag > 0) for (let pc = 0; pc < 12; pc++) bas[f * 12 + pc] /= somLaag;
  }
  return { frames, data: uit, energie, bas };
}

// ------------------------------------------------------------ tempo en maat ---

// Onsetsterkte per frame: hoeveel energie komt er bij?
function onsetSterkte(energie, frames) {
  const ruw = new Float32Array(frames);
  for (let f = 1; f < frames; f++) {
    // alleen toenames tellen: een aanslag laat de energie springen
    const verschil = energie[f] - energie[f - 1];
    ruw[f] = verschil > 0 ? verschil : 0;
  }
  // het gemiddelde van de omgeving eraf halen, zodat zachte maten niet wegvallen
  const uit = new Float32Array(frames);
  const venster = 12;
  for (let f = 0; f < frames; f++) {
    let som = 0, aantal = 0;
    for (let k = -venster; k <= venster; k++) {
      const i = f + k;
      if (i >= 0 && i < frames) { som += ruw[i]; aantal++; }
    }
    uit[f] = Math.max(0, ruw[f] - (aantal ? som / aantal : 0));
  }
  return uit;
}

// Tempo (BPM) en de eerste tel zoeken met autocorrelatie.
function zoekTempo(onset, rate, opties) {
  const o = Object.assign({ min: 60, max: 180 }, opties || {});
  const framesPerSeconde = rate / HOP;
  const minLag = Math.round(framesPerSeconde * 60 / (o.max || 180));
  const maxLag = Math.round(framesPerSeconde * 60 / (o.min || 60));
  // Eerst de losse aanslagen zoeken, en dan kijken welke afstand ertussen het
  // vaakst terugkomt. Dat is minder gevoelig voor ruis dan een kam over alles.
  const pieken = [];
  const drempel = 0.25 * (onset.reduce((a, b) => Math.max(a, b), 0) || 1);
  for (let f = 1; f < onset.length - 1; f++) {
    if (onset[f] > drempel && onset[f] >= onset[f - 1] && onset[f] >= onset[f + 1]) {
      pieken.push(f);
      f += Math.max(1, Math.round(0.05 * framesPerSeconde));   // niet elk sample als piek tellen
    }
  }
  const histogram = new Float32Array(Math.round(1.2 * framesPerSeconde) + 2);
  for (let i = 0; i < pieken.length; i++) {
    for (let j = i + 1; j < pieken.length && pieken[j] - pieken[i] <= histogram.length; j++) {
      const afstand = pieken[j] - pieken[i];
      histogram[afstand] += 1;
      histogram[Math.round(afstand * 2)] += 0.5;
      histogram[Math.round(afstand / 2)] += 0.5;
    }
  }
  let histogramBeste = { lag: minLag, score: -1 };
  for (let afstand = minLag; afstand <= Math.min(maxLag, histogram.length - 1); afstand++) {
    const score = histogram[afstand];
    if (score > histogramBeste.score) histogramBeste = { lag: afstand, score };
  }

  // Hoe goed past een tik-tik-tik op deze afstand? We leggen een kam over de
  // tiksterkte en kijken welke afstand de meeste tikken precies raakt.
  const kam = lag => {
    let besteScore = -1, besteFase = 0;
    for (let fase = 0; fase < lag; fase++) {
      let som = 0, aantal = 0;
      for (let f = fase; f < onset.length; f += lag) {
        const i = Math.round(f);
        if (i >= onset.length) continue;
        // een tik valt nooit precies op een framegrens: kijk twee frames naar
        // weerszijden, anders verliest een fijn ritme het van een grof ritme
        let top = 0;
        for (let k = -2; k <= 2; k++) {
          const j = i + k;
          if (j >= 0 && j < onset.length && onset[j] > top) top = onset[j];
        }
        som += top;
        aantal++;
      }
      // het gemiddelde per tik: een kam die de tikken raakt scoort hoog, een kam
      // die ernaast zit laag. Delen door het aantal tikken voorkomt dat een traag
      // tempo wint omdat het minder tikken hoeft te raken.
      const score = aantal > 1 ? som / aantal : 0;
      if (score > besteScore) { besteScore = score; besteFase = fase; }
    }
    return { score: besteScore, fase: besteFase };
  };
  let ruw = { lag: minLag, score: -1, fase: 0 };
  for (let lag = minLag; lag <= maxLag; lag++) {
    const k = kam(lag);
    if (k.score > ruw.score) ruw = { lag, score: k.score, fase: k.fase };
  }
  // hetzelfde ritme past ook op de halve en de dubbele snelheid; kies de variant
  // die het beste klinkt binnen het bereik waarin mensen muziek tellen
  const kandidaten = [];
  for (const basis of [histogramBeste.lag, ruw.lag]) {
    for (const factor of [1, 2, 0.5]) {
      const lag = Math.round(basis * factor);
      if (lag < minLag || lag > maxLag) continue;
      const bpm = 60 / (lag / framesPerSeconde);
      const k = kam(lag);
      const voorkeur = bpm >= 80 && bpm <= 150 ? 1 : (bpm < 70 || bpm > 180 ? 0.8 : 0.92);
      kandidaten.push({ lag, score: k.score * voorkeur, bpm, fase: k.fase });
    }
  }
  kandidaten.sort((a, b) => b.score - a.score);
  let beste = kandidaten[0] || ruw;
  // mensen tellen eerder twee keer zo snel als twee keer zo langzaam: als het
  // dubbele tempo bijna even goed past, kiezen we dat
  const dubbel = kandidaten.find(k => k.bpm >= 88 && k.bpm <= 170 && k.score >= beste.score * 0.72);
  const dichtbij = kandidaten.find(k => k.bpm >= 88 && k.bpm <= 160 && k.score >= beste.score * 0.82);
  if (dubbel) beste = dubbel;
  if (dichtbij) beste = dichtbij;
  const besteFase = beste.fase || 0;
  return {
    bpm: 60 / (beste.lag / framesPerSeconde),
    lagFrames: beste.lag,
    faseFrames: besteFase,
    tikkenPerSeconde: framesPerSeconde / beste.lag
  };
}

// Past een maat van n tellen beter of slechter dan vier tellen?
function maatPast(onset, tempo, tellen) {
  let som = 0, aantal = 0;
  for (let maatStart = tempo.faseFrames; maatStart + tellen * tempo.lagFrames < onset.length; maatStart += tellen * tempo.lagFrames) {
    const i = Math.round(maatStart);
    // ook hier de tik ernaast meenemen, en het gemiddelde nemen: een korte maat
    // heeft meer maatstrepen en zou anders altijd winnen
    const top = Math.max(onset[i] || 0, onset[i - 1] || 0, onset[i + 1] || 0);
    som += top;
    aantal++;
  }
  return aantal ? som / aantal : 0;
}

// ------------------------------------------------------------------- analyse ---

function analyseer(samples, rate, opties) {
  const o = Object.assign({ maatsoort: 0, minSeconden: 6 }, opties || {});
  const seconden = samples.length / rate;
  if (seconden < o.minSeconden) throw new Error('De opname is te kort om te analyseren');
  const chroma = chromagram(samples, rate);
  const onset = onsetSterkte(chroma.energie, chroma.frames);
  const tempo = zoekTempo(onset, rate, o);
  let maatsoort = o.maatsoort;
  if (!maatsoort) {
    // 3/4 tegen 4/4: de maat die de tikken het beste dekt, wint
    const voor4 = maatPast(onset, tempo, 4);
    const voor3 = maatPast(onset, tempo, 3);
    // Vier tellen is veruit het meest voorkomend; drie alleen als dat duidelijk beter dekt.
    // In de praktijk wint de wals anders te vaak: bij een popopname past de maatindeling in
    // vieren bijna altijd minstens zo goed, en dan is 4 de veilige keuze.
    maatsoort = voor3 > voor4 * 1.6 ? 3 : 4;
  }
  // Het tempo nog een keer fijn afstellen op de maatstrepen: een fout van een
  // paar procent laat de maatindeling na een halve minuut weglopen.
  const verfijn = (t, tellen) => {
    const fps = rate / HOP;
    let beste = { bpm: t.bpm, score: -1, lag: t.lagFrames, fase: t.faseFrames };
    for (let bpm = t.bpm * 0.94; bpm <= t.bpm * 1.06; bpm += 0.1) {
      const lag = fps * 60 / bpm;
      if (lag < 2) continue;
      for (let fase = 0; fase < lag; fase += 1) {
        let som = 0, aantal = 0;
        for (let f = fase; f + lag * tellen < onset.length; f += lag * tellen) {
          const i = Math.round(f);
          som += Math.max(onset[i] || 0, onset[i - 1] || 0, onset[i + 1] || 0);
          aantal++;
        }
        const score = aantal ? som / aantal : 0;
        if (score > beste.score) beste = { bpm, score, lag, fase };
      }
    }
    return beste;
  };
  const verfijnd = verfijn(tempo, maatsoort);
  if (verfijnd.score > 0) {
    tempo.bpm = verfijnd.bpm;
    tempo.lagFrames = verfijnd.lag;
    tempo.faseFrames = Math.round(verfijnd.fase);
  }
  const framesPerTel = tempo.lagFrames;
  const framesPerMaat = framesPerTel * maatsoort;
  const aantalMaten = Math.max(1, Math.floor((chroma.frames - tempo.faseFrames) / framesPerMaat));

  const chromaPerMaat = [];
  const basPerMaat = [];
  let akkoordenPerMaat = [];
  const zekerheid = [];
  const totaleChroma = new Float32Array(12);
  for (let maat = 0; maat < aantalMaten; maat++) {
    const van = Math.round(tempo.faseFrames + maat * framesPerMaat);
    const tot = Math.min(chroma.frames, Math.round(tempo.faseFrames + (maat + 1) * framesPerMaat));
    const breedte = Math.max(1, tot - van);

    // Per tel kijken: een akkoord dat midden in de maat wisselt, valt zo op, en één vieze tel
    // verdwijnt in de meerderheid.
    const telBreedte = Math.max(1, Math.round(breedte / maatsoort));
    const perTel = [];
    for (let tel = 0; tel < maatsoort; tel++) {
      const tVan = van + tel * telBreedte;
      const tTot = Math.min(tot, tVan + telBreedte);
      if (tTot <= tVan) continue;
      const som = new Float32Array(12);
      const laag = new Float32Array(12);
      for (let f = tVan; f < tTot; f++) {
        const gewicht = 0.5 + 0.5 * Math.sin(Math.PI * ((f - tVan + 0.5) / (tTot - tVan)));
        for (let pc = 0; pc < 12; pc++) {
          som[pc] += chroma.data[f * 12 + pc] * gewicht;
          laag[pc] += chroma.bas[f * 12 + pc] * gewicht;
        }
      }
      let laagste = 0;
      let tweedeLaagste = -1;
      for (let pc = 0; pc < 12; pc++) {
        if (laag[pc] > laag[laagste]) { tweedeLaagste = laagste; laagste = pc; }
      }
      const keuze = akkoorden.besteAkkoord(Array.from(som), { bas: laagste, basTweede: tweedeLaagste >= 0 ? tweedeLaagste : null });
      perTel.push(keuze ? { naam: keuze.naam, score: keuze.score, marge: keuze.marge } : null);
    }

    // De maat als geheel: voor de toonsoort, en als geen enkele tel iets opleverde.
    const somHeel = new Float32Array(12);
    const laagHeel = new Float32Array(12);
    for (let f = van; f < tot; f++) {
      const gewicht = 0.35 + 0.65 * Math.sin(Math.PI * ((f - van + 0.5) / breedte));
      for (let pc = 0; pc < 12; pc++) {
        somHeel[pc] += chroma.data[f * 12 + pc] * gewicht;
        laagHeel[pc] += chroma.bas[f * 12 + pc] * gewicht;
      }
    }
    chromaPerMaat.push(Array.from(somHeel));
    for (let pc = 0; pc < 12; pc++) totaleChroma[pc] += somHeel[pc];
    let laagsteHeel = 0;
    let tweedeHeel = -1;
    for (let pc = 0; pc < 12; pc++) if (laagHeel[pc] > laagHeel[laagsteHeel]) { tweedeHeel = laagsteHeel; laagsteHeel = pc; }
    basPerMaat.push(laagsteHeel);
    const heel = akkoorden.besteAkkoord(Array.from(somHeel), { bas: laagsteHeel, basTweede: tweedeHeel >= 0 ? tweedeHeel : null });

    // Welk akkoord won de meeste tellen van deze maat?
    const stemmen = {};
    perTel.forEach(t => { if (t && t.score > 0) stemmen[t.naam] = (stemmen[t.naam] || 0) + 1; });
    let winnaar = '';
    Object.keys(stemmen).forEach(naam => { if (!winnaar || stemmen[naam] > stemmen[winnaar]) winnaar = naam; });
    const gekozen = winnaar || (heel ? heel.naam : '');
    const besteTel = gekozen ? perTel.filter(t => t && t.naam === gekozen)[0] : null;
    const marge = besteTel ? besteTel.marge : (heel ? heel.marge : 0);
    if (gekozen) {
      akkoordenPerMaat.push(gekozen);
      zekerheid.push(Math.round(Math.max(0, Math.min(1, marge / 0.35)) * 100) / 100);
    } else {
      akkoordenPerMaat.push(null);
      zekerheid.push(0);
    }
  }

  // gaten en losse uitschieters opruimen: één maat afwijkend tussen twee gelijke
  // akkoorden is bijna altijd een meetfout
  for (let i = 1; i < akkoordenPerMaat.length - 1; i++) {
    if (akkoordenPerMaat[i] !== akkoordenPerMaat[i - 1] && akkoordenPerMaat[i - 1] === akkoordenPerMaat[i + 1]) {
      akkoordenPerMaat[i] = akkoordenPerMaat[i - 1];
      zekerheid[i] = zekerheid[i - 1];
    }
  }
  let vorige = akkoordenPerMaat.find(a => a);
  akkoordenPerMaat = akkoordenPerMaat.map((a, i) => {
    if (a) { vorige = a; return a; }
    zekerheid[i] = 0;
    return vorige;
  });
  const toonsoort = akkoorden.schatToonsoort(Array.from(totaleChroma));
  const gemiddeldeZekerheid = zekerheid.length ? zekerheid.reduce((a, b) => a + b, 0) / zekerheid.length : 0;

  // Is dit bruikbaar als bladmuziek? Eén enkel akkoord voor de hele opname betekent bijna altijd
  // dat de herkenning de klank niet aankan (drums, zang, veel galm). Dan zeggen we dat liever dan
  // dat we een schema opleveren dat nergens op slaat.
  const verdeling = {};
  akkoordenPerMaat.forEach(a => { if (a) verdeling[a] = (verdeling[a] || 0) + 1; });
  const aantalVerschillende = Object.keys(verdeling).length;
  const meestVoorkomend = Object.keys(verdeling).reduce((a, b) => Math.max(a, verdeling[b]), 0);
  const aandeelMeest = akkoordenPerMaat.length ? meestVoorkomend / akkoordenPerMaat.length : 1;
  const eentonig = aantalVerschillende <= 1 && aandeelMeest >= 0.9;
  const bruikbaar = Object.keys(verdeling).length > 0 && !eentonig && gemiddeldeZekerheid >= 0.1;

  return {
    bruikbaar,
    verdeling,
    aantalVerschillende,
    aandeelMeest: Math.round(aandeelMeest * 100) / 100,
    tempo: Math.round(tempo.bpm * 10) / 10,
    basPerMaat,
    maatsoort,
    akkoordenPerMaat,
    zekerheid,
    gemiddeldeZekerheid: Math.round(gemiddeldeZekerheid * 100) / 100,
    toonsoort: toonsoort.naam,
    toonsoortScore: Math.round(toonsoort.score * 100) / 100,
    aantalMaten,
    seconden: Math.round(seconden * 10) / 10,
    eersteTelSeconden: Math.round((tempo.faseFrames / (rate / HOP)) * 1000) / 1000
  };
}

// Noten voor de notenbalk: de sterke toon per maat uit het chromagram, als
// eenvoudige melodielijn. Dit is een benadering: de app laat zien wat er
// het duidelijkst klinkt, geen uitgeschreven zangpartij.
function melodielijn(chromaPerMaat, maatsoort, opties) {
  const o = Object.assign({ hoogsteOctaaf: 5 }, opties || {});
  const uit = [];
  for (let maat = 0; maat < chromaPerMaat.length; maat++) {
    const chroma = chromaPerMaat[maat];
    let beste = 0;
    for (let pc = 1; pc < 12; pc++) if (chroma[pc] > chroma[beste]) beste = pc;
    const midi = 12 * (o.hoogsteOctaaf + 1) + beste - 12;
    uit.push({ start: maat * maatsoort, duur: maatsoort, midi });
  }
  return uit;
}

module.exports = { leesWav, chromagram, onsetSterkte, zoekTempo, analyseer, melodielijn, fft, pitchClass, FRAME, HOP };
