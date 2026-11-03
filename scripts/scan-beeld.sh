#!/usr/bin/env bash
# Scherpe afbeeldingen van het scannen van een muziekmap (zonder clip, dus zonder spookbalk).
set -e
cd /home/hermes/akkoordkast
export FONTCONFIG_FILE=/home/hermes/.local/fontconfig/fonts.conf

rm -rf /tmp/muziekmap4
mkdir -p /tmp/muziekmap4
node - <<'JS'
const gitaar = require('/home/hermes/akkoordkast/lib/gitaar');
const tijdlijn = require('/home/hermes/akkoordkast/lib/tijdlijn');
const fs = require('fs');
const proeven = [
  ['Amazing Grace (official video).mp3', ['G', 'C', 'G', 'D7', 'G'], 92],
  ['Greensleeves HD.mp3', ['Am', 'C', 'G', 'Am', 'E7'], 100],
  ['Oh! Susanna.mp3', ['C', 'G7', 'C', 'F', 'C'], 120],
  ['Zie de maan schijnt door de bomen.mp3', ['C', 'F', 'G7', 'C', 'C'], 108]
];
for (const [naam, akkoorden, bpm] of proeven) {
  const plan = tijdlijn.maakPlan({ akkoorden, bpm, maatsoort: 4, rondes: 2 });
  fs.writeFileSync('/tmp/muziekmap4/' + naam.replace(/\.mp3$/, '.wav'), gitaar.maakPlanWav(plan));
}
JS
for f in /tmp/muziekmap4/*.wav; do ffmpeg -v error -y -i "$f" -codec:a libmp3lame -b:a 128k "${f%.wav}.mp3" && rm "$f"; done
python3 scripts/scan-proef.py --basis http://127.0.0.1:8091 --map /tmp/muziekmap4 --doel /tmp/scan4
cp /tmp/scan4/muziekmap-gevonden.png docs/img/muziekmap-gevonden.png
cp /tmp/scan4/muziekmap-klaar.png docs/img/muziekmap-klaar.png
ls -la --time-style=+%H:%M docs/img/muziekmap-*.png
