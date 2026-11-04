#!/usr/bin/env bash
# Werkt een bestaande AkkoordKast-container bij naar de laatste versie op main.
#
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/Theberas04/akkoordkast/main/deploy/proxmox/update-from-github.sh)" <CTID>
#
# Wat het doet: haalt de bestanden op naar een tijdelijke map op de host, maakt een
# reservekopie in de container, schuift de nieuwe bestanden erin, herstart de dienst
# en controleert of de nieuwe versie echt draait. Mislukt de controle, dan gaat de
# reservekopie terug en blijft de oude werkende versie staan. De database en de
# mediabibliotheek worden nooit overschreven.
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
REPO_OWNER="${REPO_OWNER:-Theberas04}"
REPO_NAAM="${REPO_NAAM:-akkoordkast}"
BRANCH="${BRANCH:-main}"
RAW_BASE="${RAW_BASE:-https://raw.githubusercontent.com/$REPO_OWNER/$REPO_NAAM/$BRANCH}"

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
    echo "   bash -c \"\$(curl -fsSL -H 'Accept: application/vnd.github.raw' https://api.github.com/repos/$REPO_OWNER/$REPO_NAAM/contents/deploy/proxmox/update-from-github.sh?ref=$BRANCH)\"" >&2
  fi
fi
APP_DIR="${APP_DIR:-/opt/akkoordkast}"
DATA_DIR="${DATA_DIR:-/var/lib/akkoordkast}"
POORT="${POORT:-80}"
STAGING="${STAGING:-/opt/akkoordkast-update}"

if [ "$(id -u)" != "0" ]; then
  echo "Draai dit als root op de Proxmox-host." >&2
  exit 1
fi
if [ -z "$CTID" ]; then
  echo "Gebruik: bash update-from-github.sh <CTID>" >&2
  exit 1
fi
if ! pct status "$CTID" >/dev/null 2>&1; then
  echo "Container $CTID bestaat niet." >&2
  exit 1
fi

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
  "lib/muziekbestand.js"
  "lib/downloader.js"
  "lib/beheer.js"
  "lib/youtube.js"
  "lib/akkoorden.js"
  "lib/analyse.js"
  "lib/spotify.js"
  "public/index.html"
  "public/favicon.svg"
  "public/manifest.webmanifest"
  "public/sw.js"
  "public/icon-192.png"
  "public/icon-512.png"
  "public/icon-512-maskable.png"
  "public/apple-touch-icon.png"
  "public/handleiding/index.html"
  "public/handleiding/img/backup-naar-nas.png"
  "public/handleiding/img/beheerder-inloggen.png"
  "public/handleiding/img/beheerder-ingelogd.png"
  "public/handleiding/img/leren-cursus.png"
  "public/handleiding/img/liedjes-desktop.png"
  "public/handleiding/img/link-naar-mp3-bezig.png"
  "public/handleiding/img/link-naar-mp3-klaar.png"
  "public/handleiding/img/link-naar-mp3-voor.png"
  "public/handleiding/img/link-naar-mp3.png"
  "public/handleiding/img/mappen-toevoegen.png"
  "public/handleiding/img/muziek-kandidaten.png"
  "public/handleiding/img/muziek-van-het-liedje.png"
  "public/handleiding/img/muziekmap-klaar.png"
  "public/handleiding/img/oefenen-per-week.png"
  "public/handleiding/img/profiel-admin.png"
  "public/handleiding/img/profiel-slot.png"
  "public/handleiding/img/profiel-gewoon.png"
  "public/handleiding/img/setlist-overgangen.png"
  "public/handleiding/img/spelen-desktop.png"
  "public/handleiding/img/spotify-blok.png"
  "public/handleiding/img/upload-herkend.png"
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
  "lib/muziekbestand.js"
  "lib/downloader.js"
  "lib/beheer.js"
  "lib/youtube.js"
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
  "public/handleiding/index.html"
  "public/handleiding/img/backup-naar-nas.png"
  "public/handleiding/img/beheerder-inloggen.png"
  "public/handleiding/img/beheerder-ingelogd.png"
  "public/handleiding/img/leren-cursus.png"
  "public/handleiding/img/liedjes-desktop.png"
  "public/handleiding/img/link-naar-mp3-bezig.png"
  "public/handleiding/img/link-naar-mp3-klaar.png"
  "public/handleiding/img/link-naar-mp3-voor.png"
  "public/handleiding/img/link-naar-mp3.png"
  "public/handleiding/img/mappen-toevoegen.png"
  "public/handleiding/img/muziek-kandidaten.png"
  "public/handleiding/img/muziek-van-het-liedje.png"
  "public/handleiding/img/muziekmap-klaar.png"
  "public/handleiding/img/oefenen-per-week.png"
  "public/handleiding/img/profiel-admin.png"
  "public/handleiding/img/profiel-slot.png"
  "public/handleiding/img/profiel-gewoon.png"
  "public/handleiding/img/setlist-overgangen.png"
  "public/handleiding/img/spelen-desktop.png"
  "public/handleiding/img/spotify-blok.png"
  "public/handleiding/img/upload-herkend.png"
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

binnen_bash() { pct exec "$CTID" -- bash -c "$1"; }

echo "== Nieuwe bestanden ophalen"
rm -rf "$STAGING"
mkdir -p "$STAGING"
for f in "${FILES[@]}"; do
  case "$f" in
    *" "*|"") echo "Interne fout: bestandsnaam met een spatie ($f)." >&2; exit 1 ;;
  esac
  mkdir -p "$STAGING/$(dirname "$f")"
  if ! curl -fsSL --max-time 60 "$RAW_BASE/$f?cb=$(date +%s)" -o "$STAGING/$f"; then
    echo "Download mislukt: $f" >&2
    exit 1
  fi
done
echo "   $(echo "${#FILES[@]}") bestanden opgehaald"

STAMP="$(date +%Y%m%d-%H%M%S)"
echo "== Reservekopie maken in de container ($STAMP)"
binnen_bash "rm -rf $APP_DIR.bak && cp -a $APP_DIR $APP_DIR.bak"
if [ ! -d "$APP_DIR.bak" ] && ! pct exec "$CTID" -- test -d "$APP_DIR.bak"; then
  echo "Kon geen reservekopie maken; ik stop voordat er iets verandert." >&2
  exit 1
fi

echo "== Nieuwe bestanden plaatsen"
for f in "${RUNTIME[@]}"; do pct push "$CTID" "$STAGING/$f" "$APP_DIR/$f" --perms 644; done
for f in "${PAGINA[@]}"; do pct push "$CTID" "$STAGING/$f" "$APP_DIR/$f" --perms 644; done
for f in "${DATA[@]}"; do pct push "$CTID" "$STAGING/$f" "$APP_DIR/$f" --perms 644; done

GEBRUIKER="$(binnen_bash "stat -c %U $APP_DIR" | tr -d '\r')"
binnen_bash "chmod 755 $APP_DIR/scripts/cast-helper.py && chown -R $GEBRUIKER:$GEBRUIKER $APP_DIR"

echo "== Gereedschap controleren"
# ffmpeg is nodig om geluid uit een bestand te halen, en yt-dlp om een link naar mp3 te kunnen
# omzetten. Beide horen er te staan; we halen alleen op wat ontbreekt, zodat een bijwerking ook
# een oudere container bijwerkt.
if ! binnen_bash "command -v ffmpeg >/dev/null 2>&1"; then
  echo "   ffmpeg ontbreekt; ik installeer het"
  binnen_bash "export DEBIAN_FRONTEND=noninteractive; apt-get update -qq && apt-get install -y -qq ffmpeg >/dev/null" || \
    echo "   let op: ffmpeg kon niet worden geinstalleerd."
fi
if ! binnen_bash "test -x /usr/local/bin/yt-dlp"; then
  echo "   yt-dlp ontbreekt; ik haal de nieuwste versie op"
  if binnen_bash "curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && chmod 755 /usr/local/bin/yt-dlp"; then
    echo "   $(binnen_bash "/usr/local/bin/yt-dlp --version" 2>/dev/null || echo 'versie onbekend')"
  else
    echo "   let op: yt-dlp kon niet worden opgehaald; het omzetten van een link naar mp3 werkt dan niet."
  fi
fi

echo "== Dienst herstarten"
binnen_bash "systemctl restart akkoordkast"

echo "== Controleren of de nieuwe versie echt draait"
OK=0
for poging in $(seq 1 60); do
  KOPPEN="$(mktemp)"
  if binnen_bash "curl -fsS -D $KOPPEN -o /tmp/akkoordkast-healthz.txt http://127.0.0.1:$POORT/healthz" 2>/dev/null; then
    if binnen_bash "grep -qi 'x-akkoordkast' $KOPPEN && grep -q '^ok' /tmp/akkoordkast-healthz.txt"; then OK=1; rm -f "$KOPPEN"; break; fi
  fi
  rm -f "$KOPPEN"
  sleep 2
done

if [ "$OK" = "1" ]; then
  if ! binnen_bash "ss -ltnpH 'sport = :$POORT' | grep -q node"; then
    echo "Poort $POORT antwoordt wel, maar niet door node. Wat luistert er:" >&2
    binnen_bash "ss -ltnpH 'sport = :$POORT'" >&2 || true
    exit 1
  fi
  # De pagina wordt per verzoek van schijf gelezen; vergelijk daarom een bestand dat
  # alleen de nieuwe versie schrijft, zodat een oud proces niet als "bijgewerkt" geldt.
  if binnen_bash "curl -fsS -H 'Cache-Control: no-cache' http://127.0.0.1:$POORT/sw.js -o /tmp/sw-gediend.js && cmp -s /tmp/sw-gediend.js $APP_DIR/public/sw.js"; then
    echo "   de nieuwste bestanden worden ook echt geserveerd"
  else
    echo "De bestanden staan in de container, maar de dienst serveert nog de oude versie." >&2
    binnen_bash "ss -ltnpH 'sport = :$POORT'" >&2 || true
    binnen_bash "journalctl -u akkoordkast -n 20 --no-pager" >&2 || true
    echo "Probeer: pct exec $CTID -- systemctl restart akkoordkast" >&2
    exit 1
  fi
else
  echo "De nieuwe versie start niet; ik zet de reservekopie terug." >&2
  binnen_bash "journalctl -u akkoordkast -n 30 --no-pager" >&2 || true
  binnen_bash "systemctl stop akkoordkast || true"
  binnen_bash "rm -rf $APP_DIR.stuk && mv $APP_DIR $APP_DIR.stuk && mv $APP_DIR.bak $APP_DIR && chown -R $GEBRUIKER:$GEBRUIKER $APP_DIR"
  binnen_bash "systemctl start akkoordkast"
  echo "De oude versie draait weer. Bestanden die niet werkten staan in $APP_DIR.stuk." >&2
  exit 1
fi

binnen_bash "rm -rf $APP_DIR.bak $APP_DIR.stuk"
echo "AkkoordKast in container $CTID is bijgewerkt."
