'use strict';
// Tijdlijn: één plan dat zowel de audio als het beeld bepaalt.
//
// De meespeelmodus laat de bladmuziek, de grepen en de noten meebewegen met wat je
// hoort. Dat kan alleen als het beeld en het geluid uit dezelfde berekening komen:
// dit bestand verdeelt het liedje in maten, tellen en slagen met een tijd in
// seconden, en lib/gitaar.js speelt precies diezelfde tijden af. Zo kan het beeld
// niet losraken van het geluid.
const grepen = require('./grepen');
const theorie = require('./theorie');

const STANDAARD_STEMMING = [40, 45, 50, 55, 59, 64]; // E2 A2 D3 G3 B3 E4
const NAMEN = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function notennaam(midi) {
  return NAMEN[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
}

// Waar speel je deze noot op de hals? Laagste fret wint (eerste positie),
// bij gelijke fret de dikste snaar (warmere toon), en frets boven de 5e als laatste redmiddel.
// Met een capo schuift de hele hals op: je speelt dezelfde klank dan lager,
// dus de gespeelde fret is de klinkende fret min de capostand.
function positieVoorMidi(midi, stemming, capo) {
  const snaren = stemming || STANDAARD_STEMMING;
  const c = Math.max(0, Math.min(12, Number(capo) || 0));
  const kandidaten = [];
  const nood = [];
  for (let s = 0; s < snaren.length; s++) {
    const klinkend = midi - snaren[s];
    if (klinkend < 0 || klinkend > 14 + c) continue;
    if (klinkend < c) {
      // onder de capo niet te spelen: onthou hem als noodoplossing
      nood.push({ snaar: s, fret: 0, klinkendeFret: klinkend, onderCapo: false });
      continue;
    }
    kandidaten.push({ snaar: s, fret: klinkend - c, klinkendeFret: klinkend, onderCapo: true });
  }
  const sorteer = (a, b) => {
    const ver = (a.fret > 5 ? 1 : 0) - (b.fret > 5 ? 1 : 0);
    if (ver) return ver;
    if (a.fret !== b.fret) return a.fret - b.fret;
    return a.snaar - b.snaar;
  };
  kandidaten.sort(sorteer);
  if (kandidaten.length) return kandidaten[0];
  nood.sort((a, b) => (a.klinkendeFret - b.klinkendeFret) || (a.snaar - b.snaar));
  return nood[0] || null;
}

// Positiewissels in een melodie: per noot de laagste speelbare fret, zodat het
// stuk in een logische greephoek blijft liggen.
function zetPosities(noten, stemming, capo) {
  const uit = [];
  for (const noot of noten) {
    const positie = positieVoorMidi(noot.midi, stemming, capo);
    if (!positie) continue;
    uit.push(Object.assign({}, noot, {
      snaar: noot.snaar == null ? positie.snaar : noot.snaar,
      fret: noot.fret == null ? positie.fret : noot.fret,
      klinkendeFret: noot.klinkendeFret == null ? positie.klinkendeFret : noot.klinkendeFret,
      onderCapo: positie.onderCapo,
      naam: noot.naam || notennaam(noot.midi)
    }));
  }
  return uit;
}

// Tijdseenheden van een liedje: tellen en maten in seconden.
function eenheden(bpm, maatsoort) {
  const tempo = Math.max(40, Math.min(200, Number(bpm) || 84));
  const tellen = Math.max(2, Math.min(8, Number(maatsoort) || 4));
  const telSeconden = 60 / tempo;
  return {
    bpm: tempo,
    maatsoort: tellen,
    telSeconden: telSeconden,
    maatSeconden: telSeconden * tellen,
    achtsteSeconden: telSeconden / 2
  };
}

// Het hele plan: maten, slagen, noten en klikken, alles met een tijd in seconden.
function maakPlan(opties) {
  const o = Object.assign({
    akkoorden: ['C', 'G', 'Am', 'F'],  // per maat: één akkoord per maat
    rondes: 2,
    capo: 0,
    bpm: 84,
    maatsoort: 4,
    strum: 'D DU UDU',
    noten: [],                          // melodie in tellen, absoluut vanaf maat 1
    aftellen: true,
    klik: false
  }, opties || {});

  const e = eenheden(o.bpm, o.maatsoort);
  const capoStand = Math.max(0, Math.min(12, Number(o.capo) || 0));
  const reeks = (o.akkoorden || []).filter(a => grepen.heeftGreep(a));
  if (!reeks.length) throw new Error('Geen bekende akkoorden om te spelen');
  const heeftMelodie = !!(o.noten && o.noten.length);
  const rondes = heeftMelodie ? 1 : Math.max(1, Math.min(8, Number(o.rondes) || 2));
  // het patroon vult de hele maat: bij 3/4 zes achtsten, bij 9/4 achttien
  const tokens = require('./gitaar').patroonTokens(o.strum, e.maatsoort * 2);
  const slangPerAchtste = e.achtsteSeconden;

  const aftellenAan = o.aftellen !== false;
  const aftellenMaten = aftellenAan ? 1 : 0;
  const aftellenSeconden = aftellenMaten * e.maatSeconden;

  const maten = [];
  const slagen = [];
  const tikken = [];

  // aftellen: één maat tikken vóór het liedje, met de eerste tel geaccentueerd
  if (aftellenAan) {
    for (let t = 0; t < e.maatsoort; t++) {
      tikken.push({
        startSeconden: t * e.telSeconden,
        maat: 0,
        tel: t + 1,
        soort: 'aftellen',
        hoog: t === 0
      });
    }
  }

  for (let ronde = 0; ronde < rondes; ronde++) {
    for (let m = 0; m < reeks.length; m++) {
      const akkoord = reeks[m];
      const maatNummer = ronde * reeks.length + m + 1;
      const maatStart = aftellenSeconden + (ronde * reeks.length + m) * e.maatSeconden;
      const vorm = grepen.heeftGreep(akkoord) ? akkoord : null;
      maten.push({
        nummer: maatNummer,
        akkoord: akkoord,
        vorm: vorm,
        startSeconden: maatStart,
        duurSeconden: e.maatSeconden,
        barre: grepen.isBarre(akkoord)
      });
      const greepNoten = grepen.noten(akkoord, capoStand);
      for (let a = 0; a < tokens.length; a++) {
        const richting = tokens[a];
        if (richting !== 'D' && richting !== 'U') continue;
        const volgorde = richting === 'U' ? greepNoten.slice().reverse() : greepNoten;
        slagen.push({
          startSeconden: maatStart + a * slangPerAchtste,
          maat: maatNummer,
          achtste: a,
          tel: Math.floor(a / 2) + 1,
          richting: richting,
          akkoord: akkoord,
          capoFret: capoStand,
          // per snaar de tijd waarop hij klinkt: de aanslag rolt over de snaren
          // fret = positie zoals in het greepdiagram (dus onder de capo),
          // klinkendeFret = dezelfde snaar hoger op de hals door de capo
          noten: volgorde.map((n, i) => ({
            snaar: n.snaar,
            fret: n.midi - STANDAARD_STEMMING[n.snaar] - capoStand,
            klinkendeFret: n.midi - STANDAARD_STEMMING[n.snaar],
            midi: n.midi,
            naam: notennaam(n.midi),
            offset: i * 0.09
          }))
        });
      }
      if (o.klik) {
        for (let t = 0; t < e.maatsoort; t++) {
          tikken.push({
            startSeconden: maatStart + t * e.telSeconden,
            maat: maatNummer,
            tel: t + 1,
            soort: 'maat',
            hoog: t === 0
          });
        }
      }
    }
  }

  // melodie: de noten staan in tellen vanaf het begin van het liedje (niet vanaf de aftelmaat)
  const noten = zetPosities(o.noten || [], STANDAARD_STEMMING, capoStand).map(n => {
    const startSeconden = aftellenSeconden + n.start * e.telSeconden;
    return {
      startSeconden: startSeconden,
      duurSeconden: n.duur * e.telSeconden,
      midi: n.midi,
      naam: n.naam,
      snaar: n.snaar,
      fret: n.fret,
      klinkendeFret: n.klinkendeFret,
      onderCapo: n.onderCapo !== false,
      maat: Math.floor(n.start / e.maatsoort) + 1,
      tel: (n.start % e.maatsoort) + 1
    };
  });

  const laatsteMaat = aftellenSeconden + rondes * reeks.length * e.maatSeconden;
  const duurSeconden = laatsteMaat + 0.6;

  return {
    bpm: e.bpm,
    maatsoort: e.maatsoort,
    strum: o.strum,
    capo: capoStand,
    telSeconden: e.telSeconden,
    maatSeconden: e.maatSeconden,
    achtsteSeconden: e.achtsteSeconden,
    aftellen: { aan: aftellenAan, maten: aftellenMaten, seconden: aftellenSeconden, tikken: aftellenAan ? e.maatsoort : 0 },
    klik: !!o.klik,
    heeftMelodie: heeftMelodie,
    rondes: rondes,
    aantalMaten: reeks.length * rondes,
    maten: maten,
    slagen: slagen,
    noten: noten,
    tikken: tikken,
    akkoorden: theorie.uniek(reeks),
    duurSeconden: duurSeconden
  };
}

// De tijdlijn die de pagina krijgt: het plan zonder de interne velden, in een
// vorm die de weergave direct kan gebruiken.
function tijdlijnVanPlan(plan) {
  return {
    bpm: plan.bpm,
    maatsoort: plan.maatsoort,
    strum: plan.strum,
    capo: plan.capo,
    telSeconden: Math.round(plan.telSeconden * 1000) / 1000,
    maatSeconden: Math.round(plan.maatSeconden * 1000) / 1000,
    aftellen: plan.aftellen,
    klik: plan.klik,
    heeftMelodie: plan.heeftMelodie,
    rondes: plan.rondes,
    aantalMaten: plan.aantalMaten,
    akkoorden: plan.akkoorden,
    duurSeconden: Math.round(plan.duurSeconden * 1000) / 1000,
    maten: plan.maten.map(m => ({
      nummer: m.nummer,
      akkoord: m.akkoord,
      startSeconden: rond(m.startSeconden),
      duurSeconden: rond(m.duurSeconden),
      barre: m.barre
    })),
    slagen: plan.slagen.map(s => ({
      startSeconden: rond(s.startSeconden),
      maat: s.maat,
      tel: s.tel,
      achtste: s.achtste,
      richting: s.richting,
      akkoord: s.akkoord,
      noten: s.noten.map(n => ({ snaar: n.snaar, fret: n.fret, midi: n.midi, naam: n.naam, offset: n.offset }))
    })),
    noten: plan.noten.map(n => ({
      startSeconden: rond(n.startSeconden),
      duurSeconden: rond(n.duurSeconden),
      midi: n.midi,
      naam: n.naam,
      snaar: n.snaar,
      fret: n.fret,
      klinkendeFret: n.klinkendeFret,
      onderCapo: n.onderCapo !== false,
      maat: n.maat,
      tel: n.tel
    })),
    tikken: plan.tikken.map(t => ({
      startSeconden: rond(t.startSeconden),
      maat: t.maat,
      tel: t.tel,
      soort: t.soort,
      hoog: t.hoog
    }))
  };
}

function rond(waarde) {
  return Math.round(waarde * 1000) / 1000;
}

module.exports = {
  maakPlan,
  tijdlijnVanPlan,
  positieVoorMidi,
  zetPosities,
  notennaam,
  eenheden,
  STANDAARD_STEMMING
};
