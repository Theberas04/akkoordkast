#!/usr/bin/env bash
# Zet de eenmalige voorbereiding klaar voor een cloudkoppeling (Google Drive of OneDrive) in de
# AkkoordKast-container. Daarna koppel je in de app zelf: Toevoegen -> Downloaden als mp3 ->
# Cloudopslag koppelen. Dit script hoef je daarna nooit meer te draaien.
#
# Draai dit OP DE PROXMOX-HOST, als root:
#
#   CTID=106 bash -c "$(curl -fsSL https://raw.githubusercontent.com/Theberas04/akkoordkast/main/deploy/proxmox/drive-koppelen-lxc.sh)"
#
# of, met dit bestand op de host:
#
#   CTID=106 bash deploy/proxmox/drive-koppelen-lxc.sh
#
# Wat het doet (alles eenmalig):
#   1. zet het fuse-recht in de container (de vlag fuse=1 in de containeropties; de oude
#      configuratie wordt bewaard) en herstart de container één keer, alleen als dat nodig is;
#   2. installeert in de container rclone en fuse3 (alleen als ze er nog niet zijn);
#   3. zet user_allow_other in /etc/fuse.conf, zodat de koppeling ook voor andere gebruikers
#      (zoals root) leesbaar is;
#   4. herstelt zo nodig een te strenge instelling van de app-dienst (NoNewPrivileges), die
#      een koppeling vanuit de app laat mislukken met "mount failed: Operation not permitted".
#
# De oudere route met drive-koppelen.sh (een systemd-dienst in de container) blijft bestaan,
# maar is voor de koppelwizard in de app niet nodig.
set -euo pipefail

CTID="${CTID:-${1:-}}"
HERSTART="${HERSTART:-ja}"

zeg() { printf '%s\n' "$*"; }
fout() { printf '%s\n' "$*" >&2; }
stop() { fout "$*"; exit 1; }

[ "$(id -u)" = "0" ] || stop "Draai dit als root op de Proxmox-host."
command -v pct >/dev/null 2>&1 || stop "Dit script hoort op de Proxmox-host te draaien (pct ontbreekt)."
[ -n "$CTID" ] || stop "Geef het container-id mee, bijvoorbeeld: CTID=106 bash $0"
pct status "$CTID" >/dev/null 2>&1 || stop "Container $CTID bestaat niet op deze host."

CONF="/etc/pve/lxc/$CTID.conf"
[ -f "$CONF" ] || stop "Ik kan de configuratie van container $CTID niet vinden: $CONF"

# --- het fuse-recht in de container --------------------------------------------
# Een cloudkoppeling is een gebruikersbestandssysteem (fuse). De container heeft daarvoor
# twee dingen nodig: /dev/fuse en de AppArmor-regel die het koppelen toestaat. PVE regelt
# dat allebei met de vlag 'fuse=1' in de containeropties (features); eerdere versies van dit
# script zetten alleen de losse /dev/fuse-regel klaar, en dan weigert de koppeling met
# "fusermount: mount failed: Operation not permitted".
zeg "== Het fuse-recht doorgeven aan container $CTID"
veranderd=0
if grep -q '^features:.*fuse=1' "$CONF"; then
  zeg "   fuse=1 staat al in de containeropties."
else
  kopie="$CONF.bak-$(date +%Y%m%d-%H%M%S)"
  cp -a "$CONF" "$kopie"
  zeg "   Oude configuratie bewaard als $kopie (terugzetten: cp $kopie $CONF)"
  nieuw="fuse=1"
  if grep -q '^features:' "$CONF"; then
    bestaand="$(grep '^features:' "$CONF" | head -1 | sed 's/^features:[[:space:]]*//; s/[[:space:]]*$//')"
    [ -n "$bestaand" ] && nieuw="$bestaand,fuse=1"
  fi
  pct set "$CTID" -features "$nieuw"
  veranderd=1
  zeg "   fuse=1 toegevoegd (features: $nieuw)."
fi
grep -q '^features:.*fuse=1' "$CONF" || stop "De vlag fuse=1 kwam niet in $CONF; kijk daar even naar."
# De losse /dev/fuse-regel van eerdere versies van dit script is met fuse=1 dubbelop; opruimen.
if grep -q '^lxc.mount.entry: /dev/fuse' "$CONF"; then
  tijd="$(mktemp)"
  grep -v '^lxc.mount.entry: /dev/fuse' "$CONF" > "$tijd"
  cat "$tijd" > "$CONF"
  rm -f "$tijd"
  veranderd=1
  zeg "   Oude losse /dev/fuse-regel opgeruimd (fuse=1 regelt dat nu zelf)."
fi

if [ "$veranderd" = "1" ]; then
  if [ "$HERSTART" = "ja" ]; then
    zeg "   De container moet een keer opnieuw opstarten om het fuse-recht te krijgen."
    zeg "   De app is dan even niet bereikbaar. Bezig..."
    pct reboot "$CTID" >/dev/null 2>&1 || pct stop "$CTID" >/dev/null 2>&1 || true
    sleep 3
    for _ in $(seq 1 30); do
      if pct status "$CTID" 2>/dev/null | grep -q running; then break; fi
      sleep 2
    done
    pct status "$CTID" 2>/dev/null | grep -q running || stop "Container $CTID wilde niet starten. Controleer $CONF en probeer het opnieuw."
    zeg "   Container is weer op."
  else
    fout "   HERSTART=nee: start de container zelf opnieuw op voordat de rest werkt."
  fi
else
  zeg "   Het fuse-recht stond al goed; de container hoefde niet opnieuw te starten."
fi

# --- rclone en fuse3 in de container ------------------------------------------
# Het containerdeel gaat als klein script mee: zo staan er geen ingewikkelde quotes in dit
# bestand en is de uitvoering in de container precies wat hieronder staat.
zeg "== rclone en fuse3 in de container"
BINNEN="$(mktemp)"
cat > "$BINNEN" <<'BINNENEOF'
set -e
if command -v rclone >/dev/null 2>&1 && command -v fusermount3 >/dev/null 2>&1; then
  echo "   rclone en fuse3 staan er al."
else
  echo "   Installeren (even geduld)..."
  DEBIAN_FRONTEND=noninteractive apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq rclone fuse3
fi
f=/etc/fuse.conf
[ -f "$f" ] || : > "$f"
grep -qE "^[[:space:]]*user_allow_other" "$f" || printf "user_allow_other\n" >> "$f"
echo "   user_allow_other in /etc/fuse.conf staat aan."
# De fuse3-postinst zet /usr/bin/fusermount3 normaal op 4755 (setuid). Zonder die bit kan een
# niet-root gebruiker geen fuse koppelen ("mount failed: Operation not permitted"); op sommige
# images raakt de bit kwijt. Zet hem goed als dat nodig is.
if [ -e /usr/bin/fusermount3 ]; then
  m="$(stat -c '%a' /usr/bin/fusermount3)"
  if [ "$m" != "4755" ]; then
    chmod 4755 /usr/bin/fusermount3
    echo "   setuid-bit op fusermount3 stond op $m en is goedgezet (4755)."
  else
    echo "   setuid-bit op fusermount3 staat goed (4755)."
  fi
fi
# De app-dienst van eerdere installaties kan te streng staan: NoNewPrivileges=yes maakt het
# setuid-bit van fusermount3 onwerkzaam ("mount failed: Operation not permitted" vanuit de
# app, terwijl los koppelen lukt). Een drop-in zet het recht goed; nieuwe installaties
# hebben hem niet nodig.
if [ -f /etc/systemd/system/akkoordkast.service ] && grep -q "NoNewPrivileges=yes" /etc/systemd/system/akkoordkast.service; then
  install -d /etc/systemd/system/akkoordkast.service.d
  printf "[Service]\nNoNewPrivileges=no\nCapabilityBoundingSet=CAP_NET_BIND_SERVICE CAP_SYS_ADMIN\n" > /etc/systemd/system/akkoordkast.service.d/zz-fuse-recht.conf
  systemctl daemon-reload
  systemctl restart akkoordkast
  echo "   app-dienst hersteld: koppelrecht gezet (NoNewPrivileges uit, SYS_ADMIN erin) en herstart."
else
  echo "   app-dienst: geen herstel nodig (of nog geen dienst)."
fi
BINNENEOF
pct push "$CTID" "$BINNEN" /root/akkoordkast-drive-voorbereiden.sh --perms 700 >/dev/null
if ! pct exec "$CTID" -- bash /root/akkoordkast-drive-voorbereiden.sh; then
  pct exec "$CTID" -- rm -f /root/akkoordkast-drive-voorbereiden.sh >/dev/null 2>&1 || true
  rm -f "$BINNEN"
  stop "De voorbereiding in de container lukte niet; zie de regels hierboven."
fi
pct exec "$CTID" -- rm -f /root/akkoordkast-drive-voorbereiden.sh >/dev/null 2>&1 || true
rm -f "$BINNEN"

# --- controle ------------------------------------------------------------------
zeg "== Controle in de container"
if ! pct exec "$CTID" -- bash -c "test -e /dev/fuse && command -v rclone >/dev/null 2>&1 && command -v fusermount3 >/dev/null 2>&1"; then
  stop "De controle vond een ontbrekend onderdeel (zoals /dev/fuse); zie de regels hierboven."
fi
zeg "   /dev/fuse: aanwezig"
pct exec "$CTID" -- rclone version | head -1 | sed 's/^/   /'
zeg "   fuse: aanwezig"
hulp="$(pct exec "$CTID" -- stat -c '%a' /usr/bin/fusermount3 2>/dev/null | tr -d '[:space:]')"
if [ "$hulp" = "4755" ]; then
  zeg "   fuse-hulp fusermount3: goed (mode 4755)"
else
  fout "   fuse-hulp fusermount3 staat op mode $hulp (hoort 4755 te zijn); draai dit script nog eens."
fi

cat <<KLAAR

==============================================================
 Eenmalige voorbereiding klaar
==============================================================
 Ga nu in AkkoordKast zelf verder:
   1. Open de app en kies het profiel Admin (inloggen).
   2. Ga naar Toevoegen -> Downloaden als mp3 -> Cloudopslag koppelen.
   3. Op een computer met een browser: draai  rclone authorize "drive"
      (of "onedrive"), log in, en plak de sleutel in de app.
   4. Kies de map in de cloud (bijvoorbeeld Muziek) en druk op Koppelen.

 Later controleren kan met:
   pct exec $CTID -- mountpoint -q /home/akkoordkast/muziek && echo gekoppeld
==============================================================
KLAAR
