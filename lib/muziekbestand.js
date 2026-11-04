'use strict';
// De muziek van een liedje: een echt audiobestand uit de muziekmappen van de gebruiker.
// De app haalt zelf geen opnamen van internet (auteursrecht) — hij speelt wat er op deze
// machine of op de NAS staat, en uitsluitend binnen de mappen die de gebruiker heeft
// aangewezen. Alles wat van buiten komt gaat door veilig(), dat een pad buiten die mappen
// weigert. Zo kan een verzoek met '../' niet buiten de muziekmap lezen.
const fs = require('fs');
const path = require('path');

const EXTENSIES = ['.mp3', '.m4a', '.aac', '.ogg', '.oga', '.opus', '.flac', '.wav'];
const MIME = {
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.flac': 'audio/flac',
  '.wav': 'audio/wav',
};

// Mappen die we nooit doorlopen: onze eigen back-ups, rommel van besturingssystemen en
// ontwikkelmappen. Zo kost een zoektocht geen tijd aan dingen die geen muziek zijn.
const OVERSLAAN = new Set(['akkoordkast-backup', 'node_modules', '.git', '.cache',
  '.Trash', '$RECYCLE.BIN', 'System Volume Information', 'lost+found']);
const MAX_BESTANDEN = 40000;

function extensie(pad) {
  return path.extname(String(pad || '')).toLowerCase();
}

function isAudio(pad) {
  return EXTENSIES.includes(extensie(pad));
}

function mimeVan(pad) {
  return MIME[extensie(pad)] || 'application/octet-stream';
}

// Voor het vergelijken: kleine letters, zonder accenten, zonder haakjes-tussenvoegsels
// ((live), [remix]) en zonder leestekens. 'Het Dorp (live)' en 'het_dorp.mp3' worden zo
// allebei 'het dorp'.
function normaliseer(tekst) {
  return String(tekst || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\.(mp3|m4a|aac|ogg|oga|opus|flac|wav)$/, '')
    .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
    .replace(/&/g, ' en ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// De titel zoals hij uit een bestandsnaam te halen is: streepjes en underscores worden
// spaties, een nummer vooraan ('01 - ') gaat eraf.
function titelVan(pad) {
  const naam = path.basename(String(pad || ''), path.extname(String(pad || '')));
  return naam
    .replace(/^\s*\d{1,3}\s*[-._)\s]\s*/, '')     // '01 - ', '01. ', '01 '
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Staat dit pad binnen een van de muziekmappen? Zo niet, dan komt er niets terug en kan
// de route een 400 sturen in plaats van een bestand buiten de map te serveren. We kijken
// ook naar het echte pad (symlinks), zodat een link naar buiten niet alsnog doorwerkt.
function veilig(pad, mappen) {
  const gevraagd = path.resolve(String(pad || ''));
  if (!gevraagd) return '';
  const binnen = (kandidaat) => {
    for (const map of (mappen || [])) {
      const m = path.resolve(String(map || ''));
      if (!m || kandidaat === m) continue;
      if (kandidaat.startsWith(m + path.sep)) return true;
    }
    return false;
  };
  if (!binnen(gevraagd)) return '';
  try {
    const echt = fs.realpathSync(gevraagd);
    if (!binnen(echt)) return '';
    return echt;
  } catch (e) {
    // Bestaat (nog) niet: dan is het opgeven pad zelf genoeg, mits het binnen de map valt.
    return gevraagd;
  }
}

// Hoe goed past een bestandsnaam bij een titel? Alleen de vorm van de naam telt hier.
function basisScore(bestand, titel) {
  if (!bestand || !titel) return 0;
  if (bestand === titel) return 100;
  if (bestand.startsWith(titel + ' ')) return 85;               // 'het dorp live'
  if (bestand.includes(titel)) return 70;                       // 'het dorp van wim sonneveld'
  if (titel.startsWith(bestand + ' ') && bestand.length >= 4) return 55;
  return 0;
}

// Hoe goed past dit bestand bij dit liedje? 0 = geen match, 100 = precies de titel.
// We kijken naar twee vormen van de bestandsnaam: zoals hij is, en met een volgnummer
// vooraan eraf. Zo klopt '01 Het Dorp.mp3' met 'Het Dorp' (muziek op een schijf staat nu
// eenmaal met nummers), terwijl '99 Luftballons.mp3' ook op '99 Luftballons' blijft passen.
function beoordeel(bestandPad, lied) {
  const titel = normaliseer(lied && lied.titel);
  if (!titel) return 0;
  const vorm1 = normaliseer(path.basename(String(bestandPad || '')));
  const vorm2 = normaliseer(titelVan(bestandPad));
  const score1 = basisScore(vorm1, titel);
  const score2 = basisScore(vorm2, titel);
  let score = Math.max(score1, score2);
  if (!score) return 0;
  const bestand = score2 >= score1 ? vorm2 : vorm1;

  // De artiest die in de mapnaam of de bestandsnaam staat maakt het aannemelijker dat het
  // dezelfde uitvoering is.
  const artiest = normaliseer(lied && lied.artiest);
  if (artiest && artiest.length >= 3) {
    const omgeving = normaliseer(path.dirname(String(bestandPad || '')) + ' ' + bestand);
    if (omgeving.includes(artiest)) score += 8;
  }
  // Een korte bestandsnaam die precies klopt is beter dan een lang bestand dat de titel
  // ergens in het midden heeft staan.
  if (bestand.length > titel.length + 40) score -= 10;
  return Math.max(0, Math.min(100, score));
}

// De beste kandidaten voor een liedje, op score gesorteerd.
function kandidaten(paden, lied, opties) {
  const o = Object.assign({ max: 25 }, opties || {});
  const gezien = new Set();
  const uit = [];
  for (const pad of (paden || [])) {
    const p = String(pad || '');
    if (!p || !isAudio(p)) continue;
    const score = beoordeel(p, lied);
    if (!score) continue;
    let sleutel = p;
    try { sleutel = fs.realpathSync(p); } catch (e) { /* niet erg */ }
    if (gezien.has(sleutel)) continue;
    gezien.add(sleutel);
    uit.push({ pad: p, titel: titelVan(p), map: path.dirname(p), score });
  }
  uit.sort((a, b) => b.score - a.score
    || a.titel.length - b.titel.length
    || a.pad.localeCompare(b.pad));
  const max = Math.max(1, Number(o.max) || 25);
  return uit.slice(0, max);
}

// Loopt de muziekmappen langs en houdt de bestandsnamen bij die bij dit liedje passen.
function zoek(mappen, lied, opties) {
  const o = Object.assign({ max: 25, diepte: 6 }, opties || {});
  const paden = [];
  let geteld = 0;
  const teDoen = (mappen || []).map(m => ({ pad: path.resolve(String(m || '')), diepte: 0 }));
  while (teDoen.length) {
    const nu = teDoen.shift();
    if (!nu.pad || nu.diepte > o.diepte) continue;
    let inhoud;
    try {
      inhoud = fs.readdirSync(nu.pad, { withFileTypes: true });
    } catch (e) {
      continue;                      // map bestaat niet (meer) of geen rechten: overslaan
    }
    for (const stuk of inhoud) {
      if (stuk.name.startsWith('.')) continue;
      const vol = path.join(nu.pad, stuk.name);
      if (stuk.isDirectory()) {
        if (OVERSLAAN.has(stuk.name)) continue;
        if (nu.diepte + 1 > o.diepte) continue;
        teDoen.push({ pad: vol, diepte: nu.diepte + 1 });
        continue;
      }
      if (!stuk.isFile()) continue;
      geteld += 1;
      if (geteld > MAX_BESTANDEN) break;
      if (!isAudio(vol)) continue;
      const score = beoordeel(vol, lied);
      if (score) paden.push(vol);
    }
    if (geteld > MAX_BESTANDEN) break;
  }
  return { kandidaten: kandidaten(paden, lied, o), bekeken: geteld };
}

module.exports = {
  EXTENSIES,
  MIME,
  OVERSLAAN,
  extensie,
  isAudio,
  mimeVan,
  normaliseer,
  titelVan,
  veilig,
  beoordeel,
  kandidaten,
  zoek,
};
