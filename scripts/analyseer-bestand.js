#!/usr/bin/env node
'use strict';
// Geluid uit één bestand halen en daar de akkoorden uit rekenen.
//
// Dit draait in een apart proces. De app start dit script voor elk liedje waar de akkoorden nog uit
// de muziek moeten komen. Doordat het apart staat, blijft de app zelf gewoon werken: het rekenen van
// een hele opname duurt namelijk seconden tot een halve minuut, en als dat in de app zelf gebeurde
// zou de hele app al die tijd stilvallen.
//
// Gebruik: node scripts/analyseer-bestand.js <bestand> [maatsoort]
// Uitvoer: één regel JSON, bijvoorbeeld {"uitslag":{"akkoordenPerMaat":["C","G"],...}}

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const analyse = require('../lib/analyse');

const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const bestand = process.argv[2];
const maatsoort = parseInt(process.argv[3], 10) || 0;

// Altijd antwoord geven, ook als het misgaat: de app leest de uitvoer en hoeft niet te raden.
function klaar(antwoord) {
  process.stdout.write(JSON.stringify(antwoord));
  process.exit(0);
}

if (!bestand || !fs.existsSync(bestand)) {
  klaar({ fout: 'Dit geluidsbestand is niet te vinden.' });
}

const map = fs.mkdtempSync(path.join(os.tmpdir(), 'akkoordkast-analyse-'));
const wav = path.join(map, 'geluid.wav');

try {
  const omzetten = spawnSync(FFMPEG, ['-v', 'error', '-y', '-i', bestand, '-ac', '1', '-ar', '22050', '-vn', wav], { timeout: 240000 });
  if (omzetten.status !== 0 || !fs.existsSync(wav)) {
    klaar({
      fout: 'Het geluid uit dit bestand kon niet worden gelezen. Is het een echt geluids- of ' +
        'videobestand, en staat ffmpeg op deze machine?'
    });
  }
  const { samples, rate } = analyse.leesWav(fs.readFileSync(wav));
  klaar({ uitslag: analyse.analyseer(samples, rate, { maatsoort }) });
} catch (e) {
  klaar({ fout: String((e && e.message) || e).slice(0, 300) });
} finally {
  try { fs.rmSync(map, { recursive: true, force: true }); } catch (e) {}
}
