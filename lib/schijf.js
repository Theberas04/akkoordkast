(function (root) {
  'use strict';
  // Rekenwerk rond de schijf: hoeveel ruimte is er nog, welke reservekopieën staan er, en het
  // opruimen daarvan. Het opruimen laat de nieuwste kopie altijd staan, zodat een mislukte
  // bijwerking altijd terug te draaien blijft.

  const fs = require('fs');
  const path = require('path');

  const VOORVOEGSEL = 'bijwerken-';

  // 1536 -> '1,5 kB'. Voor de meldingen en de kaart in de app.
  function leesbaar(bytes) {
    if (bytes === null || bytes === undefined || !isFinite(bytes)) return 'onbekend';
    const eenheden = ['bytes', 'kB', 'MB', 'GB', 'TB'];
    let n = Math.abs(bytes);
    let i = 0;
    while (n >= 1024 && i < eenheden.length - 1) { n = n / 1024; i++; }
    const getal = i === 0 ? String(Math.round(n)) : n.toFixed(n < 10 ? 1 : 0).replace('.', ',');
    return (bytes < 0 ? '-' : '') + getal + ' ' + eenheden[i];
  }

  // Hoeveel ruimte is er nog op de schijf waar dit pad staat? null als het niet te lezen is.
  function vrijeRuimte(pad) {
    try {
      const s = fs.statfsSync(pad);
      return { vrij: s.bavail * s.bsize, totaal: s.blocks * s.bsize };
    } catch (e) {
      return null;
    }
  }

  // Hoe groot is een map (in bytes), met een bovengrens aan het aantal bestanden dat we tellen.
  function mapGrootte(pad, grens) {
    const max = grens || 20000;
    let totaal = 0;
    let geteld = 0;
    const stapel = [pad];
    while (stapel.length && geteld < max) {
      const nu = stapel.pop();
      let inhoud;
      try { inhoud = fs.readdirSync(nu, { withFileTypes: true }); } catch (e) { continue; }
      for (const ding of inhoud) {
        const vol = path.join(nu, ding.name);
        try {
          if (ding.isDirectory()) stapel.push(vol);
          else if (ding.isFile()) { totaal += fs.statSync(vol).size; geteld++; }
        } catch (e) { /* overslaan wat niet te lezen is */ }
      }
    }
    return totaal;
  }

  // De reservekopieën die de app bij het bijwerken achterlaat: bijwerken-<datum>-<tijd>.
  function reservekopieen(dataDir) {
    let namen;
    try { namen = fs.readdirSync(dataDir, { withFileTypes: true }); } catch (e) { return []; }
    const koppen = namen
      .filter(d => d.isDirectory() && d.name.startsWith(VOORVOEGSEL))
      .map(d => d.name)
      .sort();
    // Nieuwste eerst.
    koppen.reverse();
    return koppen.map((naam, i) => {
      const vol = path.join(dataDir, naam);
      let wanneer = null;
      try { wanneer = fs.statSync(vol).mtime.toISOString(); } catch (e) { /* laat leeg */ }
      return { naam, pad: vol, bytes: mapGrootte(vol), nieuwste: i === 0, wanneer };
    });
  }

  // Ruimt de oude reservekopieën op. De nieuwste blijft staan tenzij alles=true.
  function ruimReserveOp(dataDir, opties) {
    const alles = !!(opties && opties.alles);
    const koppen = reservekopieen(dataDir);
    const weg = alles ? koppen : koppen.filter(k => !k.nieuwste);
    let vrijgemaakt = 0;
    const verwijderd = [];
    for (const kopie of weg) {
      try {
        fs.rmSync(kopie.pad, { recursive: true, force: true });
        vrijgemaakt += kopie.bytes;
        verwijderd.push(kopie.naam);
      } catch (e) { /* laten staan wat niet weg kan */ }
    }
    return { verwijderd, vrijgemaakt, bewaard: koppen.filter(k => !weg.some(w => w.naam === k.naam)).map(k => k.naam) };
  }

  const reken = { leesbaar, vrijeRuimte, mapGrootte, reservekopieen, ruimReserveOp, VOORVOEGSEL };

  if (typeof module !== 'undefined' && module.exports) module.exports = reken;
  if (root) root.schijfRekenen = reken;
})(typeof window !== 'undefined' ? window : null);
