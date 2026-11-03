#!/usr/bin/env bash
# Zet Google Drive als muziekmap klaar voor AkkoordKast, met rclone.
#
# Draai dit IN de container, als root:
#
#   pct exec <CTID> -- bash -c "$(cat deploy/proxmox/drive-koppelen.sh)"
#
# of, als het bestand al in de container staat:
#
#   bash drive-koppelen.sh
#
# Wat het doet, stap voor stap:
#   1. installeert rclone en fuse (de map wordt als gebruikersbestandssysteem
#      gekoppeld, daar is fuse voor nodig),
#   2. legt uit hoe je eenmalig rclone config doet en controleert of de
#      koppeling (remote) bestaat,
#   3. maakt de koppelmap aan,
#   4. zet een systemd-service op die de map koppelt met
#      rclone mount --vfs-cache-mode writes, en die na een herstart van de
#      container weer opkomt,
#   5. zet een systemd-timer op die elke vijf minuten controleert of de map er
#      nog is en de service zo nodig herstart,
#   6. laat zien hoe je MUSIC_DIR op deze map zet.
#
# Eenmalige aanmelding bij Google (dat kan niet zonder browser):
#   - Op een computer met een browser: installeer daar rclone, draai
#     rclone config, maak een remote van het type drive aan, en laat de
#     browser inloggen. Kopieer daarna het bestand met de inloggegevens naar
#     deze container, standaard /root/.config/rclone/rclone.conf.
#   - Of: draai rclone config in deze container. Die print een link. Die link
#     open je in een browser op een ander apparaat; de code die je terugkrijgt
#     plak je in de container. Zo heb je geen browser in de container nodig.
# Zonder gedaan configuratiebestand stopt dit script met uitleg en verandert
# het verder niets.
set -euo pipefail

REMOTE="${REMOTE:-gdrive}"
MOUNT="${MOUNT:-/home/akkoordkast/muziek}"
CONTAINER_GEBRUIKER="${CONTAINER_GEBRUIKER:-akkoordkast}"
RCLONE_CONF="${RCLONE_CONF:-/root/.config/rclone/rclone.conf}"
APP_DIR="${APP_DIR:-/opt/akkoordkast}"
POORT="${POORT:-80}"
DIENST="akkoordkast-drive-mount.service"
CONTROLE_DIENST="akkoordkast-drive-check.service"
CONTROLE_TIMER="akkoordkast-drive-check.timer"

zeg() { printf '%s\n' "$*"; }
fout() { printf '%s\n' "$*" >&2; }

if [ "$(id -u)" != "0" ]; then
  fout "Draai dit als root IN de container."
  fout "Vanaf de Proxmox-host bijvoorbeeld: pct exec <CTID> -- bash drive-koppelen.sh"
  exit 1
fi

if [ ! -f /etc/debian_version ]; then
  fout "Dit script gaat uit van een Debian-container (apt)."
  exit 1
fi

# --- Stap 1: rclone en fuse installeren -------------------------------------

zeg "== rclone en fuse installeren"
if ! command -v rclone >/dev/null 2>&1; then
  if ! DEBIAN_FRONTEND=noninteractive apt-get install -y -qq rclone fuse3 >/dev/null; then
    fout "Kon rclone of fuse3 niet installeren."
    fout "Draai eerst: apt-get update && apt-get install -y rclone fuse3"
    exit 1
  fi
else
  zeg "   rclone is er al ($(rclone version | head -1))"
fi

# rclone mount mag alleen door andere gebruikers gelezen worden als fuse dat
# toestaat. De app draait als de gebruiker $CONTAINER_GEBRUIKER, dus dat moet.
if [ -f /etc/fuse.conf ] && ! grep -qE '^[[:space:]]*user_allow_other' /etc/fuse.conf; then
  zeg "   user_allow_other aanzetten in /etc/fuse.conf"
  printf 'user_allow_other\n' >> /etc/fuse.conf
fi

# --- Stap 2: eenmalige aanmelding en de remote ------------------------------

zeg "== De Google Drive-koppeling (remote) controleren"
if ! rclone listremotes 2>/dev/null | grep -q "^${REMOTE}:"; then
  fout "De remote '$REMOTE' is nog niet ingesteld."
  fout ""
  fout "Doe eerst eenmalig de aanmelding bij Google. Dat kan op twee manieren:"
  fout ""
  fout "  A. Op een computer met een browser:"
  fout "     - installeer daar rclone en draai: rclone config"
  fout "     - kies n (nieuwe remote), geef hem de naam $REMOTE, kies als type drive,"
  fout "       en laat de browser inloggen; sla op."
  fout "     - kopieer daarna het bestand met de inloggegevens naar deze container:"
  fout "         vanaf een andere machine:"
  fout "           pct push <CTID> rclone.conf $RCLONE_CONF --perms 600"
  fout "       of zet de inhoud met een editor in $RCLONE_CONF"
  fout ""
  fout "  B. In deze container zelf (geen browser nodig):"
  fout "     - draai: rclone config"
  fout "     - kies n (nieuwe remote), naam $REMOTE, type drive."
  fout "     - rclone print een link; open die in een browser op een ander"
  fout "       apparaat, log in, en plak de code die je terugkrijgt hier in."
  fout ""
  fout "Draai daarna dit script opnieuw."
  exit 1
fi
zeg "   remote '$REMOTE' bestaat"

mkdir -p "$(dirname "$RCLONE_CONF")"
chmod 700 "$(dirname "$RCLONE_CONF")" 2>/dev/null || true
if [ -f "$RCLONE_CONF" ]; then chmod 600 "$RCLONE_CONF"; fi

if ! rclone lsd "${REMOTE}:" --max-depth 1 >/dev/null 2>&1; then
  fout "De remote '$REMOTE' bestaat, maar Google Drive antwoordt niet."
  fout "Controleer je internetverbinding en of de aanmelding nog geldig is:"
  fout "   rclone about ${REMOTE}:"
  exit 1
fi
zeg "   Google Drive is bereikbaar"

# --- Stap 3: de koppelmap ---------------------------------------------------

zeg "== Koppelmap aanmaken: $MOUNT"
mkdir -p "$MOUNT"
if id -u "$CONTAINER_GEBRUIKER" >/dev/null 2>&1; then
  chown "$CONTAINER_GEBRUIKER:$CONTAINER_GEBRUIKER" "$MOUNT"
fi

# --- Stap 4: de systemd-service die de map koppelt --------------------------
# --vfs-cache-mode writes laat schrijfacties eerst lokaal landen en daarna pas
# naar Drive gaan; zonder die optie weigert de app-bestanden-app het schrijven.

zeg "== Service installeren: $DIENST"
UNIT="/etc/systemd/system/$DIENST"
cat > "$UNIT" <<UNITEOF
[Unit]
Description=Google Drive van AkkoordKast koppelen met rclone
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
ExecStartPre=/bin/mkdir -p $MOUNT
ExecStart=/usr/bin/rclone mount $REMOTE: $MOUNT --config $RCLONE_CONF --vfs-cache-mode writes --dir-cache-time 1m --poll-interval 15s --umask 002 --allow-other
ExecStop=/bin/fusermount -uz $MOUNT
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
UNITEOF
zeg "   $UNIT geschreven"

# --- Stap 5: de timer die de koppeling in de gaten houdt --------------------
# Google Drive wil de koppeling nog wel eens laten vallen. De timer test elke
# vijf minuten of de map er nog is en herstart de service zo nodig.

zeg "== Controle-timer installeren: $CONTROLE_TIMER"
cat > "/etc/systemd/system/$CONTROLE_DIENST" <<CHECKEOF
[Unit]
Description=Controleer of de Google Drive-koppeling van AkkoordKast nog leeft

[Service]
Type=oneshot
ExecStart=/bin/bash -c "/usr/bin/mountpoint -q $MOUNT || /bin/systemctl restart $DIENST"
CHECKEOF

cat > "/etc/systemd/system/$CONTROLE_TIMER" <<TIMEREOF
[Unit]
Description=Controleer regelmatig de Google Drive-koppeling van AkkoordKast

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
Unit=$CONTROLE_DIENST

[Install]
WantedBy=timers.target
TIMEREOF
zeg "   $CONTROLE_DIENST en $CONTROLE_TIMER geschreven"

# --- Stap 6: inschakelen en koppelen ----------------------------------------

zeg "== Dienst en timer inschakelen"
systemctl daemon-reload
systemctl enable "$CONTROLE_TIMER" >/dev/null 2>&1 || true
systemctl enable "$CONTROLE_DIENST" >/dev/null 2>&1 || true
systemctl restart "$DIENST"
systemctl start "$CONTROLE_TIMER" >/dev/null 2>&1 || true

zeg "== Wachten tot de map gekoppeld is"
OK=0
for poging in $(seq 1 30); do
  if mountpoint -q "$MOUNT"; then OK=1; break; fi
  sleep 2
done
if [ "$OK" != "1" ]; then
  fout "De map is niet gekoppeld."
  fout "Wat je kunt doen:"
  fout "   systemctl status $DIENST --no-pager -l"
  fout "   journalctl -u $DIENST -n 30 --no-pager"
  fout "Meestal is de aanmelding verlopen of de remote-naam verkeerd; draai dan"
  fout "opnieuw rclone config en daarna dit script."
  exit 1
fi
zeg "   $MOUNT is gekoppeld aan ${REMOTE}:"

# --- MUSIC_DIR zetten: de app op deze map wijzen ----------------------------
# De map die de app scant hoort in MUSIC_DIR te staan (standaard $MOUNT). We
# zetten dat via een drop-in op de dienst van de app, zodat het een herstart
# overleeft. Dezelfde waarde vul je ook in bij Muziekmap scannen in de app.

zeg "== MUSIC_DIR zetten op $MOUNT"
DROPIN_DIR="/etc/systemd/system/akkoordkast.service.d"
mkdir -p "$DROPIN_DIR"
printf '[Service]\nEnvironment=MUSIC_DIR=%s\n' "$MOUNT" > "$DROPIN_DIR/music-dir.conf"
zeg "   $DROPIN_DIR/music-dir.conf geschreven"

if systemctl list-unit-files 2>/dev/null | grep -q '^akkoordkast.service'; then
  systemctl daemon-reload
  systemctl restart akkoordkast || true
  zeg "   de app is herstart met MUSIC_DIR=$MOUNT"
else
  zeg "   (de dienst akkoordkast is hier nog niet gevonden; MUSIC_DIR staat wel klaar)"
fi

# --- Klaar ------------------------------------------------------------------

cat <<KLAAR

==============================================================
 Google Drive is gekoppeld aan de muziekmap
==============================================================
   koppeling : ${REMOTE}:  ->  $MOUNT
   dienst    : $DIENST
   timer     : $CONTROLE_TIMER (elke vijf minuten een controle)
   MUSIC_DIR : $MOUNT

 Nu de app erop wijzen:
   1. Open AkkoordKast in je browser.
   2. Ga naar het tabblad Toevoegen en zoek Muziekmap scannen op.
   3. Vul bij Map op deze machine in:  $MOUNT
   4. Klik op Kijk wat erin zit, en daarna op Alles omzetten.

 Let op: Google Drive koppelen gaat over het internet. Bij een grote map duurt
 het inlezen langer en worden bestanden pas bij gebruik opgehaald; houd daar bij
 het omzetten rekening mee.

 Controle:  mountpoint -q $MOUNT && echo gekoppeld
 Logboek :  journalctl -u $DIENST -n 30 --no-pager
 Bijwerken van de aanmelding: rclone config, daarna systemctl restart $DIENST

==============================================================
KLAAR
