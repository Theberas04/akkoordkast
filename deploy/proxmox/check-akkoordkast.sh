#!/usr/bin/env bash
# Alleen-lezen diagnose van een AkkoordKast-container. Verandert niets.
#
#   bash check-akkoordkast.sh [CTID]
set -uo pipefail

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
POORT="${POORT:-80}"

if [ -z "$CTID" ]; then
  echo "Gebruik: bash check-akkoordkast.sh <CTID>" >&2
  exit 2
fi

kop() { echo; echo "--- $* ---"; }
binnen() { pct exec "$CTID" -- bash -c "$1" 2>&1; }

kop "Container $CTID op de host"
pct status "$CTID" 2>&1
pct config "$CTID" 2>&1 | grep -E '^(memory|cores|rootfs|net0|onboot)' || true

kop "Netwerk in de container"
binnen "ip -4 -o addr show | sed 's/^/  /'"
binnen "ip route | sed 's/^/  /'"
binnen "cat /etc/resolv.conf | grep -v '^#' | sed 's/^/  /'"

kop "Dienst"
binnen "systemctl is-enabled akkoordkast 2>&1; systemctl is-active akkoordkast 2>&1"
binnen "systemctl status akkoordkast --no-pager -l 2>&1 | tail -15"

kop "Node en de module node:sqlite"
binnen "node --version 2>&1"
binnen "node -e \"require('node:sqlite'); console.log('node:sqlite werkt')\" 2>&1 | tail -3"

kop "Wat luistert er op poort $POORT"
binnen "ss -ltnpH 'sport = :$POORT' 2>&1 || echo '  niets'"

kop "Geheugen en schijf"
binnen "free -m | sed 's/^/  /'"
binnen "df -h / | sed 's/^/  /'"

kop "Bestanden"
binnen "ls -la $APP_DIR 2>&1 | head -15"
binnen "ls -la $APP_DIR/public 2>&1 | head -15"
binnen "ls -la $DATA_DIR 2>&1 | head -10"
binnen "ls -la $APP_DIR/venv/bin/python 2>&1"

kop "Chromecast-hulp"
binnen "$APP_DIR/venv/bin/python $APP_DIR/scripts/cast-helper.py apparaten 2>&1 | tail -2"

kop "Laatste regels uit het journaal"
binnen "journalctl -u akkoordkast -n 25 --no-pager 2>&1"

kop "Wat nu?"
cat <<'HULP'
  - Staat de dienst niet actief?            pct exec <CTID> -- systemctl restart akkoordkast
  - node:sqlite ontbreekt?                  Installeer Node 22:
      pct exec <CTID> -- bash -c 'curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs'
  - Niets luistert op poort 80?             pct exec <CTID> -- systemctl status akkoordkast
  - Chromecast-hulp ontbreekt?              Zet het tabblad Casten open: de pagina noemt de opdracht
      pct exec <CTID> -- bash -c 'apt-get install -y python3-venv && python3 -m venv /opt/akkoordkast/venv && /opt/akkoordkast/venv/bin/pip install pychromecast'
  - Bijwerken naar de nieuwste versie:
      bash -c "$(curl -fsSL https://raw.githubusercontent.com/Theberas04/akkoordkast/main/deploy/proxmox/update-from-github.sh)" <CTID>
HULP
