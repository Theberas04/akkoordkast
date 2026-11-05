# Wat er veranderd is

Alles wat de app in huis heeft staat in de [README](README.md); hier staat per versie wat er
nieuw is, wat er veranderd is en wat er gerepareerd is.

## [1.43.0] — 5 november 2026

### Meespelen met muziek uit je eigen map werkt nu ook zonder opname-analyse

Bij *Smoorverliefd* (een opgehaald nummer met muziek erbij) deed de meespeelknop niets: geen NU, geen
maten, geen meelopend bladmuziek. De app speelde alleen de muziek. Oorzaak: bij een liedje met muziek uit
je map keek de app of er een **opname-analyse** was (`audio_bestand` + akkoorden per maat), en anders
zette hij het beeld uit — ook als het liedje wél akkoorden had in zijn schema.

- Het beeld loopt nu mee zodra er akkoorden zijn: uit de analyse van een opname, uit het schema van het
  liedje of uit het voorstel dat de kaart erboven ook laat zien. Pas als er helemaal geen akkoorden
  zijn, blijft het bij alleen muziek.
- Bij een voorstel zegt de app het eerlijk: "Dit liedje had geen eigen akkoorden: de akkoorden hierboven
  zijn een voorstel. Druk op Meespelen en de maat, de slagen en de noten lopen mee met de muziek. Het
  beeld kan iets naast de opname lopen, want die is niet op maat geanalyseerd."
- Het antwoord van `/api/meespelen` heeft daarvoor het veld `voorstel`.

Nieuwe proeven erbij: een liedje met muziek uit de map krijgt een tijdlijn, en bij een liedje zonder
eigen akkoorden loopt het beeld mee op het voorstel (met die melding erbij).

## [1.42.0] — 5 november 2026

### Dubbele nummers bekijken

Een overzicht van liedjes met dezelfde titel, voor de beheerder. Er wordt **niets** weggehaald: je ziet
waar het om gaat en opent het liedje om het zelf te verwijderen als je dat wilt.

- `GET /api/dubbelen` groepeert de hele verzameling (meegeleverd én eigen) op een genormaliseerde titel
  (accenten, leestekens en hoofdletters maken niet uit), en laat per liedje zien waar het vandaan komt en
  of er akkoorden en muziek bij zitten.
- Titels die niets zeggen (`(untitled)`, `zonder titel`) blijven erbuiten: die liedjes heten allemaal
  hetzelfde zonder iets met elkaar te maken te hebben.
- In de kaart **Dubbele nummers** (tabblad Toevoegen, alleen voor de beheerder) staat de knop
  **Dubbele nummers zoeken**, met per groep de liedjes en een knop **Openen**.
- Alleen de beheerder komt erbij; zonder beheerderssessie weigert de app (403).

Nieuwe proeven erbij; op een verzameling van 8701 liedjes vond de proef 623 dubbele titels (1387
liedjes), en het overzicht is in Chromium op telefoonformaat nagekeken.

## [1.41.0] — 5 november 2026

### Een akkoordenschema leest als een schema

Bij een liedje zonder liedtekst zette de app de akkoorden op een regel en de maatstrepen op de regel
eronder. Op een smal scherm liepen de akkoorden daardoor in elkaar over (`Amaj7Amaj7Am7Am7`): je kon de
maten niet meer lezen. Dat kwam zo bij *Smoorverliefd* binnen.

- Een regel met alleen akkoorden wordt nu een **schema**: elke maat een eigen vak met de maatstreep
  erin, vier maten per regel, en het loopt netjes om op een smal scherm.
- De losse regel met maatstrepen eronder verdwijnt, want die strepen zitten dan al in het schema.
- Een liedje **met** liedtekst blijft precies zoals het was: akkoorden boven de woorden.
- De maat die klinkt licht ook in het schema op (het bladmuziek loopt mee met de muziek).

Nieuwe proeven erbij; het schema nagekeken in Chromium op telefoonformaat.

## [1.40.0] — 5 november 2026

### Het bladmuziek loopt mee met de muziek

Tijdens het meespelen liepen de notenbalk, de tabulatuur en de hals wel mee, maar het bladmuziek zelf
stond stil: je zag nergens waar de muziek was. Nu licht het akkoord van de maat die klinkt op, en loopt
het uit beeld, dan schuift het blad mee.

- Elk akkoord op het blad krijgt een nummer mee (`data-ak`), zodat het beeld de maat kan terugvinden.
- De animatielus zet het opgelichte akkoord op de maat die hij uit de audiotijd haalt (`zetBladOpMaat`),
  en zoekt dat in de hele pagina — het blad staat in meer dan één houder (liedblad, meespeelkaart,
  boek), en het opzoeken binnen één houder vond niets.
- Het blad schuift alleen als het akkoord niet goed in beeld staat, zodat het niet onder je handen danst.
- Stoppen laat de markering weer los (`laatBladLos`).

Nieuwe proef die de onderdelen bewaakt; nagekeken in Chromium met een telefoonformaat, waarbij het
opgelichte akkoord meeliep met de audio (C → F → G7).

## [1.39.0] — 5 november 2026

### De beheerder zet de handleiding in de app, zonder dat hij in het repo staat

De handleiding hoort niet in het openbare repo (hij noemt het adres van de app), maar moest er wel in de
app kunnen staan. Dat kon al uit de gegevensmap `DATA_DIR/handleiding` — alleen was er geen weg om hem
daar te krijgen.

- In de beheerkaart staat nu **Handleiding in de app**: kies het bestand `index.html` van de handleiding en
  druk op **Plaatsen**. Hij komt in de gegevensmap te staan, dus elke bijwerking laat hem staan, en met
  **Weggooien** haal je hem weer weg.
- `POST /api/handleiding` neemt het bestand aan (ook als ruw bestand, niet alleen als base64), controleert
  de naam streng (alleen `index.html` of `img/...`, nooit buiten de map) en weigert iets dat geen HTML is.
- De plaatjes van de handleiding komen uit `docs/img` van het programma zelf, zodat er maar één bestand
  geplaatst hoeft te worden. De pagina in het repo gebruikt nog steeds `img/...`.

Nieuwe proef die het hele pad doorloopt: zonder beheerder geweigerd, plaatsen, serveren, plaatje erbij,
`../` geweigerd, en weggooien.

## [1.38.0] — 5 november 2026

### De regel noemt het adres waarop je zit, met de weg om de blokkade te wissen

Bij Tom werkt de microfoon wel bij Google Translate maar niet bij zijn app: Chrome is dus in orde en de
blokkade is een **bewaarde keuze per site**. Zulke keuzes zijn onzichtbaar in de app en staan in Chrome
onder *Site-instellingen, Alle sites*.

- De regel *Microfoon volgens je browser* noemt nu het adres waarop je zit (`location.hostname`, dus nooit
  hard in het repo) en de weg eromheen: het slotje bij het adres, of *Chrome, Instellingen,
  Site-instellingen, Alle sites, zoek dit adres, Gegevens wissen en rechten resetten*.
- Zonder blokkade blijft er staan dat er nog niets gevraagd is op dat adres — dan hoort Start de vraag te
  geven en zit het ergens anders.

## [1.37.0] — 5 november 2026

### De regel in de stemmerkaart noemt ook de blokkade in Chrome zelf

Chrome's Android-machtiging voor de microfoon staat bij Tom goed, dus een blokkade zit in Chrome zelf
(de site-instelling *Microfoon*, die voor alle sites kan dichtstaan). De regel *Microfoon volgens je
browser* zegt nu bij **geblokkeerd** allebei de plekken: het slotje bij het adres, en Chrome's
*Instellingen, Site-instellingen, Microfoon*.

Zo is in een oogopslag te zien of er een beslissing bewaard is (*geblokkeerd*) of dat er nog niets
gevraagd is (*nog niet gevraagd*—dan hoort Start de vraag te geven).

## [1.36.0] — 5 november 2026

### De microfoon-uitleg noemt ook de twee bovenliggende schakelaars

Tom meldde dat de microfoon **ook in Chrome zelf** niet werkt. Dat sluit de app-schil uit en wijst naar de
browser of het toestel zelf: staat de microfoon voor **Chrome** uit, of vraagt Chrome het niet meer (de
site-instelling *Microfoon* op Blokkeren), dan krijgt geen enkele website ooit een vraag te zien — en
daarom staat er ook geen microfoon in het rechtenoverzicht van de site.

- De uitleg bij een geweigerde microfoon noemt nu die twee plekken: in Chrome bij *Instellingen,
  Site-instellingen, Microfoon* de schakelaar weer aan of op Vragen, en in de telefoon bij *Instellingen,
  Privacy en beveiliging, Machtigingsbeheer, Microfoon* of Chrome daar aan staat.
- Dezelfde uitleg wijst meteen naar de snaartononen bij **Stemmen**, want die werken zonder microfoon.

Zo hoeft dezelfde vraag niet nog eens heen en weer.

## [1.35.0] — 5 november 2026

### De app legt uit wat een Cloudflare-fout (1033 of 502) betekent

Klacht: "ik krijg een 502 melding". De app zelf was kerngezond (elk adres antwoordde in minder dan een
seconde, met de app-marker), dus het lag niet aan de app maar aan de **tunnel** naar de machine: de
foutpagina was *Cloudflare Tunnel error 1033* — de tunnelkoppeling kon de app op dat moment niet
bereiken. Dat gebeurt precies in de paar seconden dat de app zichzelf opnieuw opstart, bijvoorbeeld na
**Bijwerken**.

- De melding bij **Bijwerken** zegt nu vooraf dat de app stopt en opnieuw start, dat het adres in die
  seconden onbereikbaar is, en dat een Cloudflare-fout (1033 of 502) daarbij hoort: tien tellen wachten
  en verversen. Er gaat niets verloren.
- De kaart **Beheer en bijwerken** legt hetzelfde uit, met de stap als het aanhoudt (kijk of de app en de
  tunnelkoppeling allebei draaien).

Zo is een tunnelmelding geen raadsel meer op het moment dat hij verschijnt.

## [1.34.0] — 5 november 2026

### Stemmen zonder microfoon, zichtbaar in de app

De microfoon van de geinstalleerde app blijft op dit toestel onbereikbaar (de rechtenlijst toont alleen
Meldingen, en er is nooit om gevraagd). De app had al een weg die **altijd** werkt, maar die stond er
niet als zodanig bij: in de kaart **Stemmen** kun je elke snaar aantikken en de toon laten klinken.

- De kaart Stemmen zegt nu dat dit de weg is als de microfoon van je toestel niet mag: tik een snaar
  aan, laat de toon klinken en draai aan de sleutel tot je gitaar hetzelfde klinkt. Geen microfoon, geen
  toestemming, geen https nodig.
- Mislukt de microfoon, dan verwijst de melding zelf ook naar die snaartononen.

Zo kan een gitarist op elke telefoon stemmen, ook als de browser of het toestel de microfoon niet toestaat.

## [1.33.0] — 5 november 2026

### Een uitweg als de geinstalleerde app de microfoon niet mag aanvragen

De klacht bleef, met een nieuwe schermafbeelding van **App-rechten** van AkkoordKast: onder *Toegestaan*
staat alleen **Meldingen**, en onder *Niet toegestaan* staat **"Geen rechten geweigerd"**. Er is dus nooit
iets geweigerd — de microfoon is **nooit gevraagd**. De geinstalleerde app kan hem op dit toestel blijkbaar
niet aanvragen, en dan valt er in de app ook niets toe te staan.

- In de stemmerkaart staat nu, als de app als app draait, de weg die wel werkt: **Open de app in Chrome**,
  met het adres waarop de app draait (`location.origin` — het publieke adres staat bewust nergens in het
  repo). In de browser vraagt Chrome de microfoon wel, en daar werkt de stemmer.
- De uitleg bij een geblokkeerde microfoon in de app verwijst naar die knop in plaats van naar een
  instellingenscherm waar de microfoon niet eens tussen staat.

Bewijs: de proef in `test/versie.test.js` controleert dat de knop er is, dat het adres uit `location.origin`
komt en dat het publieke adres niet in de pagina staat.

## [1.32.0] — 5 november 2026

### De microfoon van de geinstalleerde app: de uitleg noemt nu de juiste plek

De klacht bleef: *"ik kan nog geen microfoon gebruiken"*, met een schermafbeelding van het scherm
**Rechten** van de site. Daarop staat alleen **Meldingen**, met de regel *"Beheerd door AkkoordKast"* — en
**geen microfoon**. Dat is de aanwijzing: de app draait als **geinstalleerde app** (het manifest zegt
`display: standalone`). Dan beheert Android de microfoon bij de **app** en niet bij Chrome, en de
rechtenpagina van de site laat hem dus niet zien. De uitleg in de app stuurde naar Chrome — de verkeerde plek.

- `alsApp()` herkent of de app als app draait (standalone/fullscreen of `navigator.standalone`).
- De uitleg bij een geblokkeerde microfoon noemt dan **eerst** de juiste route: *Instellingen, Apps,
  AkkoordKast, Machtigingen, Microfoon, Toestaan* — met als terugval: open de app in Chrome zelf en zet
  het daar aan via het slotje in de adresbalk.
- In het controlepaneel staat nu *"je gebruikt de app als app — de microfoontoestemming hoort dan bij
  Instellingen, Apps, AkkoordKast, Machtigingen"*, en bij **nul gevonden microfoons** volgt meteen de
  concrete stap in plaats van alleen een getal.
- Voor de gewone site noemt de uitleg er nu ook bij dat je de rechten kunt wegvegen (**Rechten
  resetten**, zoals op de schermafbeelding) waarna de browser het opnieuw vraagt.

Bewijs: de proef in `test/versie.test.js` controleert dat `alsApp()` bestaat, dat de uitleg de
app-route noemt, en dat een telefoon met nul microfoons de stap te zien krijgt.

## [1.31.0] — 5 november 2026

### De microfoon op een telefoon: de app vertelt nu zelf waar het misgaat

De klacht: "ik kan hem via de website niet gebruiken" — de microfoon werkt niet op de telefoon.

Eerst nagegaan of het aan de app ligt: in een browser met een **echte toon op de microfooningang**
(110 Hz) zegt de stemmer netjes *"De A-snaar staat 7 cent te laag (110 Hz)"*. De microfoon, het rekenwerk
en de weergave werken dus. Op een telefoon gaat het bijna altijd mis op drie plekken, en die zijn nu
allemaal te zien en af te vangen.

- **Controle in de stemmerkaart** (`microfoonControle()`), meteen bij het openen: *beveiligd adres ja/nee ·
  microfoon in de browser aanwezig · andere app ja/nee · microfoons gevonden: 0/1/2*. Eén regel die zegt
  waar het op vastloopt, in plaats van "het werkt niet".
- **Andere app herkennen** (`inAndereApp()`): WhatsApp, Slack, Facebook, Instagram, de Google-app en een
  Android-WebView laten de microfoon vaak niet toe. De app zegt dan: *"Je opent de app in een andere app;
  open hem in Chrome of Safari zelf, daar werkt de microfoon wel."*
- **Terugval bij de microfoonvraag** (`vraagMicrofoon()`): de stemmer, de akkoordentrainer en de
  ritme-trainer vroegen alle drie de microfoon met de strenge instellingen (echo-onderdrukking uit enz.).
  Sommige telefoons wijzen dat af met een fout; dan vraagt de app het nu zonder eisen opnieuw. Beter een
  meting met ruis dan helemaal geen stemmer.
- **De foutcode staat erbij** (bijvoorbeeld `NotAllowedError`), zodat te zien is wat de browser precies zei.

## [1.30.0] — 4 november 2026

### Bij het bladmuziek staat nu een akkoordenschema in plaats van een lap uitleg

De klacht: bij de bladmuziek van (opgehaalde) nummers stond een **alinea uitleg** in plaats van bladmuziek:
*"De akkoorden van dit nummer zijn uit de opname gehaald; ze lopen mee als je in het speelscherm op
Meespelen met de muziek drukt. Er zit geen liedtekst bij dit nummer, dus speel op gehoor mee…"*.

Dat was een fout van de vorige versie: 1.27.0 verving de melding van het ophalen door een **nieuwe lap
tekst**, terwijl er een **akkoordblad** hoort te staan. Een nummer zonder liedtekst hoort zijn akkoorden te
laten zien, niet uit te leggen waar ze vandaan komen.

- `akkoordBlad()` maakt een echt akkoordenschema: **vier maten per regel**, elke maat met een maatstreep en
  de akkoorden uit de opname (`|[C] |[G] |[Am] |[F]`), met `{title}`, `{key}` en `{tempo}` erboven en één
  korte regel erbij: *"Akkoorden uit de opname - pas ze gerust aan waar het beter klinkt."*
- Zijn er geen akkoorden te vinden, dan staat er één korte, eerlijke regel in plaats van een alinea.
- `heeftEigenTekst()` zorgt dat dit **alleen** gebeurt bij liedjes zonder eigen liedtekst: een tekst die de
  gebruiker zelf heeft ingevoerd blijft altijd staan.
- De eenmalige opruiming bij het starten zet ook de nummers die de lap uitleg al hadden om naar een
  akkoordenschema. Op de app van de gebruiker ging het om 118 nummers; bijwerken is genoeg.

Bewijs: in `test/bladmuziek.test.js` controleert de proef bij het zelf-aanvullen dat er een akkoordenschema
in het blad staat (`|[C]`) en dat de lap uitleg er niet meer in zit, en de opruimproef controleert dat de
akkoorden die er al waren als schema terugkomen.

## [1.29.0] — 4 november 2026

### "Ik krijg de melding nog" — de pagina kwam uit de cache

De klacht kwam nadat 1.27.0 en 1.28.0 allebei al op de server stonden. Wat bleek: de **app op de server was
in orde** (1.28.0, de nieuwe teksten, van de 200 Kensington-nummers nul met de oude melding en 118 met de
nieuwe uitleg), maar de **browser liet de oude pagina zien**.

De service worker (`public/sw.js`) zocht de pagina eerst in zijn eigen cache en haalde hem pas op als hij er
niet stond. Na een bijwerking kreeg je dus één keer de oude pagina — met de melding er nog in — en pas bij de
tweede keer laden de nieuwe. Dat is precies het gevoel van "het is nog niet gerepareerd".

- De app-schil (`/`, `/index.html` en de vijf lesbestanden in `/lib/`) is nu **netwerk-eerst**: altijd eerst
  van de server, en alleen als er geen internet is valt hij terug op de cache. Gewone liedjes, audio en
  `/api/` gingen al nooit door de cache.
- De cache kreeg een nieuwe naam (`akkoordkast-v66`), zodat oude inhoud bij het starten wordt weggegooid.

Bewijs: de nieuwe proef in `test/versie.test.js` laat de service worker **echt draaien** met een nep-cache
waarin de oude pagina staat, en controleert dat hij de **server** vraagt in plaats van de cache. Een tweede
proef controleert dat `/api/...` niet door de service worker gaat.

## [1.28.0] — 4 november 2026

### "Je draait de nieuwste versie ()" — de lege haakjes zijn weg

De klacht: de app meldde *"Je draait de nieuwste versie ()."* met niets tussen de haakjes.

Wat er aan de hand was: de app vroeg zijn eigen versie op met `git rev-parse` in de app-map. Bij een
installatie uit een **archief** (zoals de Proxmox-installer doet) is er geen `.git`, dus kwam er niets uit
en bleven de haakjes leeg.

- `korteCommit()` kijkt nu op vier plekken, in deze volgorde: de omgeving (`GIT_COMMIT`/`VERSIE_COMMIT`),
  **`commit.txt` in de gegevensmap**, diezelfde naam in de app-map, en pas dan `git`. Van een lange commit
  wordt de korte vorm gebruikt (7 tekens, kleine letters).
- De **bijwerkscripts leggen de commit vast** die ze toch al ophalen: `update-from-github.sh` (vanaf de
  host) en `bijwerken-in-de-app.sh` (de knop in de app) schrijven hem naar `$DATA_DIR/commit.txt`, en
  `install.sh` doet het bij een verse installatie. De app leest het bestand per keer, dus een herstart is
  niet nodig.
- De pagina zet de commit er **alleen bij als hij hem kent**: *"Je draait de nieuwste versie (a3e0acb)."*
  of anders *"Je draait de nieuwste versie."* Dat geldt ook voor het bericht dat er iets nieuws klaarstaat.
- De bovenbalk laat de commit ook zien: **versie 1.28.0 · a3e0acb**.
- En de vergelijking is niet meer zoek: kort en lang zijn nu verwisselbaar (`isNieuwereVersie()`), en als de
  app zijn eigen commit niet weet, **beweert hij niets** in plaats van "er staat iets nieuws" te roepen.

Bewijs: de nieuwe proef in `test/versie.test.js` zet een commit in `commit.txt`, controleert dat
`/api/versie` hem als `abcdef0` teruggeeft, dat de omgeving vóór het bestand gaat, en dat onzin in het
bestand geen halve commit oplevert.

## [1.27.0] — 4 november 2026

### De melding "de bladmuziek staat er nog niet in" wordt nu opgeruimd als de akkoorden er wél zijn

De klacht: bij veel Kensington-nummers staat nog *"Dit liedje is opgehaald uit een link. De bladmuziek
staat er nog niet in, maar de muziek wel: druk in het speelscherm op Meespelen met de muziek en de
akkoorden lopen mee."* terwijl het inmiddels wél werkt.

Wat er aan de hand was: die melding wordt **bij het ophalen** in de liedtekst gezet. Toen de app later de
akkoorden uit de opname haalde, kwamen die akkoorden er wel — maar de tekst bleef staan. Resultaat: echte
akkoorden boven een tekst die zei dat er niets was. Op de app van de gebruiker ging het om 121 nummers.

- Wanneer de app akkoorden uit een opname vastlegt, **herkent hij die melding** (`isOphaalTekst()`) en zet
  er een kloppende tekst in plaats van: *"De akkoorden van dit nummer zijn uit de opname gehaald; ze lopen
  mee als je op Meespelen met de muziek drukt."* De kop (`{title: …}`) blijft staan.
- Lukt het niet om akkoorden te vinden, dan staat er nu eerlijk: *"De akkoorden konden niet uit deze opname
  worden gehaald (drums en zang maken dat lastig). De muziek hoor je wel met Meespelen met de muziek."*
- **Eenmalige opruiming bij het starten** (`herstelOphaalTeksten()`): liedjes die de melding nog hebben
  terwijl de akkoorden er al zijn, worden meteen rechtgezet. Dat geldt dus ook voor de nummers die hun
  akkoorden vóór deze versie kregen — de gebruiker hoeft niets opnieuw te doen, alleen bij te werken.

Bewijs: de nieuwe proef in `test/bladmuziek.test.js` zet een liedje met de ophaal-melding neer, laat de app
de akkoorden uit een echte opname halen, en controleert dat de melding daarna weg is en dat er staat dat de
akkoorden uit de opname komen.

## [1.26.0] — 4 november 2026

### De cast speelt nu de muziek van het liedje (dáár zat "chromecast werkt nog niet")

Nagekeken op de app van de gebruiker: de verbinding met de Chromecast was in orde (een statusvraag naar
`192.168.1.100` lukte, het toestel antwoordt), maar het klaarzetten van het geluid mislukte:

    GET /api/cast/audio?liedje=900145  ->  {"fout":"Geen bekende akkoorden om te spelen"}

De app wilde **zelf begeleiding maken** — en dat kan alleen als de akkoorden van het liedje bekend zijn —
terwijl de **muziek gewoon bij het liedje stond**. Bij liedjes die je hebt opgehaald (met muziek, zonder
eigen akkoorden) ging casten dus altijd mis, bij de server-cast én bij het casten vanaf je eigen apparaat.

- De cast speelt nu **de muziek die bij het liedje hoort**, precies hetzelfde bestand dat de speler ook
  gebruikt (`/api/muziek/bestand?liedje=…`), met het juiste soort bestand erbij (`audio/mpeg`, `audio/wav`,
  enzovoort) — dus ook het zoeken in de tijd werkt, want dat adres ondersteunt `Range`.
- Je eigen opname gaat nog steeds voor als je daar om vraagt, en de begeleiding die de app zelf maakt blijft
  bestaan (`bron: meespelen`).
- Kan de app niets klaarzetten (geen muziek én geen akkoorden), dan **legt hij uit waarom** in plaats van met
  een rauwe fout te stoppen: *"Bij dit liedje staat geen muziek en de app kan er ook geen begeleiding van
  maken. Haal eerst de muziek op of zet de akkoorden erin."*

Bewijs: `test/cast.test.js` heeft er twee proeven bij — een liedje met muziek moet via beide wegen de
muziek-url krijgen (met het eigen netwerkadres voor de server-cast), en een liedje zonder muziek en zonder
akkoorden moet een nette uitleg geven in plaats van een fout.

## [1.25.0] — 4 november 2026

### Casten naar het toestel op het netwerk waar je nú bent

De klacht: *"ik vind alsnog alleen maar slaapkamer als chromecast in plaats van het apparaat wat er is op
het netwerk waar ik nu ben"*. Dat klopt, en het is geen fout in het zoeken: **de server zoekt alleen in
het netwerk waar hij zelf staat** (thuis). Een Chromecast in een ander netwerk kan hij niet zien, en ook
niet bedienen — ook niet als je hem het IP-adres geeft.

Daarom kan de app het nu ook **vanaf jouw eigen apparaat** doen:

- Op het tabblad Casten staat bovenaan de vraag *"Waar ben je?"* met de knop **Zoek en cast vanaf dit
  apparaat**. Die gebruikt de cast-bibliotheek van de browser zelf, dus je telefoon of computer zoekt in
  **het netwerk waar jij nu bent** — precies het toestel dat je bedoelt.
- Het geluid haalt de cast dan op bij **het adres waarmee je de app hebt geopend** (`location.origin`),
  via het nieuwe `GET /api/cast/audio`. Dat adres is van buiten bereikbaar, dus dit werkt in welk netwerk
  dan ook. Dat is het omgekeerde van de server-cast, die juist het adres *in* het eigen netwerk gebruikt —
  beide hebben hun eigen juiste adres.
- Welk geluid er gecast wordt is nu één keuze in de app (`castGeluid()`): je eigen opname als die er is,
  anders de begeleiding die de app maakt. De server-cast en het casten vanaf je apparaat pakken dus
  hetzelfde geluid, en de app vertelt erbij wat er speelt.
- Kan de browser niet zelf casten (bijvoorbeeld Safari), dan zegt de app dat en wijst hij op het zoeken
  van de server.
- De server-zoektocht kan nu ook **een ander netwerk** krijgen (een invulvak `192.168.2` bijvoorbeeld),
  voor als jouw netwerken aan elkaar geknoopt zijn.

Bewijs: `test/cast.test.js` controleert dat `GET /api/cast/audio` een volledig adres teruggeeft met het
adres waarmee de pagina de app bereikt, met het juiste pad, type en titel — en dat de pagina de knop, de
cast-bibliotheek en de uitleg echt heeft.

## [1.24.0] — 4 november 2026

### Casten werkt nu ook als je de app ergens anders vandaan opent

De klacht: *"de chromecast werkt nog niet als ik ergens anders ben in het netwerk"*. De oorzaak zat in
het adres dat de cast meekreeg:

- De pagina stuurde `basis: location.origin` mee — het adres waarmee **jij** de app hebt openstaan. Thuis
  is dat je eigen netwerk (`http://192.168.1.100:8080`) en dan haalt de cast het geluid prima op. Maar
  open je de app van buiten (bijvoorbeeld via het adres van de app), dan kreeg de Chromecast **dat**
  adres: een adres van buiten dat hij thuis niet kan ophalen. Vandaar dat het juist misging als je
  ergens anders was.
- De app bepaalt het adres nu **zelf** (`castBasis()`): het adres van de machine waarop de app draait in
  het eigen netwerk, met de poort waarop de app echt luistert — dat is de poort die hij werkelijk gebruikt,
  ook als hij op een andere poort gestart is. Dat is het adres dat de cast nodig heeft, want die staat in
  hetzelfde netwerk.
- Stuurt de pagina tóch een volledig adres mee, dan houdt de app alleen het pad over en zet dat op het
  eigen adres. Een zelf opgegeven adres in het eigen netwerk (192.168.x, 10.x, 172.16-31.x) mag wel.
- De app vertelt er nu bij **waarlangs** de cast het geluid ophaalt, zodat te zien is welk adres gebruikt
  is. Werkt het dan nog niet, dan zit de cast in een ander netwerk (bijvoorbeeld het gastennetwerk) — ook
  dat meldt de app.

Bewijs: `test/cast.test.js` stuurt een liedje naar de cast met een **nagemaakt** hulp-programma en met een
vraag alsof de pagina via een adres van buiten geopend is. De proef controleert dat de cast toch een adres
in het eigen netwerk krijgt met de juiste poort en het juiste pad.

## [1.23.0] — 4 november 2026

### De app vindt de muziek nu ook als de rij onder een ander nummer bewaard is

De app vult sinds 1.22.0 zelf bladmuziek aan, maar bij de gebruiker gebeurde er niets: de kaart zei
*"Er is niets te doen: elk liedje met muziek heeft al akkoorden"* en er werden 0 liedjes gedaan. De
oorzaak zat in de nummers waaronder de muziek bewaard is:

- In de **database** staat een eigen liedje onder een klein nummer (bijvoorbeeld `145`), terwijl de app
  het aan de buitenkant als `900145` laat zien. Bij de verzameling van de gebruiker staat de muziekrij
  onder dat **grote** nummer (`900145`), terwijl het liedje zelf onder `145` staat.
- Het scherm zocht met het nummer dat bij de rij hoort en vond de muziek, maar het zoeken naar kandidaten
  zocht met het kleine nummer en vond **niets** — waardoor de app dacht dat er niets te doen was.
- Voor de **eigen** liedjes kijkt de app nu onder beide nummers: eerst `900000 + nummer`, dan het nummer
  zelf (`muziekVanEigenLiedje()`). Dat gebeurt alleen daar en niet bij de meegeleverde liedjes: daar
  betekent 900000+ iets heel anders, dus daar mag je niet omrekenen. (Die fout maakte ik eerst wel, en
  een bestaande proef — `test/downloadmap.test.js` — wees hem meteen aan: een meegeleverd liedje kreeg
  zo de muziek van een eigen liedje.)
- De stand van het gereedschap (`GET /api/gereedschap`) zegt er nu ook bij hoeveel liedjes er nog te doen
  zijn. Dat had deze fout meteen zichtbaar gemaakt.

Bewijs: de nieuwe proef in `test/opnameauto.test.js` zet de muziekrij bewust onder het **grote** nummer —
precies zoals in de verzameling van de gebruiker — en kijkt of de app het liedje dan tóch vindt en de
akkoorden er zelf in zet.

## [1.22.0] — 4 november 2026

### De app vult je bladmuziek nu zelf aan, en zegt waar het op blijft hangen

De verbeterde herkenning van 1.21.0 deed zijn werk, maar bij de gebruiker stonden de Kensington-nummers
nog steeds op een voorstel: de ronde moest met de hand gestart worden en dat gebeurde niet. Dat is nu
anders.

- **Het gebeurt vanzelf.** Zodra de app draait pakt hij op de achtergrond één liedje per keer: kijken
  wat er muziek heeft maar nog geen akkoorden, en daar de akkoorden uit de muziek halen. Je hoeft dus
  nergens meer op te klikken. Wat niet lukt wordt overgeslagen in plaats van eindeloos opnieuw geprobeerd.
- **Het rekenen gebeurt in een apart proces** (`scripts/analyseer-bestand.js`). Eerst gebeurde dat in de
  app zelf, waardoor de app seconden tot een halve minuut kon stilvallen. Nu blijft de app gewoon bruikbaar
  terwijl er op de achtergrond een liedje wordt uitgezocht. Dat geldt ook voor de ronde van de beheerder.
- **Je kunt het zien en uitzetten.** Op de kaart *Bladmuziek uit de muziek halen* staat een vinkje
  (zelf aanvullen aan/uit, bewaard in de instellingen) met daaronder hoe ver de app is: hoeveel liedjes
  gedaan, hoeveel gelukt, hoeveel overgeslagen, en bij welke het niet lukte met de reden erbij.
- **De app meldt ontbrekend gereedschap.** `GET /api/gereedschap` (klein, ook zonder inloggen) vertelt of
  ffmpeg en yt-dlp op de machine staan. Ontbreekt ffmpeg, dan zegt de kaart: *zet het erop met
  `sudo apt-get install -y ffmpeg`*. Zonder dat gereedschap kan er geen geluid uit een opname worden gehaald.
- De schakelaar werkt met `POST /api/opname-auto` en hoort bij het beheerdersprofiel.

Getest met een echte opname: de proef in `test/opnameauto.test.js` zet een liedje met muziek neer en
wacht — zonder één knop in te drukken staan de akkoorden er binnen enkele seconden, met bron *opname*.

## [1.21.0] — 4 november 2026

### De akkoordherkenning werkt nu ook bij echte opnames

Tot nu toe gaf de analyse bij een gewone opname (met drums, zang en galm) overal **hetzelfde**
akkoord — bij een Kensington-nummer bijvoorbeeld 122 maten lang "Am7". Daar kwam de klacht vandaan dat
niet alle liedjes bladmuziek hadden: de herkenning kon de klank niet aan. Dat is nu anders:

- **De klankkleur wordt schoner gemaakt.** Bij echte muziek zit er in elke frame wel wat energie op elke
  toon, waardoor elk akkoord even goed lijkt te passen. De vloer gaat er nu af, zodat de pieken overblijven
  (de tonen die echt klinken).
- **Er wordt per tel beslist, niet per maat.** Een akkoord dat midden in de maat wisselt valt zo op, en één
  vieze tel verdwijnt in de meerderheid van de maat.
- **Het akkoord met de meeste tonen wint niet meer automatisch.** Er gaat juist vanaf als er klank buiten
  het akkoord zit, de grondtoon in de bas weegt zwaarder mee, en een septiem moet echt klinken om te
  winnen. Daardoor komt er een echte akkoordwisseling uit in plaats van één vierklank.
- **Zekerheid is nu de marge** tussen het beste en het op een na beste akkoord (met een andere grondtoon),
  in plaats van een ruwe score.
- **Is het resultaat onbruikbaar, dan zegt de app dat.** Eén akkoord voor de hele opname of te weinig
  zekerheid: dan blijft het voorstel staan en meldt de app *"In deze opname kon ik geen duidelijke
  akkoordwisselingen vinden (drums en zang maken het lastig)"*. Bij een goede uitkomst staat er nu ook de
  zekerheid en het aantal verschillende akkoorden bij.

Ook de maatindeling kiest nu duidelijker voor vier tellen: drie alleen als dat aantoonbaar beter dekt,
want in de praktijk won de wals te vaak bij popopnames.

Gemeten op een echte opname van de gebruiker (Kensington — All Before You, 3,7 minuut): eerst 122× hetzelfde
akkoord, nu negen verschillende in de toonaard C — de akkoordfamilie Am–F–C–G, 41% het meest voorkomend,
gemiddelde zekerheid 65%. Twee proeven bewaken dit: een mengsel van gitaar met basdrum, snare en ruisvloer
(minstens 60% van de maten goed) en gelijkmatige ruis (moet als onbruikbaar gelden).

## [1.20.0] — 4 november 2026

### Nieuw

- **Chromecast zoeken werkt nu ook zonder mDNS.** In een container of op een netwerk dat geen
  multicast doorlaat, vond de app geen enkel toestel terwijl het er wel was. De cast-hulp loopt nu,
  als het zoeken via mDNS niets oplevert, het eigen netwerk af: welk adres luistert op poort 8009.
  Van elk gevonden adres haalt hij de naam op (`eureka_info`). De pagina zegt erbij hoe er gezocht is
  ("gevonden met een netwerkscan in 192.168.1.x") en noemt dezelfde-wifi-valkuil; het IP-adres zelf
  intypen blijft ook werken.
- **De cast-hulp werkt zonder pychromecast.** Alleen het afspelen heeft pychromecast nodig; zoeken
  niet. Ontbreekt het pakket, dan vindt de app de toestellen tóch en zegt erbij wat je moet
  installeren (`python3 -m pip install --break-system-packages pychromecast`).
- **Te zien wat je browser van de microfoon vindt**: naast *Nog niet gestart* staat nu
  *Microfoon volgens je browser: toegestaan / geweigerd / nog niet gevraagd*, met een knop *Opnieuw
  vragen*. Zo zie je meteen of de browser überhaupt om toestemming is gevraagd — als Chrome de
  microfoon op systeemniveau weigert, staat er namelijk géén microfoon in het rechtenscherm van de
  site (alleen Meldingen), en dat is precies waar het dan misgaat. Met de knop *Rechten resetten* in
  datzelfde scherm vraagt Chrome het opnieuw.

## [1.19.0] — 4 november 2026

### Nieuw

- **Bijwerken vanuit de app werkt nu.** De dienst kent `UPDATE_SCRIPT` (`scripts/bijwerken-in-de-app.sh`)
  en dat script haalt het nieuwste archief van GitHub, controleert de nieuwe bestanden (`node --check`),
  maakt een reservekopie van de oude in je gegevensmap en legt de nieuwe code op hun plek. Daarna stopt
  de app en start systemd hem opnieuw op (`Restart=always`), zodat de nieuwe versie echt draait. De knop
  *Bijwerken* in de kaart *Beheer en bijwerken* wacht tot de app er weer is en zegt dan welke versie er
  draait. De database, de mediabibliotheek, je eigen liedjes, de bladmuziek en de handleiding blijven
  staan; alleen code en pagina's worden vervangen. Bijwerken vanuit een oudere installatie (zoals een
  versie van vóór deze) zet de dienstregel er zelf bij.
- **De versie staat nu ook in de kop van de app** (naast de cast-regel), zodat je meteen ziet welke versie
  er draait. Hij komt van het nieuwe, open adres `GET /api/versie` (versie, laatste aanpassing en het
  aantal liedjes).

### Gerepareerd

- **Een geblokkeerde microfoon legt de app nu uit wat je moet doen** in plaats van de rauwe melding van de
  browser ("Permission denied"). Bij *geen toegang* staat er welke stappen je zet: in de adresbalk op het
  slotje of tune-pictogram, *Machtigingen* of *Site-instellingen*, microfoon op *Toestaan*; op Android ook
  *Instellingen, Apps, Chrome, Machtigingen, Microfoon*. Er zijn eigen teksten voor: geen microfoon
  gevonden, microfoon bezet door een ander programma, instellingen die deze microfoon niet kan, en een
  adres dat geen https is. Dit geldt voor de stemmer, de ritme-trainer en het opnemen van jezelf.

## [1.18.1] — 4 november 2026

### De handleiding en de landingspagina gaan uit het openbare repo

- **De handleiding zit niet meer op GitHub** (`docs/handleiding.md`, `.html` en `.pdf`, de map
  `public/handleiding/` en `scripts/maak-handleiding.py`). Hij blijft wel werken in de app: die kijkt
  eerst in de gegevensmap (`/var/lib/akkoordkast/handleiding/`) en pas daarna in `public/handleiding/`.
  De bijwerker verhuist de handleiding bij het bijwerken naar die gegevensmap, zodat hij in de app
  blijft staan en niet verdwijnt als de bestanden uit de app-map gaan verdwijnen.
- **Het adres van de app staat nergens meer in het repo.** In de changelog staat nu "je eigen adres van
  de app" in plaats van het volledige adres.
- **De landingspagina (`docs/index.html`) is uit het repo** en **GitHub Pages staat uit**, zodat er geen
  site meer vanaf GitHub te vinden is.
- Een verse installatie krijgt de handleiding dus niet meer mee; hij staat wel in je eigen gegevensmap
  (of in de app, bij een bestaande installatie).

## [1.18.0] — 4 november 2026

### Nieuw

- **Bladmuziek uit de muziek halen voor alle liedjes tegelijk.** Een opgehaald nummer heeft de muziek er
  vaak wel bij (bij de 144 Kensington-nummers in de app: 128) maar nog geen akkoorden; die kregen tot nu
  een voorstel-schema. Per liedje kon de beheerder ze al uit de opname laten halen, één voor één. In het
  tabblad Toevoegen staat nu een kaart *Bladmuziek uit de muziek halen voor alle liedjes*: eerst kijken
  hoeveel liedjes muziek hebben zonder akkoorden, dan met één knop de hele ronde, met een teller (gedaan /
  totaal, en welk liedje nu). De akkoorden komen uit de opname zelf, krijgen bron `opname` en de kaart zegt
  erbij dat ze automatisch zijn en gecontroleerd moeten worden.
- Liedjes waar de akkoorden **al in de tekst** staan (zelf ingevoerd) blijven ongemoeid: die zijn al klaar.
- De ronde draait één liedje per keer met een korte pauze, zodat de app bruikbaar blijft, en is alleen voor
  de beheerder (de drie adressen weigeren zonder beheerderssessie).

## [1.17.2] — 4 november 2026

### Nieuw

- **De kaart zegt nu waar de akkoorden van een eigen liedje vandaan komen.** Zaten ze al in wat je zelf
  toevoegde (een geplakt schema, een eigen bestand of een opname waar ze bij zaten), dan staat er:
  *"De akkoorden van dit liedje zaten in wat je zelf hebt toegevoegd — de app zoekt zelf geen akkoorden
  van websites op."* Bij de meegeleverde liedjes blijft die regel weg, zodat de bibliotheek rustig
  blijft. Zo is meteen te zien dat bijvoorbeeld een eigen nummer met akkoorden in de tekst bij jou
  vandaan komt en niet uit de publiek-domeinverzameling.

## [1.17.1] — 4 november 2026

### Gerepareerd

- **Bij het opruimen stond er "Object [object Object]" in de regel onder de knoppen** in plaats van het
  aantal eigen liedjes. De kaart leest nu het juiste getal ("Dit is te vinden in 6 eigen liedje(s)
  naast 8701 meegeleverde liedjes").

### Nieuw in het repo

- **Rondleiding door de app** als filmpje: `docs/img/akkoordkast-2026.mp4` (1 min 19, 1280x720,
  Nederlandse voice-over, demo-gegevens), met een poster die ernaar linkt in de README. De schermen
  komen uit `filmpjes/akkoordkast-2026.json`; opnieuw maken met `scripts/maak-filmpje.py`.
- De beheerderstukken (gegevens aanpassen, opruimen, je eigen bladmuziek) staan met schermafbeeldingen
  in de README, plus het scherm dat laat zien dat een gewoon profiel die niet heeft.
- De landingspagina zei nog "26 gitaarlessen in vier delen" en "181 tests"; dat is nu 110 lessen in acht
  delen en 250 tests.

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
