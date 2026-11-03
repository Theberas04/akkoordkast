'use strict';
// Zoekt dubbelen over ALLE liedjes-datasets en haalt ze eruit.
//
// Waarom: de bundels overlappen elkaar. Hetzelfde Ierse wijsje staat in O'Neill's
// Music of Ireland, in Kerr's Merry Melodies én in Ryan's Mammoth Collection. Zonder
// deze stap zou een zoekopdracht op "The Rights of Man" vier identieke treffers geven.
//
// Werkwijze: de datasets worden in de volgorde van song-data/datasets.json gelezen
// (die volgorde is ook de prioriteit: het eerste bestand wint). Van elk liedje maken
// we een vingerafdruk van de titel plus het verloop van de melodie in hele en halve
// toonafstanden — dat verloop is onafhankelijk van de toonsoort, zodat twee
// transcripties van dezelfde wijs in een andere toonsoort alsnog als dubbel gelden.
// Wat later komt en dezelfde vingerafdruk heeft, valt af.
//
// Gebruik:
//   node scripts/ontdubbel.js                     -> alleen tellen (droogloop)
//   node scripts/ontdubbel.js --doen              -> de datasets ook echt opschonen
const fs = require('fs');
const path = require('path');

const WORTEL = path.resolve(__dirname, '..');
const DATASETS = path.join(WORTEL, 'song-data', 'datasets.json');

// Deze datasets blijven ongemoeid: hun liedjesnummers zitten al in de database van
// bestaande installaties (eigen opnames, Spotify-koppelingen, imports), en een regel
// uit het midden halen zou al die nummers opschuiven. Ze tellen wel mee als
// referentie: wat nieuws is én al in een van deze bestanden staat, valt af.
const VAST = ['liedjes.json', 'volkswijsjes.json', 'kerkwijsjes.json'];

function leesJSON(pad) {
  return JSON.parse(fs.readFileSync(pad, 'utf8'));
}

// Titel zonder leestekens, zonder lidwoorden en in kleine letters.
function netteTitel(titel) {
  return String(titel || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\b(the|a|an|de|het|een|les|la|le|der|die|das)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Verloop van de melodie: per stap het aantal halve tonen (0-11), dus los van de
// toonsoort waarin iemand het heeft opgeschreven.
function verloop(noten) {
  const midis = (noten || []).map(n => n && n.midi).filter(m => Number.isFinite(m));
  const uit = [];
  for (let i = 1; i < midis.length; i++) uit.push(Math.abs(midis[i] - midis[i - 1]) % 12);
  return uit.slice(0, 16).join(',');
}

function vingerafdruk(lied) {
  return netteTitel(lied.titel) + '|' + verloop(lied.noten) + '|' + (lied.noten || []).length;
}

function main() {
  const doen = process.argv.includes('--doen');
  const index = leesJSON(DATASETS);
  const gezien = new Map(); // vingerafdruk -> { bestand, titel }
  const rapport = [];
  let totaalVoor = 0;
  let totaalNa = 0;

  for (const dataset of index.datasets) {
    const pad = path.join(WORTEL, dataset.bestand);
    const liedjes = leesJSON(pad);
    const behouden = [];
    const dubbelen = [];
    const magSchrijven = !VAST.includes(path.basename(dataset.bestand));
    for (const lied of liedjes) {
      const sleutel = vingerafdruk(lied);
      const eerder = gezien.get(sleutel);
      if (eerder) {
        dubbelen.push({ titel: lied.titel, ookIn: eerder.bestand });
        continue;
      }
      gezien.set(sleutel, { bestand: dataset.bestand, titel: lied.titel });
      behouden.push(lied);
    }
    totaalVoor += liedjes.length;
    totaalNa += behouden.length;
    rapport.push({ bestand: dataset.bestand, voor: liedjes.length, na: behouden.length, dubbelen,
      vast: !magSchrijven });
    if (doen && magSchrijven && behouden.length !== liedjes.length) {
      fs.writeFileSync(pad, JSON.stringify(behouden, null, 1));
    }
  }

  for (const regel of rapport) {
    const weg = regel.voor - regel.na;
    console.log(
      (regel.bestand + ' ').padEnd(46, '.') + ' ' +
      String(regel.voor).padStart(6) + ' -> ' + String(regel.na).padStart(6) +
      (weg ? '  (' + weg + ' dubbel' + (regel.vast ? ', blijft staan' : '') + ')' : '')
    );
    for (const d of regel.dubbelen.slice(0, 8)) {
      console.log('     dubbel: ' + d.titel + '  (staat al in ' + d.ookIn + ')');
    }
    if (regel.dubbelen.length > 8) console.log('     ... en nog ' + (regel.dubbelen.length - 8));
  }
  console.log('');
  console.log('totaal: ' + totaalVoor + ' -> ' + totaalNa + '  (' + (totaalVoor - totaalNa) + ' dubbelen eruit)');
  console.log(doen ? 'datasets opgeschoond' : 'droogloop: niets geschreven (gebruik --doen)');
}

if (require.main === module) main();
module.exports = { vingerafdruk, netteTitel, verloop };
