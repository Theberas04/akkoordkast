# AkkoordKast

**Gitaarsongbook met capo-advies, grepen, begeleidingsaudio en Chromecast — op je eigen server.**

![AkkoordKast](docs/img/hero.png)

[![installeren op Proxmox](https://img.shields.io/badge/install-Proxmox%20LXC-f5a524)](deploy/proxmox/README.md)
![Node 22](https://img.shields.io/badge/Node.js-22%20(node%3Asqlite)-3c873a)
![geen npm-afhankelijkheden](https://img.shields.io/badge/dependencies-geen-34d399)
![taal](https://img.shields.io/badge/taal-Nederlands-60a5fa)
![liedjes](https://img.shields.io/badge/publiek--domein%20liedjes-26-f5a524)

Je opent AkkoordKast op je telefoon of laptop, zoekt een liedje en ziet meteen:
de bladmuziek met de akkoorden boven de tekst, **of je een capo nodig hebt en welke grepen
je dan pakt**, de greepdiagrammen, en een audiospeler met begeleiding van de akkoordenreeks.
Die begeleiding cast je naar een Chromecast in je netwerk.

| Scherm | Wat je ziet |
| --- | --- |
| ![liedjes](docs/img/liedjes-desktop.png) | **Liedjesbibliotheek** — zoeken op titel, artiest of akkoord, filteren op taal, soort, capo en moeilijkheid. Elk liedje toont zijn capostand. |
| ![spelen](docs/img/spelen-desktop.png) | **Capo-advies** — "Capo 3, speel in A", met de grepen die je dan pakt en de barré-akkoorden die je ermee ontwijkt. |
| ![grepen](docs/img/grepen-desktop.png) | **Grepen** — een greepdiagram per akkoord, meegeschoven met de capostand en de barré als balk getekend. |
| ![bladmuziek](docs/img/bladmuziek-telefoon.png) | **Bladmuziek op je telefoon** — akkoorden boven de lettergreep waar ze vallen, refreinen apart, tabblokken in monospace. Ook te printen. |
| ![toevoegen](docs/img/toevoegen-desktop.png) | **Eigen liedjes** — ChordPro plakken of een bestand kiezen. Aan je eigen liedjes hang je je eigen opname. |
| ![casten](docs/img/casten-desktop.png) | **Casten** — Chromecasts zoeken (of een IP intypen), casten, stoppen en het volume regelen. |

## Rondleiding van 56 seconden

[![Rondleiding](docs/img/spelen-desktop.png)](docs/img/rondleiding.mp4)

Een diashow van de echte schermen met Nederlandse voice-over:
[`docs/img/rondleiding.mp4`](docs/img/rondleiding.mp4) (56 s, 1280x720, met geluid, demo-gegevens).

## Installeren op je Proxmox-host

Draai dit op de Proxmox-host zelf, als root:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/Theberas04/akkoordkast/main/deploy/proxmox/install.sh)"
```

Het script maakt een Debian-container, installeert Node.js 22, ffmpeg en de Chromecast-hulp,
zet de app als systemd-dienst op poort 80 en print het adres. Bijwerken later:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/Theberas04/akkoordkast/main/deploy/proxmox/update-from-github.sh)" <CTID>
```

Gaat er iets mis, dan is er een alleen-lezen diagnose:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/Theberas04/akkoordkast/main/deploy/proxmox/check-akkoordkast.sh)" <CTID>
```

Meer over de scripts, de keuzes en het terugrollen: [`deploy/proxmox/README.md`](deploy/proxmox/README.md).

## Zelf draaien zonder container

```bash
git clone https://github.com/Theberas04/akkoordkast && cd akkoordkast
node server.js          # http://localhost:8090
node --test test/*.test.js
```

Alleen Node.js 22.5 of nieuwer nodig (voor `node:sqlite`), en optioneel `ffmpeg` voor mp3
in plaats van wav. Geen npm-afhankelijkheden.

## Wat zit erin

- **Capo-advies dat rekent.** Voor elke capostand 0–8 telt de app de grepen die je dan pakt,
  straft barrés en onbekende grepen, en kiest de makkelijkste stand. Het advies zegt ook wat het
  kost om *zonder* capo te spelen ("Zonder capo zou je F als barré moeten pakken").
- **Grepen voor élk akkoord.** 26 vaste open grepen plus afgeleide barré-grepen uit de
  E- en A-vorm, zodat ook een akkoord na transponeren of onder een hoge capo een diagram heeft.
- **ChordPro als bronformaat.** `[G]akkoord` boven de lettergreep, `{soc}`/`{eoc}` voor refreinen,
  `{sot}`/`{eot}` voor tabblokken. Meerdere liedjes in één plaksel worden apart opgeslagen.
- **Transponeren.** Heen en weer in halve tonen, met de juiste spelling (mollen waar dat hoort).
- **Audio zonder auteursrechten.** De app synthetiseert de begeleiding zelf (Karplus-Strong
  tokkels per snaar, slagpatroon, tempo uit het liedje) en levert die als mp3. Je eigen opname
  uploaden kan bij je eigen liedjes; voor de muziek zelf linkt elk liedje naar een zoekopdracht
  op YouTube.
- **Chromecast.** Apparaten zoeken via mDNS en anders direct op een IP, casten met titel en
  artiest, stoppen en volume regelen. De Chromecast haalt de audio bij deze server op, dus
  het toestel moet de container kunnen bereiken.
- **PWA.** Installeerbaar op je telefoon, met de app-schil in de cache maar liedjes, audio en
  cast-status altijd live.

## De liedjes

Meegeleverd: **26 publiek-domein liedjes** (Nederlandse kinderliedjes en Sinterklaasliedjes,
kerstliedjes, het Wilhelmus, Engelstalige en Afrikaanse traditionals, drie instrumentale
stukken met tab) in [`song-data/liedjes.json`](song-data/liedjes.json), elk met bronvermelding.

Eerlijk over de grens: een app met de bladmuziek van *alle* nummers die bestaan kan niet legaal
worden meegeleverd — de meeste muziek van na ~1928 valt onder auteursrecht. Daarom is AkkoordKast
zo gebouwd dat jij zelf alles kunt toevoegen wat je wilt spelen: plak de ChordPro-tekst van je
eigen liedjesboek, of maak een eigen kopie van een meegeleverd liedje en hang er je eigen audio
aan. De app zelf levert alleen de akkoordenreeks, de grepen en de capo-adviezen.

## Hoe het werkt

| Onderdeel | Keuze |
| --- | --- |
| Server | één Node.js-proces, geen npm-afhankelijkheden, `node:sqlite` voor je eigen liedjes |
| Interface | één `public/index.html` met CSS, markup en app-script erin; mobiel-first, Nederlands |
| Muziektheorie | `lib/theorie.js` (transponeren en toonsoort-spelling), `lib/capo.js` (advies), `lib/grepen.js` (grepen en SVG-diagrammen) |
| Bladmuziek | `lib/chordpro.js` parseert ChordPro naar een renderbaar model |
| Audio | `lib/gitaar.js` synthetiseert tokkels naar WAV; `ffmpeg` zet dat om naar mp3 en die wordt gecachet |
| Casten | `scripts/cast-helper.py` met pychromecast, door de server aangeroepen; de pagina praat nooit rechtstreeks met de Chromecast |

## Tests

```bash
node --test test/*.test.js          # 57 tests: muziektheorie, API, pagina, deploy-scripts
python3 scripts/check-deploy-file-lists.py            # bestandslijsten van de deploy
python3 scripts/check-deploy-file-lists.py --remote   # ook HTTP 200 op elke ruwe URL
```

De suite controleert onder meer dat elk inline scriptblok van de pagina compileert, dat geen
enkele id dubbel voorkomt, dat de liedjes-dataset alleen akkoorden gebruikt waar een diagram voor
bestaat, dat de downloadlijsten van de installer en de updater bij elkaar passen (de klassieke
`Cannot find module`-oorzaak), en dat de gezondheidscontrole de app-marker eist en controleert of
node op de poort luistert. Deploy-scripts worden met `bash -n` en een aanhalingstekensbalans per
regel nagelopen, omdat een afgebroken quote in een single-quoted heredoc stil blijft.

## Licentie

De app-code is MIT. De meegeleverde liedjes zijn publiek domein; de bronvermelding staat per
liedje in de dataset. De liedjes zijn niet van mij en de dataset is met de hand samengesteld,
dus controleer bij twijfel zelf de herkomst voordat je iets publiceert.
