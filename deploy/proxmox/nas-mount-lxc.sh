#!/usr/bin/env bash
# De containerkant van nas-koppelen-lxc.sh: koppelt de NAS-share met rclone (fuse).
#
# Dit script hoort IN de container te draaien, als root. Je hoeft het niet zelf aan
# te roepen: nas-koppelen-lxc.sh doet dat vanaf de Proxmox-host.
#
# Wat het doet, stap voor stap:
#   1. leest de gegevens uit /root/nas-gegevens.env,
#   2. controleert of /dev/fuse er is (zonder fuse kan dit niet; dan zegt het script
#      dat je eerst nas-koppelen-lxc.sh op de host moet draaien),
#   3. installeert rclone en fuse3,
#   4. schrijft de koppeling in /root/.config/rclone/rclone.conf (rechten 600),
#   5. probeert de share te lezen en laat de fout van rclone zien als dat mislukt,
#   6. zet een systemd-service die de map koppelt en na een herstart terugkomt,
#   7. zet een systemd-timer die elke vijf minuten kijkt of de map er nog is en de
#      service zo nodig herstart,
#   8. zet MUSIC_DIR in de dienst van de app, zodat de app de map zelf voorstelt.
#
# Eerst kijken wat het zou doen, zonder iets te veranderen:
#   PROEF=1 GEGEVENS=/pad/naar/gegevens.env bash nas-mount-lxc.sh
# In proefmodus schrijft het script alles in een tijdelijke map in plaats van in /etc,
# en probeert het niets te installeren of te starten.
set -euo pipefail

GEGEVENS="${GEGEVENS:-/root/nas-gegevens.env}"
REMOTE="${REMOTE:-nas}"
DIENST="akkoordkast-nas.service"
CONTROLE_DIENST="akkoordkast-nas-check.service"
CONTROLE_TIMER="akkoordkast-nas-check.timer"
APP_DIENST="${APP_DIENST:-akkoordkast.service}"
APP_GEBRUIKER="${APP_GEBRUIKER:-akkoordkast}"
PROEF="${PROEF:-}"

NAS_PROTO="cifs"
NAS_HOST=""
NAS_SHARE=""
NAS_USER=""
NAS_PASS=""
NAS_POORT=""
MOUNT=""

zeg() { printf '%s\n' "$*"; }
fout() { printf '%s\n' "$*" >&2; }
stop() { fout "$*"; exit 1; }

# In proefmodus verandert het script niets buiten deze tijdelijke map.
if [ -n "$PROEF" ]; then
  PROEFWORTEL="$(mktemp -d)"
  SYSTEMD_MAP="$PROEFWORTEL/etc/systemd/system"
  FUSE_CONF="$PROEFWORTEL/etc/fuse.conf"
  RCLONE_CONF="${RCLONE_CONF:-$PROEFWORTEL/rclone/rclone.conf}"
  MOUNT="${MOUNT:-$PROEFWORTEL/muziek}"
  mkdir -p "$SYSTEMD_MAP" "$PROEFWORTEL/etc" "$(dirname "$RCLONE_CONF")" "$MOUNT"
  touch "$FUSE_CONF"
  zeg "PROEFMODUS: ik verander niets buiten $PROEFWORTEL"
else
  SYSTEMD_MAP="/etc/systemd/system"
  FUSE_CONF="/etc/fuse.conf"
  RCLONE_CONF="${RCLONE_CONF:-/root/.config/rclone/rclone.conf}"
  MOUNT="${MOUNT:-/home/akkoordkast/muziek}"
fi
DIENST_PAD="$SYSTEMD_MAP/$DIENST"
CONTROLE_PAD="$SYSTEMD_MAP/$CONTROLE_DIENST"
TIMER_PAD="$SYSTEMD_MAP/$CONTROLE_TIMER"
DROPIN_MAP="$SYSTEMD_MAP/$APP_DIENST.d"
DROPIN="$DROPIN_MAP/muziekmap.conf"

# In proefmodus doen we alsof: zo loopt de hele weg na zonder rechten.
doe() {
  if [ -n "$PROEF" ]; then
    printf '%s\n' "   [proef] zou uitvoeren: $*"
    return 0
  fi
  "$@"
}

if [ -z "$PROEF" ]; then
  [ "$(id -u)" = "0" ] || stop "Draai dit als root IN de container."
fi
[ -f /etc/debian_version ] || stop "Dit script gaat uit van een Debian-container (apt)."

if [ -f "$GEGEVENS" ]; then
  # shellcheck disable=SC1090
  . "$GEGEVENS"
else
  stop "Ik mis $GEGEVENS. Draai eerst nas-koppelen-lxc.sh vanaf de Proxmox-host, of zet dat bestand zelf klaar."
fi

[ -n "$NAS_HOST" ] || stop "Er staat geen NAS_HOST in $GEGEVENS."
if [ -n "$PROEF" ] && [ -z "$MOUNT" ]; then
  MOUNT="$PROEFWORTEL/muziek"
fi

zeg "== Controleren of deze container zelf mag koppelen"
FUSE_AANWEZIG=0
[ -e /dev/fuse ] && FUSE_AANWEZIG=1
if [ -n "$PROEF" ] && [ "${PROEF_FUSE:-}" = "ja" ]; then FUSE_AANWEZIG=1; fi

if [ "$FUSE_AANWEZIG" != "1" ]; then
  fout "Deze container heeft geen /dev/fuse, dus hij kan de NAS niet zelf koppelen."
  fout ""
  fout "Dat komt zo goed: een ongeprivilegieerde container mag dit niet zomaar."
  fout "Draai op de Proxmox-host een keer:"
  fout "   CTID=<dit container-id> bash deploy/proxmox/nas-koppelen-lxc.sh"
  fout "Dat zet /dev/fuse in de container en start hem opnieuw op."
  fout ""
  fout "Wil je de map liever op de host koppelen en in de container hangen (dat is bij"
  fout "grote mappen sneller), gebruik dan deploy/proxmox/nas-koppelen.sh."
  exit 1
fi
zeg "   /dev/fuse is aanwezig."

zeg "== rclone en fuse installeren"
if command -v rclone >/dev/null 2>&1; then
  zeg "   rclone staat er al: $(rclone version 2>/dev/null | head -1)"
else
  doe bash -c "DEBIAN_FRONTEND=noninteractive apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq rclone fuse3"
  if [ -z "$PROEF" ]; then
    command -v rclone >/dev/null 2>&1 || stop "rclone installeren lukte niet."
  fi
fi

zeg "== De koppeling naar de NAS opschrijven"
mkdir -p "$(dirname "$RCLONE_CONF")"
doe chmod 700 "$(dirname "$RCLONE_CONF")"

VERSLUIERD=""
if [ -n "$NAS_PASS" ]; then
  if command -v rclone >/dev/null 2>&1; then
    VERSLUIERD="$(printf '%s' "$NAS_PASS" | rclone obscure -)"
  else
    VERSLUIERD="(wachtwoord, versluierd door rclone)"
  fi
fi

# Het wachtwoord staat alleen in dit bestand (rechten 600). Het gaat niet mee als
# opdrachtregel, dus het staat ook niet in de proceslijst.
if [ "$NAS_PROTO" = "nfs" ]; then
  cat > "$RCLONE_CONF" <<CONFEOF
[$REMOTE]
type = nfs
host = $NAS_HOST
CONFEOF
  if [ -n "$NAS_SHARE" ]; then
    printf '%s\n' "path = $NAS_SHARE" >> "$RCLONE_CONF"
  fi
else
  cat > "$RCLONE_CONF" <<CONFEOF
[$REMOTE]
type = smb
host = $NAS_HOST
user = $NAS_USER
pass = $VERSLUIERD
CONFEOF
  if [ -n "$NAS_POORT" ]; then
    printf '%s\n' "port = $NAS_POORT" >> "$RCLONE_CONF"
  fi
fi
doe chmod 600 "$RCLONE_CONF"
zeg "   $RCLONE_CONF geschreven (rechten 600)."

zeg "== De share proberen te lezen"
if [ -n "$PROEF" ] && [ "${PROEF_SHARE:-}" != "ja" ]; then
  zeg "   [proef] ik probeer de share niet; zet PROEF_SHARE=ja om dat wel te doen."
elif rclone lsd "$REMOTE:" --timeout 20s >/dev/null 2>&1; then
  zeg "   De NAS antwoordt."
  if [ -n "$NAS_SHARE" ]; then
    if ! rclone lsd "$REMOTE:$NAS_SHARE" --timeout 20s >/dev/null 2>&1; then
      fout "   Let op: de share $NAS_SHARE kon ik niet openen. Wat rclone zegt:"
      rclone lsd "$REMOTE:$NAS_SHARE" --timeout 20s 2>&1 | sed 's/^/   /' | head -20
      exit 1
    fi
  fi
else
  fout "   Ik kan de share niet lezen. Wat rclone zegt:"
  set +e
  rclone lsd "$REMOTE:" --timeout 20s 2>&1 | sed 's/^/   /' | head -20
  set -e
  fout ""
  fout "Controleer het adres, de gebruikersnaam en het wachtwoord op de NAS, en of de"
  fout "share bestaat. Klopt alles, draai dit script dan opnieuw."
  exit 1
fi

zeg "== Schrijfrechten controleren"
if [ "$NAS_PROTO" = "nfs" ] && [ -n "$NAS_SHARE" ]; then
  DOEL="$REMOTE:$NAS_SHARE"
elif [ -n "$NAS_SHARE" ]; then
  DOEL="$REMOTE:$NAS_SHARE"
else
  DOEL="$REMOTE:"
fi

if [ -n "$PROEF" ] && [ "${PROEF_SHARE:-}" != "ja" ]; then
  zeg "   [proef] ik schrijf geen proefbestand."
elif rclone touch "$DOEL/akkoordkast-proef.txt" --timeout 20s >/dev/null 2>&1; then
  rclone deletefile "$DOEL/akkoordkast-proef.txt" --timeout 20s >/dev/null 2>&1 || true
  zeg "   Schrijven in de share werkt."
else
  fout "   Let op: ik kan wel lezen maar niet schrijven in $DOEL."
  fout "   De app zet nieuwe liedjes in deze map, dus dat moet wel kunnen."
  fout "   Op een TrueNAS bijvoorbeeld: kijk bij Datasets of de gebruiker van deze"
  fout "   koppeling eigenaar is van de dataset (of in de groep zit) en of de share"
  fout "   geen alleen-lezen vinkje heeft. Daarna dit script opnieuw draaien."
  fout "   Alleen lezen kan genoeg zijn als je de map niet laat bijhouden; dan mag je"
  fout "   dit negeren, maar dan kun je in de app ook geen nieuwe muziek omzetten."
fi

zeg "== De map koppelen op $MOUNT"
mkdir -p "$MOUNT"
if ! grep -q "^user_allow_other" "$FUSE_CONF" 2>/dev/null; then
  printf '%s\n' "user_allow_other" >> "$FUSE_CONF"
fi
if [ -n "$PROEF" ]; then
  zeg "   [proef] op een echte machine zet ik user_allow_other in /etc/fuse.conf."
fi

if id "$APP_GEBRUIKER" >/dev/null 2>&1; then
  UID_APP="$(id -u "$APP_GEBRUIKER")"
  GID_APP="$(id -g "$APP_GEBRUIKER")"
else
  UID_APP="0"
  GID_APP="0"
  fout "   Let op: gebruiker $APP_GEBRUIKER bestaat hier niet; de bestanden komen van root."
fi

cat > "$DIENST_PAD" <<UNITEOF
[Unit]
Description=NAS-map van AkkoordKast (rclone)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/bin/rclone mount $REMOTE: $MOUNT --config $RCLONE_CONF --vfs-cache-mode writes --dir-cache-time 5m --allow-other --uid $UID_APP --gid $GID_APP --umask 002 --timeout 30s --log-level INFO
ExecStop=/bin/fusermount3 -u $MOUNT
Restart=on-failure
RestartSec=10
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
UNITEOF
doe chmod 644 "$DIENST_PAD"

cat > "$CONTROLE_PAD" <<ONDERHOUDEOF
[Unit]
Description=Kijkt of de NAS-map van AkkoordKast er nog is

[Service]
Type=oneshot
ExecStart=/bin/bash -c "mountpoint -q $MOUNT || systemctl restart $DIENST"
ONDERHOUDEOF
doe chmod 644 "$CONTROLE_PAD"

cat > "$TIMER_PAD" <<TIMEREOF
[Unit]
Description=Elke vijf minuten kijken of de NAS-map van AkkoordKast er nog is

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min

[Install]
WantedBy=timers.target
TIMEREOF
doe chmod 644 "$TIMER_PAD"
zeg "   De dienst, de controle en de timer staan klaar."

doe systemctl daemon-reload
doe systemctl enable --now "$CONTROLE_TIMER"

# Een oude koppeling eerst netjes losmaken, anders weigert fuse.
if [ -z "$PROEF" ] && mountpoint -q "$MOUNT"; then
  systemctl stop "$DIENST" >/dev/null 2>&1 || true
  fusermount3 -u "$MOUNT" >/dev/null 2>&1 || true
fi

doe systemctl enable --now "$DIENST"

if [ -n "$PROEF" ]; then
  zeg "   [proef] op een echte machine zou de map nu op $MOUNT staan."
else
  for _ in $(seq 1 20); do
    if mountpoint -q "$MOUNT"; then break; fi
    sleep 1
  done
  if ! mountpoint -q "$MOUNT"; then
    fout "De map is niet gekoppeld. Wat de dienst zegt:"
    systemctl status "$DIENST" --no-pager -l 2>&1 | tail -20 | sed 's/^/   /'
    fout "Opnieuw proberen: systemctl restart $DIENST"
    exit 1
  fi
  zeg "   De map staat op $MOUNT."
fi

zeg "== De app naar deze map wijzen"
mkdir -p "$DROPIN_MAP"
cat > "$DROPIN" <<DROPINEOF
[Service]
Environment=MUSIC_DIR=$MOUNT
DROPINEOF

if [ -n "$PROEF" ]; then
  zeg "   [proef] MUSIC_DIR=$MOUNT in $DROPIN, daarna de app herstarten."
elif systemctl list-unit-files "$APP_DIENST" >/dev/null 2>&1; then
  systemctl daemon-reload
  systemctl restart "$APP_DIENST" >/dev/null 2>&1 || fout "   Let op: $APP_DIENST herstarten lukte niet; doe dat zelf een keer."
  zeg "   MUSIC_DIR=$MOUNT staat in $DROPIN en de app is herstart."
else
  fout "   De dienst $APP_DIENST vond ik niet. Zet zelf MUSIC_DIR=$MOUNT in de omgeving van de app."
fi

zeg ""
if [ -n "$PROEF" ]; then
  zeg "Proef klaar; er is niets buiten $PROEFWORTEL veranderd. Kijk gerust in die map."
else
  zeg "Klaar. De NAS staat rechtstreeks in deze container op $MOUNT."
  zeg "Controle:    mountpoint -q $MOUNT && echo goed"
  zeg "Logboek:     journalctl -u $DIENST -n 30"
  zeg "Losmaken:    systemctl disable --now $DIENST && fusermount3 -u $MOUNT"
fi
