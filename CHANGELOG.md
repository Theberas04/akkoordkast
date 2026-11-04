# Wat er veranderd is

Alles wat de app in huis heeft staat in de [README](README.md); hier staat per versie wat er
nieuw is, wat er veranderd is en wat er gerepareerd is.

## [1.6.0] — 4 november 2026

### Nieuw

- **Downloaden als mp3 staat nu ook in het tabblad Toevoegen.** Zoek bij welk liedje de muziek
  hoort, klik *Dit liedje*, plak de link en downloaden maar. Het bestand komt in je muziekmap en
  hangt meteen aan dat liedje; daarna is er één knop *Openen in Spelen*. De oude weg — een link
  plakken in het speelscherm van een liedje — blijft bestaan.

### Gerepareerd

- **Op een telefoon was de profielkiezer niet te gebruiken.** In de mobiele stijl werd de hele
  onderkop van de pagina verborgen, en daar zat de profielkiezer in. Nu blijft alleen de ondertitel
  weg; de kiezer staat bovenin onder de titel, met het plusje voor een nieuw profiel.
- Op een telefoon liepen de liedjeskaartjes in de knoop: de titel werd in een smalle strook naast de
  knoppen geperst en brak in drie regels af. De knoppen staan nu onder het liedje, over de volle
  breedte.
- **De installer en de bijwerker liepen vast op een 403 van GitHub.** Ze vroegen de nieuwste
  commit op via de GitHub-API, en die heeft een limiet per IP-adres (zestig verzoeken per uur);
  daarna gaf hij `curl: (22) The requested URL returned error: 403` en kon de bijwerking niet
  doorgaan. Nu halen ze de commit eerst uit de Atom-feed van de commits — dat is geen API en heeft
  geen limiet — en pas als dat niet lukt via de API. De aanbevolen opdracht in de documentatie
  gebruikt de ruwe bestands-URL en raakt de API helemaal niet meer.
- De app-cache naar v40.

## [1.5.0] — 4 november 2026

### Nieuw

- **Het beheerdersprofiel zit achter het wachtwoord.** Kies je in de profielkiezer *Admin *
  beheerder*, dan vraagt de app eerst om het beheerderswachtwoord (met een kaartje over het scherm);
  pas daarna wordt dat profiel het actieve profiel en verschijnt het gereedschap. Annuleren of een
  fout wachtwoord laat je gewoon in je eigen profiel, en het beheerdersprofiel blijft dan dicht. Op
  een verse installatie kies je het wachtwoord in datzelfde kaartje.
- In de profielkiezer staat het beheerdersprofiel met een slotje zolang je niet bent ingelogd.
- Uitloggen zet het profiel weer op slot en brengt de app terug naar een gewoon profiel.

### Veranderd

- Ook de serverkant is dicht: zonder beheerderssessie valt een verzoek om het beheerdersprofiel
  terug op een gewoon profiel. Wie de profiel-id raadt, komt er dus ook niet in — hij ziet zijn eigen
  favorieten en geschiedenis, geen die van de beheerder.
- De app-cache naar v38.

## [1.4.0] — 4 november 2026

### Nieuw

- **Het toevoeggereedschap zit in een eigen profiel: `Admin`.** Het tabblad Toevoegen (en de
  toevoegblokken in het speelscherm) bestaan alleen in dat profiel; in je gewone profielen — voor
  het gezin, per persoon, voor een optreden — is het er niet, zodat daar alleen staat waar je mee
  speelt en leert. In de profielkiezer staat het als *Admin · beheerder*.
- Het beheerdersprofiel wordt automatisch aangemaakt (ook in een database die al bestond, via een
  kolom `is_beheer` die er zonder verlies bij komt) en kan niet worden verwijderd.
- De poortwachter eist nu beide: ingelogd zijn **en** in het beheerdersprofiel werken. Wie is
  ingelogd maar in een gewoon profiel zit, krijgt een uitleg waarin staat welk profiel je moet
  kiezen in plaats van een kaal "niet toegestaan".

### Veranderd

- De handleiding en de README leggen uit hoe je bij het beheerdersprofiel komt.
- De app-cache naar v33.

## [1.3.0] — 4 november 2026

### Nieuw

- **Een beheerdersaccount voor alles wat toevoegt.** Zoeken, spelen, leren, casten en je eigen
  profielen, favorieten, labels en setlists blijven voor iedereen; muziek uploaden, een link
  omzetten naar mp3, een muziekmap laten omzetten, eigen liedjes bewerken, een opname uploaden, de
  back-up, de wachter, de bijwerking en de Spotify-sleutels horen bij de beheerder. Het
  wachtwoord wordt bewaard als scrypt-afdruk met een eigen zout (nooit als tekst), de sessie is een
  HttpOnly-koekje van negentig dagen in de nieuwe tabel `sessies`, en na tien foute pogingen binnen
  een kwartier houdt de app het even voor gezien.
- De eerste keer stel je het wachtwoord in het tabblad Toevoegen in; je bent dan meteen ingelogd.
  Zonder login zie je daar alleen de inlogkaart, en in het speelscherm alleen dat muziek toevoegen
  beheerderswerk is.

### Veranderd

- **De handleiding gaat alleen nog over de app.** Wat installeren, koppelen en beheren betreft
  staat nu in de README: welke mappen en bestanden waar staan, hoe je een NAS- of Drive-map
  koppelt, en hoe je het beheerderswachtwoord wist als je het kwijt bent. Zo leest de handleiding
  als een gebruiksaanwijzing in plaats van een installatiegids.
- De app-cache naar v30.

## [1.2.0] — 4 november 2026

### Nieuw

- **Meespelen met de muziek van het liedje.** Naast de begeleiding die de app zelf maakt (een
  gitaarsynthesizer), kun je nu meespelen met de echte muziek: de app zoekt het bestand bij de titel
  in jouw muziekmappen (ook de map op de NAS), je kiest de juiste uitvoering en de akkoorden, de
  maat, de notenbalk en de hals lopen mee. Met de snelheidsregelaar oefen je trager zonder dat de
  toonhoogte verandert, en met vier tikken neemt de app het tempo van de opname over. De app leest
  het bestand alleen: er wordt niets naar je NAS geschreven.
- **Een link omzetten naar mp3.** Plak een link in het speelscherm en de app zet er met `yt-dlp` en
  `ffmpeg` een mp3 van in je eigen muziekmap (ondermap `Gedownload`). Het bestand wordt meteen aan
  het liedje gehangen, dus je kunt er direct mee meespelen. De app weigert links naar je eigen
  netwerk, en er loopt er één tegelijk.
- **Een handleiding.** Stap voor stap door alle functies heen, met schermafbeeldingen: te lezen in
  de app (tabblad Toevoegen → *Handleiding openen*), in de repo (`docs/handleiding.md`) en als PDF
  (`docs/handleiding.pdf`). De handleiding wordt uit één bron gemaakt met
  `scripts/maak-handleiding.py`, zodat tekst en beelden niet uit elkaar kunnen lopen.

### Veiligheid

- Een verzoek om een muziekbestand wordt geweigerd als het pad buiten de mappen valt die jij hebt
  aangewezen — ook als dat via `..` of een symbolische link gaat.
- Bij het ophalen van een link worden adressen binnen je eigen netwerk (`192.168.…`, `10.…`,
  `localhost`, `*.local`) geweigerd, zodat je niet per ongeluk bestanden van je router of NAS
  ophaalt.

### Veranderd

- De knop in het speelblok heet **Meespelen met de muziek** zodra er een bestand aan het liedje
  hangt; de app-cache is naar v28.

## [1.1.0] — 3 november 2026

### Nieuw

- **Metronoom met aftellen en tik-tempo.** In de speler klikt de maat mee, met een zware tik op de
  eerste tel. De app telt de maat af voor je begint, en als je vier keer meetikt neemt hij dat tempo
  over (een te late tik of een dubbeltik verpest het niet). De klikken volgen je oefentempo.
- **Back-up naar een map die jij kiest**, bijvoorbeeld op je NAS. Eén bestand per keer met je
  profielen, favorieten, labels, setlists, oefencijfers, eigen liedjes en instellingen. De laatste
  tien blijven staan; wachtwoorden en API-sleutels gaan er niet in.
- **Overzicht per week** van je oefenen: minuten, aantal sessies en de akkoorden waar je mee bezig
  was, volgens de ISO-kalender en met de weken zonder oefening erbij.
- **Akkoordovergangen in een setlist.** Per paar opeenvolgende liedjes: in welke toonsoort je het
  tweede speelt (of welke capo), welke akkoorden je in allebei hebt, en een bruggetje als ze niets
  gemeen hebben.
- **Meerdere muziekmappen naast elkaar** — de map op de machine zelf én de map op je NAS. Omzetten en
  de automatische wachter lopen ze allemaal langs; een map die verdwenen is wordt gemeld.
- **De NAS rechtstreeks in de container koppelen** (route 1b) met fuse en rclone, zonder de map op de
  Proxmox-host te zetten. NFS kan niet in een ongeprivilegieerde container; de scripts zeggen dat nu
  met uitleg in plaats van het te proberen.
- **Google Drive** koppelen kan nu ook alleen een map in plaats van je hele Drive
  (`RCLONE_PAD=Muziek`), met de juiste eigenaar voor de app en een proefmodus om het eerst na te
  lopen.

### Veranderd

- **Vormgeving opnieuw gedaan**: rustiger kop en tabbalk van dezelfde breedte als de kaarten, vaste
  maatvoering voor knoppen en velden, SVG-iconen in plaats van emoji, en één rustige kleurgloed in
  plaats van losse vlekken.
- **De filters staan standaard dicht**, zodat je de liedjes meteen ziet in plaats van een muur aan
  keuzelijsten. Wat je kiest wordt onthouden.
- Een tabblad is ook via het adres te openen (`/#toevoegen`), zodat je een link kunt doorsturen.
- Route 1 zet `MUSIC_DIR` in de dienst van de app, zodat *Muziekmap scannen* het pad al ingevuld
  heeft.
- De schermafbeeldingen en de omslagafbeelding in de README en op de projectpagina zijn opnieuw
  gemaakt in de nieuwe vormgeving.

### Gerepareerd

- De NAS-koppeling in de container zocht zijn hulpbestand naast zichzelf, wat met een installatie via
  één regel niet klopte; dat wordt nu opgehaald.
- De setlist-kaart zei twee dingen tegelijk als er nog geen setlist was.

## [1.0.0] — 3 november 2026

Eerste uitgave: 8.701 liedjes (publiek domein, met bronvermelding per liedje), capo-advies dat
rekent, greepdiagrammen voor alle 26 akkoorden, begeleidingsaudio uit een eigen gitaarsynthesizer,
meespelen met noten en tab, eigen mp3 of mp4 uploaden met herkenning van tempo, toonsoort en
akkoorden, Spotify erbij, Chromecast, een cursus van 26 gitaarlessen, profielen met favorieten,
labels en oefencijfers, meescrollen, podiummodus, liedjesboek als PDF, vertragen met een A/B-lus,
microfoon die meeluistert, akkoordenboek met alle posities, setlist en optredenmodus, gehoor-trainer,
wachter voor nieuwe muziek en een Proxmox-installer met updater.
