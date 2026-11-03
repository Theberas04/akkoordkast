'use strict';
// De rekenkant van de back-up: hoe het bestand heet, wat erin hoort te staan en welke
// oude bestanden opgeruimd mogen worden. De server geeft de rijen uit de database mee,
// zodat dit deel zonder database te testen is.

// Sleutels waar een geheim in kan zitten. Die gaan niet mee in een back-up: een back-up
// belandt op een NAS of in een cloudmap, en daar hoort geen wachtwoord of API-sleutel.
const GEHEIM = /(secret|token|wachtwoord|password|api[_-]?key|sleutel)/i;

function isGeheim(sleutel) {
  return GEHEIM.test(String(sleutel || ''));
}

function schonInstellingen(rijen) {
  const uit = {};
  for (const rij of rijen || []) {
    const sleutel = String((rij && rij.sleutel) || '');
    if (!sleutel || isGeheim(sleutel)) continue;
    uit[sleutel] = rij.waarde;
  }
  return uit;
}

function bestandsnaam(nu) {
  const d = nu instanceof Date ? nu : new Date(nu === undefined ? Date.now() : nu);
  const twee = n => String(n).padStart(2, '0');
  return 'akkoordkast-backup-' + d.getFullYear() + '-' + twee(d.getMonth() + 1) + '-' + twee(d.getDate()) +
    '-' + twee(d.getHours()) + twee(d.getMinutes()) + twee(d.getSeconds()) + '.json';
}

// Alles wat de gebruiker zelf heeft gemaakt of gedaan. De liedjesbibliotheek zelf zit in
// de repo en hoeft niet mee, maar de liedjes die de app uit de muziekmap heeft gehaald
// (eigen liedjes) wel — die staan in dezelfde tabel en zijn niet terug te halen als ze weg
// zijn.
function maakInhoud(delen, nu) {
  const d = nu instanceof Date ? nu : new Date(nu === undefined ? Date.now() : nu);
  const bron = delen || {};
  return {
    soort: 'akkoordkast-backup',
    versie: 1,
    gemaakt: d.toISOString(),
    liedjes: bron.liedjes || [],
    profielen: bron.profielen || [],
    favorieten: bron.favorieten || [],
    labels: bron.labels || [],
    liedje_labels: bron.liedje_labels || [],
    gespeeld: bron.gespeeld || [],
    oefensessies: bron.oefensessies || [],
    setlists: bron.setlists || [],
    setlist_liedjes: bron.setlist_liedjes || [],
    instellingen: schonInstellingen(bron.instellingen)
  };
}

// Welke bestanden mogen weg als je er maar N wilt bewaren? De namen zijn sorteerbaar op
// tijd (jaar-maand-dag-uur-minuut), dus de oudste staan vooraan.
function teVerwijderen(namen, bewaren) {
  const lijst = (namen || []).map(String).sort();
  const gevraagd = parseInt(bewaren, 10);
  const aantal = Number.isFinite(gevraagd) ? Math.max(1, gevraagd) : 10;
  return lijst.slice(0, Math.max(0, lijst.length - aantal));
}

// Een beknopte samenvatting voor in de app: wat er in deze back-up zit.
function samenvatting(inhoud) {
  const i = inhoud || {};
  return {
    liedjes: (i.liedjes || []).length,
    profielen: (i.profielen || []).length,
    favorieten: (i.favorieten || []).length,
    setlists: (i.setlists || []).length,
    oefensessies: (i.oefensessies || []).length,
    instellingen: Object.keys(i.instellingen || {}).length
  };
}

module.exports = { isGeheim, schonInstellingen, bestandsnaam, maakInhoud, teVerwijderen, samenvatting };
