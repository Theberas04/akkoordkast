#!/usr/bin/env bash
# Alle resterende schermafbeeldingen opnieuw, in de nieuwe vormgeving.
set -e
cd /home/hermes/akkoordkast
export FONTCONFIG_FILE=/home/hermes/.local/fontconfig/fonts.conf
BASIS=http://127.0.0.1:8091

echo "== start- en stopknop =="
python3 /tmp/ak-start-stop.py 2>&1 | tail -4

echo "== liedjestekst =="
python3 /tmp/ak-schot.py 2>&1 | tail -3

echo "== muziekmap (verse map) =="
rm -rf /tmp/muziekmap5 /tmp/scan5
mkdir -p /tmp/muziekmap5
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
  fs.writeFileSync('/tmp/muziekmap5/' + naam.replace(/\.mp3$/, '.wav'), gitaar.maakPlanWav(plan));
}
JS
for f in /tmp/muziekmap5/*.wav; do ffmpeg -v error -y -i "$f" -codec:a libmp3lame -b:a 128k "${f%.wav}.mp3" && rm "$f"; done
python3 scripts/scan-proef.py --basis $BASIS --map /tmp/muziekmap5 --doel /tmp/scan5 2>&1 | tail -4
cp /tmp/scan5/muziekmap-gevonden.png docs/img/muziekmap-gevonden.png
cp /tmp/scan5/muziekmap-klaar.png docs/img/muziekmap-klaar.png

echo "== upload en meespelen met een opname =="
python3 scripts/upload-proef.py --basis $BASIS --bestand "/tmp/Amazing Grace (official video).mp3" --doel /tmp/up 2>&1 | tail -4 || echo "(upload-proef overgeslagen)"
cp -f /tmp/up/upload-herkend.png docs/img/upload-herkend.png 2>/dev/null || true
cp -f /tmp/up/meespelen-opname.png docs/img/meespelen-opname.png 2>/dev/null || true

echo "== spotify =="
python3 scripts/spotify-proef.py --basis $BASIS --liedje 1 --link "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M" --doel /tmp/sp2 2>&1 | tail -3 || true
cp -f /tmp/sp2/spotify-blok.png docs/img/spotify-blok.png 2>/dev/null || true

echo "== klaar =="
ls -la --time-style=+%H:%M docs/img/ | tail -20
