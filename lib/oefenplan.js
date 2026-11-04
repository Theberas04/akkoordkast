// De rekenkant van het oefenplan: uit een doel (een liedje met akkoorden) en een paar wensen
// van de speler een compleet plan bouwen van weken met taken. Puur rekenwerk, zodat het te
// testen is zonder scherm. De pagina haalt de invoer op uit de app en laat het plan zien; hier
// staat alleen het rekenen.
//
// Let op: dit bestand draait ook als gewoon script in de pagina, naast de code van de app zelf.
// Alles staat daarom in een eigen afsluiting. De app heeft zelf al een eigen OEFENPLAN of iets
// dergelijks, en een tweede aangifte op het hoogste niveau laat het hele bestand stuklopen.
(function (root) {
'use strict';

// De soorten taken die een plan kent. Een taak noemt altijd precies één van deze soorten.
var SOORTEN = ['grepen', 'overgang', 'liedje', 'les', 'ritme', 'tempo', 'herhalen'];

// De delen van een liedje die per week aan bod komen bij de taak 'liedje'.
var WEEKDELEN = ['het eerste couplet', 'het refrein', 'couplet en refrein aan elkaar'];

// Een geheel getal, en niet iets als 2,5 of 'zes'. Zo blijft het plan heel.
function isGeheelGetal(x) {
  return typeof x === 'number' && isFinite(x) && Math.floor(x) === x;
}

// Een nieuwe taak. De minuten worden later verdeeld, dus die beginnen op nul.
function taak(soort, titel) {
  return { soort: soort, titel: titel, minuten: 0, klaar: false };
}

// Alle overgangen van een akkoordenlijst: elk aangrenzend paar, en het paar van de laatste
// terug naar de eerste. Zo oefent de speler het liedje rond, niet alleen van voor naar achter.
// Bij minder dan twee akkoorden valt er niets over te gaan.
function overgangenVan(akkoorden) {
  var paren = [];
  if (!akkoorden || akkoorden.length < 2) return paren;
  var i;
  for (i = 0; i + 1 < akkoorden.length; i++) {
    paren.push([akkoorden[i], akkoorden[i + 1]]);
  }
  paren.push([akkoorden[akkoorden.length - 1], akkoorden[0]]);
  return paren;
}

// De minuten eerlijk over de taken verdelen: iedere taak krijgt evenveel, en wat overblijft
// gaat naar de eerste taken. De som is dan precies het weektotaal en alles blijft heel.
function verdeel(taken, totaal) {
  var n = taken.length;
  if (!n) return taken;
  var basis = Math.floor(totaal / n);
  var rest = totaal - basis * n;
  var i;
  for (i = 0; i < n; i++) {
    taken[i].minuten = basis + (i < rest ? 1 : 0);
  }
  return taken;
}

function maakPlan(invoer) {
  invoer = invoer || {};
  var doel = invoer.doel;
  if (!doel || typeof doel.titel !== 'string' || !doel.titel) {
    throw new Error('Geen titel van het doel opgegeven');
  }
  var wekenAantal = invoer.weken;
  if (!isGeheelGetal(wekenAantal) || wekenAantal < 1) {
    throw new Error('Het aantal weken moet een geheel getal van minstens 1 zijn');
  }

  var minutenPerDag = (isGeheelGetal(invoer.minutenPerDag) && invoer.minutenPerDag > 0)
    ? invoer.minutenPerDag : 20;
  var perWeek = (isGeheelGetal(invoer.perWeek) && invoer.perWeek > 0)
    ? invoer.perWeek : 5;
  var akkoorden = (doel.akkoorden && doel.akkoorden.length) ? doel.akkoorden.slice() : [];
  var lessen = (invoer.lessen && invoer.lessen.length) ? invoer.lessen : [];

  var perWeeekMinuten = perWeek * minutenPerDag;
  var totaalMinuten = wekenAantal * perWeeekMinuten;

  var paren = overgangenVan(akkoorden);
  var lessenIdx = 0;
  var deelIdx = 0;

  // De soorten die in de middelste weken voorop mogen staan. Ze wisselen elkaar af, zodat geen
  // twee weken achter elkaar hetzelfde beginnen. De overgang staat vooraan omdat de overgangen
  // van het liedje er in een kort plan anders misschien niet aan toe komen.
  var primaireSoorten = [];
  if (paren.length) primaireSoorten.push('overgang');
  primaireSoorten.push('ritme');
  primaireSoorten.push('liedje');

  var RITMETITEL = 'Ritme: het slagpatroon van het liedje op het tempo van de muziek';

  // Alle overgangstaken in één keer opbouwen voor een week die op overgangen begint.
  function maakOvergangStaken() {
    var uit = [];
    var j;
    for (j = 0; j < paren.length; j++) {
      uit.push(taak('overgang', 'De overgang ' + paren[j][0] + ' naar ' + paren[j][1] +
        ', langzaam en gelijkmatig'));
    }
    return uit;
  }

  // De volgende les uit de lijst, in volgorde. Als de lessen op zijn valt de taak weg.
  function neemLes() {
    if (lessenIdx < lessen.length && lessen[lessenIdx] && lessen[lessenIdx].titel) {
      var lestitel = lessen[lessenIdx].titel;
      lessenIdx++;
      return taak('les', 'Les: ' + lestitel);
    }
    return null;
  }

  // Een volgend deel van het liedje voor de taak 'liedje', zodat de weken van elkaar verschillen.
  function neemLiedjeDeel() {
    var deel = WEEKDELEN[deelIdx % WEEKDELEN.length];
    deelIdx++;
    return taak('liedje', 'Het liedje: ' + deel);
  }

  var weken = [];
  var i;
  for (i = 0; i < wekenAantal; i++) {
    var nummer = i + 1;
    var isEerste = (i === 0);
    var isLaatste = (i === wekenAantal - 1);
    var taken = [];
    var titel;

    if (isEerste && isLaatste) {
      // Eén week: die ene week moet alles leren, dus grepen, overgangen en de afsluiting.
      if (akkoorden.length) taken.push(taak('grepen', 'De grepen van het liedje: ' + akkoorden.join(', ')));
      taken = taken.concat(maakOvergangStaken());
      taken.push(neemLiedjeDeel());
      var lesEen = neemLes();
      if (lesEen) taken.push(lesEen);
      taken.push(taak('tempo', 'Het hele liedje op tempo spelen'));
      taken.push(taak('herhalen', 'Het hele liedje twee keer achter elkaar, zonder stoppen'));
      titel = 'Alles onder de knie krijgen';
    } else if (isEerste) {
      // Week een: de grepen leren kennen, het liedje rustig doorlopen, en de eerste les.
      if (akkoorden.length) taken.push(taak('grepen', 'De grepen van het liedje: ' + akkoorden.join(', ')));
      taken.push(taak('liedje', 'Het liedje rustig helemaal doorlopen, zonder tempo'));
      var lesTwee = neemLes();
      if (lesTwee) taken.push(lesTwee);
      if (taken.length < 2) taken.push(taak('ritme', RITMETITEL));
      titel = akkoorden.length ? 'De grepen kennen' : 'Het liedje leren kennen';
    } else if (isLaatste) {
      // De laatste week: het liedje op tempo, en dan nog eens achter elkaar zonder stoppen.
      taken.push(taak('tempo', 'Het hele liedje op tempo spelen'));
      taken.push(taak('herhalen', 'Het hele liedje twee keer achter elkaar, zonder stoppen'));
      var lesDrie = neemLes();
      if (lesDrie) taken.push(lesDrie);
      titel = 'Alles op tempo krijgen';
    } else {
      // De middelste weken: steeds iets anders voorop.
      var midden = i - 1;
      var primair = primaireSoorten[midden % primaireSoorten.length];
      if (primair === 'overgang') {
        taken = taken.concat(maakOvergangStaken());
        taken.push(neemLiedjeDeel());
        titel = 'De overgangen soepel maken';
      } else if (primair === 'ritme') {
        taken.push(taak('ritme', RITMETITEL));
        taken.push(neemLiedjeDeel());
        titel = 'Het ritme erin krijgen';
      } else {
        taken.push(neemLiedjeDeel());
        taken.push(taak('ritme', RITMETITEL));
        titel = 'Delen van het liedje aan elkaar plakken';
      }
      var lesVier = neemLes();
      if (lesVier) taken.push(lesVier);
    }

    // Een week heeft altijd minstens twee taken; anders valt er niets te kiezen.
    if (taken.length < 2) taken.push(taak('herhalen', 'Het liedje rustig nog een keer doorspelen'));

    verdeel(taken, perWeeekMinuten);

    weken.push({
      nummer: nummer,
      van: 'Week ' + nummer,
      tot: 'Week ' + nummer,
      titel: titel,
      minuten: perWeeekMinuten,
      taken: taken
    });
  }

  // Veiligheidsnet: in een heel kort plan (twee weken) zijn er geen middelste weken, en dan
  // zouden de overgangen van het liedje nergens staan. Zet ze dan bij week een.
  if (paren.length) {
    var heeftOvergang = false;
    for (i = 0; i < weken.length && !heeftOvergang; i++) {
      var k;
      for (k = 0; k < weken[i].taken.length; k++) {
        if (weken[i].taken[k].soort === 'overgang') { heeftOvergang = true; break; }
      }
    }
    if (!heeftOvergang) {
      var extra = maakOvergangStaken();
      var nieuw = weken[0].taken.concat(extra);
      verdeel(nieuw, perWeeekMinuten);
      weken[0].taken = nieuw;
    }
  }

  return {
    titel: 'Oefenplan voor ' + doel.titel,
    totaalMinuten: totaalMinuten,
    weken: weken
  };
}

var reken = {
  SOORTEN: SOORTEN,
  maakPlan: maakPlan
};

if (typeof module !== 'undefined' && module.exports) module.exports = reken;
if (root) root.oefenplanRekenen = reken;

})(typeof window !== 'undefined' ? window : null);
