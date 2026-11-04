# Wat er nog bij kan: kandidaten voor de liedjesverzameling

Dit overzicht hoort bij de vraag *"welke nummers kun je nog downloaden"*. Het bestaat uit twee delen:
een lijst met **bronnen** (met wat de bron zelf opgeeft, en of de app er iets mee kan) en een
**kandidatenlijst per lied** in `docs/kandidaten.csv`, zodat je kunt aanvinken wat je wel en niet wilt.

## 1. Waarom Kensington en Claudia de Breij geen bladmuziek hebben

Nagekeken in de draaiende app (versie 1.15.0, 8.701 liedjes):

- Van Kensington staan er **144** nummers in, allemaal opgehaald via een link, allemaal met muziek.
  Hun akkoorden staan op **"voorstel"**: de app heeft er zelf een schema bij bedacht in de toonaard van
  het liedje, omdat er geen echte akkoordenbron voor bestaat.
- Van Claudia de Breij staat *Mag ik dan bij jou* er ook, eveneens met een voorstel-schema.
- Een voorstel levert alleen een **akkoordenreeks** (voor het meespelen). De woorden hebben geen
  akkoorden boven de tekst, en juist dat is wat "bladmuziek" in deze app is. Daarom zie je geen
  muziekblad: er is geen akkoordregel om te tonen.
- En die akkoordregel **mag er ook niet komen van een website**: Kensington en Claudia de Breij zijn
  allebei nog onder de levenden en hun werk is auteursrechtelijk beschermd. Akkoordsites die het toch
  aanbieden (Ultimate Guitar, Chordify, Chordie) mogen we niet overnemen. Ze staan dan ook niet in de
  8.701 publiek-domeinliedjes, dus de automatische zoektocht in de eigen bibliotheek vindt ze niet.

Wat je er in de app wél mee kunt:

1. **Bladmuziek uit de muziek halen** (knop in de kaart van een liedje met muziek, alleen als beheerder).
   De app leest de opname uit en zet toonaard, tempo en een akkoord per maat neer. Bij studioregistraties
   gaat dat aardig; bij live-opnamen met veel publiek is het minder — het blijft een automatische gok,
   en de app zegt dat er ook bij.
2. **Gegevens aanpassen** (tabblad Toevoegen): zet de zanger netjes op *Kensington* in plaats van
   *Gedownload*, en titel, toonaard, tempo en maatsoort naar wens.
3. **Zelf de akkoorden erin zetten** via een eigen liedje — dan staat het er precies zoals jij het speelt.

## 2. Wat er nu in de app zit

- O'Neill's Music of Ireland — 2352
- Kerr's Merry Melodies — 1757
- Historische Engelse dansbundels — 1720
- Ryan's Mammoth Collection / Cole's 1000 Fiddle Tunes — 1030
- Nottingham Music Database — 971
- The Public Domain Song Anthology — 314
- Open Hymnal Project — 244
- Eric Conrad: historische muziekcollecties — 150
- Open Hymnal Project · — 83
- Public domain — 26

In totaal **8.701 liedjes**, waarvan **8.683** met een echt akkoordschema (de rest krijgt een voorstel).

## 3. Bronnen die er nog bij kunnen (met wat de bron zelf opgeeft)

**Direct bruikbaar, met akkoorden of melodie in tekstvorm**

- **Our Daily Guide / Open Hymnal Project / PDHymns** — **8.428 gezangen, allemaal publiek domein**, met
  bladmuziek. Hier zit de grootste winst voor gezongen liedjes: onze 327 uit de Open Hymnal zijn een
  deelverzameling. Engelstalig.
- **abcnotation.com** — **circa 800.000 tot 830.000 traditionele deuntjes** uit 150 collecties. Alleen de
  collecties met publiek-domein- of CC-licentie mogen mee; vijf van de grootste zitten er al in
  (O'Neill's, Kerr's, Nottingham, Ryan's/Cole's, de Engelse dansbundels). Vooral instrumentaal: de app
  leidt uit de melodie zelf een akkoordschema af.
- **Wikifonia** — **6.675 lead sheets** (akkoorden plus melodie, jazz/folk/standards). De site bestaat
  niet meer; het archief zwerft rond en de licentie is per lied niet meer na te gaan, dus alleen
  bruikbaar als iets aantoonbaar publiek domein is.

**Bruikbaar als bladmuziek, maar zonder akkoordschema's**

- **IMSLP (Petrucci Music Library)** — **261.000 werken, 880.000 partituren**, publiek domein, maar
  klassiek en grotendeels scans. Niet iets voor een akkoorden-app.
- **MuseScore.com** — **1,3 miljoen scores** gratis te bekijken; alleen het deel dat als publiek domein
  staat gemarkeerd is vrij te gebruiken. De rest is juist voor hun platform gelicentieerd.
- **Hymnary.org** — **circa 1.030.000 liedvermeldingen, 188.000 teksten, ~12.000 melodieën, 2.658
  partituren**; licentie per lied.

**Als vindplaats voor Nederlandstalig werk**

- **Nederlandse Liederenbank (Meertens Instituut)** — **ruim 180.000 liederen**, van de Middeleeuwen tot
  nu, inclusief sinterklaas-, kinder- en volksliedjes. Vooral tekst- en melodieverwijzingen, **geen
  akkoorden**, en de licentie verschilt per lied. Wel de beste plek om teksten op te sporen die daarna
  publiek domein blijken.

**Valt af (auteursrechtelijk beschermd)**

- Ultimate Guitar, Chordify, Chordie, thesession.org, de gelicentieerde MuseScore-scores. Daar staan
  miljoenen akkoordschema's, maar die mogen niet in de app — dat blijft de staande regel.

## 4. De kandidatenlijst per lied

`docs/kandidaten.csv` bevat **152 Nederlandstalige liedjes** uit drie groepen: sinterklaasliedjes,
kinderliedjes en kerstliedjes, met per regel de bron, of het al in de app zit, en de beoordeling.

- Kolom **al_in_de_app**: 7 van de 152 staan er al (die vallen dus af).
- Kolom **beoordeling**: per lied moet nog nagekeken worden of de schrijver vóór 1 januari 1956 is
  overleden; alleen dan mag het in de app. Twee regels zijn al duidelijk beschermd (modern) en vallen af.
- Hoe je kiest: zet in de kolom **keuze** *ja* of *nee* achter de liedjes die je wilt, of stuur me een
  lijstje met titels. Ik controleer dan per lied de datering en zet ze in de app, in het Nederlands en
  met de bron erbij.

De grootste lijst met namen (die 8.428 gezangen) heb ik nog niet uitgewerkt: de bron laat zich niet in
één keer uitlezen. Wil je die erbij, dan haal ik de volledige titellijst in een aparte ronde op.
