# AkkoordKast

**Gitaarsongbook met capo-advies, grepen, begeleidingsaudio en Chromecast — op je eigen server.**

![AkkoordKast](docs/img/hero.png)

[![tests](https://github.com/Theberas04/akkoordkast/actions/workflows/tests.yml/badge.svg)](https://github.com/Theberas04/akkoordkast/actions/workflows/tests.yml)
[![installeren op Proxmox](https://img.shields.io/badge/install-Proxmox%20LXC-f5a524)](deploy/proxmox/README.md)
![Node 22](https://img.shields.io/badge/Node.js-22%20(node%3Asqlite)-3c873a)
![geen npm-afhankelijkheden](https://img.shields.io/badge/dependencies-geen-34d399)
![taal](https://img.shields.io/badge/taal-Nederlands-60a5fa)
![liedjes](https://img.shields.io/badge/liedjes-48-f5a524)
![bronnen](https://img.shields.io/badge/bronnen-publiek%20domein-34d399)

Je opent AkkoordKast op je telefoon of laptop, zoekt een liedje en ziet meteen:
de bladmuziek met de akkoorden boven de tekst, **of je een capo nodig hebt en welke grepen
je dan pakt**, de greepdiagrammen, en een audiospeler met begeleiding van de akkoordenreeks.
Die begeleiding cast je naar een Chromecast in je netwerk.

**Wat staat waar:** [rondleiding](#rondleiding-van-56-seconden) ·
de handleiding in de app zelf (knop **Handleiding openen**) · [installeren op Proxmox](#installeren-op-je-proxmox-host) · [zelf draaien](#zelf-draaien-zonder-container) ·
[wat zit erin](#wat-zit-erin) · [de liedjes](#de-liedjes) · [gitaar leren spelen](#gitaar-leren-spelen) ·
[muziek erbij zoeken](#muziek-of-video-erbij-zoeken) · [een muziekmap in één keer](#een-hele-muziekmap-in-één-keer) ·
[op een NAS of in Drive](#de-muziekmap-op-een-nas-of-in-google-drive) ·
[spelen op het podium](#spelen-op-het-podium) · [een setlist en optredenmodus](#een-setlist-en-optredenmodus) ·
[meespelen met de muziek](#meespelen-met-de-muziek-van-het-liedje) ·
[oefenen met moeilijke stukken](#oefenen-met-moeilijke-stukken) ·
[metronoom en tik-tempo](#metronoom-aftellen-en-tik-tempo) ·
[back-up](#back-up-naar-een-nas-of-map) · [je oefenen per week](#jouw-oefenen-per-week) ·
[akkoordovergangen](#akkoordovergangen-in-een-setlist) ·
[gehoor-trainer](#gehoor-trainer-akkoorden-herkennen) ·
[het akkoordenboek](#akkoordenboek-alle-posities-over-de-hals) ·
[jouw eigen lijstjes](#jouw-eigen-lijstjes) · [beheer en bijwerken](#beheer-en-bijwerken) ·
[Spotify](#spotify) · [hoe het werkt](#hoe-het-werkt) · [tests](#tests) · [licentie](#licentie) ·
[wat er veranderd is](CHANGELOG.md)

| Scherm | Wat je ziet |
| --- | --- |
| ![liedjes](docs/img/liedjes-desktop.png) | **Liedjesbibliotheek** — zoeken op titel, artiest of akkoord, filteren op taal, **genre**, **artiest**, capo en moeilijkheid. Elk liedje toont zijn capostand. |
| ![spelen](docs/img/spelen-desktop.png) | **Capo-advies** — "Capo 3, speel in A", met de grepen die je dan pakt en de barré-akkoorden die je ermee ontwijkt. |
| ![grepen](docs/img/grepen-desktop.png) | **Grepen** — een greepdiagram per akkoord, meegeschoven met de capostand en de barré als balk getekend. |
| ![bladmuziek](docs/img/bladmuziek-telefoon.png) | **Bladmuziek op je telefoon** — akkoorden boven de lettergreep waar ze vallen, refreinen apart, tabblokken in monospace. Ook te printen. |
| ![toevoegen](docs/img/toevoegen-desktop.png) | **Eigen liedjes** — ChordPro plakken of een bestand kiezen. Aan je eigen liedjes hang je je eigen opname. |
| ![casten](docs/img/casten-desktop.png) | **Casten** — Chromecasts zoeken (of een IP intypen), casten, stoppen en het volume regelen. |
| ![upload](docs/img/upload-herkend.png) | **Mp3 of mp4 uploaden** — de app haalt het geluid uit je bestand, herkent tempo, toonsoort en akkoorden en zoekt het liedje er meteen bij in de bibliotheek. |
| ![muziek van het liedje](docs/img/muziek-van-het-liedje.png) | **Meespelen met de muziek** — zoek de opname in je eigen muziekmap, kies de juiste uitvoering en speel mee; de akkoorden en de hals lopen mee. |
| ![metronoom](docs/img/metronoom.png) | **Metronoom en tik-tempo** — klikt de maat mee, telt af voor je begint en neemt het tempo over als je meetikt. |
| ![overgangen](docs/img/setlist-overgangen.png) | **Akkoordovergangen** — hoe je van het ene liedje in het andere komt, met de capo erbij. |
| ![week](docs/img/oefenen-per-week.png) | **Je oefenen per week** — minuten, aantal keer en de akkoorden waar je mee bezig was. |
| ![backup](docs/img/backup-naar-nas.png) | **Back-up naar je NAS** — één bestand met je eigen gegevens, zonder wachtwoorden. |
| ![mappen](docs/img/mappen-toevoegen.png) | **Meer dan één muziekmap** — je NAS-map naast de map op de machine zelf. |
| ![meespelen](docs/img/meespelen-opname.png) | **Meespelen met je eigen opname** — je opname is de muziek; de akkoorden, de maat, de hals en de grepen lopen ermee mee. |
| ![spotify](docs/img/spotify-blok.png) | **Spotify** — plak een link en de speler staat erbij; de noten lopen mee met wat je hoort. Met een eigen Client ID kun je ook zoeken. |
| ![muziekmap](docs/img/muziekmap-klaar.png) | **Een hele muziekmap in één keer** — geef een map op deze machine op en elk nummer erin wordt een eigen liedje met akkoordschema, tempo en toonsoort. |
| ![leren](docs/img/leren-cursus.png) | **Gitaar leren spelen** — honderdtien lessen in acht delen, van "hoe houd ik hem vast" tot een oefenplan dat je volhoudt, met per les een oefening in de app en je voortgang bewaard op je toestel. |
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

## Rondleiding door de app

[![Rondleiding door AkkoordKast: klik om de video te openen](docs/img/akkoordkast-2026-poster.jpg)](docs/img/akkoordkast-2026.mp4)

🎬 **[Rondleiding door AkkoordKast (1 min 19, MP4, 1280×720, Nederlandse voice-over)](docs/img/akkoordkast-2026.mp4)**
— de bibliotheek, een liedje met akkoorden en capo-advies boven de woorden, meespelen met de echte
muziek, de cursus van 110 lessen, de stemmer met de microfoon, en wat de beheerder kan: gegevens
aanpassen, opruimen en je eigen bladmuziek erbij zetten. De eerste seconde laat zien wat een gewoon
profiel níet heeft: alles wat iets toevoegt of verandert hoort bij de beheerder.

Het filmpje is een diashow van echte schermen (demo-gegevens) volgens `filmpjes/akkoordkast-2026.json`;
opnieuw maken met `python3 scripts/maak-filmpje.py --scenes filmpjes/akkoordkast-2026.json --stem <map>
--uit docs/img/akkoordkast-2026.mp4`, waarbij `<map>` ook `titel.png` en `slot.png` bevat.

Eerder: [rondleiding.mp4](docs/img/rondleiding.mp4) (56 s) en
[nieuwe-functies.mp4](docs/img/nieuwe-functies.mp4) (1 min 51).

## Installeren op je Proxmox-host

Draai dit op de Proxmox-host zelf, als root:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/Theberas04/akkoordkast/main/deploy/proxmox/install.sh)"
```

Het script print eerst zijn eigen versie, haalt alle bestanden op, maakt een Debian-container,
installeert Node.js 22, ffmpeg en de Chromecast-hulp,
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

- **Een beheerdersaccount voor alles wat toevoegt.** Zoeken, spelen, leren en je eigen lijstjes
  kan iedereen; muziek uploaden, een link omzetten naar mp3, mappen laten omzetten, eigen liedjes
  bewerken, de back-up en de bijwerking horen bij de beheerder. Het wachtwoord wordt als
  scrypt-afdruk bewaard (nooit als tekst) en de sessie is een HttpOnly-koekje van negentig dagen.
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
- **Een link omzetten naar mp3.** Plak een link (YouTube en honderden andere sites) en de app
  zet er een mp3 van in je eigen muziekmap en hangt die meteen aan het liedje — daarna speel je
  ermee mee. Het zware werk doet `yt-dlp` met `ffmpeg` op de server. De app weigert links naar je
  eigen netwerk (anders zou je via de app bestanden van je router of NAS kunnen ophalen) en er
  loopt er één tegelijk, want omzetten naar mp3 kost de hele processor. Het bestand blijft in je
  eigen map staan: gebruik het voor materiaal dat je mag downloaden.
- **Meespelen met de muziek van het liedje.** De app speelt standaard begeleiding uit een eigen
  gitaarsynthesizer. Heb je het liedje zelf als muziekbestand — bijvoorbeeld in de map op je NAS —
  dan zoek je dat op met één knop en speel je mee met de echte muziek: de akkoorden, de maat en de
  hals lopen mee. Je kunt langzamer afspelen, en met vier tikken het tempo van de opname overnemen
  zodat de klik en het meescrollen kloppen. De app haalt zelf geen opnamen van internet; hij speelt
  uitsluitend bestanden binnen de muziekmappen die jij hebt aangewezen.
- **Metronoom, aftellen en tik-tempo.** In de speler klikt de maat mee (met een zware tik op
  de eerste tel), telt de app de maat af voor je begint, en neemt hij het tempo over als je vier
  keer meetikt. De klikken komen uit Web Audio en volgen je oefentempo.
- **Back-up naar een map die jij kiest.** Eén bestand per keer met alles wat je zelf hebt gemaakt —
  profielen, favorieten, labels, setlists, oefencijfers, je eigen liedjes en de instellingen — naar
  bijvoorbeeld je NAS. De laatste tien blijven staan; wachtwoorden en sleutels gaan er niet in.
- **Overzicht per week.** In het tabblad Leren zie je per week hoeveel minuten je geoefend hebt, hoe
  vaak, en met welke akkoorden je bezig was. Weken zonder oefening staan er ook in.
- **Akkoordovergangen in een setlist.** Per paar opeenvolgende liedjes zegt de app in welke toonsoort
  je het tweede speelt (of welke capo), welke akkoorden je in allebei hebt, en welk akkoord als
  bruggetje werkt als ze niets gemeen hebben.
- **Meerdere muziekmappen.** Je muziek mag op meer dan één plek staan: een map op de machine zelf en
  een map op de NAS. Je voegt ze toe in het tabblad Toevoegen; omzetten en de wachter lopen ze alle
  langs.
- **Setlists en een optredenmodus.** Zet liedjes in een vaste volgorde en speel ze achter elkaar
  door: groot beeld, alleen het liedje van nu, met de knoppen om verder te gaan en een pauzeklok.
- **Gehoor-trainer.** De app speelt een akkoord en jij zegt welk het is; of ze speelt er twee en
  jij zegt of het tweede hoger of lager klinkt. Je hoeft niets te zien.
- **PWA.** Installeerbaar op je telefoon, met de app-schil in de cache maar liedjes, audio en
  cast-status altijd live.

## De beheerder

De app is voor iedereen te gebruiken, maar wat er *op de machine komt* hoort bij één account:

Het toevoeggereedschap zit in een **eigen profiel** (`Admin`), niet in je gewone profielen:

| Wat | Wie |
| --- | --- |
| Zoeken, filteren, spelen, meespelen, leren, casten, eigen profielen/favorieten/setlists | iedereen, in elk profiel |
| Muziek of video uploaden, een map laten omzetten | beheerder, in het profiel Admin |
| Downloaden als mp3 (link plakken; als nieuwe muziek of bij een bestaand liedje) | beheerder, in het profiel Admin |
| Een hele artiest of afspeellijst ophalen (elk nummer wordt een eigen liedje) | beheerder, in het profiel Admin |
| Muziekmappen toevoegen of weghalen, eigen liedjes bewerken, opnamen uploaden | beheerder |
| Liedjes uit de app halen (eigen liedjes echt, meegeleverde verbergen) | beheerder |
| Filters beheren: talen en genres toevoegen, weghalen en liedjes eraan koppelen | beheerder |

**Je eigen bladmuziek.** In de kaart van een liedje kun je als beheerder je eigen foto of PDF van het
nummer zetten (`media/bladmuziek`). De verzameling zelf blijft bij publiek domein; dit is jouw eigen
materiaal en het blijft in je eigen app.

**Opruimen.** In het beheerdersprofiel (tabblad Toevoegen) staat *Opruimen*: eerst kijken wat er te
vinden is (dubbele liedjes, lege liedjes, verwijzingen naar muziek die er niet meer is, losse
muziekbestanden, oude back-ups, verlopen sessies, verborgen liedjes), dan per soort opruimen. De
meegeleverde verzameling blijft altijd staan.

**Gegevens aanpassen.** In het beheerdersprofiel (tabblad Toevoegen) staat *Gegevens van een liedje
aanpassen*: titel, zanger, taal, genre, toonaard, tempo, maatsoort, moeilijkheid, slagpatroon, YouTube
en notitie. Van een meegeleverd liedje maakt de app daarbij een eigen kopie (`maakEigenKopie`), zodat
de verzameling zelf ongemoeid blijft.

**Akkoorden bij elk liedje.** Een liedje waarvan de bron geen akkoorden heeft (een nummer dat je via
een link ophaalt, of een liedje waarvan alleen de tekst is overgeleverd) krijgt een **voorgesteld**
schema in de toonaard van het liedje (zie `lib/voorstel.js`). De app zegt er zelf bij dat het een
voorstel is, en wat je in het veld *Akkoordenreeks* invult gaat vóór het voorstel. Zo kan elk liedje
getekend, begeleid en meegelezen worden.

**Waar opgehaalde muziek terechtkomt.** De app haalt muziek op in `DOWNLOAD_DIR` (standaard
`MUSIC_DIR/Gedownload`, dus in je muziekmap — bij een NAS-koppeling bijvoorbeeld
`/mnt/Nas/Nas-Opslag/Muziek/Gedownload`). Kan daar niet in geschreven worden — de koppeling is weg, de
map is alleen-lezen of de schijf zit vol — dan **valt de app terug op zijn eigen map**
(`gedownload` naast de gegevens) en zegt hij dat in de app: bij *Muziekmappen* en bij het ophalen.
Zo blijft ophalen werken en weet je waar de muziek staat. Dat geldt ook als de koppeling **tijdens
het draaien** wegvalt: bij elke download wordt opnieuw gekeken of de map beschrijfbaar is. Koppel je
NAS opnieuw met `bash deploy/proxmox/nas-koppelen.sh` (op de Proxmox-host) om de muziekmap weer te
gebruiken.
| Back-up, wachter, bijwerken, Spotify-sleutels | beheerder |

Het tabblad **Toevoegen** bestaat alleen in het profiel `Admin` (in de profielkiezer staat het als
*Admin · beheerder*, met een slotje zolang je niet bent ingelogd); in andere profielen is het er
niet, zodat daar alleen staat waar je mee speelt en leert. Het beheerdersprofiel kan niet worden
verwijderd.

**Het profiel zelf zit achter het wachtwoord.** Kies je Admin, dan vraagt de app eerst om het
wachtwoord en pas daarna gaat dat profiel open; bij een verse installatie kies je het daar meteen
(minstens acht tekens). Ook de serverkant is dicht: zonder beheerderssessie valt een verzoek om het
beheerdersprofiel terug op een gewoon profiel, dus ook met een zelfgemaakt verzoek kom je er niet
in. Uitloggen zet het profiel weer op slot en brengt de app terug naar een gewoon profiel. Je blijft negentig dagen ingelogd per apparaat. Na tien foute pogingen
binnen een kwartier weigert de app het even.

Het wachtwoord zelf wordt nooit bewaard: er staat alleen een scrypt-afdruk met een eigen zout in de
database (`beheer_hash` in de tabel `instellingen`). De sessies staan in de tabel `sessies`.

### Liedjes weghalen

In het tabblad Toevoegen staat **Liedjes weghalen**. Zoek een liedje en haal het uit de app:

- Een **eigen liedje** — zelf toegevoegd of uit een link gehaald — verdwijnt helemaal: de rij uit de
  database, de muziek die eraan hing, de opname, de koppelingen met filters en labels, de favoriet en
  de speelgeschiedenis. Er blijft niets van achter.
- Een **meegeleverd liedje** zit in de bestanden van de app: dat kun je **verbergen**. Het staat dan
  niet meer in de lijsten, het zoeken en de filters, maar je kunt het met één knop terugzetten
  (onder *Verborgen liedjes*). Zo blijft de meegeleverde verzameling heel.

### Filters beheren

In **Filters beheren** staan alle talen en genres die de app als filter laat zien, met hoeveel
liedjes eronder vallen. Je kunt er zelf een toevoegen (een genre dat je zelf gebruikt, of een taal —
die staat er dan meteen bij, ook als er nog geen liedje bij hoort) en weer weghalen. Wat je weghaalt
laat de liedjes staan: die vallen terug op de taal of het genre dat ze zelf hadden.

Daaronder koppel je liedjes aan een filter: zoek liedjes, vink ze aan en druk op **Koppelen** (of
**Losmaken**). Wat je koppelt gaat vóór de taal of het genre die het liedje zelf al had, dus je kunt
een liedje in een eigen vak zetten zonder de verzameling zelf aan te raken. Alles wat je hier doet
komt meteen in de gewone filters terecht, voor alle profielen.

**Wachtwoord vergeten?** Wis de afdruk en de sessies in de container; daarna kun je in de app weer
een nieuw wachtwoord instellen:

```bash
pct exec 106 -- bash -c 'cd /opt/akkoordkast && node -e "
const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync(process.env.DB_PATH || "/var/lib/akkoordkast/akkoordkast.db");
db.prepare("DELETE FROM instellingen WHERE sleutel = ?").run("beheer_hash");
db.prepare("DELETE FROM sessies").run();
console.log("beheerderswachtwoord gewist");
"'
```

Een andere container dan 106? Vervang het nummer, of laat `pct exec` weg als je al in de container
zit. Wat er in de database staat kun je ook bekijken met
`pct exec 106 -- bash -c 'cd /opt/akkoordkast && node -e "…"'`, maar het wissen hierboven is
meestal wat je zoekt.

## De liedjes

Meegeleverd: **48 liedjes**, allemaal Nederlandstalig, met akkoorden per maat en (waar de bron dat
heeft) de melodie. Welke bestanden meegaan staat in
[`song-data/datasets.json`](song-data/datasets.json); een test controleert dat die lijst, de bestanden
op schijf en de installatiescripts hetzelfde zeggen.

| Bestand | Aantal | Wat | Id's |
| --- | --- | --- | --- |
| [`song-data/liedjes.json`](song-data/liedjes.json) | 26 | met tekst en akkoorden: Nederlandse kinder- en Sinterklaasliedjes, kerstliedjes, het Wilhelmus, het **Limburgs volkslied**, plus instrumentale stukken met tab | 1–26 |
| [`song-data/limburg-liedjes.json`](song-data/limburg-liedjes.json) | 22 | Limburg: het volkslied en drie liedjes van de Sittardse troubadour **Jo Erens** (tekst én muziek, rechtenvrij) met akkoordschema, plus **achttien publiek-domein liedteksten** uit Maastricht (Mestreechs dialect, uit de bloemlezing van Endepols, 1943) en Belgisch-Limburg (Lambrechts) — van die achttien is geen melodie overgeleverd, dus die staan er als tekst zonder akkoorden | 600.000+ |

Elk liedje houdt de toonsoort die de bron aangeeft; waar een akkoord geen greep heeft zoekt de
app de dichtstbijzijnde toonsoort waarin alles speelbaar is, en verder lost het capo-advies het op.

**Over de licenties.** Er komt niets in de app zonder een licentie die publiek domein, CC0, CC-BY of
MIT is; bronnen met "niet-commercieel", "geen afgeleiden" of share-alike vallen af, en The Session
(thesession.org, ~10.000 Ierse tunes) valt af omdat de licentie daarvan gebruik met Large Language
Models verbiedt. De 26 liedjes met tekst en de Limburgse liedjes zijn publiek domein; de bronvermelding
staat per liedje in de dataset.

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

**Over dubbelen.** Twee datasets kunnen elkaar overlappen. `scripts/ontdubbel.js` haalt die eruit op
titel plus het verloop van de melodie (los van de toonsoort, zodat ook een getransponeerde transcriptie
als dubbel geldt). Liedjesnummers die al in de database van een bestaande installatie kunnen zitten,
blijven daarbij ongemoeid.

Eerlijk over de grens: een app met de bladmuziek van *alle* nummers die bestaan kan niet legaal
worden meegeleverd — de meeste muziek van na ~1928 valt onder auteursrecht. Daarom is AkkoordKast
zo gebouwd dat jij zelf alles kunt toevoegen wat je wilt spelen: plak de ChordPro-tekst van je
eigen liedjesboek, of maak een eigen kopie van een meegeleverd liedje en hang er je eigen audio
aan. De app zelf levert alleen de akkoordenreeks, de grepen en de capo-adviezen.

## Gitaar leren spelen

In het tabblad **Leren** zit een cursus van **110 lessen in acht delen**. Elke les heeft een doel,
uitleg in gewone taal, één oefening die je meteen in de app doet en waar het past een knop naar het
onderdeel dat erbij hoort (grepen, akkoordenboek, akkoordentrainer, gehoor-trainer, weekplanning,
overgangen, capo, metronoom of meespelen). Je voortgang (lessen, oefeningen en getrainde
akkoordwissels) blijft in je eigen browser bewaard. De Leren-tab groepeert de lessen per deel, met
per deel hoeveel je er al afgerond hebt.

**Beginnen (10 lessen)** — de gitaar vasthouden en de zes snaren; stemmen; je eerste drie akkoorden
(Em · Am · C); de houding van je linkerhand; opwarmen en vingeroefeningen; de plectrum en je
rechterhand; wat je nodig hebt (en niet); in één minuut speelklaar; je eerste liedje van begin tot
eind; oefenen met de app.

**Akkoorden (16 lessen)** — C · G · D7 en leren wisselen; groot tegen klein horen; mineurakkoorden
(Am · Em · Dm · Bm); zevende akkoorden en waarom G7 naar C wil; barré-akkoorden F en Bm; en met één
barrévorm akkoorden op elke fret pakken. Daarna: de hele akkoordenfamilie binnen de 26 grepen,
soepel wisselen met de overgangen-trainer, Bm en Bb in een liedje dat je kent, dempen en schoon
grijpen, het akkoordenboek, maj7 en m7, dezelfde akkoorden in een andere greep, open snaren, akkoorden
horen aankomen en spiergeheugen.

**Ritme en slag (18 lessen)** — slagritme met de rechterhand (D DU UDU); maatsoort en meetellen
(4/4, 3/4, 6/8); tokkelen met je vingers; tempo vasthouden zonder metronoom; dynamiek, hard en zacht;
twee tellen tegen vier tellen; het standaardpatroon in stukjes; het wiegende gevoel van 6/8; shuffle
en triolen; een bas op de tel; accenten; palm-dempen; zestienden en dubbele slagen; de wals; syncope;
het patroon van een liedje herkennen; meespelen met de metronoom; en een liedje in twee tempi.

**Tokkelen (17 lessen)** — p‑i‑m‑a; de drieklanktokkel; het travispatroon; patronen per maatsoort;
basloopjes tussen je akkoorden; tokkelen en zingen tegelijk; tokkelliedjes uit de app; je duim als
metronoom; slag en tokkel afwisselen; hybride met een plectrum; arpeggio's; tokkelen in 3/4; toon
maken met nagels en aanslag; tokkelen met demping; je eigen patroon maken; en tokkelen op de maat van
een liedje uit de app.

**Toonladders en theorie (15 lessen)** — noten op de hals; intervallen horen; de kwintencirkel;
majeur en mineur; I‑IV‑V; de majeurtoonladder op één snaar; de mineurtoonladder; pentatonisch;
akkoorden opbouwen uit een ladder; akkoordfuncties; transponeren; de capo als hulpmiddel; zelf een
akkoordschema maken; je gehoor trainen; en je eerste solo met de pentatonische ladder.

**Verdiepen (14 lessen)** — een liedje helemaal meespelen; capo en toonsoort; transponeren naar jouw
stem; toonladders en waar akkoorden vandaan komen; zelf akkoorden kiezen bij een tekst; een liedje op
gehoor uitzoeken; meespelen met een opname; jezelf terugluisteren; een liedje uitpluizen in stukjes;
bladmuziek en tab lezen; de microfoon als leraar; vingervlugheid; ontspannen handen; warmspelen en
oefenen met een timer.

**Samenspelen en optreden (10 lessen)** — meespelen met een opname; een liedje instuderen in stappen;
wie doet wat als je samen speelt; optreden met setlist, podiummodus en aftellen; opnemen en
terugluisteren; fouten herstellen tijdens het spelen; omgaan met zenuwen; een optreden van een half
uur samenstellen; meezingen en spelen tegelijk; en een medespeler bijhouden.

**Onderhoud en volhouden (10 lessen)** — snaren vervangen; schoonmaken en vochtigheid; stemsleutels
en intonatie; elke dag tien minuten; je voortgang bijhouden; een oefenplan van twaalf weken; een
liedjesboek samenstellen; verder leren zonder leraar; onderhoud van je gitaar; en een oefenplan dat
je volhoudt.

Daarnaast staat in hetzelfde tabblad:

- **Akkoordentrainer** met metronoom: vul een eigen akkoordenset in (met de voorbeelden als suggestie,
  van Em · Am · C tot alle 26 grepen door elkaar), kies het tempo en het aantal maten per akkoord. De
  app laat het volgende akkoord alvast zien en telt de maten voor je; na het stoppen zie je hoeveel
  akkoordwissels je gedaan hebt.
- **Stemmen**: klik op een snaar en hoor de toon. Zes knoppen, dik naar dun. Daarnaast de **stemmer
  met de microfoon**: druk op Start, sla één snaar aan, en de app zegt welke snaar het is, hoeveel cent
  je ernaast zit en welke kant je op moet, met een naald die in het groen komt als je goed zit. Het
  rekenwerk (de toonhoogte uit het geluid halen met een genormaliseerde autocorrelatie, zonder
  octaaffouten) staat in `lib/stemmen.js`, los van de pagina, zodat de tests precies dezelfde
  rekenkunde raken. Werkt op een beveiligd adres (`https`); de microfoon wordt alleen gebruikt terwijl
  je op Start hebt gedrukt en er wordt niets opgenomen of bewaard.
- **Slagpatronen**: vier patronen plus tokkelen, met een metronoom die meetelt.
- **Ritme-trainer met de microfoon**: sla of klap mee en de app luistert of je op de maat zit. De tik
  geeft de maat (zichtbaar meetellen, of hoorbaar met oortjes in), want de microfoon zou een tik uit
  de luidspreker als jouw slag tellen. Per slag zie je hoeveel milliseconden je ernaast zat, of je
  neigt naar te vroeg of te laat, en welk deel op de maat was. De app let op de **aanslag**: per
  beeldje vergelijkt hij het spectrum (de analyser van de WebAudio-kaart) met dat van het beeldje
  ervoor, en een sprong daarin is een slag. Dat is de enige maat die een snel slagpatroon aankan: met
  een drempel op de geluidssterkte miste de app drie van de acht slagen zodra de vorige snaar nog
  doorklonk, en telde hij gewone ruis en netbrom juist als slagen (veertien tot tweeëntwintig valse
  slagen per drie seconden). Het rekenwerk staat in `lib/ritme.js`, los van de pagina, met eigen
  tests. Zit je er steeds met hetzelfde aantal milliseconden naast, dan is dat de vertraging van je
  toestel: met **Zet mijn gemiddelde op nul** gaat die er af.
- **Toonladders op de hals**: majeur, mineur, pentatonisch majeur, pentatonisch mineur en blues, in
  elke grondtoon, over één tot drie octaven. Je ziet de noten op de hals tot en met vak 12 (de
  grondtoon oranje, de rest met de nootnaam erin), je kunt de ladder laten horen en hem noot voor
  noot meespelen met een tik. Het rekenwerk staat in `lib/toonladders.js`.
- **Mijn oefenplan**: kies een liedje, het aantal weken, de minuten per dag en de dagen per week, en
  de app vult het plan: eerst de grepen van dat liedje, dan de overgangen en de delen van het liedje,
  en in de laatste week het hele liedje op tempo en twee keer achter elkaar. Elke taak heeft een
  aantal minuten en een afvinkvakje; het plan blijft bewaard. Het rekenwerk staat in
  `lib/oefenplan.js`.
- **Neem jezelf op**: neem op met de microfoon (maximaal vijf minuten), luister het terug, bewaar het
  als bestand op je toestel of gooi het weg. De opname blijft in je eigen toestel; er gaat niets naar
  de server.
- **Alle grepen** op één plek: klik op een greep en je hoort hem, en vink af wat je al kunt — met een
  voortgangsbalk en een knop die de grepen die je nog niet kent meteen in de akkoordentrainer zet.
- **Op gehoor stemmen als de microfoon niet mag**: blokkeert je browser of toestel de microfoon
  (dan verschijnt er ook geen vraag meer, en staat er in het rechtenoverzicht van de site geen microfoon
  bij), dan werken die zes snaartononen altijd. Tik een snaar aan, laat de toon klinken en draai aan de
  sleutel tot je gitaar hetzelfde klinkt. De app zegt er zelf bij waar je de blokkade kunt wissen.

Alles wat klinkt maakt de pagina zelf met Web Audio — geen geluidsbestanden, geen internet, en het werkt
dus ook in de app op je telefoon en offline.

![een les uit het deel Ritme](docs/img/leren-les.png)

![stemmen en slagpatronen](docs/img/leren-stemmen.png)

![toonladders op de hals](docs/img/toonladder.png)

![de ritme-trainer met de microfoon](docs/img/ritme-trainer.png)

![het oefenplan](docs/img/oefenplan.png)

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

### Meer dan één muziekmap

De app kan naar **meerdere mappen tegelijk** kijken. Dat is handig als je muziek deels op de NAS
staat en deels op de machine zelf: je voegt ze allebei toe in het tabblad **Toevoegen**, en zowel
**Alles omzetten** als de automatische wachter lopen ze allemaal langs.

- **Muziekmap toevoegen**: vul een volledig pad in (bijvoorbeeld `/mnt/Nas/Nas-Opslag/Muziek`) en
  druk op **Deze map toevoegen**. De app controleert meteen of de map er is en hoeveel muziek erin
  staat; staat de koppeling er niet, dan zegt hij dat in plaats van te doen alsof.
- Per map zie je **hoeveel bestanden erin staan en hoeveel er nog te doen zijn**, met **Kijk wat
  erin zit** om die map te bekijken en **weghalen** om hem uit de lijst te halen.
- **Alles omzetten** met een leeg vak doet alle mappen in de lijst; vul je een pad in, dan doet hij
  alleen die map.
- Bij het opstarten is de map uit `MUSIC_DIR` (zie hieronder) meteen de eerste map in de lijst.

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
CTID=106 ZELFDE_PAD=ja bash deploy/proxmox/nas-koppelen.sh
```

Met `ZELFDE_PAD=ja` hangt de container de map op **precies hetzelfde pad** als op de NAS, dus dan
vul je in de app letterlijk `/mnt/Nas/Nas-Opslag/Muziek` in. Zonder die optie kiest het script het
standaard koppelpunt (`/home/akkoordkast/muziek`) en moet je in de app dat pad gebruiken.

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

## Akkoordovergangen in een setlist

Onder een setlist staat per paar opeenvolgende liedjes hoe je het beste van het ene in het andere komt.
De app kijkt naar de toonsoort en de akkoorden en zegt bijvoorbeeld: *"Zet De zilvervloot in C: dat is
tien halve tonen omlaag, en dan zit je op de toonsoort van Sinterklaas kapoentje. Of zet capo 2 en speel
de grepen die je al kent."* Zitten er akkoorden in allebei, dan noemt hij ze, want daar blijf je in de
buurt als je wisselt. Hebben twee liedjes niets gemeen, dan stelt hij een bruggetje voor (een akkoord dat
in beide toonsoorten past) of vier tellen stilte. Let op: hij noemt ook wanneer je er barrés bij krijgt.

De rekenkunde staat in `lib/overgangen.js`, los van de server, zodat de tests dezelfde logica raken.

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

## Meespelen met de muziek van het liedje

De begeleiding die de app zelf maakt, is een gitaarsynthesizer: tokkels van de akkoordenreeks
(met de melodie er hoorbaar bovenop als de app die van het liedje heeft). Wil je liever meespelen
met de **echte muziek**, dan koppel je een muziekbestand aan het liedje.

1. Open het liedje en ga naar het blok **Muziek van het liedje**.
2. Druk op **Zoek de muziek in mijn map**. De app loopt de muziekmappen langs die je in het
   tabblad Toevoegen hebt aangewezen — de map op de machine zelf en bijvoorbeeld de map op je NAS —
   en beoordeelt elk audiobestand op de titel van het liedje.
3. Je krijgt de beste treffers te zien met een percentage en de map erbij. Kies **Dit is hem**.
4. Nu staat er een speler met **Start** en **Stop**, een **snelheid** (trager oefenen zonder de
   toonhoogte te veranderen) en **Tik mee voor het tempo**: vier tikken op de maat van de muziek en
   het tempo van het liedje staat gelijk aan de opname, zodat de metronoom en het meescrollen
   kloppen. Met **Losmaken** haal je de koppeling weer weg.

Druk daarna op **Meespelen met de muziek** in het speelblok: je hoort dan je eigen bestand en de
akkoorden, de maat, de notenbalk en de hals lopen daarmee mee. Staat de koppeling er niet meer
(bijvoorbeeld omdat de NAS los is), dan zegt de app dat en kun je een ander bestand kiezen.

Wat de app **niet** doet: opnamen van internet halen. Auteursrechtelijk beschermde muziek mag niet
in de app of op deze server staan. De app speelt alleen wat er in jouw eigen mappen staat, en
alleen bestanden binnen de mappen die jij hebt aangewezen — een verzoek met `..` erin wordt
geweigerd, ook als het via een symbolische link zou gaan.

## Metronoom, aftellen en tik-tempo

In de speler staat naast het meescrollen een rij met de maat: **Metronoom**, **Aftellen en starten** en
**Tik tempo**.

- **Metronoom**: klikt het tempo mee, met een zwaardere tik op de eerste tel. De klikken komen uit Web
  Audio, dus ze lopen niet uit de pas met de begeleiding en er is geen bestand voor nodig. Staat het
  oefentempo op 70%, dan gaat de metronoom mee naar 70%.
- **Aftellen en starten**: telt de maat af (vier tellen in 4/4, twee maten in 3/4 of bij een langzaam
  tempo) en start dan de begeleiding, zodat je niet zelf hoeft te mikken.
- **Tik tempo**: tik vier keer mee zoals je het nummer voelt en de app rekent het tempo uit. Eén te late
  tik verpest het niet, en een dubbeltik wordt genegeerd. Daarna maak je de begeleiding opnieuw op dat
  tempo.

De rekenkunde (tik-tempo, wanneer de klikken vallen, hoeveel tellen aftellen) staat in
`lib/metronoom.js`; die wordt zowel door de server als door de app gebruikt, zodat er één versie is en
de tests dezelfde rekenkunde raken als de app.

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

De beheerder kan liedjes ophalen, de gegevens aanpassen en opruimen:

![Gegevens van een liedje aanpassen](docs/img/gegevens-aanpassen.png)

![Zonder beheerder is dit er niet](docs/img/gegevens-geen-beheerder.png)

### Bladmuziek uit de muziek halen voor alle liedjes

Een opgehaald nummer heeft de muziek er vaak wel bij, maar nog geen akkoorden — en dan tekent de app een
voorstel-schema. Bij één liedje kon je de akkoorden al uit de opname laten halen; in het tabblad Toevoegen
staat nu een kaart die dat voor **alle** liedjes tegelijk doet: eerst kijken hoeveel liedjes muziek hebben
zonder akkoorden, dan met één knop de hele ronde, met een teller ernaast. Eén liedje per keer, met een korte
pauze ertussen, zodat de app bruikbaar blijft.

De akkoorden komen uit de opname zelf (tempo, toonaard en één akkoord per maat), krijgen bron `opname` en de
kaart zegt erbij dat ze automatisch zijn: controleer ze en pas ze aan waar nodig. Liedjes waar de akkoorden
al in de tekst staan blijven ongemoeid, en de app haalt niets van websites — wat er in de opname zit, is wat
je zelf hebt.

Opruimen kijkt eerst wat er te vinden is en ruimt dan pas op:

![Opruimen in de beheerder](docs/img/opruimen-kijken.png)

![Na het opruimen](docs/img/opruimen-gedaan.png)

| | |
|---|---|
| ![Gegevens aanpassen](docs/img/film/06-beheer-gegevens.png) | **Gegevens aanpassen** — zoek een liedje en pas titel, zanger, taal, genre, toonaard, tempo en maatsoort aan. |
| ![Opruimen](docs/img/film/07-beheer-opruimen.png) | **Opruimen** — eerst kijken wat er te vinden is (dubbele liedjes, lege liedjes, losse bestanden, oude back-ups), dan pas opruimen. |
| ![Je eigen bladmuziek](docs/img/film/08-beheer-bladmuziek.png) | **Je eigen bladmuziek** — heb je zelf het blad van een nummer, dan hangt het als foto of PDF aan het liedje. |
| ![Zonder beheerder](docs/img/film/09-geen-beheerder.png) | **Zonder beheerdersprofiel** — dan is dit er allemaal niet. De app is voor iedereen, toevoegen is voor de beheerder. |

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

## Back-up naar een NAS of map

Alles wat je zelf hebt gemaakt — profielen, favorieten, labels, setlists, oefencijfers, je eigen liedjes
en de instellingen — kan de app elke dag als één bestand wegschrijven naar een map die jij kiest,
bijvoorbeeld op de NAS. In het tabblad **Toevoegen** onder *Beheer en bijwerken*:

- vul de **back-upmap** in en druk op
  **Back-up aanzetten**. Standaard stelt de app een map **in** je muziekmap voor
  (`.../Muziek/akkoordkast-backup`); dat is bewust, want de container ziet alleen wat daar gekoppeld
  is. Wil je de back-ups ergens anders op de NAS, koppel die map dan ook in de container (met
  `nas-koppelen.sh` en een eigen `KOPPELPUNT`);
- met **Nu een back-up maken** doe je het meteen;
- de laatste tien blijven staan (aan te passen met *Bewaren*), de rest wordt opgeruimd;
- onder de knoppen zie je de bestanden met hun grootte, zodat je kunt zien dat het loopt.

Het bestand heet `akkoordkast-backup-jaar-maand-dag-uur-minuut-seconde.json`, dus op naam gesorteerd is
het oudste vooraan. **Wachtwoorden en API-sleutels gaan er niet in**: een back-up belandt op een NAS of
in een cloudmap en daar horen geen geheimen te staan. Staat de map er niet (NAS uit, koppeling weg), dan
zegt de app dat en maakt ze niets.

## Jouw oefenen per week

Het tabblad **Leren** laat onder je oefencijfers een overzicht per week zien: hoeveel minuten, hoe vaak,
en met welke akkoorden je die week bezig was. Weken zonder oefening staan er ook in (met een streepje in
plaats van een staaf), zodat je in één oogopslag ziet of je een week hebt overgeslagen. De weken lopen
volgens de ISO-kalender, dus precies zoals je agenda ze nummert.

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
node --test test/*.test.js          # 250 tests: muziektheorie, API, pagina, datasets, persoonlijke laag,
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

## Waar alles staat

- **De app zelf:** `/opt/akkoordkast` — de code, de liedjes en de pagina's.
- **Je gegevens:** `/var/lib/akkoordkast` — de database, je opnamen en de omgezette audio. De
  updater komt hier nooit aan.
- **Je muziekmap:** standaard `/home/akkoordkast/muziek`, of het koppelpunt van je NAS. Wat je via
  *Link naar mp3* ophaalt, komt in de ondermap `Gedownload` (`DOWNLOAD_DIR` in de dienst).
- **De dienst:** `akkoordkast.service`, draait als gewone gebruiker op poort 80 met
  `CAP_NET_BIND_SERVICE`. Extra instellingen, zoals `MUSIC_DIR`, horen in
  `/etc/systemd/system/akkoordkast.service.d/`.
- **Bijwerken:** `deploy/proxmox/update-from-github.sh` op de host, of **in de app zelf**: tabblad
  *Toevoegen*, kaart *Beheer en bijwerken*, knop **Bijwerken**. De app haalt de nieuwe bestanden van
  GitHub, controleert ze, maakt een reservekopie in je gegevensmap en start zichzelf opnieuw op. Database,
  eigen liedjes, mediabibliotheek en handleiding blijven staan. Welke versie er draait staat in de
  bovenbalk.
- **Controleren:** `deploy/proxmox/check-akkoordkast.sh` (alleen-lezen, met per bevinding de
  letterlijke opdracht die het oplost).
- **Logboek:** `pct exec 106 -- journalctl -u akkoordkast -n 50 --no-pager`.

## Licentie

De app-code is van Tom Werdens; er is geen licentie verleend voor hergebruik. De meegeleverde
liedjes zijn publiek domein — de bronvermelding en de letterlijke licentieverklaring van elke bron
staan per liedje in de dataset. De liedjes zijn niet van mij en de dataset is met de hand samengesteld,
dus controleer bij twijfel zelf de herkomst voordat je iets publiceert.
