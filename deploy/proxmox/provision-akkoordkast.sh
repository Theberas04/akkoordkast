#!/usr/bin/env bash
# Richt een bestaande Debian-container in als AkkoordKast-server.
#
#   bash deploy/proxmox/provision-akkoordkast.sh <CTID>
#
# De app-bestanden komen uit $SRC (standaard /opt/akkoordkast-pakket), de map die
# install.sh heeft gevuld. Met SRC=/pad/naar/checkout kun je een lokale werkboom
# naar de container sturen zonder GitHub.
set -euo pipefail

# Het container-id kan op drie manieren komen: als eerste argument
# ('bash script.sh 106'), via de omgeving (CTID=106 ...) en via
# 'bash -c "$(curl ...)" 106' — dat laatste zet het nummer in $0, niet in $1.
# Een $0 die geen cijfer is, is de naam van dit script en telt dus niet mee.
case "${0:-}" in
  *[!0-9]*|"") KANDIDAAT0="" ;;
  *) KANDIDAAT0="$0" ;;
esac
CTID="${1:-${CTID:-$KANDIDAAT0}}"
APP_DIR="${APP_DIR:-/opt/akkoordkast}"
DATA_DIR="${DATA_DIR:-/var/lib/akkoordkast}"
GEBRUIKER="${GEBRUIKER:-akkoordkast}"
POORT="${POORT:-80}"
SRC="${SRC:-/opt/akkoordkast-pakket}"
# De map met muziek. De app stelt dit pad voor bij 'Muziekmap scannen', dus het scheelt
# typen als hij meteen bestaat en van de app-gebruiker is. Een NAS- of Drive-koppeling
# zet MUSIC_DIR later naar het koppelpunt.
MUZIEKMAP="${MUZIEKMAP:-/home/$GEBRUIKER/muziek}"

if [ "$(id -u)" != "0" ]; then
  echo "Draai dit als root op de Proxmox-host." >&2
  exit 1
fi
if [ -z "$CTID" ]; then
  echo "Gebruik: bash provision-akkoordkast.sh <CTID>" >&2
  exit 1
fi
if ! pct status "$CTID" >/dev/null 2>&1; then
  echo "Container $CTID bestaat niet." >&2
  exit 1
fi

RUNTIME=(
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
)
PAGINA=(
  "public/index.html"
  "public/favicon.svg"
  "public/manifest.webmanifest"
  "public/sw.js"
  "public/icon-192.png"
  "public/icon-512.png"
  "public/icon-512-maskable.png"
  "public/apple-touch-icon.png"
)
DATA=(
  "song-data/liedjes.json"
  "song-data/volkswijsjes.json"
  "song-data/kerkwijsjes.json"
  "song-data/datasets.json"
  "song-data/limburg-liedjes.json"
  "song-data/anthology-liedjes.json"
  "song-data/oneill-liedjes.json"
  "song-data/oude-bundels.json"
  "scripts/cast-helper.py"
)

for f in "${RUNTIME[@]}" "${PAGINA[@]}" "${DATA[@]}"; do
  if [ ! -f "$SRC/$f" ]; then
    echo "Bestand ontbreekt op de host: $SRC/$f" >&2
    echo "Draai eerst deploy/proxmox/install.sh (of zet SRC naar je checkout)." >&2
    exit 1
  fi
done

binnen() { pct exec "$CTID" -- "$@"; }
binnen_bash() { pct exec "$CTID" -- bash -c "$1"; }

echo "== Pakketten installeren in container $CTID"
binnen_bash "export DEBIAN_FRONTEND=noninteractive; apt-get update -qq && apt-get install -y -qq curl ca-certificates gnupg ffmpeg python3 python3-venv >/dev/null"

echo "== Node.js 22 installeren (node:sqlite vereist 22.5 of nieuwer)"
if ! binnen_bash "test -s /etc/apt/sources.list.d/nodesource.list"; then
  binnen_bash "curl -fsSL https://deb.nodesource.com/setup_22.x -o /tmp/nodesource.sh && bash /tmp/nodesource.sh >/dev/null 2>&1"
  binnen_bash "export DEBIAN_FRONTEND=noninteractive; apt-get install -y -qq nodejs >/dev/null"
fi
if ! binnen_bash "node -e \"require('node:sqlite')\" >/dev/null 2>&1"; then
  echo "Node in de container kan node:sqlite niet laden. Installeer Node 22 of nieuwer handmatig:" >&2
  echo "  pct exec $CTID -- bash -c 'curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs'" >&2
  exit 1
fi
echo "   $(binnen_bash "node --version")"

echo "== Gebruiker en mappen"
binnen_bash "id -u $GEBRUIKER >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin $GEBRUIKER"
binnen_bash "install -d -o $GEBRUIKER -g $GEBRUIKER $APP_DIR $APP_DIR/lib $APP_DIR/public $APP_DIR/song-data $APP_DIR/scripts $DATA_DIR $DATA_DIR/media $DATA_DIR/media/audio $DATA_DIR/media/preview $MUZIEKMAP"

echo "== Bestanden naar de container sturen"
for f in "${RUNTIME[@]}"; do pct push "$CTID" "$SRC/$f" "$APP_DIR/$f" --perms 644; done
for f in "${PAGINA[@]}"; do pct push "$CTID" "$SRC/$f" "$APP_DIR/$f" --perms 644; done
for f in "${DATA[@]}"; do pct push "$CTID" "$SRC/$f" "$APP_DIR/$f" --perms 644; done
binnen_bash "chmod 755 $APP_DIR/scripts/cast-helper.py && chown -R $GEBRUIKER:$GEBRUIKER $APP_DIR $DATA_DIR"

echo "== Chromecast-hulp installeren (pychromecast in een eigen venv)"
CAST_KLAAR=1
if [ ! -x "$APP_DIR/venv/bin/python" ]; then
  binnen_bash "python3 -m venv $APP_DIR/venv" || CAST_KLAAR=0
fi
if [ "$CAST_KLAAR" = "1" ]; then
  binnen_bash "$APP_DIR/venv/bin/pip install --quiet --upgrade pip >/dev/null 2>&1 || true"
  if ! binnen_bash "$APP_DIR/venv/bin/pip install --quiet pychromecast >/dev/null 2>&1"; then
    CAST_KLAAR=0
  fi
fi
if [ "$CAST_KLAAR" = "1" ]; then
  binnen_bash "chown -R $GEBRUIKER:$GEBRUIKER $APP_DIR/venv"
  echo "   pychromecast geinstalleerd"
else
  echo "   LET OP: pychromecast kon niet worden geinstalleerd. De app werkt, maar het"
  echo "   tabblad Casten meldt dat de cast-hulp ontbreekt. Later alsnog:"
  echo "   pct exec $CTID -- bash -c 'apt-get install -y python3-venv && python3 -m venv $APP_DIR/venv && $APP_DIR/venv/bin/pip install pychromecast'"
fi

echo "   muziekmap: $MUZIEKMAP"

echo "== Systemd-dienst"
UNIT="$(mktemp)"
cat > "$UNIT" <<UNITEOF
[Unit]
Description=AkkoordKast gitaarsongbook met capo-advies en Chromecast
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$GEBRUIKER
Group=$GEBRUIKER
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/node $APP_DIR/server.js
Environment=NODE_ENV=production
Environment=PORT=$POORT
Environment=DATA_DIR=$DATA_DIR
Environment=MEDIA_DIR=$DATA_DIR/media
Environment=DB_PATH=$DATA_DIR/akkoordkast.db
Environment=CAST_PYTHON=$APP_DIR/venv/bin/python
Environment=FFMPEG=/usr/bin/ffmpeg
Environment=MUSIC_DIR=$MUZIEKMAP
AmbientCapabilities=CAP_NET_BIND_SERVICE
CapabilityBoundingSet=CAP_NET_BIND_SERVICE
NoNewPrivileges=yes
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNITEOF
pct push "$CTID" "$UNIT" /etc/systemd/system/akkoordkast.service --perms 644
rm -f "$UNIT"

binnen_bash "systemctl daemon-reload && systemctl enable akkoordkast >/dev/null 2>&1 && systemctl restart akkoordkast"

echo "== Controle"
OK=0
for poging in $(seq 1 30); do
  KOPPEN="$(mktemp)"
  if binnen_bash "curl -fsS -D $KOPPEN -o /tmp/akkoordkast-healthz.txt http://127.0.0.1:$POORT/healthz" 2>/dev/null; then
    if binnen_bash "grep -qi 'x-akkoordkast' $KOPPEN && grep -q '^ok' /tmp/akkoordkast-healthz.txt"; then OK=1; break; fi
  fi
  rm -f "$KOPPEN"
  sleep 2
done

if [ "$OK" != "1" ]; then
  echo "De app antwoordt niet op poort $POORT. Bewijs:" >&2
  binnen_bash "systemctl is-active akkoordkast; systemctl status akkoordkast --no-pager -l | tail -20" >&2 || true
  binnen_bash "ss -ltnpH 'sport = :$POORT' || echo 'niets luistert op $POORT'" >&2 || true
  binnen_bash "journalctl -u akkoordkast -n 25 --no-pager" >&2 || true
  exit 1
fi

if ! binnen_bash "ss -ltnpH 'sport = :$POORT' | grep -q node"; then
  echo "Poort $POORT antwoordt wel, maar niet door node. Wat luistert er:" >&2
  binnen_bash "ss -ltnpH 'sport = :$POORT'" >&2 || true
  exit 1
fi

AANTAL="$(binnen_bash "curl -fsS http://127.0.0.1:$POORT/api/liedjes?compact=1 | head -c 200" | grep -o '"totaal":[0-9]*' | head -1 | cut -d: -f2)"
echo "   app antwoordt, liedjes in de catalogus: ${AANTAL:-onbekend}"
echo "AkkoordKast is klaar in container $CTID op poort $POORT."
