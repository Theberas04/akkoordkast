#!/usr/bin/env bash
# AkkoordKast op een Proxmox-host installeren.
#
# Draai dit op de Proxmox-host zelf (niet in een container), als root:
#
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/Theberas04/akkoordkast/main/deploy/proxmox/install.sh)"
#
# Wat het doet:
#   1. haalt alle app-bestanden op naar een tijdelijke map op de host,
#   2. maakt een Debian-container aan (create-akkoordkast-lxc.sh),
#   3. richt de container in en start de dienst (provision-akkoordkast.sh).
#
# Los testen zonder container:
#   FETCH_ONLY=1 RAW_BASE=file://$PWD TARGET_DIR=/tmp/akkoordkast-pakket bash deploy/proxmox/install.sh
set -euo pipefail

REPO_OWNER="${REPO_OWNER:-Theberas04}"
REPO_NAAM="${REPO_NAAM:-akkoordkast}"
BRANCH="${BRANCH:-main}"
RAW_BASE="${RAW_BASE:-https://raw.githubusercontent.com/$REPO_OWNER/$REPO_NAAM/$BRANCH}"
TARGET_DIR="${TARGET_DIR:-/opt/akkoordkast-pakket}"
FETCH_ONLY="${FETCH_ONLY:-0}"

FILES=(
  "server.js"
  "liedjes-bron.js"
  "lib/theorie.js"
  "lib/grepen.js"
  "lib/chordpro.js"
  "lib/capo.js"
  "lib/gitaar.js"
  "lib/tijdlijn.js"
  "lib/akkoorden.js"
  "lib/analyse.js"
  "lib/spotify.js"
  "song-data/liedjes.json"
  "song-data/volkswijsjes.json"
  "song-data/kerkwijsjes.json"
  "song-data/datasets.json"
  "song-data/limburg-liedjes.json"
  "song-data/anthology-liedjes.json"
  "song-data/oneill-liedjes.json"
  "song-data/oude-bundels.json"
  "scripts/cast-helper.py"
  "public/index.html"
  "public/favicon.svg"
  "public/manifest.webmanifest"
  "public/sw.js"
  "public/icon-192.png"
  "public/icon-512.png"
  "public/icon-512-maskable.png"
  "public/apple-touch-icon.png"
  "deploy/proxmox/provision-akkoordkast.sh"
  "deploy/proxmox/update-from-github.sh"
)

if [ "$(id -u)" != "0" ]; then
  echo "Draai dit als root op de Proxmox-host." >&2
  exit 1
fi

for nodig in pct pvesm curl; do
  if ! command -v "$nodig" >/dev/null 2>&1; then
    echo "Dit lijkt geen Proxmox-host: $nodig ontbreekt." >&2
    exit 1
  fi
done

PROEF="$(mktemp)"
KOPPEN="$(mktemp)"
trap 'rm -f "$PROEF" "$KOPPEN"' EXIT

echo "== Bestanden ophalen van $RAW_BASE naar $TARGET_DIR"
rm -rf "$TARGET_DIR"
mkdir -p "$TARGET_DIR"
for f in "${FILES[@]}"; do
  case "$f" in
    *" "*|"") echo "Interne fout: bestandsnaam met een spatie ($f)." >&2; exit 1 ;;
  esac
  mkdir -p "$TARGET_DIR/$(dirname "$f")"
  if [ "${RAW_BASE#file://}" != "$RAW_BASE" ]; then
    cp "${RAW_BASE#file://}/$f" "$TARGET_DIR/$f"
  else
    if ! curl -fsSL --max-time 60 "$RAW_BASE/$f?cb=$(date +%s)" -o "$TARGET_DIR/$f"; then
      echo "Download mislukt: $f" >&2
      echo "Controleer of de repository openbaar is en of $f echt bestaat." >&2
      exit 1
    fi
  fi
  echo "   $f"
done

if [ "$FETCH_ONLY" = "1" ]; then
  echo "== Alleen ophalen gevraagd (FETCH_ONLY=1): klaar in $TARGET_DIR"
  exit 0
fi

echo "== Container aanmaken"
CTID="$(bash "$TARGET_DIR/deploy/proxmox/create-akkoordkast-lxc.sh")"
if ! echo "$CTID" | grep -qE '^[0-9]+$'; then
  echo "Kon geen container-id bepalen (kreeg: '$CTID')." >&2
  exit 1
fi
echo "   container $CTID"

echo "== Container inrichten"
bash "$TARGET_DIR/deploy/proxmox/provision-akkoordkast.sh" "$CTID"

IP="$(pct exec "$CTID" -- bash -c "ip -4 -o addr show dev eth0 | awk '{print \$4}' | cut -d/ -f1" 2>/dev/null || true)"
echo
echo "=============================================================="
echo " AkkoordKast draait in container $CTID"
[ -n "$IP" ] && echo " Open op je telefoon of laptop:  http://$IP/"
echo " Bijwerken later:"
echo "   bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/$REPO_OWNER/$REPO_NAAM/$BRANCH/deploy/proxmox/update-from-github.sh)\" $CTID"
echo "=============================================================="
