#!/usr/bin/env bash
# Ververs alle beelden: demo-database, schermafbeeldingen, scanproef, hero en rondleiding.
set -e
cd /home/hermes/akkoordkast
export FONTCONFIG_FILE=/home/hermes/.local/fontconfig/fonts.conf
BASIS=http://127.0.0.1:8091

echo "== 1. demo-server opnieuw =="
PID=$(ss -ltnp 2>/dev/null | grep ':8091' | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2 || true)
[ -n "$PID" ] && kill "$PID" && sleep 1
rm -rf data-demo
DATA_DIR=/home/hermes/akkoordkast/data-demo PORT=8091 nohup node server.js >/tmp/ak-8091.log 2>&1 &
sleep 3
BASIS=$BASIS node scripts/demo-gegevens.js

echo "== 2. proefmuziekmap voor het scherm =="
rm -rf /tmp/muziekmap2
mkdir -p /tmp/muziekmap2
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
  fs.writeFileSync('/tmp/muziekmap2/' + naam.replace(/\.mp3$/, '.wav'), gitaar.maakPlanWav(plan));
}
JS
for f in /tmp/muziekmap2/*.wav; do ffmpeg -v error -y -i "$f" -codec:a libmp3lame -b:a 128k "${f%.wav}.mp3" && rm "$f"; done
ls /tmp/muziekmap2

echo "== 3. schermafbeeldingen =="
python3 scripts/screenshots.py --basis $BASIS --doel docs/img

echo "== 4. scanproef =="
python3 scripts/scan-proef.py --basis $BASIS --map /tmp/muziekmap2 --doel /tmp/scan
cp /tmp/scan/muziekmap-gevonden.png docs/img/muziekmap-gevonden.png
cp /tmp/scan/muziekmap-klaar.png docs/img/muziekmap-klaar.png

echo "== 5. hero en social card =="
python3 scripts/maak-beeld.py

echo "== 6. rondleiding =="
python3 scripts/maak-rondleiding.py --stem /tmp/ak-video --uit docs/img/rondleiding.mp4 2>&1 | tail -8

echo "== 7. klaar =="
ls -la docs/img/ | head -30
