#!/bin/bash
# fuse-proef-lxc.sh — zoekt uit waarom een fuse-koppeling (cloudopslag) in de container
# niet opkomt, en herstelt meteen de meest voorkomende oorzaak (een ontbrekende setuid-bit
# op fusermount3).
#
# Draai dit op de Proxmox-host, als root:
#   CTID=106 bash -c "$(curl -fsSL https://raw.githubusercontent.com/Theberas04/akkoordkast/main/deploy/proxmox/fuse-proef-lxc.sh)"
#
# Wat het doet:
#   1. de containerconfig, het gegenereerde runtimeconfig en het apparmor-profiel op de host;
#   2. de stand in de container: welk profiel draait, no_new_privs, de rootfs-opties,
#      de fusermount-hulpen (setuid-bit!), /dev/fuse en /etc/fuse.conf;
#   3. als de setuid-bit op /usr/bin/fusermount3 ontbreekt: goedzetten (dat is de standaard
#      van Debian; de fuse3-postinst zet hem normaal bij installatie);
#   4. drie proefkoppelingen met rclone (:memory:, geen aanmelding nodig): als root, als de
#      app-gebruiker (uid 999) en op de échte koppelmap van de app met de opties van de app;
#   5. apparmor-weigeringen op de host (dmesg), plus de versies van PVE en de hulppakketten.
#
# Er wordt niets buiten deze container aangeraakt; de enige wijziging kan de setuid-bit zijn.
set -u

CTID="${CTID:-106}"
CONF="/etc/pve/lxc/${CTID}.conf"
BINNEN_CONTAINER="/tmp/akkoordkast-fuse-proef.sh"

zeg() { printf '%s\n' "$*"; }

zeg "== AkkoordKast fuse-proef (container $CTID) =="
zeg

zeg "-- 1/6 containerconfig ($CONF)"
if [ -f "$CONF" ]; then
  grep -n -E 'features|apparmor|seccomp|fuse' "$CONF" || zeg "   (geen apparmor/seccomp/fuse-regels)"
else
  zeg "   LET OP: $CONF bestaat niet."
fi
zeg

zeg "-- 2/6 gegenereerde runtimeconfig (/var/lib/lxc/$CTID/config)"
if [ -f "/var/lib/lxc/$CTID/config" ]; then
  grep -n -E 'apparmor|seccomp|fuse' "/var/lib/lxc/$CTID/config" || zeg "   (geen apparmor/seccomp/fuse-regels)"
else
  zeg "   (nog geen gegenereerde config; draait de container wel?)"
fi
zeg

zeg "-- 3/6 gegenereerd apparmor-profiel"
profiel_gevonden=0
for f in /var/lib/lxc/"$CTID"/apparmor/*; do
  [ -f "$f" ] || continue
  profiel_gevonden=1
  zeg "   $f"
  if grep -n "mount fstype=fuse" "$f" | sed 's/^/     /'; then
    :
  else
    zeg "     LET OP: geen 'mount fstype=fuse' in dit profiel!"
  fi
done
[ "$profiel_gevonden" = "1" ] || zeg "   (geen profielbestand gevonden)"
zeg

# Het hulpscript voor in de container: vraagt de feiten op en doet de proefkoppelingen.
# (Zo blijft elke regel van dit script heel voor de huisregel dat aanhalingstekens per regel
# in paren komen; een open quote over meerdere regels mag niet.)
BINNEN="$(mktemp)"
cat > "$BINNEN" <<'BINNENEOF'
set -u
proef() {
  MP="$1"
  LOG="${MP}.log"
  rm -rf "$MP" "$LOG"
  mkdir -p "$MP"
  rclone mount :memory: "$MP" --vfs-cache-mode writes --umask 002 --allow-other >"$LOG" 2>&1 &
  RP=$!
  sleep 3
  if mountpoint -q "$MP"; then
    echo "     WERKT (de koppeling komt op)"
    fusermount3 -u "$MP" 2>/dev/null || umount "$MP" 2>/dev/null || true
  else
    echo "     MISLUKT:"
    tail -4 "$LOG" 2>/dev/null | sed 's/^/       /'
  fi
  kill "$RP" 2>/dev/null || true
  wait "$RP" 2>/dev/null || true
  true
}
proef_map() {
  MP="$1"
  LOG=/tmp/fuseproef-app.log
  rm -f "$LOG"
  if mountpoint -q "$MP"; then
    echo "     (er staat nog een oude koppeling; eerst opruimen)"
    fusermount3 -u "$MP" 2>/dev/null || umount "$MP" 2>/dev/null || true
    sleep 1
  fi
  mkdir -p "$MP" 2>/dev/null || true
  rclone mount :memory: "$MP" --vfs-cache-mode writes --umask 002 --allow-other --dir-cache-time 1m --poll-interval 15s >"$LOG" 2>&1 &
  RP=$!
  sleep 3
  if mountpoint -q "$MP"; then
    echo "     WERKT (op de echte map, met de opties van de app)"
    fusermount3 -u "$MP" 2>/dev/null || umount "$MP" 2>/dev/null || true
  else
    echo "     MISLUKT (op de echte map):"
    tail -5 "$LOG" 2>/dev/null | sed 's/^/       /'
  fi
  kill "$RP" 2>/dev/null || true
  wait "$RP" 2>/dev/null || true
  true
}
case "${1:-}" in
  feiten)
    printf "   draait onder profiel: %s\n" "$(cat /proc/1/attr/current 2>/dev/null)"
    printf "   no_new_privs:         %s\n" "$(grep -i NoNewPrivs /proc/1/status 2>/dev/null | tr -d "[:blank:]")"
    printf "   rootfs-opties:        %s\n" "$(grep " / " /proc/mounts | cut -d" " -f4)"
    printf "   dienst-gebruiker:     %s\n" "$(systemctl show akkoordkast -p User --value 2>/dev/null || echo "?")"
    printf "   dienst NoNewPrivs:    %s\n" "$(systemctl show akkoordkast -p NoNewPrivileges --value 2>/dev/null || echo "?")"
    printf "   dienst bounding set:  %s\n" "$(systemctl show akkoordkast -p CapabilityBoundingSet --value 2>/dev/null || echo "?")"
    if [ "$(systemctl show akkoordkast -p NoNewPrivileges --value 2>/dev/null)" = "yes" ]; then
      echo "     LET OP: de app-dienst staat op NoNewPrivileges=yes; daarmee kan de fuse-hulp niet mounten."
    fi
    printf "   fusermount3:          %s\n" "$(command -v fusermount3 || echo ONTBREEKT)"
    ls -l /usr/bin/fusermount3 /usr/bin/fusermount /usr/local/bin/fusermount3 /usr/local/bin/fusermount 2>&1 | grep -v "No such" | sed "s/^/     /"
    printf "   fusermount3-versie:   %s\n" "$(fusermount3 --version 2>&1 | head -1)"
    printf "   rclone:               %s\n" "$(command -v rclone || echo ONTBREEKT)"
    ls -l /usr/bin/rclone /usr/local/bin/rclone /bin/rclone 2>&1 | grep -v "No such" | sed "s/^/     /"
    printf "   rclone-versie:        %s\n" "$(rclone version 2>/dev/null | head -1)"
    H99="$(getent passwd 999 | cut -d: -f6)"
    printf "   app-thuismap:         %s\n" "$H99"
    ls -ld "$H99" "$H99/muziek" "$H99/muziek-2" "$H99/.config/rclone" 2>&1 | sed "s/^/     /"
    printf "   al gemount op koppelmap: %s\n" "$(grep -c " $H99/muziek " /proc/mounts 2>/dev/null || echo 0)"
    printf "   /dev/fuse:            %s\n" "$(ls -ld /dev/fuse 2>&1)"
    printf "   /etc/fuse.conf:       %s\n" "$(ls -l /etc/fuse.conf 2>&1)"
    printf "   fuse3-pakket:         %s\n" "$(dpkg-query -W -f='${Status} ${Version}' fuse3 2>/dev/null || echo "niet gevonden")"
    ;;
  root)
    echo "   als root:"
    proef /tmp/fuseproef-root
    ;;
  gebruiker)
    U="$(getent passwd 999 | cut -d: -f1)"
    if [ -z "$U" ]; then
      echo "   geen gebruiker met uid 999 in deze container"
      exit 0
    fi
    echo "   als de app-gebruiker ($U, uid 999):"
    su -s /bin/bash "$U" -c "/tmp/akkoordkast-fuse-proef.sh gebruiker2" 2>&1 || true
    ;;
  gebruiker2)
    proef /tmp/fuseproef-gebruiker
    ;;
  app)
    U="$(getent passwd 999 | cut -d: -f1)"
    H99="$(getent passwd 999 | cut -d: -f6)"
    if [ -z "$U" ]; then
      echo "   geen gebruiker met uid 999 in deze container"
      exit 0
    fi
    echo "   op de echte koppelmap van de app ($H99/muziek):"
    su -s /bin/bash "$U" -c "cd $H99 && /tmp/akkoordkast-fuse-proef.sh app2" 2>&1 || true
    ;;
  app2)
    H99="$(getent passwd "$(id -u)" | cut -d: -f6)"
    proef_map "$H99/muziek"
    ;;
esac
BINNENEOF
if pct push "$CTID" "$BINNEN" "$BINNEN_CONTAINER" --perms 755 >/dev/null 2>&1; then
  gepusht=1
else
  gepusht=0
  zeg "   (proefscript kon niet in de container gezet worden; stappen 4 en 5 worden overgeslagen)"
fi
rm -f "$BINNEN"

if [ "$gepusht" = "1" ]; then
  zeg "-- 4/6 de container zelf"
  pct exec "$CTID" -- bash "$BINNEN_CONTAINER" feiten || true

  # De setuid-bit goedzetten als die mist (dat is de standaard van Debian; zonder setuid kan
  # een niet-root gebruiker geen fuse koppelen en krijg je "mount failed: Operation not permitted").
  MODE="$(pct exec "$CTID" -- stat -c '%a' /usr/bin/fusermount3 2>/dev/null | tr -d '[:space:]')"
  if [ -z "$MODE" ]; then
    zeg "   fusermount3 niet gevonden in de container — draai het koppelscript opnieuw (dat installeert fuse3)."
  elif [ "$MODE" = "4755" ]; then
    zeg "   setuid-bit op fusermount3 staat goed (mode $MODE)."
  else
    zeg "   fusermount3 mist de setuid-bit (mode $MODE) — ik zet hem goed (chmod 4755);"
    zeg "   dat is de standaard die Debian zelf zet, en zonder is koppelen als gewone gebruiker onmogelijk."
    pct exec "$CTID" -- chmod 4755 /usr/bin/fusermount3
    zeg "   nieuwe mode: $(pct exec "$CTID" -- stat -c '%a' /usr/bin/fusermount3 2>/dev/null)"
  fi
  zeg

  zeg "-- 5/6 proefkoppelingen (rclone :memory:, opties gelijk aan de app)"
  pct exec "$CTID" -- bash "$BINNEN_CONTAINER" root || true
  pct exec "$CTID" -- bash "$BINNEN_CONTAINER" gebruiker || true
  pct exec "$CTID" -- bash "$BINNEN_CONTAINER" app || true
  pct exec "$CTID" -- rm -f "$BINNEN_CONTAINER" >/dev/null 2>&1 || true
  zeg
else
  zeg "-- 4/6 en 5/6 overgeslagen (geen proefscript in de container)"
  zeg
fi

zeg "-- 6/6 apparmor-weigeringen en versies (host)"
dmesg 2>/dev/null | grep -i "apparmor" | grep -i "denied" | tail -6 | sed 's/^/   /'
pveversion 2>/dev/null | head -1 | sed 's/^/   /' || true
dpkg-query -W -f='   pve-container ${Version}\n' pve-container 2>/dev/null || true
zeg
zeg "KLAAR — stuur deze hele uitvoer terug."
