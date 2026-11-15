// Showplan: hoe lang duurt het optreden? Van de liedjes van een setlist maakt de app een tijdlijn:
// per liedje een geschatte speeltijd, een praatje ertussen, en hoe laat elk liedje begint en klaar
// is. Dit bestand is puur rekenwerk — geen scherm, geen netwerk — zodat de app en de proeven
// dezelfde rekenkunde gebruiken.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.showplanRekenen = factory();
})(this, function () {
  'use strict';

  function twee(n) { return (n < 10 ? '0' : '') + n; }

  // Hoeveel zingbare regels staan er in de tekst? Opdrachtregels ({title: ...}, {soc}) en
  // commentaar tellen niet mee.
  function regelsVan(chordpro) {
    var regels = 0;
    String(chordpro || '').split(/\r?\n/).forEach(function (regel) {
      var r = regel.trim();
      if (!r) return;
      if (r[0] === '{' && r[r.length - 1] === '}') return;
      if (r[0] === '#' || r[0] === ';' || r.slice(0, 2) === '/*' || r.slice(0, 2) === '//') return;
      regels++;
    });
    return regels;
  }

  // Een schatting van hoe lang het liedje duurt als je het speelt: per regel vier maten (het
  // gebruikelijkste liedje-regelritme), plus een intro en een outro. Het tempo bepaalt de maatduur.
  // Weet de app niets van de tekst, dan gaan we van zestien regels uit. De uitkomst is een
  // schatting — in de app is elk getal aan te passen.
  function schatSeconden(chordpro, tempo) {
    var t = Number(tempo) || 84;
    var regels = regelsVan(chordpro);
    if (!regels) regels = 16;
    var seconden = (regels * 4 + 6) * 60 / t;
    if (seconden < 45) seconden = 45;
    if (seconden > 480) seconden = 480;
    return Math.round(seconden / 5) * 5;
  }

  // '20:00' → seconden na middernacht; onzin geeft null.
  function klokNaarSeconden(tekst) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(tekst == null ? '' : tekst).trim());
    if (!m) return null;
    var uur = Number(m[1]);
    var minuten = Number(m[2]);
    if (uur > 23 || minuten > 59) return null;
    return uur * 3600 + minuten * 60;
  }

  // Seconden na middernacht → '20:03'; loopt het over middernacht heen, dan komt er '(+1 dag)' bij.
  function secondenNaarKlok(seconden) {
    var rest = Math.max(0, Math.round(Number(seconden) || 0));
    var dagen = Math.floor(rest / 86400);
    rest -= dagen * 86400;
    var klok = Math.floor(rest / 3600) + ':' + twee(Math.floor((rest % 3600) / 60));
    return dagen > 0 ? klok + ' (+' + dagen + ' dag' + (dagen === 1 ? '' : 'en') + ')' : klok;
  }

  // 192 → '3:12'
  function minuutSeconde(seconden) {
    var rest = Math.max(0, Math.round(Number(seconden) || 0));
    return Math.floor(rest / 60) + ':' + twee(rest % 60);
  }

  // De tijdlijn: per liedje wanneer het begint en klaar is. Tussen twee liedjes zit het praatje
  // (niet ná het laatste — daarna ben je klaar).
  function maakTijdlijn(rijen, opties) {
    var o = opties || {};
    var start = Math.max(0, Math.round(Number(o.startSeconden) || 0));
    var praatje = Math.max(0, Math.round(Number(o.praatjeSeconden) || 0));
    var t = start;
    var uit = [];
    (rijen || []).forEach(function (r, i) {
      if (i > 0) t += praatje;
      var duur = Math.max(1, Math.round(Number(r.seconden) || 0));
      uit.push({ id: r.id, titel: r.titel, duur: duur, begintSeconden: t, klaarSeconden: t + duur });
      t += duur;
    });
    var gespeeld = uit.reduce(function (a, r) { return a + r.duur; }, 0);
    return {
      rijen: uit,
      startSeconden: start,
      eindSeconden: uit.length ? t : start,
      gespeeldSeconden: gespeeld,
      totaalSeconden: uit.length ? (t - start) : 0,
      praatjeSeconden: praatje
    };
  }

  return {
    regelsVan: regelsVan,
    schatSeconden: schatSeconden,
    klokNaarSeconden: klokNaarSeconden,
    secondenNaarKlok: secondenNaarKlok,
    minuutSeconde: minuutSeconde,
    maakTijdlijn: maakTijdlijn
  };
});
