# AkkoordKast

**Gitaarsongbook met capo-advies, grepen, begeleidingsaudio en Chromecast — op je eigen server.**

![AkkoordKast](docs/img/hero.png)

[![installeren op Proxmox](https://img.shields.io/badge/install-Proxmox%20LXC-f5a524)](deploy/proxmox/README.md)
![Node 22](https://img.shields.io/badge/Node.js-22%20(node%3Asqlite)-3c873a)
![geen npm-afhankelijkheden](https://img.shields.io/badge/dependencies-geen-34d399)
![taal](https://img.shields.io/badge/taal-Nederlands-60a5fa)
![liedjes](https://img.shields.io/badge/liedjes-8680-f5a524)
![bronnen](https://img.shields.io/badge/bronnen-publiek%20domein-34d399)

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
| ![upload](docs/img/upload-herkend.png) | **Mp3 of mp4 uploaden** — de app haalt het geluid uit je bestand, herkent tempo, toonsoort en akkoorden en zoekt het liedje er meteen bij in de bibliotheek. |
| ![meespelen](docs/img/meespelen-opname.png) | **Meespelen met je eigen opname** — je opname is de muziek; de akkoorden, de maat, de hals en de grepen lopen ermee mee. |
| ![spotify](docs/img/spotify-blok.png) | **Spotify** — plak een link en de speler staat erbij; de noten lopen mee met wat je hoort. Met een eigen Client ID kun je ook zoeken. |
| ![muziekmap](docs/img/muziekmap-klaar.png) | **Een hele muziekmap in één keer** — geef een map op deze machine op en elk nummer erin wordt een eigen liedje met akkoordschema, tempo en toonsoort. |
| ![start/stop](docs/img/start-stop.png) | **Start en stop bij het spelen** — naast de speler staan twee gewone knoppen (Start en Stop) met de stand ernaast; Stop zet de muziek ook echt terug naar het begin. |
| ![tekst](docs/img/liedjestekst-bij-opname.png) | **De liedjestekst erbij** — lijkt de bestandsnaam op een liedje uit de bibliotheek, dan krijg je de tekst van dat liedje erbij te lezen, met de akkoorden uit jouw opname erboven. |

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

Meegeleverd: **8.680 liedjes**, allemaal met akkoorden per maat en (waar de bron dat heeft) de melodie,
verdeeld over zes bestanden met eigen id-bereiken. Welke bestanden meegaan staat in
[`song-data/datasets.json`](song-data/datasets.json); een test controleert dat die lijst, de bestanden
op schijf en de installatiescripts hetzelfde zeggen.

| Bestand | Aantal | Wat | Id's |
| --- | --- | --- | --- |
| [`song-data/liedjes.json`](song-data/liedjes.json) | 27 | met tekst en akkoorden: Nederlandse kinder- en Sinterklaasliedjes, kerstliedjes, het Wilhelmus, het **Limburgs volkslied**, Engelstalige en Afrikaanse traditionals, plus instrumentale stukken met tab | 1–27 |
| [`song-data/volkswijsjes.json`](song-data/volkswijsjes.json) | 971 | melodieën uit de Nottingham-collectie (jigs, reels, waltzes, morris, Playford), instrumentaal, akkoorden uit de bron | 100.000+ |
| [`song-data/kerkwijsjes.json`](song-data/kerkwijsjes.json) | 328 | kerkwijsjes uit het Open Hymnal Project, instrumentaal, akkoorden uit de vierstemmige zetting | 200.000+ |
| [`song-data/anthology-liedjes.json`](song-data/anthology-liedjes.json) | 314 | liedjes **met tekst** uit The Public Domain Song Anthology (CC0), Engelstalig, akkoorden uit de harmonisatie, noten uit de zangstem | 500.000+ |
| [`song-data/oneill-liedjes.json`](song-data/oneill-liedjes.json) | 2.352 | Ierse wijsjes uit O'Neill's *Music of Ireland* en *Dance Music of Ireland* (1903): jigs, reels, hornpipes, airs | 300.000+ |
| [`song-data/oude-bundels.json`](song-data/oude-bundels.json) | 4.688 | historische dansbundels: Kerr's *Merry Melodies*, Ryan's *Mammoth Collection* / Cole's *1000 Fiddle Tunes*, en achttiende-eeuwse Engelse manuscripten | 400.000+ |

Elk liedje houdt de toonsoort die de bron aangeeft; waar een akkoord geen greep heeft zoekt de
app de dichtstbijzijnde toonsoort waarin alles speelbaar is, en verder lost het capo-advies het op.

**Over de licenties.** Er komt niets in de app zonder een licentie die publiek domein, CC0, CC-BY of
MIT is; bronnen met "niet-commercieel", "geen afgeleiden" of share-alike vallen af, en The Session
(thesession.org, ~10.000 Ierse tunes) valt af omdat de licentie daarvan gebruik met Large Language
Models verbiedt. Per groep:

- **De 26 liedjes met tekst** zijn publiek domein.
- **De volkswijsjes** komen uit een collectie zonder expliciete licentieverklaring op de bronpagina —
  negentiende-eeuwse traditionals, maar zonder licentie-grant; daarom staan ze in een **apart bestand**
  dat je met één regel kunt weglaten. De kerkwijsjes komen uit het Open Hymnal Project, dat zijn
  publiek-domeinstatus in elk bestand zelf verklaart.
- **The Public Domain Song Anthology** (David Berger en Chuck Israels, Aperio Press) is CC0 1.0.
- **O'Neill (1903)** is publiek domein; de ABC-transcripties eisen **naamsvermelding van de
  transcribers** (folkies/oneill-project, 1997-2000) — die staat per liedje in de dataset.
- **De oude bundels**: de achttiende-eeuwse Engelse manuscripten komen van Gubbledenut/ABC TuneBooks
  (CC0 1.0), de historische collecties van Eric Conrad (MIT), en Kerr's en Ryan's Mammoth Collection
  zijn getranscribeerd door **John Chambers** (JC's Online Music Books), die ze publiek domein en vrij
  te kopiëren verklaart.

De bronvermelding en de letterlijke licentieverklaringen staan per bron in de manifesten onder
`song-data/` (bijvoorbeeld `oneill/manifest-oneill.json` en `anthology/manifest-anthology.json`),
plus per liedje in de dataset zelf.

**Over Limburg en Sittard.** Daar is bewust weinig van te vinden. Dertien bronnen zijn nagelopen
(CPDL/ChoralWiki, Cantorion, IMSLP, Wikimedia Commons, Delpher, de Nederlandse Liederenbank van het
Meertens Instituut, janwolters.nl, overtuin.net, MuseScore, abcnotation.com, Wikisource, de Limburgse
erfgoedorganisaties en de Sittardse liedjes zelf) — de uitkomst staat per bron in
`song-data/limburg/manifest-*.json`. Telkens is er ofwel geen licentieverklaring, ofwel een licentie
met share-alike of niet-commercieel, ofwel alleen een scan of PDF in plaats van leesbare noten. Het
Limburgs volkslied staat er wel in: de melodie en de tekst zijn publiek domein (Tijssen 1926,
Krekelberg 1937) en het akkoordschema is erbij gemaakt. Liedjes van Sittardse makelij — zoals die van
Jo Erens (1928-1955) — zijn pas dit jaar rechtenvrij en er bestaat geen leesbaar notenbestand van; die
kunnen er dus alleen in als jij de akkoorden en de tekst aanlevert, of als je een opname uploadt en de
app de akkoorden er zelf uit haalt.

**Over dubbelen.** De bundels overlappen elkaar: hetzelfde wijsje staat in O'Neill, in Kerr's én in
Ryan's. `scripts/ontdubbel.js` haalt die eruit op titel plus het verloop van de melodie (los van de
toonsoort, zodat ook een getransponeerde transcriptie als dubbel geldt) — 300 dubbelen eruit. De
eerste drie bestanden blijven daarbij ongemoeid, omdat hun liedjesnummers al in de database van
bestaande installaties kunnen zitten.

Eerlijk over de grens: een app met de bladmuziek van *alle* nummers die bestaan kan niet legaal
worden meegeleverd — de meeste muziek van na ~1928 valt onder auteursrecht. Daarom is AkkoordKast
zo gebouwd dat jij zelf alles kunt toevoegen wat je wilt spelen: plak de ChordPro-tekst van je
eigen liedjesboek, of maak een eigen kopie van een meegeleverd liedje en hang er je eigen audio
aan. De app zelf levert alleen de akkoordenreeks, de grepen en de capo-adviezen.

## Muziek of video erbij zoeken

Kies in het tabblad **Toevoegen** een **mp3, mp4, m4a, wav, ogg of webm**. De app:

1. haalt met `ffmpeg` het geluid uit het bestand;
2. bepaalt het tempo, de maatsoort en de toonsoort (FFT, chromagram, tikherkenning);
3. herkent per maat het akkoord dat het beste bij de klankkleur past, met een zekerheid per maat;
4. maakt er een eigen liedje van, zet het schema in de bladmuziek en hangt je opname eraan;
5. zoekt in de bibliotheek of de bestandsnaam bij een bestaand liedje hoort ("Amazing Grace (official video).mp3" → het liedje *Amazing Grace*), zodat je meteen de grepen en het capo-advies hebt;
6. neemt van dat gevonden liedje **de liedjestekst mee** (zonder akkoorden), zodat je onder het herkende schema de woorden te lezen krijgt en meteen kunt meezingen.

Daarna speel je mee met je eigen opname: geen aftelmaat, één keer door het schema, en het beeld volgt het geluid.
Het is automatische herkenning — het resultaat is een voorstel, dus controleer het schema en pas het gerust aan.

## Een hele muziekmap in één keer

Staat je muziek op dezelfde machine als AkkoordKast, dan hoef je niets te uploaden. Geef in het
tabblad **Toevoegen** het pad op (bijvoorbeeld `/home/tom/muziek`) en druk op **Kijk wat erin zit**;
de app loopt de map en alle onderliggende mappen door en laat zien wat erin staat en wat al gedaan is.
Daarna zet **Alles omzetten** elk nummer om naar een eigen liedje: tempo, toonsoort en akkoorden per
maat, met de bestandsnaam als titel, en waar de naam op een liedje uit de bibliotheek lijkt krijg je
dat liedje erbij (grepen en capo-advies inbegrepen). Het werk gaat in kleine rondes met een
voortgangsbalk, dus ook een map met honderden nummers loopt gewoon door; wat al gedaan is wordt
overgeslagen, zodat je gerust nog eens kunt drukken.

## Spotify

Plak in het liedpaneel een Spotify-link (`open.spotify.com/track/…`, `spotify:track:…` of een losse id). De speler
verschijnt in de app en geeft zijn positie terug via de Spotify iFrame-API, zodat de noten, de grepen en de akkoorden
meelopen met de echte muziek. Dit werkt zonder account of sleutel.

Wil je ook *in* Spotify zoeken, vul dan bij **Casten → Spotify** een eigen Client ID en Secret in (gratis aan te maken
op `developer.spotify.com/dashboard`). Die sleutels blijven in de database van deze server staan. Afspelen op afstand
(Spotify Connect) vraagt daarnaast een accountkoppeling met inlog; daar is nog geen knop voor.

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
