# Wat er veranderd is

Alles wat de app in huis heeft staat in de [README](README.md); hier staat per versie wat er
nieuw is, wat er veranderd is en wat er gerepareerd is.

## [1.17.0] — 4 november 2026

### Nieuw

- **Je eigen bladmuziek bij een liedje.** In de kaart van een liedje staat nu het onderdeel
  *Bladmuziek* (alleen voor de beheerder): zet je eigen foto of PDF van het nummer erbij — gekocht,
  gekregen of zelf uitgeschreven. De app bewaart hem in je eigen map (`media/bladmuziek`) en toont hem
  in de kaart; bij een foto zie je hem meteen, bij een PDF staat er een knop om hem te openen. Weghalen
  kan ook, en een nieuw blad vervangt het oude.
- **Nieuwe routes** `POST`, `GET` en `DELETE /api/liedjes/<id>/eigen-blad` (beheerder), met een
  maximum van 40 MB en alleen png, jpg, webp, gif of PDF.

### Waarom dit de eerlijke weg is

De verzameling zelf houdt zich aan **publiek domein**: er komt geen akkoordschema van een website in
voor muziek die nog auteursrechtelijk beschermd is. Voor een nummer als dat van Kensington is er dus
geen bladmuziek om over te nemen — maar heb je zelf het blad, dan kun je het hier aan het liedje
hangen. Dat blijft in jouw eigen app en gaat nergens naartoe.

## [1.16.0] — 4 november 2026

### Nieuw

- **Opruimen in de beheerder.** Op het tabblad Toevoegen staat nu de kaart *Opruimen* met de knop
  *Kijken wat er op te ruimen valt*. Die kijkt eerst en laat zien wat er te vinden is; er gebeurt niets
  voordat je op een knop drukt. Per soort staat er een eigen knop, plus *Alles hierboven opruimen*:

  - **dubbele liedjes** — eigen liedjes met dezelfde titel (en dezelfde artiest, of een lege artiest).
    Van elk stel blijft het liedje met de meeste inhoud staan: eerst een liedje met akkoorden, dan met
    muziek, dan het oudste.
  - **lege liedjes** — eigen liedjes zonder akkoorden en vrijwel zonder tekst (de aanwijzingen tussen
    `{ }` en de akkoorden tussen `[ ]` tellen niet mee).
  - **verwijzingen naar muziek die er niet meer is** — bijvoorbeeld omdat de NAS-map weg is; de
    verwijzing wordt opgeruimd, het liedje blijft staan.
  - **losse muziekbestanden** — bestanden in de muziekmappen die bij geen enkel liedje horen (alleen
    geluids- en videobestanden; wat ergens bij hoort blijft met rust).
  - **oude back-ups** — alles boven het ingestelde aantal (standaard tien) gaat weg.
  - **verlopen sessies** — opgeruimd.
  - **verborgen liedjes** zijn hier ook weer zichtbaar te maken.

  De **meegeleverde verzameling blijft altijd ongemoeid**: opgeruimd worden alleen je eigen liedjes,
  verwijzingen, losse bestanden, back-ups en sessies. Alles hoort bij het beheerdersprofiel.

## [1.15.1] — 4 november 2026

### Veranderd

- **Wat iets toevoegt of verandert is nu ook in de app zelf alleen voor de beheerder te zien.** De knop
  *Bladmuziek uit de muziek halen* stond bij elk liedje met muziek, ook bij een gewoon profiel; die
  hoort alleen bij de beheerder. De server weigerde het al zonder beheerderssessie, maar nu is de knop
  er ook niet meer voor anderen. Samen met de kaart *Gegevens van een liedje aanpassen* (die al achter
  het beheerdersprofiel zat) is daarmee alles wat iets wijzigt beheerderswerk.

## [1.15.0] — 4 november 2026

### Nieuw

- **De gegevens van een liedje aanpassen.** In het beheerdersprofiel staat op het tabblad Toevoegen de
  kaart *Gegevens van een liedje aanpassen*: zoek een liedje en pas de titel, de **zanger of artiest**,
  de taal, het genre, de toonaard, het tempo, de maatsoort, de moeilijkheid, het slagpatroon, de
  YouTube-link en de notitie aan. De app zegt erbij wat er gebeurt: een eigen liedje wordt bijgewerkt,
  en van een **meegeleverd** liedje maakt de app een eigen kopie met jouw gegevens — het origineel
  blijft staan (en kun je verbergen). Muziek en video gaan mee naar de kopie, zodat je hem meteen kunt
  spelen.
- **Nieuwe route** `PUT /api/liedjes/<id>/gegevens` (beheerder) die dit regelt, met nette grenzen:
  een lege titel wordt geweigerd, tempo blijft tussen 40 en 200, maatsoort tussen 2 en 12,
  moeilijkheid tussen 1 en 5, en de taal wordt in kleine letters bewaard.

## [1.14.0] — 4 november 2026

### Nieuw

- **De app zoekt de bladmuziek er zelf bij.** Haal je een nummer via een link op, dan kijkt de app
  meteen of dat liedje al in de eigen bibliotheek staat (op precies dezelfde titel). Zo ja, dan neemt
  hij die bladmuziek over — de woorden én de akkoorden — en heet de bron voortaan "… (uit je
  bibliotheek)". Zo krijgt een opgehaald volkswijsje meteen een echt akkoordschema.
- **Akkoorden uit de muziek zelf halen.** Bij een liedje met muziek staat in de kaart de knop
  *Bladmuziek uit de muziek halen*: de app leest de opname uit (tempo, maatsoort, toonaard en een
  akkoord per maat) en zet dat als schema neer. De kaart zegt er dan bij dat de akkoorden automatisch
  uit de muziek zijn gehaald, zodat je ze even kunt controleren. Dit rekent, dus het gebeurt als je er
  zelf om vraagt — niet bij elke download.

## [1.13.0] — 4 november 2026

### Nieuw

- **Elk liedje heeft nu akkoorden.** Van de 8.701 liedjes hadden er 8.683 al een eigen akkoordschema
  uit de bron. De rest — achttien liedjes waarvan alleen de tekst is overgeleverd, en elk nummer dat
  je zelf via een link ophaalt — had er geen, en daar kon de app niets mee: geen grepen, geen
  begeleiding, geen meespelen. Voor die liedjes stelt de app nu een **schema voor** in de toonaard van
  het liedje: de bekende ronde (I-V-vi-IV en verwanten), vier akkoorden die je kunt tekenen en spelen.
  De app zegt er zelf bij dat het een voorstel is — het liedje had geen eigen akkoorden, dus wat je
  hoort komt niet uit de bron. Wat je zelf in het veld *Akkoordenreeks* zet, gaat vóór het voorstel.
- **Alle voorstellen zijn na te tekenen.** Een proef controleert voor elke toonaard in de tabel dat
  elk akkoord een greep heeft, of een capo-vorm die de app zelf uitrekent (zoals bij F#m). Staat een
  liedje in een toonaard die niet in de tabel past (Es, As), dan komt er een verwant schema en wijst
  het capo-advies de weg.

### Gerepareerd

- Een liedje zonder eigen akkoorden kon de app geen akkoordenreeks meegeven (het model had geen
  regels), waardoor begeleiding en meespelen leeg bleven. De reeks komt nu ook uit de akkoorden van
  het model zelf.

## [1.12.3] — 4 november 2026

### Gerepareerd

- **Meespelen weigerde bij een liedje dat uit een link was opgehaald.** Zo'n liedje heeft wel muziek,
  maar geen akkoorden of melodie. *Meespelen met de muziek* gaf dan een rode melding: "Van dit liedje
  is alleen de tekst overgeleverd: er is geen melodie of akkoordschema om mee te spelen" — terwijl de
  app erboven beloofde dat de muziek er wel was. Nu speelt de app in dat geval **de muziek zelf**, met
  de eerlijke uitleg erbij: er loopt niets mee, speel mee op gehoor. Heeft een liedje akkoorden, dan
  verandert er niets.
- **De belofte boven de knop klopte niet meer.** Bij een liedje zonder akkoorden stond er nog dat de
  maat, de slagen en de akkoordnoten mee zouden lopen. Dat staat er nu alleen nog als het liedje
  akkoorden heeft.
- De tekst die bij een nieuw opgehaald liedje in de bladmuziek staat, zegt nu wat je echt kunt
  verwachten: de muziek is er, de akkoorden niet.

## [1.12.2] — 4 november 2026

### Gerepareerd

- **Een koppeling kan ook tijdens het draaien wegvallen.** De app keek bij het opstarten of de
  downloadmap beschrijfbaar was, maar niet meer daarna. Viel de NAS-koppeling later weg — en dat is
  precies wat er bij een slapende NAS gebeurt — dan gaf het ophalen alsnog
  `ENOENT: no such file or directory, mkdir '/mnt/Nas/Nas-Opslag/Muziek/Gedownload'`. De downloader
  kiest nu **bij elke download opnieuw**: lukt de gewone map niet, dan gaat hij door in de eigen map
  van de app, meldt hij het in het logboek van het ophalen en in de app zelf, en het opgehaalde
  bestand wordt gewoon een liedje (de eigen map hoort er nu ook bij de toegestane mappen). Ook de
  mappenlijst, het liedje en de voortgang melden waar de muziek terechtkomt, en er staat bij of dat
  de gevraagde map is.

## [1.12.1] — 4 november 2026

### Gerepareerd

- **Muziek ophalen stopte met een systeemfout zodra de NAS-map weg was.** Wie een link of een hele
  artiest wilde ophalen kreeg `ENOENT: no such file or directory, mkdir
  '/mnt/Nas/Nas-Opslag/Muziek/Gedownload'` en er gebeurde niets. De app kijkt nu bij het opstarten of
  er in de downloadmap geschreven kan worden. Lukt dat niet — de koppeling is weg, de schijf is vol of
  de map is alleen-lezen — dan haalt de app de muziek op in zijn eigen map (`gedownload` naast de
  gegevens van de app), meldt hij dat in de app zelf (bij *Muziekmappen* en bij het ophalen), met de
  opdracht om de NAS opnieuw te koppelen (`deploy/proxmox/nas-koppelen.sh`). Er ging voorheen niets
  stuk aan je verzameling, maar je kon niet ophalen; nu wel.
- **De lijst waarin je liedjes aanvinkt stond op een breed scherm in elkaar gedrukt.** Het
  aanvinkvakje werd door de gewone formulieropmaak op ware grootte uitgerekt (bijna duizend pixels
  breed), waardoor de liedjestitels naar de rechterrand werden geduwd en er een schuifbalk verscheen.
  Het vlakje is nu een gewoon vinkje van 16 bij 16. De keuzelijst en het zoekveld in *Filters beheren*
  zijn op een breed scherm ook niet meer onnodig breed.

## [1.12.0] — 4 november 2026

### Nieuw

- **De beheerder kan liedjes uit de app halen.** In het tabblad Toevoegen staat *Liedjes weghalen*:
  zoek een liedje en haal het weg. Een eigen liedje (zelf toegevoegd of uit een link gehaald)
  verdwijnt helemaal — de rij, de muziek die eraan hing, de opname, de koppelingen met filters en
  labels, de favoriet en de speelgeschiedenis. Een meegeleverd liedje zit in de bestanden van de app:
  dat wordt *verborgen* in plaats van weggegooid, zodat het uit de lijsten, het zoeken en de filters
  is en met één knop terug te zetten is (onder *Verborgen liedjes*).
- **De beheerder beheert de filters.** In *Filters beheren* staan alle talen en genres met hoeveel
  liedjes eronder vallen. Je kunt er zelf een toevoegen — een eigen genre, of een taal — en die staat
  dan meteen als filter in de app, ook als er nog geen liedje bij hoort. Liedjes koppel je er in één
  keer aan: zoek, vink aan, koppelen. Wat je koppelt gaat vóór de taal of het genre dat het liedje
  zelf had; losmaken zet het weer terug. Een filter weghalen laat de liedjes staan.
- **De cursus is overzichtelijker.** De acht delen zijn nu groepen die je open- en dichtklapt (met per
  deel een teller en een balk, en het deel waar je bent standaard open), er is een zoekvak dat
  accentongevoelig zoekt ("barre" vindt de les over barré-akkoorden), knoppen om alles te openen of te
  sluiten, en bovenaan een kaart *Verder waar je gebleven was* met één knop naar de volgende les (met
  de mogelijkheid hem even over te slaan). Wat je open- en dichtklapt blijft bewaard.

### Gerepareerd

- **Na het inloggen als beheerder bleef het beheerblok op het inlogformulier staan.** De app vroeg de
  stand op voordat de browser het sessiekoekje van de server had verwerkt; de stand wordt nu meteen
  goed gezet en daarna nog eens opgevraagd. (Het pad via het profielslot werkte al goed, omdat dat de
  stand zelf bijhoudt.)
- De beheerkaarten koppelden hun knoppen pas als het tabblad Leren een keer was geopend; dat gebeurt nu
  bij het opstarten.

## [1.11.1] — 4 november 2026

### Gerepareerd

- **De ritme-trainer herkent slagen nu aan de aanslag in het spectrum, niet aan de geluidssterkte.**
  Twee dingen waren mis met de sterkte-aanpak, en de tweede was pas te zien met echte audio in een
  browser: bij een snel slagpatroon klinkt de vorige snaar nog door, waardoor de sterkte bijna niet
  verandert en de app drie van de acht slagen miste; en omgevingsgeluid werd juist wél geteld — een
  drempel op de luidste klap uit het hele stuk gaf veertien valse slagen per drie seconden bij gewone
  ruis en tweeëntwintig bij netbrom. De app vergelijkt nu per beeldje het spectrum met dat van het
  beeldje ervoor: een aanslag zet breedbandige energie bij, omgevingsgeluid niet. In een proef met
  twaalf aanslagen over een doorklinkende klank, met een ruisbed eronder, vindt hij ze alle twaalf
  (eerst tweeëntwintig).
- **Dezelfde aanslag werd over meerdere beeldjes opnieuw gevonden** en dus dubbel geteld; tussen de
  beeldjes geldt nu ook de minimumafstand.
- **IJken.** Elk toestel meet een vast aantal milliseconden te laat (microfoon plus het analysevenster
  van drieënnegentig milliseconden). Daar is nu een knop voor: *Zet mijn gemiddelde op nul* haalt dat
  vaste verschil eraf, zodat je alleen nog ziet wat je zelf doet. In een proef ging het gemiddelde
  daarmee van tweeënzeventig milliseconden te laat naar vier milliseconden.

## [1.11.0] — 4 november 2026

### Nieuw

- **Grepen leren met voortgang.** In het tabblad Leren kun je bij *Alle grepen* per greep afvinken wat
  je al kunt. Bovenaan loopt een balk mee ("7 van 26 grepen afgevinkt") en een greep die je kent krijgt
  een groen vinkje. Met *Nu oefenen met* kies je alleen wat je nog niet kent, alleen de grote, de
  kleine, de zevende of alleen de barré-grepen, en één knop zet die reeks meteen in de
  akkoordentrainer.
- **Ritme-trainer met de microfoon.** Sla of klap mee en de app luistert of je op de maat zit. Hij
  telt zichtbaar mee, laat per slag de afwijking in milliseconden zien, zegt of je neigt naar te vroeg
  of te laat, en geeft het deel van je slagen dat op de maat was. De tik staat standaard stil — een
  microfoon zou de tik uit de luidspreker als jouw slag tellen — met een uitleg over de vertraging van
  je toestel (kijk naar de schommeling).
- **Toonladders op de hals.** Majeur, mineur, pentatonisch majeur, pentatonisch mineur en blues in elke
  grondtoon, over één tot drie octaven: de noten op de hals tot en met vak 12, de grondtoon oranje, met
  een knop om te horen en een om noot voor noot mee te spelen op een tik.
- **Mijn oefenplan.** Kies een liedje, het aantal weken, de minuten per dag en de dagen per week, en de
  app vult het plan: eerst de grepen, dan de overgangen en de delen van het liedje, en in de laatste
  week het hele liedje op tempo en twee keer achter elkaar zonder stoppen. Elke taak heeft een aantal
  minuten en een afvinkvakje, en het plan blijft bewaard.
- **Neem jezelf op.** Opnemen met de microfoon (maximaal vijf minuten), terugluisteren, bewaren als
  bestand op je toestel of weggooien. De opname blijft in het toestel; er gaat niets naar de server.

### Veranderd

- Drie nieuwe rekenbestanden, los van de pagina en met eigen tests, net als bij de stemmer:
  `lib/ritme.js` (slagen uit het geluid halen, afwijking per slag), `lib/toonladders.js` (ladders en
  hun posities op de hals) en `lib/oefenplan.js` (het plan vullen). Daarmee zijn er 28 tests bij.
- De kop van het tabblad Leren zei nog "zesentwintig lessen in vier delen"; dat is nu honderdtien
  lessen in acht delen.
- De reeks "Alles door elkaar" noemde Fm, en dat akkoord heeft geen greep in de app.
- De app-cache gaat naar v40 met de drie nieuwe rekenbestanden erin, en de microfoon gaat alleen aan
  als je zelf op Start drukt.

## [1.10.0] — 4 november 2026

### Nieuw

- **Een stemmer met de microfoon.** In het tabblad Leren staat bij *Stemmen* nu een echte stemmer
  naast de toon-op-het-gehoor: druk op **Start de stemmer**, sla één snaar aan en laat hem
  doorklinken. De app laat zien welke snaar het is, hoeveel cent je ernaast zit en welke kant je op
  moet — *"De A-snaar staat 9 cent te laag (109 Hz) — draai de stemsleutel wat strakker"* — met een
  naald die in het groen komt als je goed zit (binnen vijf cent). De snaar die de app hoort licht op,
  zodat je merkt als je de verkeerde snaar raakt; de dikste snaar eerst is het makkelijkst.
- Het rekenwerk staat in `lib/stemmen.js`, los van de pagina, zodat de tests dezelfde rekenkunde
  raken: uit een stukje geluid de toonhoogte halen met een genormaliseerde autocorrelatie, met de
  eerste sterke piek in plaats van de hoogste (anders hoort een stemmer een boventoon en zit je een
  octaaf ernaast) en met een parabolische piek ertussen (anders scheelt het al snel een paar cent).
- Zeven nieuwe tests bewijzen dat: een rustige toon wordt op twee cent nauwkeurig herkend op alle zes
  snaren, een toon die 9, 12, 25 of 30 cent te laag staat wordt ook zo gemeld, een snaar met een
  sterke boventoon wordt niet een octaaf te hoog gehoord, een aangeslagen snaar (met ruis erin) wordt
  herkend, en stilte of geruis levert geen valse toonhoogte op.

### Veranderd

- De microfoon wordt alleen gebruikt zolang de stemmer aanstaat; er wordt niets opgenomen of bewaard.
  Op een adres zonder `https` zegt de app meteen dat de microfoon daar niet mag, in plaats van stil te
  blijven.

## [1.9.0] — 4 november 2026

### Nieuw

- **De cursus gaat van 26 naar 110 lessen, in acht delen.** Waar de cursus ophield bij de eerste
  akkoorden, gaat hij nu door tot samenspelen en optreden: *Beginnen* (10), *Akkoorden* (16),
  *Ritme en slag* (18), *Tokkelen* (17), *Toonladders en theorie* (15), *Verdiepen* (14),
  *Samenspelen en optreden* (10) en *Onderhoud en volhouden* (10). Elke les heeft een doel, de uitleg
  in drie of vier alinea's, één concrete oefening met tijd en tempo, en waar het past een knop naar
  het onderdeel van de app dat erbij hoort: grepen en akkoordenboek, de akkoordentrainer, de
  gehoor-trainer, de weekplanning, de overgangen van een setlist, het capo-advies, meespelen of de
  metronoom.
- De Leren-tab groepeert de lessen per deel met een teller per deel ("7 van 16 gedaan") en per les
  een afvinkje dat per profiel bewaard blijft, zodat je ziet waar je gebleven bent.
- De vervolgdelen staan in een eigen bestand (`lib/lessen-uitgebreid.js`); de eerste lessen blijven
  in de pagina staan. De app voegt ze samen en zet alles op de volgorde van de delen.

### Veranderd

- Vier bestaande lessen staan nu in het deel waar ze horen: *Tokkelen met je vingers* bij Tokkelen,
  *Maatsoort en meespelen met een liedje* bij Ritme en slag, en *Onderhoud van je gitaar* en *Een
  oefenplan dat je volhoudt* bij Onderhoud en volhouden.
- De handleiding noemt het adres van de app (`je eigen adres van de app`) in plaats van een
  voorbeeld met een IP-nummer, en zegt dat de camera en de microfoon daar werken.

## [1.8.0] — 4 november 2026

### Nieuw

- **Een hele artiest of afspeellijst ophalen.** In het tabblad Toevoegen staat de kaart **Een hele
  artiest of afspeellijst**: plak de link van een afspeellijst of van een kanaal, zet het hoogste
  aantal nummers en de app haalt ze één voor één op. Elk nummer wordt een **eigen liedje** in de
  bibliotheek, met de muziek eraan, en verschijnt onderweg al in de lijst. De ondergrens van één
  nummer per keer blijft: er loopt één download tegelijk.
- **De liedjes die je zelf toevoegt staan nu in de filters.** Het genre (bijvoorbeeld *Gedownload*)
  en je eigen artiesten komen in de keuzelijsten van het tabblad Liedjes te staan, met het merkje
  *eigen*; ook als er nog maar één liedje van is, want anders kun je je eigen muziek niet
  terugvinden. En de keuzelijsten verversen zichzelf, dus je hoeft de pagina niet te verversen om een
  nieuw genre te zien.

### Gerepareerd

- De video-id van een opgehaald nummer werd uit de verkeerde regel gehaald (het woord *Destination*
  is ook elf letters); die herkenning is nu streng genoeg.

## [1.7.0] — 4 november 2026

### Nieuw

- **Een link kan nu ook nieuwe muziek worden.** In de kaart **Downloaden als mp3** kies je voortaan
  wat je met de link wilt:
  - *Als nieuwe muziek* (het nieuwe standaardgedrag): het bestand wordt een **eigen liedje** in de
    bibliotheek, met de muziek eraan, zodat je het meteen kunt spelen en meespelen. De titel komt uit
    de link, of je typt er zelf een. Dit is de weg voor nummers die nog niet in de app staan.
  - *Bij een liedje dat er al staat*: het zoeken en kiezen van een liedje, zoals het eerder werkte.
- De server maakt dat nieuwe liedje zelf aan (titel, artiest *Gedownload*, de muziek eraan, en de
  video-id als het een YouTube-link was) en zegt pas **klaar** als het liedje er echt is — anders zou
  de app melden dat het klaar is terwijl het liedje nog gemaakt moest worden.
- Lukt het maken van het liedje niet, dan zegt de app dat; het bestand staat dan wel gewoon in de
  muziekmap.

### Gerepareerd

- De knop **Openen in Spelen** zette de uitslag ("Klaar: welk bestand") buiten beeld; de knop staat nu
  onder die regel in plaats van eroverheen.

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
