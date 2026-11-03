#!/usr/bin/env bash
# Schermafbeeldingen opnieuw (start/stop-knoppen) en de rondleiding opnieuw renderen.
set -e
cd /home/hermes/akkoordkast
export FONTCONFIG_FILE=/home/hermes/.local/fontconfig/fonts.conf
BASIS=http://127.0.0.1:8091

python3 scripts/screenshots.py --basis $BASIS --doel docs/img
python3 scripts/maak-beeld.py
python3 scripts/maak-rondleiding.py --stem /tmp/ak-video --uit docs/img/rondleiding.mp4 2>&1 | tail -12
ls -la --time-style=+%H:%M docs/img/ | head -25
ffprobe -v error -show_entries format=duration,size -of default=nw=1 docs/img/rondleiding.mp4
