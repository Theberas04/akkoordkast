'use strict';
// De overgang van het ene liedje naar het andere in een setlist. Twee vragen: in welke
// toonsoort speel je ze achter elkaar zodat je niet hoeft om te grijpen, en welke
// akkoorden heb je toch al onder je vingers? Puur rekenwerk op de akkoorden en de
// toonsoort van elk liedje.

const theorie = require('./theorie');
const grepen = require('./grepen');

function akkoordenVan(lied) {
  return theorie.uniek((lied && lied.akkoorden) || []);
}

function gemeenschappelijk(a, b) {
  const set = new Set(a);
  return b.filter(x => set.has(x));
}

// Barrés zijn het zware werk; een toonsoort met veel barrés is minder fijn om in te
// wisselen, ook als hij theoretisch mooi past.
function barres(akkoorden) {
  let aantal = 0;
  for (const a of akkoorden) {
    if (grepen.heeftGreep(a) && grepen.isBarre(a)) aantal += 1;
  }
  return aantal;
}

function richting(stappen) {
  if (stappen === 0) return 'gelijk';
  return stappen > 0 ? 'omhoog' : 'omlaag';
}

function netjes(waarde) {
  return Math.round(waarde * 100) / 100;
}

// Alle kandidaten: elke verschuiving van -5 tot +6 halve tonen (groter schuiven is
// onnodig, want twaalf halve tonen is hetzelfde liedje).
function kandidaten(van, naar) {
  const uit = [];
  for (let stappen = -5; stappen <= 6; stappen++) {
    const mol = theorie.toonsoortVoorkeur(naar.toonsoort, stappen);
    const akkoorden = naar.akkoorden.map(a => theorie.transponeer(a, stappen, mol));
    const toonsoort = theorie.transponeerToonsoort(naar.toonsoort, stappen);
    const gem = gemeenschappelijk(van.akkoorden, akkoorden);
    let score = gem.length * 2;
    if (toonsoort && toonsoort === van.toonsoort) score += 3;
    score -= barres(akkoorden) * 0.8;
    if (stappen !== 0) score -= 0.5;                  // niet transponeren als het niet hoeft
    uit.push({
      stappen,
      toonsoort,
      akkoorden,
      gemeenschappelijk: gem,
      barres: barres(akkoorden),
      score: netjes(score)
    });
  }
  return uit;
}

// Een bruggetje als de twee liedjes niets gemeen hebben: een akkoord dat in allebei de
// toonsoorten past (de dominant van de ene is vaak de tonica van de andere).
function brug(van, naar) {
  const inVan = new Set(van.akkoorden);
  const inNaar = new Set(naar.akkoorden);
  const tonicaNaar = theorie.transponeerToonsoort(naar.toonsoort, 0);
  const dominantVan = theorie.transponeer((van.toonsoort || 'C').replace(/m$/, ''), 7, false);
  if (tonicaNaar && inVan.has(tonicaNaar)) return tonicaNaar;
  if (dominantVan && inNaar.has(dominantVan)) return dominantVan;
  if (inVan.has(dominantVan)) return dominantVan;
  return '';
}

function overgang(a, b) {
  const van = {
    titel: (a && a.titel) || 'het eerste liedje',
    toonsoort: (a && a.toonsoort) || '',
    akkoorden: akkoordenVan(a)
  };
  const naar = {
    titel: (b && b.titel) || 'het tweede liedje',
    toonsoort: (b && b.toonsoort) || '',
    akkoorden: akkoordenVan(b)
  };

  if (!van.akkoorden.length || !naar.akkoorden.length) {
    return {
      van, naar, stappen: 0, toonsoort: naar.toonsoort, gemeenschappelijk: [], brug: '', capo: 0,
      advies: 'Van ' + (van.akkoorden.length ? naar.titel : van.titel) + ' ken ik geen akkoorden, dus ik kan hier niets over zeggen.'
    };
  }

  const opties = kandidaten(van, naar);
  const beste = opties.slice().sort((x, y) => y.score - x.score || Math.abs(x.stappen) - Math.abs(y.stappen))[0];
  const onveranderd = opties.find(o => o.stappen === 0);
  const gem = beste.gemeenschappelijk;
  const stukken = [];

  if (!gem.length) {
    // Geen enkel akkoord gemeen: dan helpt transponeren niet, en is een bruggetje of
    // even stilte het eerlijke advies.
    stukken.push(van.toonsoort && naar.toonsoort
      ? 'Deze twee hebben geen akkoord gemeen (' + van.titel + ' staat in ' + van.toonsoort + ', ' + naar.titel + ' in ' + naar.toonsoort + ').'
      : 'Deze twee hebben geen akkoord gemeen.');
    const brugAkkoord = brug(van, naar);
    stukken.push(brugAkkoord
      ? 'Speel een maat in ' + brugAkkoord + ' als bruggetje, dan hoor je de nieuwe toonsoort aankomen.'
      : 'Tel vier tellen stilte voor je begint, dan valt de nieuwe toonsoort niet zo op.');
  } else {
    if (beste.stappen === 0) {
      if (van.toonsoort && naar.toonsoort && van.toonsoort === naar.toonsoort) {
        stukken.push('Beide liedjes staan in ' + van.toonsoort + ', dus je kunt zo doorgaan.');
      } else {
        stukken.push('Je kunt ' + naar.titel + ' laten staan zoals hij is.');
      }
    } else {
      const aantal = Math.abs(beste.stappen);
      stukken.push('Zet ' + naar.titel + ' in ' + beste.toonsoort + ': dat is ' + aantal +
        (aantal === 1 ? ' halve toon ' : ' halve tonen ') + richting(beste.stappen) + ' ten opzichte van ' +
        (naar.toonsoort || 'wat er staat') + ', en dan zit je op de toonsoort van ' + van.titel + '.');
      if (beste.stappen > 0) {
        stukken.push('Of zet capo ' + beste.stappen + ' en speel de grepen die je al kent — dan klinkt het ook in ' + beste.toonsoort + '.');
      }
    }
    stukken.push('De akkoorden ' + (gem.length > 1 ? gem.slice(0, -1).join(', ') + ' en ' + gem.slice(-1) : gem[0]) +
      ' heb je in allebei, dus daar blijf je in de buurt.');
  }

  if (beste.barres > onveranderd.barres) {
    stukken.push('Let op: je krijgt er ' + (beste.barres - onveranderd.barres) + ' barré-akkoord' +
      (beste.barres - onveranderd.barres === 1 ? '' : 'en') + ' bij ten opzichte van onveranderd spelen.');
  }

  return {
    van,
    naar,
    stappen: beste.stappen,
    toonsoort: beste.toonsoort,
    akkoorden: beste.akkoorden,
    gemeenschappelijk: gem,
    verandert: beste.stappen !== 0,
    capo: beste.stappen > 0 ? beste.stappen : 0,
    brug: gem.length ? '' : brug(van, naar),
    score: beste.score,
    advies: stukken.join(' ')
  };
}

// De hele setlist langs: elk paar opeenvolgende liedjes.
function overgangenVan(liedjes) {
  const lijst = liedjes || [];
  const uit = [];
  for (let i = 1; i < lijst.length; i++) {
    uit.push(overgang(lijst[i - 1], lijst[i]));
  }
  return uit;
}

module.exports = { overgang, overgangenVan, gemeenschappelijk, barres };
