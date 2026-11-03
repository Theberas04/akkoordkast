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
CONTROLEER_PAKKET="${CONTROLEER_PAKKET:-0}"

# Versheid: de ruwe URL van GitHub houdt een bestand vijf minuten vast (cache-control
# max-age=300) en een ?cb= erachter verandert daar niets aan — de schijfcache van GitHub
# kijkt alleen naar het pad. Daarom halen we eerst de commit op waar de branch naar wijst en
# halen we alle bestanden van die vastgezette commit: die is onveranderlijk, dus altijd gelijk
# aan wat er in de repository staat. Lukt dat niet (geen internet naar de API), dan gaan we
# door met de branch en melden we dat de bestanden even oud kunnen zijn.
if [ "${RAW_BASE#file://}" = "$RAW_BASE" ] && [ -z "${COMMIT_VAST:-}" ]; then
  COMMIT_VAST="$(curl -fsSL --max-time 20 -H 'Accept: application/vnd.github+json' \
    "https://api.github.com/repos/$REPO_OWNER/$REPO_NAAM/commits/$BRANCH" 2>/dev/null \
    | sed -n 's/.*"sha" *: *"\([0-9a-f]\{40\}\)".*/\1/p' | head -1)"
  if [ -n "$COMMIT_VAST" ]; then
    RAW_BASE="https://raw.githubusercontent.com/$REPO_OWNER/$REPO_NAAM/$COMMIT_VAST"
    echo "== Commit ${COMMIT_VAST:0:7} van $BRANCH (alle bestanden komen uit die versie)"
  else
    echo "LET OP: kon de commit van $BRANCH niet ophalen; de bestanden kunnen tot vijf" >&2
    echo "minuten oud zijn. Forceer een verse kopie via de API:" >&2
    echo "   bash -c \"\$(curl -fsSL -H 'Accept: application/vnd.github.raw' https://api.github.com/repos/$REPO_OWNER/$REPO_NAAM/contents/deploy/proxmox/install.sh?ref=$BRANCH)\"" >&2
  fi
fi
# Stempel van deze installer. Staat bovenaan de uitvoer, zodat je meteen ziet welke versie
# er draait: een oude kopie (uit de schijfcache van GitHub, of een bewaard bestand) valt zo op.
PAKKET_VERSIE="2026-11-03.3"

# Let op: hier hoort ELK script in te staan dat hieronder met 'bash "$TARGET_DIR/..."'
# wordt uitgevoerd (dus ook create-akkoordkast-lxc.sh). Staat het er niet in, dan stopt de
# installatie met 'No such file or directory'. scripts/check-deploy-file-lists.py bewaakt dit.
FILES=(

  "server.js"
  "liedjes-bron.js"
  "lib/theorie.js"
  "lib/grepen.js"
  "lib/chordpro.js"
  "lib/capo.js"
  "lib/gitaar.js"
  "lib/tijdlijn.js"
  "lib/backup.js"
  "lib/metronoom.js"
  "lib/overgangen.js"
  "lib/week.js"
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
  "deploy/proxmox/create-akkoordkast-lxc.sh"
  "deploy/proxmox/provision-akkoordkast.sh"
  "deploy/proxmox/update-from-github.sh"
)

if [ "$(id -u)" != "0" ] && [ "$FETCH_ONLY" != "1" ] && [ "$CONTROLEER_PAKKET" != "1" ]; then
  echo "Draai dit als root op de Proxmox-host." >&2
  exit 1
fi

# Alleen bij een echte installatie is Proxmox-gereedschap nodig; het ophalen van de
# bestanden (FETCH_ONLY=1) en het controleren van het pakket (CONTROLEER_PAKKET=1) werken
# overal, zodat je die vooraf kunt proberen.
NODIG="pct pvesm curl"
if [ "$FETCH_ONLY" = "1" ] || [ "$CONTROLEER_PAKKET" = "1" ]; then
  NODIG="curl"
  if [ "${RAW_BASE#file://}" != "$RAW_BASE" ]; then NODIG=""; fi
fi
for nodig in $NODIG; do
  if ! command -v "$nodig" >/dev/null 2>&1; then
    echo "Dit lijkt geen Proxmox-host: $nodig ontbreekt." >&2
    exit 1
  fi
done

PROEF="$(mktemp)"
KOPPEN="$(mktemp)"
trap 'rm -f "$PROEF" "$KOPPEN"' EXIT

haal_bestand() {
  # $1 = het pad binnen de repository
  local f="$1"
  case "$f" in
    *" "*|"") echo "Interne fout: bestandsnaam met een spatie ($f)." >&2; exit 1 ;;
  esac
  mkdir -p "$TARGET_DIR/$(dirname "$f")"
  if [ "${RAW_BASE#file://}" != "$RAW_BASE" ]; then
    cp "${RAW_BASE#file://}/$f" "$TARGET_DIR/$f"
  else
    # ?cb= erachter: de schijfcache van GitHub houdt een bestand vijf minuten vast.
    if ! curl -fsSL --max-time 60 "$RAW_BASE/$f?cb=$(date +%s)" -o "$TARGET_DIR/$f"; then
      echo "Download mislukt: $f" >&2
      echo "Controleer of de repository openbaar is en of $f echt bestaat." >&2
      exit 1
    fi
  fi
}

zorg_voor() {
  # Vangnet: een script dat uitgevoerd moet worden hoort in FILES te staan. Staat het er
  # niet in (of is het weg), dan halen we het hier alsnog op in plaats van te stoppen met
  # 'No such file or directory'.
  local f="$1"
  if [ -s "$TARGET_DIR/$f" ]; then return 0; fi
  echo "   $f ontbrak in het pakket; alsnog opgehaald" >&2
  haal_bestand "$f"
}

echo "== AkkoordKast-installer $PAKKET_VERSIE"
echo "== Bestanden ophalen van $RAW_BASE naar $TARGET_DIR"
rm -rf "$TARGET_DIR"
mkdir -p "$TARGET_DIR"
for f in "${FILES[@]}"; do
  haal_bestand "$f"
  echo "   $f"
done

if [ "$CONTROLEER_PAKKET" = "1" ]; then
  for nodig in deploy/proxmox/create-akkoordkast-lxc.sh deploy/proxmox/provision-akkoordkast.sh; do
    zorg_voor "$nodig"
  done
  echo "== Pakket compleet in $TARGET_DIR (controle zonder container)"
  exit 0
fi

if [ "$FETCH_ONLY" = "1" ]; then
  echo "== Alleen ophalen gevraagd (FETCH_ONLY=1): klaar in $TARGET_DIR"
  exit 0
fi

echo "== Container aanmaken"
zorg_voor deploy/proxmox/create-akkoordkast-lxc.sh
CTID="$(bash "$TARGET_DIR/deploy/proxmox/create-akkoordkast-lxc.sh")"
if ! echo "$CTID" | grep -qE '^[0-9]+$'; then
  echo "Kon geen container-id bepalen (kreeg: '$CTID')." >&2
  exit 1
fi
echo "   container $CTID"

echo "== Container inrichten"
zorg_voor deploy/proxmox/provision-akkoordkast.sh
bash "$TARGET_DIR/deploy/proxmox/provision-akkoordkast.sh" "$CTID"

IP="$(pct exec "$CTID" -- bash -c "ip -4 -o addr show dev eth0 | awk '{print \$4}' | cut -d/ -f1" 2>/dev/null || true)"
echo
echo "=============================================================="
echo " AkkoordKast draait in container $CTID"
[ -n "$IP" ] && echo " Open op je telefoon of laptop:  http://$IP/"
echo " Bijwerken later:"
echo "   bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/$REPO_OWNER/$REPO_NAAM/$BRANCH/deploy/proxmox/update-from-github.sh)\" $CTID"
echo "=============================================================="
