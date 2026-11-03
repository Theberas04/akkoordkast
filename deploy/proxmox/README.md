# AkkoordKast op Proxmox

Alles wat je nodig hebt om de app in een LXC-container op je Proxmox-host te zetten,
bij te werken en te controleren.

## Installeren

Op de Proxmox-host zelf, als root:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/Theberas04/akkoordkast/main/deploy/proxmox/install.sh)"
```

De uitvoer begint met de versie van de installer, bijvoorbeeld `== AkkoordKast-installer
2026-11-03.3`. Zie je een oudere versie, dan kwam het script uit de schijfcache van GitHub
(die houdt een bestand vijf minuten vast) of uit een bewaard bestand. Forceer dan een verse
kopie met `?cb=`:

```bash
bash -c "$(curl -fsSL "https://raw.githubusercontent.com/Theberas04/akkoordkast/main/deploy/proxmox/install.sh?cb=$(date +%s)")"
```

De installer doet vier dingen:

1. `install.sh` haalt de app-bestanden op naar `/opt/akkoordkast-pakket` op de host.
   Zet `TARGET_DIR` als je een andere map wilt, of `BRANCH` voor een andere branch. Elk script
   dat de installer zelf uitvoert staat in die lijst; ontbreekt er toch een, dan haalt hij het
   op het moment van gebruik alsnog op in plaats van te stoppen.
2. `create-akkoordkast-lxc.sh` maakt een Debian-container (standaard 2 cores, 1 GB, 8 GB schijf,
   DHCP op `vmbr0`) en print alleen het container-id. Hij zoekt zelf een vrije id (vanaf 100,
   `CTID_VANAF`), een opslag die een containerschijf aankan (`OPSLAG`, standaard `local-lvm`, en
   anders de eerste opslag met `rootdir`) en een opslag die sjablonen aankan (`SJABLOON_OPSLAG`).
   Dat laatste is niet hetzelfde: een standaardinstallatie bewaart sjablonen op `local`
   (`vztmpl`) en containerschijven op `local-lvm` (`rootdir`). Vandaar de fout
   `storage 'local-lvm' does not support templates` als je die twee door elkaar haalt. Bestaat
   de bridge niet, dan noemt hij de bridges die er wel zijn.
3. `provision-akkoordkast.sh` installeert Node.js 22, ffmpeg en de Chromecast-hulp, stuurt de
   bestanden naar `/opt/akkoordkast`, zet de gegevens in `/var/lib/akkoordkast` en start de
   systemd-dienst `akkoordkast`.
4. De gezondheidscontrole eist de app-marker (`x-akkoordkast: app` op `/healthz`) **en** dat
   node op de poort luistert, en print het adres van de container.

Instellingen die je kunt meegeven: `CTID`, `GEHEUGEN`, `SCHIJF`, `CORES`, `BRIDGE`, `OPSLAG`,
`SJABLOON_OPSLAG`, `DEBIAN_MAJOR`, `CTID_VANAF`, `POORT`, `hostname`. Voorbeeld:

```bash
CTID=225 GEHEUGEN=2048 bash -c "$(curl -fsSL https://raw.githubusercontent.com/Theberas04/akkoordkast/main/deploy/proxmox/install.sh)"
```

### Installeren zonder GitHub

De bestanden mogen ook van je eigen schijf komen:

```bash
git clone https://github.com/Theberas04/akkoordkast /tmp/akkoordkast
SRC=/tmp/akkoordkast bash /tmp/akkoordkast/deploy/proxmox/provision-akkoordkast.sh 225
```

`install.sh` heeft ook een droogloop die alleen ophaalt, handig om de bestandslijst te testen:

```bash
FETCH_ONLY=1 RAW_BASE=file:///tmp/akkoordkast TARGET_DIR=/tmp/pakket bash deploy/proxmox/install.sh
```

En er is een controle die het pakket nakijkt zonder een container te maken (die werkt ook op een
gewone machine, zonder Proxmox):

```bash
CONTROLEER_PAKKET=1 TARGET_DIR=/tmp/pakket bash deploy/proxmox/install.sh
```

## Bijwerken

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/Theberas04/akkoordkast/main/deploy/proxmox/update-from-github.sh)" <CTID>
```

De updater haalt de bestanden op naar `/opt/akkoordkast-update`, maakt in de container een
reservekopie (`/opt/akkoordkast.bak`), schuift de nieuwe bestanden erin en herstart de dienst.
Daarna controleert hij twee dingen: `/healthz` met de app-marker, en of `sw.js` dat de dienst
serveert byte voor byte gelijk is aan het bestand in de container. Dat tweede is nodig omdat de
pagina per verzoek van schijf wordt gelezen: een oud proces serveert anders de nieuwe pagina
naast oude API-routes, en dan lijkt een half toegepaste update geslaagd. Mislukt de controle,
dan gaat de reservekopie terug en draait de oude versie weer; de niet-werkende bestanden blijven
staan in `/opt/akkoordkast.stuk`.

Je database en je mediabibliotheek (`/var/lib/akkoordkast`) worden nooit aangeraakt.

## Controleren

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/Theberas04/akkoordkast/main/deploy/proxmox/check-akkoordkast.sh)" <CTID>
```

Alleen-lezen: containerstatus, netwerk, dienst, Node-versie plus een `node:sqlite`-probe, wat er
op de poort luistert, geheugen, schijf, de bestanden, de Chromecast-hulp en de laatste
journaalregels, met onderaan per bevinding de letterlijke opdracht die het oplost.

## Wat de scripts bewust niet doen

- **Geen nginx.** De Node-dienst serveert zijn eigen pagina's en statische bestanden, en krijgt
  poort 80 via `AmbientCapabilities=CAP_NET_BIND_SERVICE` terwijl hij als gewone gebruiker draait.
  Een proxy die zelf `/healthz` antwoordt, verbergt een verkeerd webroot-pad: de controle slaagt
  terwijl de app onzichtbaar is. Nadeel dat je moet weten: browsers geven alleen camera-toegang in
  een beveiligde context, dus op een `http://`-adres in je LAN werkt camerascannen niet.
- **Geen Docker.** Eén proces, één systemd-unit, één databasemap.
- **Geen afhankelijkheden in de app.** Alleen Node 22 (voor `node:sqlite`), ffmpeg voor mp3 en
  Python met pychromecast voor het casten. Zonder pychromecast blijft de app werken; het tabblad
  Casten meldt dan dat de hulp ontbreekt, met de opdracht erbij.

## Portaal van de bestanden

De vier scripts moeten het over dezelfde bestandslijsten eens zijn. Dat is geen formaliteit:
een module die de installer wel ophaalt maar de updater niet naar de container stuurt, laat de
dienst crashen met `Cannot find module` en de updater daarna terugrollen — dat is de klassieke
"ik kan het niet meer updaten"-melding. Daarom controleert de testsuite van de app dit:

```bash
node --test test/deploy.test.js
python3 scripts/check-deploy-file-lists.py --remote
```

De tweede controleert elke naam in elke lijst: één pad, geen spatie, bestaat in de repo, en
optioneel HTTP 200 op de ruwe URL die het script zelf bouwt. Sinds de fout waarbij `install.sh`
de container-maker niet ophaalde, controleert hij ook dat elk script dat een deploy-script zelf
uitvoert (`bash "$TARGET_DIR/..."`) in zijn eigen lijst staat; de testsuite bewaakt hetzelfde.
