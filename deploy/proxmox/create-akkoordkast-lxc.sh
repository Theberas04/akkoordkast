#!/usr/bin/env bash
# Maakt een Debian-container voor AkkoordKast op de Proxmox-host.
# Print alleen het container-id op stdout; alle uitleg gaat naar stderr,
# zodat install.sh het id met $(...) kan opvangen.
set -euo pipefail

CTID="${CTID:-}"
HOSTNAME_CT="${HOSTNAME_CT:-akkoordkast}"
GEHEUGEN="${GEHEUGEN:-1024}"
SCHIJF="${SCHIJF:-8}"
CORES="${CORES:-2}"
BRIDGE="${BRIDGE:-vmbr0}"
OPSLAG="${OPSLAG:-local-lvm}"
DEBIAN_MAJOR="${DEBIAN_MAJOR:-12}"

melding() { echo "$@" >&2; }

if [ "$(id -u)" != "0" ]; then
  melding "Draai dit als root op de Proxmox-host."
  exit 1
fi

# Vrije container-id zoeken als er geen is opgegeven.
if [ -z "$CTID" ]; then
  for kandidaat in $(seq 200 299); do
    if ! pct status "$kandidaat" >/dev/null 2>&1; then CTID="$kandidaat"; break; fi
  done
fi
if pct status "$CTID" >/dev/null 2>&1; then
  melding "Container $CTID bestaat al. Kies een andere CTID of verwijder hem eerst."
  exit 1
fi

# Sjabloon zoeken of downloaden.
SJABLOON="$(pveam list "$OPSLAG" 2>/dev/null | awk '{print $1}' | grep "debian-$DEBIAN_MAJOR-standard" | sort | tail -1 || true)"
if [ -z "$SJABLOON" ]; then
  melding "Debian $DEBIAN_MAJOR-sjabloon wordt gedownload..."
  pveam update >/dev/null 2>&1 || true
  NAAM="$(pveam available --section system | awk '{print $2}' | grep "debian-$DEBIAN_MAJOR-standard" | sort | tail -1 || true)"
  if [ -z "$NAAM" ]; then
    melding "Geen Debian $DEBIAN_MAJOR-sjabloon gevonden. Download er handmatig een met 'pveam download'."
    exit 1
  fi
  pveam download "$OPSLAG" "$NAAM"
  SJABLOON="$OPSLAG:vztmpl/$NAAM"
fi
melding "Sjabloon: $SJABLOON"

pct create "$CTID" "$SJABLOON" \
  --hostname "$HOSTNAME_CT" \
  --cores "$CORES" \
  --memory "$GEHEUGEN" \
  --swap 512 \
  --rootfs "$OPSLAG:$SCHIJF" \
  --net0 "name=eth0,bridge=$BRIDGE,ip=dhcp" \
  --features nesting=1 \
  --unprivileged 1 \
  --onboot 1 \
  --start 1 >&2

melding "Container $CTID gestart; wachten tot hij op het netwerk is..."
for poging in $(seq 1 40); do
  if pct exec "$CTID" -- bash -c "ip -4 -o addr show dev eth0 | grep -q 'inet '" 2>/dev/null; then break; fi
  sleep 1
done
if ! pct exec "$CTID" -- bash -c "ip -4 -o addr show dev eth0 | grep -q 'inet '" 2>/dev/null; then
  melding "Container $CTID kreeg geen IP-adres. Controleer de bridge ($BRIDGE) en DHCP."
  exit 1
fi

# Alleen het id op stdout, daar rekent install.sh mee.
echo "$CTID"
