// Weetje van de dag: een klein weetje over gitaarspelen, muziektheorie en liedjes — elke dag een
// andere, zonder internet. De keuze is eerlijk verdeeld: de dag bepaalt welk weetje je ziet (dezelfde
// dag dus hetzelfde weetje), en met "Nog een weetje" schuif je door de lijst. Dit bestand is puur
// rekenwerk (en de weetjes zelf), zodat de app en de proeven hetzelfde gebruiken.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.weetjesRekenen = factory();
})(this, function () {
  'use strict';

  var WEETJES = [
    "De standaardstemming is van laag naar hoog E-A-D-G-B-E. Tussen G en B zit een halve toon minder dan tussen de andere snaren; daarom voelt een B-akkoord anders dan de rest.",
    "Een capo verhoogt de toonhoogte zonder dat je nieuwe grepen hoeft te leren: alle vormen schuiven gewoon mee omhoog met de klem.",
    "Acht vakjes verder op dezelfde snaar is precies een octaaf hoger. Dat patroon is op elke snaar hetzelfde, van de dikste tot de dunste.",
    "Een barré-akkoord bestaat omdat je met één vinger alle snaren tegelijk indrukt; zo speel je in elke toonsoort dezelfde vorm.",
    "Hoe dikker de snaar, hoe lager de toon. Een dikke E-snaar trilt ongeveer 82 keer per seconde; dat is dus de toon E2.",
    "Nieuwe snaren klinken helderder maar raken sneller vals; oude snaren klinken dof maar blijven langer op stemming. Ook daarom klinkt een gitaar nooit twee dagen hetzelfde.",
    "De toets van een gitaar is meestal van palissander of ebbenhout: harde houtsoorten die tegen de wrijving van snaren kunnen.",
    "De kam van de gitaar geeft de snaar zijn trillingslengte door; verschuif je hem een stukje, dan verandert de hele stemming.",
    "Een plectrum van 0,6 millimeter buigt mee en klinkt zacht; eentje van 1 millimeter geeft een harde, duidelijke tik.",
    "De akoestische gitaar zoals wij die kennen kreeg zijn vorm in de negentiende eeuw, in Spanje, bij bouwers als Torres.",
    "Een gitaar met stalen snaren klinkt feller dan eentje met nylon snaren; klassieke gitaren gebruiken nylon, volksmuziek meestal staal.",
    "Je gitaar stemmen hoeft niet perfect te zijn voor je begint: een beetje vals is beter dan een snaar die helemaal verkeerd staat. Stem daarna nog eens na.",
    "Een akkoord heet majeur of mineur door één noot: de terts. Alle andere noten kunnen hetzelfde blijven en toch klinkt het verdrietig of vrolijk.",
    "De kwintencirkel rangschikt alle toonsoorten zó dat buren erin maar één noot verschillen. Handig als je een liedje wilt omzetten.",
    "Er zijn twaalf verschillende noten in de westerse muziek; na twaalf halve tonen begint het patroon weer, een octaaf hoger of lager.",
    "Het kruisje (#) verhoogt een noot een halve toon, de mol (b) verlaagt hem een halve toon. Eén toets op de piano kan dus twee namen hebben.",
    "C, F en G zijn de drie grote pijlers van duizenden volksliedjes: zonder die akkoorden kom je in de gewone toonsoorten bijna nergens.",
    "Het zeven-akkoord (zoals G7) voegt een vierde noot toe en vraagt om een oplossing; daarom eindigt een liedje er graag mee.",
    "Een mineurtoonladder klinkt vaak droeviger, maar dat is deels gewoonte: in andere muziekculturen klinkt een andere ladder vrolijk.",
    "Bladmuziek met akkoorden boven de woorden heet een akkoordblad; de app bewaart ze in het ChordPro-formaat, dat je ook in andere apps kunt openen.",
    "Transponeren is alle akkoorden met dezelfde stappen verschuiven; een liedje een kwartje hoger zetten is vaak al genoeg om het zingbaar te maken.",
    "Een toonsoort kiezen die bij je stem past is belangrijker dan de 'echte' toonsoort van een liedje; de beste toonsoort is de jouwe.",
    "Het woord akkoord komt van het Latijnse 'accordare': overeenstemmen. Noten die samen klinken als een akkoord zijn het dus letterlijk met elkaar eens.",
    "Sommige akkoorden klinken 'open' als je snaren laat meeklinken die je niet aanraakt. Dat heet open stemming en het is een trucje van veel folkgitaristen.",
    "Het tempo wordt gemeten in BPM: tellen per minuut. Bij 60 BPM is elke tel precies één seconde, dus dan kun je meedelen met de klok.",
    "Een maat van vier tellen is de gewoonste maat in de westerse muziek, maar walsen staan in drie en veel volksliedjes verrassen je met een andere maat.",
    "Een metronoom bestaat in zijn bekende vorm sinds rond 1815; daarvoor tikten componisten met de voet of hielden ze het tempo in hun hoofd.",
    "Rust is ook muziek: tussen twee frases hoort stilte. Wie alles aan elkaar speelt, verliest het gevoel van het liedje.",
    "Langzaam oefenen werkt beter dan snel: je spieren onthouden de fouten die je onder haast maakt het diepst.",
    "Drie keer twintig minuten oefenen met pauze levert meer op dan een uur doorploeteren: je hoofd verwerkt het spel vooral tijdens de pauzes.",
    "Begin met het moeilijkste stukje van een liedje, niet met het eerste. Wat je het eerst oefent, onthoud je het best.",
    "Een fout die je vaker maakt, is een oefening geworden. Doe het stukje dan langzamer tot het wél lukt, en bouw pas daarna tempo op.",
    "Warmspelen is geen bijgeloof: koude vingers zijn minder precies en raken sneller vermoeid dan warme.",
    "Je pink is geen reservevinger: wie hem vanaf het begin meetraint, krijgt later de makkelijkste akkoorden cadeau.",
    "Voor een barré-akkoord duw je vlak bij het fretje met de zijkant van je wijsvinger; dat kost minder kracht dan in het midden van het vakje.",
    "Wisselen tussen twee akkoorden oefen je los, zonder slaan: eerst komen de vingers aan, dan pas het ritme.",
    "Stoppen met oefenen op een goed moment — als het net lukt — maakt dat je de volgende keer makkelijker verdergaat.",
    "Een liedje uit je hoofd leren gaat sneller als je het onderweg zingt; je gehoor en je vingers leren dan hetzelfde liedje langs twee wegen.",
    "Schrijven helpt: wie zijn oefenplan opschrijft, oefent thuis vaker dan wie het 'in zijn hoofd' plant.",
    "Zingen tijdens het spelen is een vaardigheid apart. Begin met zingen op één toon over één akkoord; de rest komt daarna.",
    "Je gehoor went snel aan een toonsoort; wie een liedje een paar keer heeft gezongen, hoort 'm daarna in die toonsoort als 'de juiste'.",
    "Twee noten die samen één klank lijken te vormen, 'zweven' een beetje als ze nét niet zuiver zijn. Dat is de reden dat een gitaar nét niet valt te stemmen voor iedereen.",
    "Een liedje naspelen op gehoor begint met het vinden van de laagste noot van de melodie; de rest zoek je van daaruit.",
    "Fluisteren kun je niet vals: zingen wel. Wie vals zingt, hoort het verschil meestal wél maar kan het nog niet aansturen — oefenen helpt echt.",
    "Een koptelefoon op één oor is het geheim van oefenen met een opname: met twee oren hoor je jezelf niet meer.",
    "Sinterklaas kapoentje is een van de oudste liedjes in het liedboek; de melodie gaat al eeuwen van mond tot mond.",
    "Van 'Zie de maan schijnt door de bomen' bestaan meerdere teksten; kinderliedjes wisselden vroeger van woorden zoals ze van dorp naar dorp gingen.",
    "Veel Limburgse liedjes zijn nooit opgeschreven en leefden alleen in het geheugen van zangers; de app bewaart ze als bladmuziek voordat ze verdwijnen.",
    "Het Limburgs is officieel erkend als streektaal; liedjes in het Limburgs horen daarom gewoon in een Nederlands liedboek.",
    "Een volksliedje heeft geen eigenaar: niemand weet precies wie het bedacht. Daarom mag iedereen het zingen en veranderen — en dat is precies wat er gebeurde.",
    "'Twee emmertjes water halen' is van oorsprong een dansliedje: kinderen beeldden de emmers uit, en het liedje hield het tempo van het spel.",
    "Er was eens een tijd dat liedjes alleen bestonden zolang iemand ze zong; het oudste lied dat we kennen is zo'n vierduizend jaar oud.",
    "Voor de boekdrukkunst werden liedjes verspreid op losse blaadjes: 'vliegende blaadjes' heetten die, en ze waren de eerste liedboekjes.",
    "Het woord 'wijs' in 'een wijsje' komt van hetzelfde woord als weten: een wijs is een melodie die je kent zonder hem op te schrijven.",
    "Muzieknoten zoals wij ze kennen zijn rond het jaar 1000 bedacht door een Italiaanse monnik, Guido van Arezzo, om zijn koor sneller te leren.",
    "Het liedboek van de app groeit nog: elke nieuwe bron met een schone licentie en Nederlandstalige liedjes is welkom.",
    "Er zijn liedjes die twee toonsoorten tegelijk lijken te hebben — ze schommelen tussen majeur en mineur. Dat is geen fout maar een stijl.",
    "Handklappen op de tweede en vierde tel van een maat heet de backbeat; die gewoonte is de motor onder popmuziek en rock.",
    "Zingen kalmeert: bij zingen komt hetzelfde systeem in je lijf in beweging als bij diep ademhalen. Daarom voelt meezingen in de auto zo goed.",
    "Gitaarspelen traint je vingers en je gehoor tegelijk; dat is een van de weinige bezigheden waarbij fijn motoriek en muziek samenvallen.",
    "Mensen kunnen van muziek een 'rilling' krijgen doordat het brein voorspelt wat er aankomt; op het moment dat het klopt, ontspant het zich.",
    "Een liedje dat je niet kent, onthoud je slechter dan een liedje waarvan je de melodie al ergens hebt gehoord. Bekendheid is een oefenhulp.",
    "Samen muziek maken maakt mensen vrijer tegenover elkaar: wie samen heeft gezongen, durft daarna makkelijker iets nieuws.",
    "Kinderen leren een liedje sneller met beweging erbij dan met woorden alleen; volwassenen eigenlijk ook.",
    "Op een snaar trillen naast de kam ook kleine boventonen mee; die maken dat dezelfde noot op twee snaren tóch anders klinkt.",
    "Een aanraking precies boven het twaalfde fretje geeft een fluitend geluid: dan telt het trillende stuk snaar de helft, een zuiver octaaf.",
    "Stilte voor een liedje werkt: een paar tellen niets voordat je begint maakt dat het publiek meegaat ademen.",
    "Podiumtip: neem voor je begint één diepe ademhaling en noem het tempo in je hoofd. Wie het tempo inzet, houdt het vast.",
    "De beste plek voor een songtekst is niet je hoofd maar je ooghoek: een vel op de grond naast je stoel leest rustiger dan onthouden onder spanning.",
    "Een liedje helemaal foutloos hoeft niet: het publiek hoort het gevoel, niet de noten. Zeker bij de derde chorus zing je met ze mee.",
    "Als je vingers vastlopen, is de greep nog niet klaar: oefen hem dan los van het liedje tot hij vanzelf gaat, en zet hem pas daarna terug.",
    "Hoe vaker je een liedje speelt, hoe minder je hoeft te kijken — het brein schuift het naar je vingers toe. Dat gaat vanzelf als je geduldig blijft.",
    "Er is geen verkeerde eerste gitaar: elke gitaar die je pakt is de beste. De beste gitaar is degene die elke dag uit zijn hoes komt."
  ];

  function twee(n) { return (n < 10 ? '0' : '') + n; }

  // De dag als één getal (sinds 1970), zodat elke dag een eigen weetje krijgt.
  function dagNummer(jaar, maand, dag) {
    return Math.floor(Date.UTC(jaar, maand - 1, dag) / 86400000);
  }

  // Welk weetje hoort bij deze dag? Dezelfde dag geeft hetzelfde weetje; de verspringing schuift
  // door de lijst als je op "Nog een weetje" drukt.
  function weetjeVanDag(jaar, maand, dag, verspringing) {
    var n = dagNummer(jaar, maand, dag) + (Math.round(Number(verspringing) || 0) % WEETJES.length);
    n = ((n % WEETJES.length) + WEETJES.length) % WEETJES.length;
    return { index: n, tekst: WEETJES[n], totaal: WEETJES.length };
  }

  return { WEETJES: WEETJES, dagNummer: dagNummer, weetjeVanDag: weetjeVanDag };
});
