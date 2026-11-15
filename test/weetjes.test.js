'use strict';
// Weetje van de dag: het rekenwerk (welk weetje hoort bij welke dag) staat in lib/weetjes.js —
// dezelfde rekenkunde voor de app (het tabblad Leren) en voor deze proeven.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const weetjes = require('../lib/weetjes');
const lees = (naam) => fs.readFileSync(path.join(__dirname, '..', naam), 'utf8');

test('elke dag heeft zijn eigen weetje, en dezelfde dag hetzelfde', () => {
  const a = weetjes.weetjeVanDag(2026, 11, 15, 0);
  const b = weetjes.weetjeVanDag(2026, 11, 15, 0);
  assert.equal(a.index, b.index, 'dezelfde dag hoort hetzelfde weetje te geven');
  assert.equal(a.tekst, b.tekst);
  const morgen = weetjes.weetjeVanDag(2026, 11, 16, 0);
  assert.notEqual(a.index, morgen.index, 'twee dagen na elkaar horen te verschillen');
  const volgende = weetjes.weetjeVanDag(2026, 11, 15, 1);
  assert.equal(volgende.index, (a.index + 1) % a.totaal, 'de verspringing schuift één verder');
  const rond = weetjes.weetjeVanDag(2026, 11, 15, a.totaal + 3);
  assert.equal(rond.index, (a.index + 3) % a.totaal, 'voorbij het einde begint de lijst weer');
});

test('de weetjes zelf zijn netjes: genoeg, uniek en af', () => {
  assert.ok(weetjes.WEETJES.length >= 60, 'er horen flink wat weetjes te zijn');
  const gezien = new Set();
  for (const w of weetjes.WEETJES) {
    assert.ok(typeof w === 'string' && w.length >= 40 && w.length <= 320,
      'een weetje is één of twee zinnen: ' + String(w).slice(0, 40));
    assert.ok(w.trim() === w && !w.includes('  '), 'geen losse spaties of dubbele spaties');
    assert.ok(/[.!?]$/.test(w), 'een weetje eindigt met een punt: ' + w.slice(-30));
    assert.ok(!gezien.has(w), 'dubbel weetje: ' + w.slice(0, 40));
    gezien.add(w);
  }
});

test('de weetjeskaart staat in het tabblad leren', () => {
  const html = lees('public/index.html');
  for (const id of ['weetje-kaart', 'weetje-datum', 'weetje-teller', 'weetje-tekst', 'weetje-nog']) {
    assert.ok(html.includes('id="' + id + '"'), 'de pagina hoort ' + id + ' te hebben');
  }
  assert.ok(html.includes('Weetje van de dag'), 'de kaart hoort zijn naam te dragen');
  assert.ok(html.includes('<script src="/lib/weetjes.js"></script>'), 'de weetjes horen in de pagina geladen te worden');
  assert.ok(lees('public/sw.js').includes("'/lib/weetjes.js'"), 'het weetjesbestand hoort in de schil te zitten');
  assert.ok(html.includes("'akkoordkast-weetje'"), 'de stand hoort bij dit toestel te blijven (localStorage)');
  assert.ok(html.includes('function weetjeToon(') && html.includes('function weetjeVolgende('),
    'de kaart hoort gevuld en doorgeschoven te kunnen worden');
  assert.ok(html.includes('Nog een weetje'), 'de knop hoort gewoon in het Nederlands te staan');
});
