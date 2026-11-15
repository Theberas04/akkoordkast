// De slimme oefensessie: uit je oefencijfers en je liedjes stelt de app een sessie samen.
// Vier soorten blokken: opwarmen (iets dat je kent), herhalen (iets dat je lang niet deed),
// uitdaging (een tandje moeilijker) en een afsluiter (herhalen op tempo). Puur rekenwerk met
// vaste regels, zodat de app en de tests zonder verrassingen hetzelfde plan maken.
(function (root) {
  'use strict';

  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  function normLiedje(l) {
    var mo = clamp(Math.round(Number(l && l.moeilijkheid) || 3), 1, 5);
    return {
      id: Number(l && l.id),
      titel: String((l && l.titel) || '').trim(),
      moeilijkheid: mo,
      favoriet: !!(l && l.favoriet),
      gespeeld: String((l && l.gespeeld) || ''),
      gespeeldMs: Date.parse(String((l && l.gespeeld) || '')) || 0
    };
  }

  function byTitel(a, b) { return a.titel.localeCompare(b.titel, 'nl'); }
  function byOudste(a, b) { return a.gespeeldMs - b.gespeeldMs || byTitel(a, b); }

  // Hoeveel minuten per blok? Kort blijft kort: onder de negen minuten alleen opwarmen + herhalen.
  function verdeling(m) {
    if (m < 9) {
      var opw = Math.max(2, Math.round(m * 0.3));
      return { opw: opw, herh: m - opw, uit: 0, afs: 0 };
    }
    var afs = Math.max(2, Math.round(m * 0.15));
    var uit = Math.max(2, Math.round(m * 0.25));
    var opw = Math.max(2, Math.round(m * 0.2));
    var herh = m - afs - uit - opw;
    if (herh < 2) { herh = 2; uit = Math.max(0, m - afs - opw - herh); if (uit < 2) uit = 0; }
    return { opw: opw, herh: herh, uit: uit, afs: afs };
  }

  // 'vandaag', 'gisteren', '4 dagen geleden', 'een week geleden', '3 weken geleden'.
  function geledenTekst(nuMs, momentMs) {
    if (!momentMs) return '';
    var dagen = Math.floor((nuMs - momentMs) / 86400000);
    if (dagen <= 0) return 'vandaag';
    if (dagen === 1) return 'gisteren';
    if (dagen < 7) return dagen + ' dagen geleden';
    if (dagen < 14) return 'een week geleden';
    return Math.floor(dagen / 7) + ' weken geleden';
  }

  function stelSamen(invoer) {
    var o = invoer || {};
    var m = clamp(Math.round(Number(o.minuten) || 15), 5, 60);
    var lijst = (o.liedjes || []).map(normLiedje).filter(function (l) { return l.id && l.titel; });
    if (!lijst.length) return { blokken: [], totaal: 0 };
    var nuMs = Date.parse(String(o.nu || '')) || Date.now();
    var laatsteWeek = null;
    if (o.weken && o.weken.length) {
      laatsteWeek = Number(o.weken[o.weken.length - 1].minuten) || 0;
    }

    var v = verdeling(m);
    var gekozen = {};
    function kies(kandidaten) {
      for (var i = 0; i < kandidaten.length; i++) {
        if (!gekozen[kandidaten[i].id]) return kandidaten[i];
      }
      return null;
    }
    function reserveer(l) { if (l) gekozen[l.id] = true; return l; }

    var opwarmKandidaten = lijst.filter(function (l) { return l.favoriet && l.moeilijkheid <= 3; }).sort(byTitel)
      .concat(lijst.filter(function (l) { return l.moeilijkheid <= 2; }).sort(byTitel))
      .concat(lijst.slice().sort(byTitel));
    var herhaalKandidaten = lijst.filter(function (l) { return l.gespeeldMs > 0; }).sort(byOudste)
      .concat(lijst.filter(function (l) { return !l.gespeeldMs; }).sort(byTitel));
    var uitdagingKandidaten = lijst.filter(function (l) { return l.moeilijkheid >= 3 && !l.gespeeldMs; }).sort(byTitel)
      .concat(lijst.filter(function (l) { return l.moeilijkheid >= 3 && l.gespeeldMs > 0; }).sort(byOudste));

    var opw = reserveer(kies(opwarmKandidaten)) || reserveer(lijst[0]);
    var herh = reserveer(kies(herhaalKandidaten)) || opw;
    var uit = reserveer(kies(uitdagingKandidaten));
    if (!uit) v.herh += v.uit;              // geen uitdaging? dan gaat die tijd naar het herhalen

    var blokken = [];
    blokken.push({
      soort: 'opwarmen', kop: 'Opwarmen', liedje: { id: opw.id, titel: opw.titel }, minuten: v.opw,
      uitleg: (laatsteWeek !== null && laatsteWeek < 10 ? 'Je was er even niet — begin rustig. ' : '') +
        (opw.favoriet ? 'Je favoriet om mee in te komen.' : (opw.moeilijkheid <= 2 ? 'Even inkomen met iets dat je al kunt.' : 'Begin rustig met iets bekends.'))
    });
    blokken.push({
      soort: 'herhalen', kop: 'Herhalen', liedje: { id: herh.id, titel: herh.titel }, minuten: v.herh,
      uitleg: herh.gespeeldMs
        ? 'Deze deed je het laatst ' + geledenTekst(nuMs, herh.gespeeldMs) + ' — tijd om hem op te halen.'
        : 'Deze heb je nog niet recent gespeeld — nieuw voor jou.'
    });
    if (uit) {
      blokken.push({
        soort: 'uitdaging', kop: 'Uitdaging', liedje: { id: uit.id, titel: uit.titel }, minuten: v.uit,
        uitleg: 'Een tandje moeilijker (' + uit.moeilijkheid + ' van 5) — rustig aan, met vertragen waar nodig.'
      });
    }
    if (v.afs > 0) {
      blokken.push({
        soort: 'afsluiter', kop: 'Afsluiter', liedje: { id: herh.id, titel: herh.titel }, minuten: v.afs,
        uitleg: 'Speel hem nog één keer, nu op tempo — dan zit hij erin.'
      });
    }
    var totaal = blokken.reduce(function (s, b) { return s + b.minuten; }, 0);
    return { blokken: blokken, totaal: totaal };
  }

  var reken = {
    stelSamen: stelSamen,
    verdeling: verdeling,
    geledenTekst: geledenTekst
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = reken;
  if (root) root.sessieRekenen = reken;
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : null));
