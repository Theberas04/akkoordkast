# Opdracht: liedjes-dataset schrijven

Doelbestand: `/home/hermes/akkoordkast/song-data/liedjes.json`

Dit is de seed-dataset van een gitaar-songbook-app. De app parseert ChordPro zelf.
De akkoorddiagram-bibliotheek van de app kent precies de akkoorden uit de whitelist
hieronder; een akkoord buiten die lijst krijgt geen diagram, dus gebruik nooit een
ander akkoordtype (geen slash-akkoorden, geen sus/add/9-varianten).

## Exact JSON-formaat

Een JSON-array, UTF-8, geen commentaar, geen trailing komma's:

```
[
  {
    "titel": "Amazing Grace",
    "artiest": "John Newton (1779)",
    "taal": "en",
    "genre": "Folk",
    "moeilijkheid": 2,
    "toonsoort": "G",
    "tempo": 84,
    "strum": "D DU UDU",
    "bron": "Public domain (John Newton, 1779)",
    "chordpro": "{title: Amazing Grace}\n{key: G}\n\n{soc}\n[G]Amazing grace, how [C]sweet the [G]sound\n{eoc}\n"
  }
]
```

### Velden

- `titel` — string, gebruikelijke Nederlandse titel bij Nederlandstalige liedjes, anders origineel.
- `artiest` — componist/auteur + jaar, of "Traditioneel".
- `taal` — "nl", "en", "de" of "af".
- `genre` — een van: Folk, Kerst, Sinterklaas, Kinderlied, Volkslied, Blues, Ballad, Country.
- `moeilijkheid` — integer 1-5 (1 = alleen C, G, Am, F; 5 = barre-akkoorden en snelle wissels).
- `toonsoort` — concert-toonsoort, bv. "G", "Am", "D", "C".
- `tempo` — integer BPM 60-160, realistisch voor het nummer.
- `strum` — slagpatroon met D (down) en U (up), bv. "D D U U D U".
- `bron` — korte licentietekst met auteur/jaar, bv. "Public domain (trad., 19e eeuw)".
- `chordpro` — de volledige tekst met akkoorden tussen rechte haken direct voor de
  lettergreep waar ze vallen.

### ChordPro-conventies in het `chordpro`-veld

- Regels mogen beginnen met richtlijnen tussen accolades: `title:`, `key:`, `tempo:`.
- Secties: openings-accolade `soc` ... sluitings-accolade `eoc` rond een refrein;
  een bloklabel met `comment: Brug` of `comment: Couplet 2`.
- Akkoorden tussen rechte haken direct voor de lettergreep:
  `[G]Amazing grace, how [C]sweet the [G]sound`.
- Instrumentale stukken: blok tussen de accolades `sot` en `eot`, met per regel
  6 fretnummers gescheiden door spaties (`x` = niet aanslaan), bv. `3 2 0 0 0 3`.
- Elke tekstregel eindigt met `\n`.

## Akkoorden-whitelist (uitsluitend deze)

C, C7, Cm, Cmaj7, D, D7, Dm, Dm7, E, E7, Em, Em7, F, F7, Fm, Fmaj7, G, G7, Gm,
A, A7, Am, Am7, Bb, B7, Bm

## Inhoud: 26 liedjes, allemaal publiek domein

Geen auteursrechtelijk beschermde popmuziek (geen Beatles, geen Hazes, geen
Blowin' in the Wind, niets van na ~1928 behalve traditioneel volksgoed).

- 8 Nederlandstalige traditionele liedjes (Kinderlied, Sinterklaas of Volkslied):
  Sinterklaas kapoentje, Zie de maan schijnt door de bomen, O dennenboom,
  Twee emmertjes water halen, Op een grote paddenstoel, De zilvervloot,
  In een groen knollenland, Daar was laatst een meisje loos,
  Altijd is Kortjakje ziek, Slaap kindje slaap, Hansje Pansje Kevertje, Zagen zagen.
- 6 Nederlandstalige kerstliedjes: Er is een kindeke geboren op aard,
  De herdertjes lagen bij nachte, Hoe leit dit kindeke, Stille nacht,
  Nu zijt wellekome, Komt allen tezamen.
- 1 Nederlandstalig volkslied: Het Wilhelmus (eerste couplet volstaat).
- 6 Engelstalige publiek-domein liedjes (kies er 6): Amazing Grace,
  House of the Rising Sun, Greensleeves, Scarborough Fair, Auld Lang Syne,
  Oh! Susanna, Camptown Races, Down by the Riverside, When the Saints Go
  Marching In, Shenandoah, Danny Boy, Jingle Bells, Silent Night,
  We Wish You a Merry Christmas, Deck the Halls.
- 2 Afrikaanstalige traditionele liedjes: Siembamba, Jan Pierewiet.
- 3 instrumentale/klassieke stukken met tab: Spanish Romance (Romanza),
  een tremolo-oefening, Greensleeves (instrumentaal).

## Kwaliteit

Gebruik de echte, bekende melodie-akkoorden; de toonsoort moet kloppen met de
akkoorden in de tekst. Minimaal twee coupletten plus het refrein (kinderliedjes
mogen het hele liedje zijn). Nederlands correct gespeld. Minimaal 12 regels
ChordPro per liedje.

## Verplichte validatie (laat de output zien)

1. `python3 -c "import json;d=json.load(open('/home/hermes/akkoordkast/song-data/liedjes.json'));print(len(d))"` -> 26
2. Een Python-check die:
   - alle akkoord-tokens vindt met `re.findall(r'\[([^\[\]{}]+)\]', chordpro)`,
   - controleert dat elk token in de whitelist staat,
   - controleert dat het eerste akkoord past bij de `toonsoort`-familie,
   - controleert dat elk liedje minstens 12 regels ChordPro heeft.
3. Print per liedje: titel, taal, moeilijkheid, gevonden akkoorden, aantal regels.

Los elke fout op voordat je klaar bent.