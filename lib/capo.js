'use strict';
// Capo-advies: welke capostand maakt dit liedje het makkelijkst speelbaar,
// en welke grepen horen daarbij? Puur rekenwerk, geen server of database.
const theorie = require('./theorie');
const grepen = require('./grepen');

const MAX_CAPO = 8;

function greepScore(naam) {
  if (!grepen.heeftGreep(naam)) return -6;     // onbekende greep: sterk ontraden
  if (grepen.isBarre(naam)) return -1.6;       // barré: speelbaar maar zwaar
  return 0;
}

// Hoe hoger, hoe makkelijker. Straf voor barrés, onbekende grepen en hoge capo.
function scoreVoorCapo(akkoorden, capo, toonsoort) {
  let score = 0;
  const uniek = theorie.uniek(akkoorden);
  if (!uniek.length) return -99;
  for (const a of uniek) {
    const vorm = theorie.transponeer(a, -capo, false);
    score += greepScore(vorm);
  }
  score -= capo * 0.35;
  if (capo > 5) score -= (capo - 5) * 0.6;
  // Een liedje dat al in een open toonsoort staat, heeft geen capo nodig.
  if (capo === 0) {
    const openToonsoorten = ['C', 'G', 'D', 'A', 'E', 'Am', 'Em', 'Dm'];
    if (openToonsoorten.includes(theorie.ontleed(toonsoort || uniek[0]) ? toonsoort || uniek[0] : 'C')) score += 0.4;
  }
  return Math.round(score * 100) / 100;
}

function vormAkkoorden(akkoorden, capo) {
  return theorie.uniek(akkoorden).map(a => {
    const vorm = theorie.transponeer(a, -capo, false);
    return {
      concert: a,
      vorm,
      heeftDiagram: grepen.heeftGreep(vorm),
      barre: grepen.isBarre(vorm),
      vingers: grepen.aantalVingers(vorm)
    };
  });
}

// Het advies: beste capostand + onderbouwing + alternatieven.
function advies(akkoorden, toonsoort) {
  const uniek = theorie.uniek(akkoorden);
  if (!uniek.length) {
    return { capo: 0, vormToonsoort: toonsoort || '', akkoorden: [], score: 0, zonderCapo: true, tekst: 'Geen akkoorden gevonden in dit liedje.', alternatieven: [] };
  }
  const kandidaten = [];
  for (let c = 0; c <= MAX_CAPO; c++) {
    kandidaten.push({
      capo: c,
      score: scoreVoorCapo(uniek, c, toonsoort),
      vormToonsoort: toonsoort ? theorie.transponeerToonsoort(toonsoort, -c) : '',
      akkoorden: vormAkkoorden(uniek, c)
    });
  }
  // Sorteer: hoogste score, bij gelijke score de laagste capo.
  const gesorteerd = kandidaten.slice().sort((a, b) => (b.score - a.score) || (a.capo - b.capo));
  const best = gesorteerd[0];
  const zonder = kandidaten[0];
  const onbekend = best.akkoorden.filter(a => !a.heeftDiagram);
  const barres = best.akkoorden.filter(a => a.barre);

  let tekst;
  if (best.capo === 0) {
    tekst = 'Zonder capo te spelen.';
    if (barres.length) tekst += ` Let op: ${barres.map(b => b.concert).join(', ')} ${barres.length === 1 ? 'is een barré-akkoord' : 'zijn barré-akkoorden'}.`;
  } else {
    tekst = `Capo op ${best.capo} en speel in ${best.vormToonsoort || best.akkoorden[0].vorm}.`;
    if (zonder.capo === 0 && zonder.score < best.score) {
      const zwaar = zonder.akkoorden.filter(a => a.barre).map(a => a.concert);
      if (zwaar.length) tekst += ` Zonder capo zou je ${zwaar.join(', ')} als barré moeten pakken.`;
    }
  }
  if (onbekend.length) tekst += ` Van ${onbekend.map(a => a.vorm).join(', ')} heb ik geen greep in de bibliotheek.`;

  return {
    capo: best.capo,
    vormToonsoort: best.vormToonsoort,
    akkoorden: best.akkoorden,
    score: best.score,
    zonderCapo: best.capo === 0,
    zonderCapoScore: zonder.score,
    zonderCapoAkkoorden: zonder.akkoorden,
    tekst,
    alternatieven: gesorteerd.slice(1, 4).map(k => ({
      capo: k.capo,
      score: k.score,
      vormToonsoort: k.vormToonsoort,
      akkoorden: k.akkoorden.map(a => a.vorm)
    }))
  };
}

module.exports = { advies, scoreVoorCapo, vormAkkoorden, greepScore, MAX_CAPO };
