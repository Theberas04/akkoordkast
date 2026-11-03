# Wat er veranderd is

Alles wat de app in huis heeft staat in de [README](README.md); hier staat per versie wat er
nieuw is, wat er veranderd is en wat er gerepareerd is.

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
