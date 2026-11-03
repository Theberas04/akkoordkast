#!/usr/bin/env bash
# Koppel een NAS-map rechtstreeks in de AkkoordKast-container.
#
# Draai dit OP DE PROXMOX-HOST, als root:
#
#   CTID=225 NAS_HOST=192.168.1.100 NAS_SHARE=muziek NAS_USER=thuis NAS_PASS=geheim \
#     bash deploy/proxmox/nas-koppelen-lxc.sh
#
# of zonder variabelen, dan vraagt het script erom:
#
#   bash deploy/proxmox/nas-koppelen-lxc.sh
#
# Waarom dit anders werkt dan nas-koppelen.sh:
#   Een ongeprivilegieerde container mag van de kernel geen NFS- of SMB-map koppelen
#   (dat mag alleen in de begingebruikersruimte van de host). Nas-koppelen.sh koppelt
#   de map daarom op de host en hangt hem met een bind-mount in de container.
#   Deze variant laat de container het zelf doen met fuse: op de host zetten we
#   eenmalig /dev/fuse in de container, in de container koppelt rclone de NAS-share.
#   Voordeel: geen map op de host, geen bind-mount, en de NAS is alleen voor deze
#   container. Nadeel: rclone doet het lees- en schrijfwerk, dus voor heel grote
#   mappen is de host-koppeling van nas-koppelen.sh sneller.
set -euo pipefail

CTID="${CTID:-${1:-}}"
MOUNT="${MOUNT:-/home/akkoordkast/muziek}"
NAS_PROTO="${NAS_PROTO:-cifs}"
NAS_HOST="${NAS_HOST:-}"
NAS_SHARE="${NAS_SHARE:-}"
NAS_USER="${NAS_USER:-}"
NAS_PASS="${NAS_PASS:-}"
NAS_POORT="${NAS_POORT:-}"
HERSTART="${HERSTART:-ja}"
HIER="$(cd "$(dirname "$0")" && pwd)"
BINNEN_SCRIPT="$HIER/nas-mount-lxc.sh"
BASIS_URL="${BASIS_URL:-https://raw.githubusercontent.com/Theberas04/akkoordkast/main/deploy/proxmox}"

# Draai je dit script via een one-liner van GitHub, dan staat nas-mount-lxc.sh hier
# niet naast. Dan halen we hem op; mislukt dat, dan zeggen we het gewoon.
haal_binnen_script() {
  [ -f "$BINNEN_SCRIPT" ] && return 0
  BINNEN_SCRIPT="$(mktemp)"
  zeg_tijdelijk="   Ik haal nas-mount-lxc.sh op van GitHub..."
  printf '%s\n' "$zeg_tijdelijk"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$BASIS_URL/nas-mount-lxc.sh" -o "$BINNEN_SCRIPT" || true
  elif command -v wget >/dev/null 2>&1; then
    wget -qO "$BINNEN_SCRIPT" "$BASIS_URL/nas-mount-lxc.sh" || true
  fi
  [ -s "$BINNEN_SCRIPT" ] || return 1
  return 0
}

zeg() { printf '%s\n' "$*"; }
fout() { printf '%s\n' "$*" >&2; }
stop() { fout "$*"; exit 1; }

[ "$(id -u)" = "0" ] || stop "Draai dit als root op de Proxmox-host."
command -v pct >/dev/null 2>&1 || stop "Dit script hoort op de Proxmox-host te draaien (pct ontbreekt)."
[ -n "$CTID" ] || stop "Geef het container-id mee, bijvoorbeeld: CTID=225 bash $0"
pct status "$CTID" >/dev/null 2>&1 || stop "Container $CTID bestaat niet op deze host."
haal_binnen_script || stop "Ik kan nas-mount-lxc.sh niet vinden en ook niet ophalen van GitHub. Zet hem naast dit script of geef BASIS_URL mee."
zeg "   Container $CTID gevonden; nas-mount-lxc.sh staat klaar."

CONF="/etc/pve/lxc/$CTID.conf"
[ -f "$CONF" ] || stop "Ik kan de configuratie van container $CTID niet vinden: $CONF"

# --- gegevens ophalen ---------------------------------------------------------
if [ -z "$NAS_HOST" ]; then
  zeg ""
  zeg "De NAS-gegevens (laat een wachtwoord niet op het scherm staan als er iemand meekijkt)."
  printf '%s' "IP-adres van de NAS: "
  read -r NAS_HOST
fi
if [ "$NAS_PROTO" = "cifs" ] && [ -z "$NAS_SHARE" ]; then
  printf '%s' "Naam van de share op de NAS (bijvoorbeeld muziek): "
  read -r NAS_SHARE
fi
if [ -z "$NAS_USER" ]; then
  printf '%s' "Gebruikersnaam op de NAS (leeg laten als de share open is): "
  read -r NAS_USER
fi
if [ -z "$NAS_PASS" ] && [ -n "$NAS_USER" ]; then
  printf '%s' "Wachtwoord op de NAS: "
  read -rs NAS_PASS
  zeg ""
fi
[ -n "$NAS_HOST" ] || stop "Zonder het adres van de NAS kan ik niets koppelen."

zeg ""
zeg "== Controle vooraf"
if command -v ping >/dev/null 2>&1; then
  if ping -c 1 -W 2 "$NAS_HOST" >/dev/null 2>&1; then
    zeg "   De NAS antwoordt op $NAS_HOST."
  else
    fout "   Let op: $NAS_HOST antwoordt niet op een ping. Een NAS mag pings weigeren;"
    fout "   het kan dus alsnog goed gaan. Ik ga door."
  fi
fi

# --- /dev/fuse in de container ------------------------------------------------
zeg "== Fuse doorgeven aan container $CTID"
kopie="$CONF.bak-$(date +%Y%m%d-%H%M%S)"
cp -a "$CONF" "$kopie"
zeg "   Oude configuratie bewaard als $kopie (terugzetten: cp $kopie $CONF)"

veranderd=0
if ! grep -q "c 10:229" "$CONF"; then
  printf '%s\n' "lxc.cgroup2.devices.allow: c 10:229 rwm" >> "$CONF"
  veranderd=1
fi
if ! grep -q "dev/fuse" "$CONF"; then
  printf '%s\n' "lxc.mount.entry: /dev/fuse dev/fuse none bind,create=file,optional 0 0" >> "$CONF"
  veranderd=1
fi

if [ "$veranderd" = "1" ]; then
  zeg "   Fuse toegevoegd aan $CONF."
  if [ "$HERSTART" = "ja" ]; then
    zeg "   De container moet een keer opnieuw opstarten om /dev/fuse te krijgen."
    zeg "   De app is dan even niet bereikbaar. Bezig..."
    pct reboot "$CTID" >/dev/null 2>&1 || pct stop "$CTID" >/dev/null 2>&1 || true
    sleep 3
    for _ in $(seq 1 30); do
      if pct status "$CTID" 2>/dev/null | grep -q running; then break; fi
      sleep 2
    done
    pct status "$CTID" 2>/dev/null | grep -q running || stop "Container $CTID wilde niet starten. Zet $kopie terug en probeer het opnieuw."
    zeg "   Container is weer op."
  else
    fout "   HERSTART=nee: start de container zelf opnieuw op voordat de rest werkt."
  fi
else
  zeg "   Fuse stond al in de configuratie; de container hoefde niet opnieuw te starten."
fi

# --- gegevens naar de container ----------------------------------------------
# De gegevens gaan als bestand mee, niet als opdrachtregel: zo staan ze niet in de
# proceslijst van de host en niet in de geschiedenis van de shell.
GEGEVENS="$(mktemp)"
chmod 600 "$GEGEVENS"
cat > "$GEGEVENS" <<GEGEVENSEOF
NAS_PROTO=$NAS_PROTO
NAS_HOST=$NAS_HOST
NAS_SHARE=$NAS_SHARE
NAS_USER=$NAS_USER
NAS_PASS=$NAS_PASS
NAS_POORT=$NAS_POORT
MOUNT=$MOUNT
GEGEVENSEOF

zeg "== De koppeling in de container opzetten"
pct push "$CTID" "$BINNEN_SCRIPT" /root/nas-mount-lxc.sh --perms 700 >/dev/null
pct push "$CTID" "$GEGEVENS" /root/nas-gegevens.env --perms 600 >/dev/null
rm -f "$GEGEVENS"

set +e
pct exec "$CTID" -- bash /root/nas-mount-lxc.sh
uitslag=$?
set -e

# De gegevens (met het wachtwoord) blijven niet in de container staan.
pct exec "$CTID" -- rm -f /root/nas-gegevens.env /root/nas-mount-lxc.sh >/dev/null 2>&1 || true

if [ "$uitslag" != "0" ]; then
  fout ""
  fout "De koppeling in de container lukte niet (code $uitslag). De regel in $CONF laat ik staan,"
  fout "want die is nodig voor een nieuwe poging. Wil je hem terugdraaien:"
  fout "   cp $kopie $CONF && pct reboot $CTID"
  exit "$uitslag"
fi

zeg ""
zeg "Klaar. De NAS staat in container $CTID op $MOUNT."
zeg "Wijs de app erop met MUSIC_DIR=$MOUNT (dat deed het script al) en ga in de app naar"
zeg "Toevoegen, Muziekmap scannen, Kijk wat erin zit."
