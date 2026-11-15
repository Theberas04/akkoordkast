// Offline-setlist: een setlist op een podium zonder internet. Welke adressen moet dit toestel
// bewaren, hoe groot is dat samen, en hoe komt de app er weer aan als er geen verbinding is?
// Puur rekenwerk — de app zet de voorraad klaar (Cache Storage), de service worker deelt hem
// uit, en allebei gebruiken ze dezelfde keuzes als hier staan.
(function (root) {
  'use strict';

  var CACHE = 'akkoordkast-offline';
  var META_PREFIX = 'akkoordkast-offline-setlist-';
  // Het hele liedboek krijgt een eigen, niet-numerieke sleutel naast de setlist-nummers.
  var BOEK_ID = 'boek';

  // Hoe leveren we dit adres uit?
  //  'cache-eerst'   – muziek en beelden die niet veranderen: eerst de bewaarde versie, anders pas
  //                    het netwerk. Scheelt op een podium megabytes en werkt zonder verbinding.
  //  'netwerk-eerst' – kleine gegevens die vers moeten blijven (liedjes, setlists, meespelen):
  //                    eerst het netwerk, en pas als dat niet lukt de bewaarde versie.
  //  null            – gewoon gedrag (schil-cache of live), hier hoort niets bijzonders bij.
  function politiekVoor(pad) {
    var p = String(pad || '');
    if (p.indexOf('/api/audio/preview') === 0) return 'cache-eerst';
    if (p.indexOf('/api/meespelen/audio') === 0) return 'cache-eerst';
    if (p.indexOf('/api/muziek/bestand') === 0) return 'cache-eerst';
    if (p.indexOf('/media/') === 0) return 'cache-eerst';
    if (p === '/api/liedjes') return 'netwerk-eerst';   // de liedlijst van de Liedjes-tab
    if (/^\/api\/liedjes\/\d+$/.test(p)) return 'netwerk-eerst';
    if (/^\/api\/liedjes\/\d+\/eigen-blad$/.test(p)) return 'netwerk-eerst';
    if (p.indexOf('/api/meespelen') === 0) return 'netwerk-eerst';
    if (/^\/api\/setlists$/.test(p)) return 'netwerk-eerst';
    if (/^\/api\/setlists\/\d+$/.test(p)) return 'netwerk-eerst';
    if (/^\/api\/setlists\/\d+\/overgangen$/.test(p)) return 'netwerk-eerst';
    if (/^\/api\/profielen$/.test(p)) return 'netwerk-eerst';
    if (p === '/api/versie') return 'netwerk-eerst';
    return null;
  }

  // De liedkaart vraagt de app precies zó op (met een lege vraag, zodat openLiedje altijd
  // hetzelfde adres gebruikt).
  function liedjeUrl(id) { return '/api/liedjes/' + Number(id) + '?'; }

  // De meespeelvraag zoals de app hem standaard stelt: tempo op 100%, aftellen aan, klik uit.
  function meespeelParams(lied) {
    var p = new URLSearchParams();
    p.set('liedje', lied.id);
    p.set('capo', lied.capo);
    p.set('transpose', lied.transpositie || 0);
    p.set('tempo', Math.round(Number(lied.tempo) || 0));
    p.set('aftellen', '1');
    p.set('klik', '0');
    return p;
  }
  function meespeelUrl(lied) { return '/api/meespelen?' + meespeelParams(lied).toString(); }
  function meespeelAudioUrl(lied) { return '/api/meespelen/audio?' + meespeelParams(lied).toString(); }

  // Alles wat dit toestel voor één liedje nodig heeft om het zonder internet te kunnen spelen:
  // de liedkaart zelf, de begeleiding, de meespeelgegevens (en de synth-audio daarvan als er
  // geen eigen opname of muziekbestand is), het eigen blad — en op verzoek je eigen muziek.
  function urlsVoorLiedje(lied, opties) {
    var o = opties || {};
    var uit = [];
    var voeg = function (u) { if (u && uit.indexOf(u) < 0) uit.push(u); };
    if (!lied || !lied.id) return uit;
    voeg(liedjeUrl(lied.id));
    var audio = lied.audio || {};
    voeg(audio.preview);
    if (o.eigen) {
      voeg(audio.opname);
      voeg((lied.muziek || {}).url);
    }
    voeg(meespeelUrl(lied));
    if (!(lied.heeftEigenOpname || lied.heeftMuziek)) {
      voeg(meespeelAudioUrl(lied));
    }
    voeg((lied.bladmuziek || {}).url);
    return uit;
  }

  // Heel het liedboek: de liedlijst van de app bewaren we per pagina van 200, onder precies het
  // adres dat de app straks ook vraagt (zodat de Liedjes-tab zonder verbinding het hele boek toont).
  function liedjesLijstUrl(vanaf) {
    return '/api/liedjes?compact=1&vanaf=' + Number(vanaf || 0) + '&aantal=200';
  }

  // Alle liedkaarten samen: elk liedje draagt zijn eigen adressen bij, dubbelen gaan eruit.
  function urlsVoorBoek(liedkaarten, opties) {
    var uit = [];
    (liedkaarten || []).forEach(function (lied) {
      urlsVoorLiedje(lied, opties).forEach(function (u) {
        if (u && uit.indexOf(u) < 0) uit.push(u);
      });
    });
    return uit;
  }

  // ------------------------------------------------------- metagegevens ---
  // Wat er per setlist op dit toestel klaarstaat: naam, aantal, grootte, moment en alle
  // adressen (zodat opruimen weet wat nergens anders meer bij hoort).
  function metaSleutel(id) {
    var s = String(id);
    return META_PREFIX + (/^\d+$/.test(s) ? String(Number(s)) : s);
  }
  function leesMeta(winkel, id) {
    try {
      var r = winkel.getItem(metaSleutel(id));
      return r ? JSON.parse(r) : null;
    } catch (e) { return null; }
  }
  function leesAlleMetas(winkel) {
    var uit = [];
    try {
      for (var i = 0; i < winkel.length; i++) {
        var sleutel = winkel.key(i);
        if (sleutel && sleutel.indexOf(META_PREFIX) === 0) {
          var m = leesMeta(winkel, sleutel.slice(META_PREFIX.length));
          if (m) uit.push(m);
        }
      }
    } catch (e) { /* geen opslag: dan is er niets klaargezet */ }
    return uit;
  }
  function bewaarMeta(winkel, meta) {
    try { winkel.setItem(metaSleutel(meta.id), JSON.stringify(meta)); } catch (e) { /* vol of uit */ }
  }
  function wisMeta(winkel, id) {
    try { winkel.removeItem(metaSleutel(id)); } catch (e) { /* niets aan de hand */ }
  }

  // Twee sleutels horen bij dezelfde voorraad? Nummers én de boek-sleutel ('boek') door elkaar.
  function zelfdeId(a, b) {
    var na = Number(a), nb = Number(b);
    if (!isNaN(na) && !isNaN(nb)) return na === nb;
    return String(a) === String(b);
  }

  // Als je de voorraad van één setlist (of van het hele liedboek) weghaalt: welke bewaarde
  // adressen mogen weg? Alleen de adressen die nergens anders meer bij horen.
  function opruimUrls(alle, teWissenId) {
    var doel = null;
    for (var i = 0; i < (alle || []).length; i++) {
      if (zelfdeId(alle[i].id, teWissenId)) doel = alle[i];
    }
    if (!doel) return [];
    var nodig = {};
    for (var j = 0; j < alle.length; j++) {
      if (zelfdeId(alle[j].id, teWissenId)) continue;
      for (var k = 0; k < (alle[j].urls || []).length; k++) nodig[alle[j].urls[k]] = true;
    }
    return (doel.urls || []).filter(function (u) { return !nodig[u]; });
  }

  // '34,2 MB' / '812 kB' — gewone taal.
  function grootteTekst(bytes) {
    var b = Number(bytes) || 0;
    if (b >= 1048576) return (b / 1048576).toFixed(1).replace('.', ',') + ' MB';
    return Math.round(b / 1024) + ' kB';
  }

  // ------------------------------------------------------- terugvallen ---
  // Een bewaard adres terugvinden voor een vraag die er nét anders uitziet (andere transpositie,
  // andere schakelaar). Alleen waar dat veilig is: dezelfde soort gegevens van hetzelfde liedje.
  function ontleed(adres) {
    try {
      var u = new URL(String(adres), 'http://x');
      return { heel: String(adres), pad: u.pathname, params: u.searchParams };
    } catch (e) {
      return { heel: String(adres), pad: '', params: new URLSearchParams() };
    }
  }
  function terugvalSleutel(gevraagd, sleutels) {
    var lijst = sleutels || [];
    if (lijst.indexOf(gevraagd) !== -1) return gevraagd;
    var q = ontleed(gevraagd);
    var kandidaten = lijst.map(ontleed);
    // De liedkaart met een andere transpositie of capo: dezelfde kaart volstaat.
    if (/^\/api\/liedjes\/\d+$/.test(q.pad)) {
      for (var i = 0; i < kandidaten.length; i++) {
        if (kandidaten[i].pad === q.pad) return kandidaten[i].heel;
      }
    }
    // De begeleiding: hetzelfde liedje in dezelfde stand is genoeg; strum en reeks mogen verschillen.
    if (q.pad === '/api/audio/preview') {
      var kern = ['liedje', 'capo', 'transpose', 'tempo'];
      for (var j = 0; j < kandidaten.length; j++) {
        if (kandidaten[j].pad !== q.pad) continue;
        var gelijk = kern.every(function (sleutel) {
          return kandidaten[j].params.get(sleutel) === q.params.get(sleutel);
        });
        if (gelijk) return kandidaten[j].heel;
      }
    }
    // Meespelen (de tijdlijn en de synth-audio): hetzelfde liedje, andere schakelaars mag.
    if (q.pad === '/api/meespelen' || q.pad === '/api/meespelen/audio') {
      for (var k = 0; k < kandidaten.length; k++) {
        if (kandidaten[k].pad === q.pad && kandidaten[k].params.get('liedje') === q.params.get('liedje')) {
          return kandidaten[k].heel;
        }
      }
    }
    // De liedlijst zelf (de Liedjes-tab): een bewaarde, ongefilterde pagina mag een pagina-vraag
    // beantwoorden — maar alleen de pagina met hetzelfde beginpunt, en nooit een zoek- of
    // filtervraag (die zou dan stilletjes de hele lijst te zien krijgen).
    if (q.pad === '/api/liedjes') {
      var filterNamen = ['zoek', 'taal', 'genre', 'artiest', 'favoriet', 'sorteer', 'label', 'capo', 'moeilijkheid', 'verborgen'];
      for (var f = 0; f < filterNamen.length; f++) {
        if (q.params.get(filterNamen[f])) return null;
      }
      var gewildVanaf = Number(q.params.get('vanaf') || 0);
      for (var l = 0; l < kandidaten.length; l++) {
        if (kandidaten[l].pad !== q.pad) continue;
        var heeftFilter = filterNamen.some(function (k) { return kandidaten[l].params.get(k); });
        if (heeftFilter) continue;
        if (Number(kandidaten[l].params.get('vanaf') || 0) === gewildVanaf) return kandidaten[l].heel;
      }
      return null;
    }
    return null;
  }

  var reken = {
    CACHE: CACHE,
    META_PREFIX: META_PREFIX,
    BOEK_ID: BOEK_ID,
    politiekVoor: politiekVoor,
    liedjeUrl: liedjeUrl,
    meespeelUrl: meespeelUrl,
    meespeelAudioUrl: meespeelAudioUrl,
    urlsVoorLiedje: urlsVoorLiedje,
    urlsVoorBoek: urlsVoorBoek,
    liedjesLijstUrl: liedjesLijstUrl,
    metaSleutel: metaSleutel,
    leesMeta: leesMeta,
    leesAlleMetas: leesAlleMetas,
    bewaarMeta: bewaarMeta,
    wisMeta: wisMeta,
    zelfdeId: zelfdeId,
    opruimUrls: opruimUrls,
    grootteTekst: grootteTekst,
    terugvalSleutel: terugvalSleutel
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = reken;
  if (root) root.offlineRekenen = reken;
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : null));
