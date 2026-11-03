#!/usr/bin/env bash
# Koppelt de muziekmap van AkkoordKast aan een NAS in hetzelfde netwerk.
#
# Draai dit op de Proxmox-host zelf (niet in de container), als root:
#
#   bash deploy/proxmox/nas-koppelen.sh
#
# Je kunt alles ook vooraf meegeven via omgevingsvariabelen, dan wordt er niets
# gevraagd. Voorbeeld met een Windows-share of een NAS die SMB deelt:
#
#   NAS_PROTO=cifs NAS_HOST=192.168.1.100 NAS_SHARE=muziek \
#   NAS_USER=thuis NAS_PASS=geheim CTID=225 bash deploy/proxmox/nas-koppelen.sh
#
# En voor NFS:
#
#   NAS_PROTO=nfs NAS_HOST=192.168.1.100 NAS_EXPORT=/volume1/muziek \
#   CTID=225 bash deploy/proxmox/nas-koppelen.sh
#
# Wat het doet, stap voor stap:
#   1. leest de gegevens van de NAS, het container-id en het koppelpunt,
#   2. controleert of de host de NAS kan bereiken (ping en de juiste poort),
#   3. zet de koppeling op de HOST en hangt die met een bind-mount in de
#      container. Dat is de veiligste route op een ongeprivilegieerde LXC:
#      binnen zo een container mag alleen root mounten en werken cifs of nfs
#      daar vaak niet, terwijl de host gewoon kan mounten en Proxmox de map
#      netjes doorgeeft aan de container. Wil je het toch binnen de container,
#      zie de opmerking onderaan over de andere variant,
#   4. schrijft de regel in /etc/fstab met _netdev en nofail, zodat de map na
#      een herstart terugkomt en een uitstaande NAS de host niet ophoudt,
#   5. koppelt, test met een lees- en een schrijftest, en herstart de container
#      zodat de bind-mount actief wordt.
#
# Wachtwoorden komen nooit in de proceslijst of in de shell-historie terecht:
# je typt ze met read -rs (dat komt niet in de historie), en de koppeling leest
# ze uit een credentials-bestand met rechten 600 (/etc/akkoordkast/nas.credentials).
# Nooit mount -o user=... -o pass=... op de opdrachtregel: die is via
# /proc/<pid>/cmdline voor iedereen leesbaar en belandt in je historie.
set -euo pipefail

NAS_PROTO="${NAS_PROTO:-}"
NAS_HOST="${NAS_HOST:-}"
NAS_SHARE="${NAS_SHARE:-}"
NAS_EXPORT="${NAS_EXPORT:-}"
NAS_USER="${NAS_USER:-}"
NAS_PASS="${NAS_PASS:-}"
CTID="${CTID:-${1:-}}"
KOPPELPUNT="${KOPPELPUNT:-/home/akkoordkast/muziek}"
HOST_MNT="${HOST_MNT:-/mnt/akkoordkast-nas}"
CREDS="${CREDS:-/etc/akkoordkast/nas.credentials}"
APP_DIR="${APP_DIR:-/opt/akkoordkast}"
POORT="${POORT:-80}"
CONTAINER_GEBRUIKER="${CONTAINER_GEBRUIKER:-akkoordkast}"

zeg() { printf '%s\n' "$*"; }
fout() { printf '%s\n' "$*" >&2; }

# Vraagt een waarde als de variabele nog leeg is. De naam van de variabele gaat
# mee, zodat we geen eval op invoer van buiten nodig hebben.
vraag() {
  local var="$1" tekst="$2" huidig
  eval "huidig=\${$var:-}"
  if [ -z "$huidig" ]; then
    read -r -p "$tekst " huidig
  fi
  eval "$var=\$huidig"
}

# Zelfde, maar zonder de invoer op het scherm en zonder historie.
vraag_stil() {
  local var="$1" tekst="$2" huidig
  eval "huidig=\${$var:-}"
  if [ -z "$huidig" ]; then
    read -rs -p "$tekst " huidig
    echo
  fi
  eval "$var=\$huidig"
}

# --- Controle: draaien we op de host, als root, met pct erbij? --------------

if [ "$(id -u)" != "0" ]; then
  fout "Draai dit als root op de Proxmox-host."
  fout "Op de host zelf, niet binnen de container: dit script zet de koppeling op de host."
  exit 1
fi

if ! command -v pct >/dev/null 2>&1; then
  fout "pct ontbreekt; dit lijkt geen Proxmox-host."
  fout "Draai dit op de Proxmox-host zelf. Wil je de map binnen de container koppelen,"
  fout "gebruik dan drive-koppelen.sh (dat draait wel in de container)."
  exit 1
fi

# --- Gegevens verzamelen ----------------------------------------------------

if [ -z "$NAS_PROTO" ]; then
  vraag NAS_PROTO "Koppelen via cifs (Windows/SMB-NAS) of nfs? [cifs]"
  NAS_PROTO="${NAS_PROTO:-cifs}"
fi
NAS_PROTO="$(printf '%s' "$NAS_PROTO" | tr '[:upper:]' '[:lower:]')"
case "$NAS_PROTO" in
  cifs|nfs) ;;
  *) fout "Onbekende NAS_PROTO: $NAS_PROTO (kies cifs of nfs)."; exit 1 ;;
esac

vraag NAS_HOST "IP-adres of hostnaam van de NAS:"
if [ -z "$NAS_HOST" ]; then
  fout "Zonder NAS_HOST kan ik niets koppelen."
  exit 1
fi

if [ "$NAS_PROTO" = "cifs" ]; then
  vraag NAS_SHARE "Naam van de share op de NAS (bijvoorbeeld muziek):"
  if [ -z "$NAS_SHARE" ]; then
    fout "Zonder NAS_SHARE kan ik de share niet vinden."
    fout "Kijk in de beheerpagina van je NAS hoe de gedeelde map heet."
    exit 1
  fi
  vraag NAS_USER "Gebruikersnaam op de NAS (leeg mag als de share gasten toestaat):"
  vraag_stil NAS_PASS "Wachtwoord op de NAS (blijft onzichtbaar):"
else
  vraag NAS_EXPORT "Pad van de NFS-export op de NAS (bijvoorbeeld /volume1/muziek):"
  if [ -z "$NAS_EXPORT" ]; then
    fout "Zonder NAS_EXPORT kan ik de NFS-export niet vinden."
    fout "Kijk in de beheerpagina van je NAS welke map gedeeld wordt via NFS."
    exit 1
  fi
fi

if [ -z "$CTID" ]; then
  vraag CTID "Container-id (CTID) van de AkkoordKast-container:"
fi
if [ -z "$CTID" ]; then
  fout "Zonder CTID weet ik niet welke container ik moet koppelen."
  fout "Het nummer staat in de Proxmox-interface achter de naam van de container."
  exit 1
fi
if ! pct status "$CTID" >/dev/null 2>&1; then
  fout "Container $CTID bestaat niet."
  fout "Controleer het nummer: pct list"
  exit 1
fi

zeg "== Gegevens"
zeg "   koppeling : $NAS_PROTO"
zeg "   NAS       : $NAS_HOST"
if [ "$NAS_PROTO" = "cifs" ]; then zeg "   share     : $NAS_SHARE"; else zeg "   export    : $NAS_EXPORT"; fi
zeg "   container : $CTID"
zeg "   koppelpunt: $KOPPELPUNT (in de container)"
zeg "   op de host: $HOST_MNT"

# --- Controle: is de NAS bereikbaar vanaf de host? --------------------------

zeg "== De NAS bereiken vanaf de host"
if ! ping -c 1 -W 2 "$NAS_HOST" >/dev/null 2>&1; then
  fout "De host krijgt geen antwoord van $NAS_HOST."
  fout "Wat je kunt doen:"
  fout "  - klopt het IP-adres? Probeer: ping -c 1 $NAS_HOST"
  fout "  - staat de NAS aan en zit hij in hetzelfde netwerk?"
  fout "  - blokkeert de firewall van de NAS dit adres?"
  exit 1
fi
zeg "   de host ziet $NAS_HOST"

if [ "$NAS_PROTO" = "cifs" ]; then
  POORT_TEST=445
  OPTIES=(credentials="$CREDS",uid=0,gid=0)
else
  POORT_TEST=2049
  OPTIES=()
fi
if ! timeout 3 bash -c "</dev/tcp/$NAS_HOST/$POORT_TEST" >/dev/null 2>&1; then
  fout "Poort $POORT_TEST op $NAS_HOST staat niet open."
  if [ "$NAS_PROTO" = "cifs" ]; then
    fout "Dat is de SMB-poort. Staat bestand delen via SMB wel aan op de NAS?"
  else
    fout "Dat is de NFS-poort. Staat NFS wel aan en is deze map geexporteerd?"
  fi
  fout "Controleer de instellingen van de share op je NAS en probeer het opnieuw."
  exit 1
fi
zeg "   poort $POORT_TEST is open"

# --- Benodigde hulpmiddelen op de host installeren --------------------------

if [ "$NAS_PROTO" = "cifs" ]; then
  if ! command -v mount.cifs >/dev/null 2>&1; then
    zeg "== cifs-utils installeren op de host"
    if ! DEBIAN_FRONTEND=noninteractive apt-get install -y -qq cifs-utils >/dev/null; then
      fout "Kon cifs-utils niet installeren."
      fout "Draai handmatig: apt-get update && apt-get install -y cifs-utils"
      exit 1
    fi
  fi
  modprobe cifs 2>/dev/null || true
else
  if ! command -v mount.nfs >/dev/null 2>&1; then
    zeg "== nfs-common installeren op de host"
    if ! DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nfs-common >/dev/null; then
      fout "Kon nfs-common niet installeren."
      fout "Draai handmatig: apt-get update && apt-get install -y nfs-common"
      exit 1
    fi
  fi
fi

# --- Rechten: welke uid en gid moet de map op de host krijgen? --------------
# Een ongeprivilegieerde container schuift zijn gebruikers op met 100000: de
# gebruiker akkoordkast in de container is op de host 100000 + zijn eigen nummer.
# We geven de gekoppelde map die host-nummers, zodat de app in de container kan
# lezen en schrijven. Is de container geprivilegieerd (unprivileged: 0), dan is
# de verschuiving nul.

ONTPRIV=1
if pct config "$CTID" | grep -qE '^unprivileged:[[:space:]]*0'; then ONTPRIV=0; fi
BASIS=100000
if [ "$ONTPRIV" = "0" ]; then BASIS=0; fi

CONTAINER_UID="$(pct exec "$CTID" -- id -u "$CONTAINER_GEBRUIKER" 2>/dev/null || echo 0)"
CONTAINER_GID="$(pct exec "$CTID" -- id -g "$CONTAINER_GEBRUIKER" 2>/dev/null || echo 0)"
HOST_UID=$(( BASIS + CONTAINER_UID ))
HOST_GID=$(( BASIS + CONTAINER_GID ))
zeg "   de map krijgt uid $HOST_UID en gid $HOST_GID op de host"
zeg "   (container-gebruiker $CONTAINER_GEBRUIKER is $CONTAINER_UID:$CONTAINER_GID, ongeprivilegieerd=$ONTPRIV)"

# --- Wachtwoord wegzetten in een credentials-bestand (cifs) ------------------

if [ "$NAS_PROTO" = "cifs" ]; then
  zeg "== Inloggegevens veilig wegzetten in $CREDS"
  install -d -m 700 "$(dirname "$CREDS")"
  umask 077
  # Het wachtwoord komt via een here-document in het bestand, niet op de
  # opdrachtregel: de opdrachtregel is via /proc voor iedereen leesbaar.
  cat > "$CREDS" <<CREDEOF
username=$NAS_USER
password=$NAS_PASS
CREDEOF
  chmod 600 "$CREDS"
  chown root:root "$CREDS"
  if [ -n "$NAS_USER" ]; then
    zeg "   bewaard (alleen leesbaar voor root)"
  else
    zeg "   geen gebruikersnaam opgegeven; de share moet gasten toestaan"
  fi
fi

# --- Koppelmap op de host ---------------------------------------------------

mkdir -p "$HOST_MNT"

# --- fstab: de regel toevoegen met _netdev en nofail ------------------------
# _netdev: pas koppelen als het netwerk er is (anders blijft de host hangen bij
#          het opstarten). nofail: een uitstaande NAS mag het opstarten niet
#          blokkeren.

FSTAB_BAK="/etc/fstab.akkoordkast.bak"
FSTAB_REGEL=""
if [ "$NAS_PROTO" = "cifs" ]; then
  FSTAB_REGEL="//$NAS_HOST/$NAS_SHARE $HOST_MNT cifs credentials=$CREDS,uid=$HOST_UID,gid=$HOST_GID,file_mode=0664,dir_mode=0775,noperm,_netdev,nofail,vers=3.0 0 0"
else
  FSTAB_REGEL="$NAS_HOST:$NAS_EXPORT $HOST_MNT nfs _netdev,nofail,vers=3,soft,timeo=100 0 0"
fi

FSTAB_TOEGEVOEGD=0
if grep -qF "$HOST_MNT" /etc/fstab; then
  zeg "== fstab: er staat al een regel voor $HOST_MNT, die laat ik staan"
else
  zeg "== fstab: regel toevoegen voor $HOST_MNT"
  cp -a /etc/fstab "$FSTAB_BAK"
  printf '%s\n' "$FSTAB_REGEL" >> /etc/fstab
  FSTAB_TOEGEVOEGD=1
  zeg "   oude fstab bewaard als $FSTAB_BAK"
fi

# --- Koppelen op de host en testen ------------------------------------------

terugrol() {
  fout "== Terugrolpad"
  if mountpoint -q "$HOST_MNT"; then
    fout "   ik ontkoppel $HOST_MNT weer"
    umount "$HOST_MNT" 2>/dev/null || umount -l "$HOST_MNT" 2>/dev/null || true
  fi
  if [ "$FSTAB_TOEGEVOEGD" = "1" ]; then
    fout "   ik haal de regel uit /etc/fstab (oude versie staat in $FSTAB_BAK)"
    if [ -f "$FSTAB_BAK" ]; then cp -a "$FSTAB_BAK" /etc/fstab; fi
  fi
}

zeg "== Koppelen op de host"
if mountpoint -q "$HOST_MNT"; then
  zeg "   $HOST_MNT is al gekoppeld; ik gebruik die bestaande koppeling"
else
  if ! mount "$HOST_MNT" 2>/dev/null; then
    fout "Koppelen mislukt."
    if [ "$NAS_PROTO" = "cifs" ]; then
      fout "Wat je kunt doen:"
      fout "  - kloppen gebruikersnaam en wachtwoord? Test: mount -v $HOST_MNT"
      fout "  - heet de share echt zo, en staat SMB aan op de NAS?"
      fout "  - ondersteunt de NAS SMB 3? Anders de fstab-regel aanpassen naar vers=2.1."
    else
      fout "Wat je kunt doen:"
      fout "  - klopt het exportpad, en staat NFS aan op de NAS?"
      fout "  - laat de NAS dit host-adres wel toe (soms alleen bepaalde subnetten)?"
    fi
    terugrol
    exit 1
  fi
fi

zeg "== Lees- en schrijftest op de host"
if ! touch "$HOST_MNT/.akkoordkast-proef" 2>/dev/null; then
  fout "De map is gekoppeld, maar de host mag er niet in schrijven."
  fout "Dat gaat meestal over rechten op de share: geef de NAS-gebruiker schrijfrechten."
  terugrol
  exit 1
fi
rm -f "$HOST_MNT/.akkoordkast-proef"
zeg "   de host kan lezen en schrijven in $HOST_MNT"

# --- Bind-mount naar de container -------------------------------------------
# Proxmox koppelt een host-map in een container met een mp-regel in de
# containerconfiguratie. We zoeken het eerste vrije mp-nummer en gebruiken dat.

CONF="/etc/pve/lxc/$CTID.conf"
zeg "== De map doorgeven aan container $CTID"
pct exec "$CTID" -- mkdir -p "$KOPPELPUNT"

if grep -qF "mp=$KOPPELPUNT" "$CONF" 2>/dev/null; then
  zeg "   er staat al een koppeling naar $KOPPELPUNT, die laat ik staan"
  HERSTART=0
else
  MP_IDX=""
  for i in $(seq 0 9); do
    if ! grep -qE "^mp$i:" "$CONF" 2>/dev/null; then MP_IDX="$i"; break; fi
  done
  if [ -z "$MP_IDX" ]; then
    fout "Geen vrij mp-nummer over in $CONF (0 t/m 9 zijn bezet)."
    fout "Ruim een oude koppeling op in de Proxmox-interface en probeer opnieuw."
    terugrol
    exit 1
  fi
  cp -a "$CONF" "$CONF.akkoordkast.bak"
  pct set "$CTID" "-mp$MP_IDX" "$HOST_MNT,mp=$KOPPELPUNT"
  zeg "   mp$MP_IDX: $HOST_MNT -> $KOPPELPUNT (oude config in $CONF.akkoordkast.bak)"
  HERSTART=1
fi

# --- Herstarten zodat de bind-mount actief wordt ----------------------------
# Een mp-regel geldt pas als de container opnieuw is gestart. De app start
# daarna vanzelf weer op.

if [ "$HERSTART" = "1" ]; then
  zeg "== Container $CTID herstarten zodat de koppeling actief wordt"
  pct reboot "$CTID"
fi

zeg "== Wachten tot de app weer antwoordt"
OK=0
for poging in $(seq 1 60); do
  if pct exec "$CTID" -- bash -c "curl -fsS -o /dev/null http://127.0.0.1:$POORT/healthz" 2>/dev/null; then
    OK=1; break
  fi
  sleep 2
done
if [ "$OK" != "1" ]; then
  fout "De app in container $CTID antwoordt niet op poort $POORT."
  fout "De koppeling staat wel. Bekijk het journaal:"
  fout "   pct exec $CTID -- journalctl -u akkoordkast -n 30 --no-pager"
  exit 1
fi

zeg "== Lees- en schrijftest in de container"
if ! pct exec "$CTID" -- bash -c "touch $KOPPELPUNT/.akkoordkast-proef && rm -f $KOPPELPUNT/.akkoordkast-proef" 2>/dev/null; then
  fout "De app draait, maar de container mag niet schrijven in $KOPPELPUNT."
  fout "Wat je kunt doen:"
  fout "  - controleer de rechten op de NAS-share voor de gebruiker die je opgaf;"
  fout "  - pas zo nodig in /etc/fstab op de host uid=$HOST_UID,gid=$HOST_GID aan"
  fout "    en draai: systemctl daemon-reload && mount -o remount $HOST_MNT"
  exit 1
fi
zeg "   de container kan lezen en schrijven in $KOPPELPUNT"

# --- Klaar ------------------------------------------------------------------

cat <<KLAAR

==============================================================
 De muziekmap is gekoppeld aan de NAS
==============================================================
   op de host : $HOST_MNT  ($NAS_PROTO van $NAS_HOST)
   in de app  : $KOPPELPUNT

 Nu de app erop wijzen:
   1. Open AkkoordKast in je browser.
   2. Ga naar het tabblad Toevoegen en zoek Muziekmap scannen op.
   3. Vul bij Map op deze machine in:  $KOPPELPUNT
   4. Klik op Kijk wat erin zit, en daarna op Alles omzetten.

 De map die de app scant hoort in de omgevingsvariabele MUSIC_DIR te staan
 (standaard $KOPPELPUNT); vul datzelfde pad in het vak hierboven in.

 Controle later: pct exec $CTID -- mountpoint -q $KOPPELPUNT && echo gekoppeld
 Losmaken:   umount $HOST_MNT   (zet de fstab-regel uit als je dat blijvend wilt)

==============================================================
KLAAR

# Andere variant: koppelen binnen de container in plaats van op de host.
# Op een ongeprivilegieerde LXC werkt dat zelden: de container mag alleen
# root-mounts voor een paar bestandssystemen gebruiken en cifs of nfs valt
# daar meestal buiten. De host-koppeling met een bind-mount hierboven is
# daarom de aanbevolen route. Wil je het toch proberen, dan doe je dat in de
# container (via pct exec $CTID -- bash) en zet je daar de fstab-regel; de
# NAS-inloggegevens zet je dan in hetzelfde credentials-bestand met chmod 600.
