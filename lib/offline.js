// Offline-setlist: een setlist op een podium zonder internet. Welke adressen moet dit toestel
// bewaren, hoe groot is dat samen, en hoe komt de app er weer aan als er geen verbinding is?
// Puur rekenwerk — de app zet de voorraad klaar (Cache Storage), de service worker deelt hem
// uit, en allebei gebruiken ze dezelfde keuzes als hier staan.
(function (root) {
  'use strict';

  var CACHE = 'akkoordkast-offline';
  var META_PREFIX = 'akkoordkast-offline-setlist-';

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

  // ------------------------------------------------------- metagegevens ---
  // Wat er per setlist op dit toestel klaarstaat: naam, aantal, grootte, moment en alle
  // adressen (zodat opruimen weet wat nergens anders meer bij hoort).
  function metaSleutel(id) { return META_PREFIX + Number(id); }
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
          var m = leesMeta(winkel, Number(sleutel.slice(META_PREFIX.length)));
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

  // Als je de voorraad van één setlist weghaalt: welke bewaarde adressen mogen weg? Alleen de
  // adressen die geen enkele andere offline-setlist meer nodig heeft.
  function opruimUrls(alle, teWissenId) {
    var doel = null;
    for (var i = 0; i < (alle || []).length; i++) {
      if (Number(alle[i].id) === Number(teWissenId)) doel = alle[i];
    }
    if (!doel) return [];
    var nodig = {};
    for (var j = 0; j < alle.length; j++) {
      if (Number(alle[j].id) === Number(teWissenId)) continue;
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
    return null;
  }

  var reken = {
    CACHE: CACHE,
    META_PREFIX: META_PREFIX,
    politiekVoor: politiekVoor,
    liedjeUrl: liedjeUrl,
    meespeelUrl: meespeelUrl,
    meespeelAudioUrl: meespeelAudioUrl,
    urlsVoorLiedje: urlsVoorLiedje,
    metaSleutel: metaSleutel,
    leesMeta: leesMeta,
    leesAlleMetas: leesAlleMetas,
    bewaarMeta: bewaarMeta,
    wisMeta: wisMeta,
    opruimUrls: opruimUrls,
    grootteTekst: grootteTekst,
    terugvalSleutel: terugvalSleutel
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = reken;
  if (root) root.offlineRekenen = reken;
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : null));
