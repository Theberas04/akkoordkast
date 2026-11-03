# AkkoordKast

**Gitaarsongbook met capo-advies, grepen, begeleidingsaudio en Chromecast — op je eigen server.**

![AkkoordKast](docs/img/hero.png)

[![tests](https://github.com/Theberas04/akkoordkast/actions/workflows/tests.yml/badge.svg)](https://github.com/Theberas04/akkoordkast/actions/workflows/tests.yml)
[![installeren op Proxmox](https://img.shields.io/badge/install-Proxmox%20LXC-f5a524)](deploy/proxmox/README.md)
![Node 22](https://img.shields.io/badge/Node.js-22%20(node%3Asqlite)-3c873a)
![geen npm-afhankelijkheden](https://img.shields.io/badge/dependencies-geen-34d399)
![taal](https://img.shields.io/badge/taal-Nederlands-60a5fa)
![liedjes](https://img.shields.io/badge/liedjes-8701-f5a524)
![bronnen](https://img.shields.io/badge/bronnen-publiek%20domein-34d399)

Je opent AkkoordKast op je telefoon of laptop, zoekt een liedje en ziet meteen:
de bladmuziek met de akkoorden boven de tekst, **of je een capo nodig hebt en welke grepen
je dan pakt**, de greepdiagrammen, en een audiospeler met begeleiding van de akkoordenreeks.
Die begeleiding cast je naar een Chromecast in je netwerk.

**Wat staat waar:** [rondleiding](#rondleiding-van-56-seconden) ·
[installeren op Proxmox](#installeren-op-je-proxmox-host) · [zelf draaien](#zelf-draaien-zonder-container) ·
[wat zit erin](#wat-zit-erin) · [de liedjes](#de-liedjes) · [gitaar leren spelen](#gitaar-leren-spelen) ·
[muziek erbij zoeken](#muziek-of-video-erbij-zoeken) · [een muziekmap in één keer](#een-hele-muziekmap-in-één-keer) ·
[op een NAS of in Drive](#de-muziekmap-op-een-nas-of-in-google-drive) ·
[spelen op het podium](#spelen-op-het-podium) · [een setlist en optredenmodus](#een-setlist-en-optredenmodus) ·
[oefenen met moeilijke stukken](#oefenen-met-moeilijke-stukken) ·
[gehoor-trainer](#gehoor-trainer-akkoorden-herkennen) ·
[het akkoordenboek](#akkoordenboek-alle-posities-over-de-hals) ·
[jouw eigen lijstjes](#jouw-eigen-lijstjes) · [beheer en bijwerken](#beheer-en-bijwerken) ·
[Spotify](#spotify) · [hoe het werkt](#hoe-het-werkt) · [tests](#tests) · [licentie](#licentie)

| Scherm | Wat je ziet |
| --- | --- |
| ![liedjes](docs/img/liedjes-desktop.png) | **Liedjesbibliotheek** — zoeken op titel, artiest of akkoord, filteren op taal, **genre**, **artiest**, capo en moeilijkheid. Elk liedje toont zijn capostand. |
| ![spelen](docs/img/spelen-desktop.png) | **Capo-advies** — "Capo 3, speel in A", met de grepen die je dan pakt en de barré-akkoorden die je ermee ontwijkt. |
| ![grepen](docs/img/grepen-desktop.png) | **Grepen** — een greepdiagram per akkoord, meegeschoven met de capostand en de barré als balk getekend. |
| ![bladmuziek](docs/img/bladmuziek-telefoon.png) | **Bladmuziek op je telefoon** — akkoorden boven de lettergreep waar ze vallen, refreinen apart, tabblokken in monospace. Ook te printen. |
| ![toevoegen](docs/img/toevoegen-desktop.png) | **Eigen liedjes** — ChordPro plakken of een bestand kiezen. Aan je eigen liedjes hang je je eigen opname. |
| ![casten](docs/img/casten-desktop.png) | **Casten** — Chromecasts zoeken (of een IP intypen), casten, stoppen en het volume regelen. |
| ![upload](docs/img/upload-herkend.png) | **Mp3 of mp4 uploaden** — de app haalt het geluid uit je bestand, herkent tempo, toonsoort en akkoorden en zoekt het liedje er meteen bij in de bibliotheek. |
| ![meespelen](docs/img/meespelen-opname.png) | **Meespelen met je eigen opname** — je opname is de muziek; de akkoorden, de maat, de hals en de grepen lopen ermee mee. |
| ![spotify](docs/img/spotify-blok.png) | **Spotify** — plak een link en de speler staat erbij; de noten lopen mee met wat je hoort. Met een eigen Client ID kun je ook zoeken. |
| ![muziekmap](docs/img/muziekmap-klaar.png) | **Een hele muziekmap in één keer** — geef een map op deze machine op en elk nummer erin wordt een eigen liedje met akkoordschema, tempo en toonsoort. |
| ![leren](docs/img/leren-cursus.png) | **Gitaar leren spelen** — zesentwintig lessen in vier delen, van "hoe houd ik hem vast" tot een oefenplan dat je volhoudt, met per les een oefening in de app en je voortgang bewaard op je toestel. |
| ![akkoordentrainer](docs/img/leren-trainer.png) | **Akkoordentrainer** — metronoom, een set akkoorden naar keuze en het volgende akkoord alvast in beeld, want daar gaat het bij leren wisselen om. |
| ![podium](docs/img/podium.png) | **Podiummodus en meescrollen** — alleen het liedje op het scherm, groot en rustig, terwijl de pagina zelf meeschuift op jouw tempo; met spatie start en stop je het schuiven en met de pijltjes ga je een halve pagina verder. |
| ![mijn lijstjes](docs/img/mijn-lijstjes.png) | **Profielen, favorieten en labels** — elk gezinslid heeft eigen favorieten, eigen labels (bruiloft, kroeg, kerk) en een eigen speelgeschiedenis; filter met één klik op je eigen lijstje. |
| ![oefenen](docs/img/oefenen.png) | **Vertragen en een stukje herhalen** — zet het liedje op 60% zodat het rustig blijft klinken (de tonen blijven even hoog), zet met A en B een lus over juist die twee maten en speel ze tot ze zitten. |
| ![meeluisteren](docs/img/microfoon.png) | **De app luistert mee** — met de microfoon hoort de app welk akkoord je pakt en zegt of dat het akkoord is dat in beeld staat. Alles in de browser, er wordt niets opgenomen of verstuurd. |
| ![liedjesboek](docs/img/boek.png) | **Een liedjesboek maken** — van je hele selectie één document met titelblad, inhoudsopgave en elk liedje op een eigen pagina met de grepen en de bladmuziek; printen doe je met de printknop van de browser (Bewaar als PDF). |
| ![setlist](docs/img/setlists.png) | **Setlists** — liedjes in een vaste volgorde voor een optreden, met pijltjes om te schuiven en een knop om er een vel van te printen. Hoort bij je profiel. |
| ![optreden](docs/img/optreden.png) | **Optredenmodus** — alleen het liedje van nu, met een balk erboven: welk nummer, vorige en volgende, en een pauzeklok voor de stilte tussen twee nummers. |
| ![gehoor](docs/img/gehoor-trainer.png) | **Gehoor-trainer** — de app speelt een akkoord en jij zegt welk het is, of je hoort twee akkoorden en zegt of het tweede hoger of lager klonk. |
| ![akkoordenboek](docs/img/akkoordenboek.png) | **Akkoordenboek** — van elk akkoord alle posities over de hals, met het vaknummer en een uitleg, en een knop om er een grepenkaart van te printen. |
| ![wachter](docs/img/wachter.png) | **Automatisch bijhouden** — de app kijkt zelf in je muziekmap en naar nieuwe versies op GitHub, en schrijft op wat er gedaan is. |
| ![beheer](docs/img/beheer.png) | **Beheer en bijwerken** — welke versie er draait, of er iets nieuws klaarstaat op GitHub, en in één klik bijwerken als deze machine daarop is ingericht. |
| ![start/stop](docs/img/start-stop.png) | **Start en stop bij het spelen** — naast de speler staan twee gewone knoppen (Start en Stop) met de stand ernaast; Stop zet de muziek ook echt terug naar het begin. |
| ![tekst](docs/img/liedjestekst-bij-opname.png) | **De liedjestekst erbij** — lijkt de bestandsnaam op een liedje uit de bibliotheek, dan krijg je de tekst van dat liedje erbij te lezen, met de akkoorden uit jouw opname erboven. |

## Rondleiding van 56 seconden

[![Rondleiding](docs/img/spelen-desktop.png)](docs/img/rondleiding.mp4)

Een diashow van de echte schermen met Nederlandse voice-over:
[`docs/img/rondleiding.mp4`](docs/img/rondleiding.mp4) (56 s, 1280x720, met geluid, demo-gegevens).

En een tweede filmpje over wat er daarna bijgekomen is — de eigen lijstjes, de podiummodus, het
meescrollen, het oefenen met een lus, het meeluisteren met de microfoon, de oefencijfers, het
liedjesboek en het bijwerken:
[`docs/img/nieuwe-functies.mp4`](docs/img/nieuwe-functies.mp4) (1 min 51, 1280x720, met geluid).
Zo'n filmpje maak je opnieuw met `python3 scripts/maak-filmpje.py --scenes filmpjes/nieuwe-functies.json`.

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
- **Een akkoordenboek met alle posities.** Van elk akkoord niet één greep maar alles wat je
  kunt pakken: de open positie en de barré-vormen verder naar boven, met de tekening erbij.
- **Setlists en een optredenmodus.** Zet liedjes in een vaste volgorde en speel ze achter elkaar
  door: groot beeld, alleen het liedje van nu, met de knoppen om verder te gaan en een pauzeklok.
- **Gehoor-trainer.** De app speelt een akkoord en jij zegt welk het is; of ze speelt er twee en
  jij zegt of het tweede hoger of lager klinkt. Je hoeft niets te zien.
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
| [`song-data/limburg-liedjes.json`](song-data/limburg-liedjes.json) | 22 | Limburg: het volkslied en drie liedjes van de Sittardse troubadour **Jo Erens** (tekst én muziek, sinds 1 januari dit jaar rechtenvrij) met akkoordschema, plus **achttien publiek-domein liedteksten** uit Maastricht (Mestreechs dialect, uit de bloemlezing van Endepols, 1943) en Belgisch-Limburg (Lambrechts) — van die achttien is geen melodie overgeleverd, dus die staan er als tekst zonder akkoorden | 600.000+ |
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

**Wat er wél uit Limburg in staat.** Achttien liedteksten uit de tweede ronde: twaalf Maastrichtse
liederen in het Mestreechs (Weustenraad †1849, Franquinet †1900, Polis †1915, Breuls †1923, Olterdissen
†1923, Albert †1939, Systermans †1939 — waaronder het *Slotkoor oet 'Trijn'*, het Maastrichtse volkslied,
en *'t Vreugjaor*), één anonieme *Erelied der Potentaten van Beek* (gedrukt 1892) en vijf liederen van de
Belgisch-Limburgse dichter Lambrecht Lambrechts (†1932). Elk lied heeft een verifieerbare bron-URL en een
geverifieerd sterfjaar; van deze liedjes is **geen melodie overgeleverd**, dus er staan geen akkoorden bij
en de app zegt dat er ook bij: de liedlijst zet er "alleen tekst" op en het speelscherm zegt dat er geen
begeleiding te maken valt. Niets verzonnen, ook niet muzikaal.

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

## Gitaar leren spelen

In het tabblad **Leren** zit een cursus van **zesentwintig lessen in vier delen**. Elke les heeft een
doel, uitleg in gewone taal en één oefening die je meteen in de app doet. Je voortgang (lessen,
oefeningen en getrainde akkoordwissels) blijft in je eigen browser bewaard.

**Beginnen (5 lessen)** — de gitaar vasthouden en de zes snaren; stemmen; je eerste drie akkoorden
(Em · Am · C); de houding van je linkerhand; opwarmen en vingeroefeningen.

**Akkoorden (6 lessen)** — C · G · D7 en leren wisselen; groot tegen klein horen; mineurakkoorden
(Am · Em · Dm · Bm); zevende akkoorden en waarom G7 naar C wil; barré-akkoorden F en Bm; en met één
barrévorm akkoorden op elke fret pakken.

**Ritme (5 lessen)** — slagritme met de rechterhand (D DU UDU); maatsoort en meetellen (4/4, 3/4, 6/8);
tokkelen met je vingers; tempo vasthouden zonder metronoom; dynamiek, hard en zacht.

**Verdiepen (10 lessen)** — een liedje helemaal meespelen; capo en toonsoort; transponeren naar jouw
stem; toonladders en waar akkoorden vandaan komen; zelf akkoorden kiezen bij een tekst; een liedje op
gehoor uitzoeken; meespelen met een opname; jezelf terugluisteren; onderhoud van je gitaar; en een
oefenplan van tien minuten per dag.

Daarnaast staat in hetzelfde tabblad:

- **Akkoordentrainer** met metronoom: vul een eigen akkoordenset in (met de voorbeelden als suggestie,
  van Em · Am · C tot alle 26 grepen door elkaar), kies het tempo en het aantal maten per akkoord. De
  app laat het volgende akkoord alvast zien en telt de maten voor je; na het stoppen zie je hoeveel
  akkoordwissels je gedaan hebt.
- **Stemmen**: klik op een snaar en hoor de toon. Zes knoppen, dik naar dun.
- **Slagpatronen**: vier patronen plus tokkelen, met een metronoom die meetelt.
- **Alle grepen** op één plek: klik op een greep en je hoort hem.

Alles wat klinkt maakt de pagina zelf met Web Audio — geen geluidsbestanden, geen internet, en het werkt
dus ook in de app op je telefoon en offline.

![een les uit het deel Ritme](docs/img/leren-les.png)

![stemmen en slagpatronen](docs/img/leren-stemmen.png)

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

## De muziekmap op een NAS of in Google Drive

Staat je muziek niet op dezelfde machine als AkkoordKast maar op een NAS in je netwerk of
in Google Drive, dan koppel je die map aan de container en wijs je de app erop. De app scant
gewoon een map op deze machine; of die map nu op de eigen schijf staat of van een NAS of Drive
komt, maakt voor het scannen niet uit. Welke map de app bekijkt hoort in de omgevingsvariabele
**`MUSIC_DIR`** te staan (standaard `/home/akkoordkast/muziek`). Na het koppelen vul je
datzelfde pad in bij het tabblad **Toevoegen → Muziekmap scannen**.

Twee hulpscripts horen erbij:

| Script | Waar het draait | Wat het doet |
| --- | --- | --- |
| [`deploy/proxmox/nas-koppelen.sh`](deploy/proxmox/nas-koppelen.sh) | op de **Proxmox-host**, als root | koppelt een NAS-map (SMB of NFS) en hangt die in de container |
| [`deploy/proxmox/nas-koppelen-lxc.sh`](deploy/proxmox/nas-koppelen-lxc.sh) | op de **Proxmox-host**, als root | zet fuse in de container en laat de container de NAS zelf koppelen (route 1b) |
| [`deploy/proxmox/nas-mount-lxc.sh`](deploy/proxmox/nas-mount-lxc.sh) | **in de container**, als root | het containerdeel van route 1b: rclone koppelt de NAS-share |
| [`deploy/proxmox/drive-koppelen.sh`](deploy/proxmox/drive-koppelen.sh) | **in de container**, als root | koppelt Google Drive met rclone, als systemd-dienst met een controletimer |

### Route 1: een NAS in hetzelfde netwerk

1. Op de Proxmox-host, als root:
   ```bash
   bash deploy/proxmox/nas-koppelen.sh
   ```
   Het script vraagt om het IP-adres van de NAS, de sharenaam (of het NFS-exportpad), de
   gebruikersnaam en het wachtwoord, het container-id en het koppelpunt. Je kunt alles ook
   vooraf meegeven, dan wordt er niets gevraagd:
   ```bash
   NAS_PROTO=cifs NAS_HOST=192.168.1.100 NAS_SHARE=muziek NAS_USER=thuis NAS_PASS=geheim \
   CTID=225 bash deploy/proxmox/nas-koppelen.sh
   ```
2. Het script controleert eerst of de host de NAS kan bereiken (ping en de juiste poort:
   445 voor SMB, 2049 voor NFS). Lukt dat niet, dan stopt het met uitleg in plaats van te
   koppelen.
3. De koppeling komt **op de host** te staan en wordt met een bind-mount in de container
   gehangen. Dat is de veiligste route: op een ongeprivilegieerde LXC mag alleen root een paar
   bestandssystemen mounten en werkt `cifs` of `nfs` binnen de container vaak niet, terwijl de
   host gewoon kan mounten en Proxmox de map netjes doorgeeft.
4. De regel gaat in `/etc/fstab` met `_netdev` (pas koppelen als het netwerk er is) en `nofail`
   (een uitstaande NAS mag het opstarten niet blokkeren). De oude `fstab` wordt als
   `/etc/fstab.akkoordkast.bak` bewaard.
5. Het script koppelt, doet een **lees- en schrijftest** op de host en in de container, en
   herstart de container zodat de bind-mount actief wordt. Gaat er iets mis, dan ontkoppelt het
   de map weer en zet de oude `fstab` terug.
6. Als laatste zet het `MUSIC_DIR` in de dienst van de app (drop-in op
   `akkoordkast.service.d/music-dir.conf`) en herstart de app, zodat het pad bij *Muziekmap
   scannen* al ingevuld staat.

**NFS kan alleen via deze route.** rclone spreekt geen NFS en de kernel laat een
ongeprivilegieerde container geen NFS-koppeling maken, dus voor NFS is de host de enige weg.
Geef dan het **exportpad** mee in `NAS_EXPORT` (niet in `NAS_SHARE`; dat is voor SMB):

```bash
NAS_PROTO=nfs NAS_HOST=192.168.1.100 NAS_EXPORT=/mnt/Nas/Nas-Opslag/Muziek \
CTID=106 bash deploy/proxmox/nas-koppelen.sh
```

De NFS-server van de NAS moet dit host-adres wel toelaten (`*`, of het netwerk/de host van de
Proxmox-server). Een export die alleen `localhost` of één gast toestaat, geeft bij het koppelen
`access denied`.

Je wachtwoord komt nooit in de proceslijst of de shell-historie: je typt het met `read -s`, en
de koppeling leest het uit `/etc/akkoordkast/nas.credentials` met rechten 600. Nooit
`mount -o pass=…` op de opdrachtregel — die is voor iedereen leesbaar via `/proc`.

### Route 1b: de NAS rechtstreeks in de container (fuse)

Wil je de map liever niet op de Proxmox-host maar alleen in de AkkoordKast-container, dan kan dat
met fuse. Op de host zet je eenmalig fuse in de container, waarna de container de share zelf koppelt:

```bash
CTID=225 NAS_HOST=192.168.1.100 NAS_SHARE=muziek NAS_USER=thuis bash deploy/proxmox/nas-koppelen-lxc.sh
```

Het hostscript zet twee regels in `/etc/pve/lxc/<CTID>.conf` (de oude configuratie wordt bewaard),
herstart de container één keer — dat moet, want zonder `/dev/fuse` kan de container niet koppelen — en
draait daarna het containerdeel. Dat installeert rclone, schrijft de share in
`/root/.config/rclone/rclone.conf` (rechten 600, het wachtwoord gaat niet mee als opdrachtregel),
koppelt de map als systemd-dienst en zet een timer die elke vijf minuten kijkt of de map er nog is.
Ook zet het `MUSIC_DIR` in de dienst van de app, zodat de app de map zelf voorstelt.

Eerst kijken wat het zou doen, zonder iets te veranderen:

```bash
pct exec 225 -- env PROEF=1 GEGEVENS=/root/nas-gegevens.env bash /root/nas-mount-lxc.sh
```

**Wat je hiervoor moet weten.** Een ongeprivilegieerde container mag van de kernel geen SMB- of
NFS-map koppelen; daarom gaat het hier via fuse (rclone), niet met `mount -t cifs`. Dat werkt zonder
privileges, maar rclone doet het lees- en schrijfwerk zelf: bij heel grote mappen (duizenden
bestanden) is route 1 — koppelen op de host — merkbaar sneller. Voor een gewone muziekmap merk je
het verschil niet.

**TrueNAS en andere SMB-servers.** Op de NAS zelf hoef je niets te installeren:

1. Zet de **SMB-dienst** aan (TrueNAS: Services → SMB) en deel de dataset met de muziek
   (Shares → Windows (SMB) → Add). TrueNAS heeft SMB1 uit staan; dat is geen probleem, rclone
   praat SMB2 en SMB3.
2. Maak op de NAS een **gebruiker** aan die bij die share mag, en geef die gebruiker **eigenaarschap
   of schrijfrechten op de dataset** (TrueNAS: Datasets → Edit Permissions). Het script zet een
   proefbestandje in de share om dit te controleren; lukt schrijven niet, dan zegt het dat met de
   reden erbij — dat is bijna altijd een dataset waar de gebruiker geen rechten op heeft.
3. Vul in de opdracht het IP of de hostnaam van de NAS, de **sharenaam** (niet het volledige pad en
   zonder `\\nas\`) en de gebruikersnaam. Voorbeeld voor een TrueNAS met de share `muziek`:

   ```bash
   CTID=225 NAS_HOST=192.168.1.100 NAS_SHARE=muziek NAS_USER=thuis \
     bash deploy/proxmox/nas-koppelen-lxc.sh
   ```

4. **NFS kan niet via deze route.** rclone spreekt geen NFS — het heeft alleen `serve nfs` en dat
   is de andere kant op — en de kernel laat een ongeprivilegieerde container geen NFS-koppeling
   maken (`mount -t nfs` werkt alleen op de host). De NFS-client van Debian (`nfs-common`) werkt
   ook via de kernel en is dus geen uitweg. Heb je je map alleen via NFS gedeeld, deel hem dan ook
   als SMB-share, of gebruik route 1 (`nas-koppelen.sh`), waar de host koppelt. Deze scripts zeggen
   dit ook zelf als je `NAS_PROTO=nfs` meegeeft, in plaats van iets te proberen wat niet kan.

### Route 2: Google Drive

1. In de container, als root:
   ```bash
   pct exec 225 -- bash drive-koppelen.sh
   ```
2. Het script installeert rclone en fuse. Daarna is er **eenmalige aanmelding** nodig, en die
   kan niet zonder browser. Twee manieren, het script legt ze allebei uit:
   - op een computer met een browser `rclone config` doen (remote van het type `drive`, naam
     `gdrive`) en daarna het bestand `/root/.config/rclone/rclone.conf` naar de container
     kopiëren met `pct push 225 rclone.conf /root/.config/rclone/rclone.conf --perms 600`;
   - of `rclone config` **in de container** draaien; die print een link die je in een browser op
     een ander apparaat opent, waarna je de code terugplakt. Geen browser in de container nodig.

   Zonder gedaan configuratiebestand stopt het script met uitleg en verandert het verder niets.
3. Het script zet een **systemd-dienst** (`akkoordkast-drive-mount.service`) op die de map
   koppelt met `rclone mount --vfs-cache-mode writes`. Die laatste optie is nodig: zonder
   schrijfcache weigert rclone het schrijven en kan de app er niets in zetten.
4. Een **systemd-timer** (`akkoordkast-drive-check.timer`) controleert elke vijf minuten of de
   map er nog is en herstart de dienst zo nodig. Drive laat de koppeling nog wel eens vallen; de
   timer en `Restart=on-failure` op de dienst vangen dat op, ook na een herstart van de container.
5. Het script zet `MUSIC_DIR` op de koppelmap via een drop-in op de dienst van de app en herstart
   die. Het zet ook de **eigenaar** van de gekoppelde bestanden op de gebruiker van de app
   (`--uid`/`--gid`), want rclone geeft bestanden standaard als root door en dan kan de app er wel
   lezen maar niet in schrijven.

Koppel bij voorkeur alleen een **map** in Drive in plaats van je hele Drive:

```bash
pct exec 225 -- env RCLONE_PAD=Muziek bash drive-koppelen.sh
```

Dat scheelt enorm bij het scannen: je hele Drive inlezen betekent ook je foto's, documenten en
back-ups. Kijk eerst wat het zou doen zonder iets te veranderen:

```bash
pct exec 225 -- env PROEF=1 bash drive-koppelen.sh
```

**Wat je hiervoor moet weten.** Google Drive is geen schijf maar een dienst over het internet:
bestanden worden pas opgehaald als je ze aanraakt, het inlezen van een grote map duurt daardoor
langer, en Google legt limieten op aan het aantal aanroepen (bij heel veel bestanden in één keer
omzetten kun je tegen die limiet aanlopen — zet dan de wachter op een ruim interval, dan gaat het
rustig in groepjes). Een **gedeelde Drive** van iemand anders, of een map die met je gedeeld is,
moet je in de koppeling apart aanzetten (`rclone config` → de remote bewerken → `shared_with_me`
of `team_drive`); standaard ziet de koppeling alleen je eigen Drive. En let op: de app leest de map
alleen, hij stuurt zelf niets naar Google toe — dat doet rclone.

### Als het gekoppeld is

Wijs de app er dan op. Zet je `MUSIC_DIR` in de omgeving van de dienst (dat doet
`drive-koppelen.sh` automatisch), dan vult de app dat pad zelf vast in bij **Muziekmap scannen** en bij
**Automatisch bijhouden**. Zonder die variabele typ je het pad één keer in — het blijft daarna bewaard.


1. Open AkkoordKast in je browser.
2. Ga naar het tabblad **Toevoegen** en zoek **Muziekmap scannen** op.
3. Vul bij **Map op deze machine** het koppelpunt in (standaard `/home/akkoordkast/muziek`).
4. Klik op **Kijk wat erin zit** en daarna op **Alles omzetten**.

### De eerlijke beperkingen

- **Een NAS die uit staat.** De map is er dan niet. Met `nofail` in `fstab` blijft de container
  gewoon opstarten, maar het scannen in de app meldt dat de map niet bestaat. Zet de NAS aan en
  probeer opnieuw; de app zelf hoeft niet te worden herstart.
- **Drive is traag bij grote mappen.** Google Drive komt over het internet. Een map met
  honderden nummers inlezen duurt langer, bestanden worden pas opgehaald als ze nodig zijn, en
  de knop `Alles omzetten` doet er dus meer tijd over. Doe zulke mappen in kleine rondes (dat
  doet de app standaard al) en houd de verbinding in de gaten.
- **De app stuurt zelf niets naar buiten.** Het scannen en omzetten gebeurt op de machine zelf
  met `ffmpeg`. Wat wél over het internet gaat, is het ophalen van de bestanden uit Drive door
  rclone; de app praat nooit rechtstreeks met Google.

## Spotify

Plak in het liedpaneel een Spotify-link (`open.spotify.com/track/…`, `spotify:track:…` of een losse id). De speler
verschijnt in de app en geeft zijn positie terug via de Spotify iFrame-API, zodat de noten, de grepen en de akkoorden
meelopen met de echte muziek. Dit werkt zonder account of sleutel.

Wil je ook *in* Spotify zoeken, vul dan bij **Casten → Spotify** een eigen Client ID en Secret in (gratis aan te maken
op `developer.spotify.com/dashboard`). Die sleutels blijven in de database van deze server staan. Afspelen op afstand
(Spotify Connect) vraagt daarnaast een accountkoppeling met inlog; daar is nog geen knop voor.

## Spelen op het podium

Voor het echte werk — repetitie of optreden — zit er een **podiummodus** in. Eén klik en het menu, de kop en alle
uitleg verdwijnen; de bladmuziek staat op anderhalve regelafstand en de grepen worden groter. Met **meescrollen**
schuift de pagina zelf door terwijl je speelt: de snelheid stel je in en blijft per toestel bewaard, spatie start en
stopt, PageUp en PageDown schuiven een halve pagina. Escape (of de p) brengt je terug in de gewone weergave.

En wil je een **liedjesboek** meenemen naar de repetitie, dan maakt de app van je huidige selectie (tot veertig
liedjes) één document: een titelblad, een inhoudsopgave en elk liedje op een eigen pagina met de grepen en de
bladmuziek erbij. Op het scherm zie je eerst een voorbeeld, waarna de printknop van de browser er een PDF van maakt.

## Een setlist en optredenmodus

Op het tabblad Liedjes staat een kaart **Setlists en optreden**. Je maakt een setlist (bijvoorbeeld
*Kroeg vrijdag*), zet er liedjes in met **+ setlist** — in de lijst naast het sterretje, of in het
spelscherm — en verschuift ze met de pijltjes tot de volgorde klopt. Setlists horen bij je profiel, dus
ieder gezelschap heeft zijn eigen lijst.

Druk je op **Optreden starten**, dan gaat de podiummodus er meteen bij aan en zie je alleen het liedje
van nu, met een balk erboven: *welk nummer je bent*, **‹ vorige** en **volgende ›**, een **pauzeklok**
die optelt hoelang je al stil bent, en **Optreden stoppen**. Met PageDown, ↓ of → ga je verder, met
PageUp, ↑ of ← terug; de spatie blijft gewoon meescrollen.

![Setlist en optreden](docs/img/optreden.png)

Met **Setlist printen** maak je er een vel van: alle liedjes onder elkaar met toonsoort, capo, tempo,
de akkoorden en een lege kolom voor je eigen notities.

![Setlist op papier](docs/img/setlist-print.png)

## Oefenen met moeilijke stukken

- **Vertragen**: het liedje op 80%, 70%, 60% of 50% van het tempo. De begeleiding wordt op dat lagere tempo
  opnieuw gemaakt, dus de noten blijven even hoog — alleen het tempo zakt.
- **Een stukje herhalen**: zet met **A** en **B** een lus over de maten die je onder de knie wilt krijgen. De speler
  springt steeds terug naar A, zodat je dat ene stukje blijft doen in plaats van het hele liedje opnieuw.
- **Meeluisteren**: in het tabblad Leren kan de app via je microfoon horen welk akkoord je pakt en zeggen of dat
  het akkoord is dat in beeld staat. Dat gebeurt allemaal in je browser met de frequentiebank van Web Audio; er
  wordt niets opgenomen en niets verstuurd. Het is een hulpmiddel, geen scheidsrechter — een versterker of een
  rammelende tafel kan de meting in de war sturen.

## Gehoor-trainer: akkoorden herkennen

In het tabblad Leren staat de **gehoor-trainer**. Je typt de akkoorden die meedoen (of je pakt een
set uit de lijst, of je drukt bij een les op de knop — dan gaan die akkoorden meteen mee), drukt op
**Start** en de app speelt een akkoord. Jij kiest welk het was uit vier knoppen; met **Nog een keer
horen** hoor je hem opnieuw. Klonk het mis, dan laat de app het goede antwoord nog één keer horen.

Met **Hoog of laag?** krijg je de tweede oefening: de app speelt twee akkoorden en jij zegt of het
tweede hoger of lager klonk. De score met je reeks staat erboven; stop je, dan gaat de tijd en het
aantal antwoorden naar je oefencijfers, zodat je ook je gehoor ziet groeien.

![Gehoor-trainer](docs/img/gehoor-trainer.png)

## Akkoordenboek: alle posities over de hals

Het akkoordenboek (ook in het tabblad Leren) laat per akkoord **alle posities** zien: de open positie
onderaan, en de barré-vormen uit het E- en A-model verder naar boven — met het vaknummer waarop ze
beginnen en een korte uitleg ("wijsvinger plat over de bovenste snaren"). Klik op een greep en je
hoort hem. Handig als een akkoord te hoog of te laag klinkt, of als je juist hoger op de hals wilt
blijven in plaats van te schuiven.

![Akkoordenboek](docs/img/akkoordenboek.png)

Met **Grepenkaart printen** zet je van alle akkoorden in het liedje dat je open hebt alle posities op
één vel — een poster voor je oefenhoek.

![Grepenkaart](docs/img/grepenkaart.png)

## Jouw eigen lijstjes

De app werkt met **profielen**: elk profiel heeft zijn eigen favorieten, zijn eigen labels en zijn eigen cijfers.
Onderaan de kop kies je met wie je meekijkt (het toestel onthoudt die keuze). Daar hoort bij:

- een **sterretje** bij elk liedje, in de lijst en in het spelscherm, en het filter *alleen mijn favorieten*;
- **labels** die je zelf maakt (bruiloft, kroeg, kerk, kerst) en aan liedjes hangt, met een filter per label;
- **laatst gespeeld**: de app onthoudt wat je wanneer opende, met een sortering *laatst gespeeld* en een lijstje in
  het tabblad Leren;
- **oefencijfers** in datzelfde tabblad: minuten geoefend, dagen op een rij, akkoordwissels, een grafiek van de
  laatste veertien dagen en de akkoorden waar je het meest mee bezig bent. De trainer en de tik sturen hun sessie
  naar de server, dus je hoeft niets bij te houden.

## Beheer en bijwerken

Onderaan het tabblad Toevoegen staat welke **versie** er draait en welke aanpassing daarbij hoort. Met één knop
vraagt de app aan GitHub of er iets nieuws is; is dat zo, dan staat de titel van die aanpassing erbij. Bijwerken
gebeurt op je Proxmox-host (daar horen de rechten bij te zitten) — de app laat het precieze commando zien, en kan
het zelf doen als er op die machine een uitvoerbaar update-script klaarstaat (`UPDATE_SCRIPT=/pad/script`).

Daaronder zit **automatisch bijhouden**. Zet je dat aan, dan kijkt de app zelf elke 1, 3, 6, 12 of 24
uur in je muziekmap of er nieuwe bestanden staan, zet die om (maximaal acht per ronde, zodat een
grote map niet in één keer de deur platloopt) en schrijft op wat er gebeurd is — "3 omgezet · nog 12
te doen", of "Niets nieuws in de map (412 bestanden)". Staat je muziek op een NAS of in Drive en is
de NAS even weg, dan zegt de kaart dat gewoon. Los daarvan kijkt de app elke zes uur op GitHub of er
een nieuwe versie is, ook als het map-bijhouden uit staat; staat er iets nieuws, dan zie je dat aan
het gele pilletje in de kaart. Met **Nu kijken** forceer je een ronde.

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
node --test test/*.test.js          # 114 tests: muziektheorie, API, pagina, datasets, persoonlijke laag,
                                    # setlists, akkoordenboek, de wachter en de deploy-scripts
python3 scripts/check-deploy-file-lists.py            # bestandslijsten van de deploy
python3 scripts/check-deploy-file-lists.py --remote   # ook HTTP 200 op elke ruwe URL
```

Elke push naar `main` draait de suite ook op GitHub (zie het badge boven aan deze pagina,
[workflow `tests.yml`](.github/workflows/tests.yml)) — op Node 22, zonder verdere afhankelijkheden.

De suite controleert onder meer dat elk inline scriptblok van de pagina compileert, dat geen
enkele id dubbel voorkomt, dat de liedjes-dataset alleen akkoorden gebruikt waar een diagram voor
bestaat, dat de downloadlijsten van de installer en de updater bij elkaar passen (de klassieke
`Cannot find module`-oorzaak), en dat de gezondheidscontrole de app-marker eist en controleert of
node op de poort luistert. Deploy-scripts worden met `bash -n` en een aanhalingstekensbalans per
regel nagelopen, omdat een afgebroken quote in een single-quoted heredoc stil blijft.

## Licentie

De app-code is van Tom Werdens; er is geen licentie verleend voor hergebruik. De meegeleverde
liedjes zijn publiek domein — de bronvermelding en de letterlijke licentieverklaring van elke bron
staan per liedje in de dataset. De liedjes zijn niet van mij en de dataset is met de hand samengesteld,
dus controleer bij twijfel zelf de herkomst voordat je iets publiceert.
