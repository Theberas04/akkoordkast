'use strict';
// Het bladmuziek loopt mee met de muziek: het akkoord van de maat die klinkt licht op, en het blad
// schuift mee zodat de regel in beeld blijft. Deze proef bewaakt de onderdelen daarvan in de pagina.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const PAGINA = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

test('elk akkoord op het blad krijgt een nummer', () => {
  assert.match(PAGINA, /var akNr = 0;/, 'de tekening hoort de akkoorden te tellen');
  assert.match(PAGINA, /data-ak="/, 'een akkoord hoort zijn nummer in het beeld te krijgen');
  assert.match(PAGINA, /BLAD\.akkoorden = akNr;/, 'en het totaal hoort bewaard te worden');
});

test('het meespelen licht het blad op de maat die klinkt', () => {
  // De animatielus zet het blad op de maat die hij net uit de audiotijd heeft gehaald.
  const tik = PAGINA.slice(PAGINA.indexOf('function meespelTik()'));
  assert.match(tik.slice(0, 3000), /zetBladOpMaat\(iMaat\);/, 'de tik hoort het blad bij te houden');
  // En de markering verdwijnt weer als je stopt.
  const stop = PAGINA.slice(PAGINA.indexOf('function meespelStop()'));
  assert.match(stop.slice(0, 400), /laatBladLos\(\);/, 'stoppen hoort de markering los te laten');
});

test('het opgelichte akkoord is te zien en blijft in beeld', () => {
  assert.match(PAGINA, /\.seg\.nu\{/, 'de opmaak van het opgelichte akkoord hoort er te zijn');
  assert.match(PAGINA, /scrollIntoView/, 'het blad hoort mee te schuiven als het akkoord uit beeld loopt');
  // Zoeken in de hele pagina, want het blad staat in meer dan één houder (liedblad, meespeelkaart, boek).
  assert.match(PAGINA, /document\.querySelector\('\[data-ak="/, 'het akkoord hoort in de hele pagina gezocht te worden');
  assert.match(PAGINA, /\.schema \.maat\.nu\{/, 'een maat in het schema hoort ook op te lichten');
});

test('een liedje zonder liedtekst wordt een akkoordenschema met maatvakken', () => {
  // De akkoorden plakten aan elkaar omdat de maatstrepen op een eigen regel stonden; nu is elke maat
  // een vak met een maatstreep, en de losse strepenregel verdwijnt.
  assert.match(PAGINA, /var alleenAkkoorden = /, 'de tekening hoort een regel met alleen akkoorden te herkennen');
  assert.match(PAGINA, /var alleenStrepen = /, 'en een regel met alleen maatstrepen');
  assert.match(PAGINA, /<div class="schema">/, 'die regel hoort als schema getekend te worden');
  assert.match(PAGINA, /<span class="maat"/, 'met per maat een eigen vak');
  assert.match(PAGINA, /if \(alleenStrepen\) return;/, 'de losse maatstrepenregel hoort te verdwijnen');
});

// De tekst van één functie, door de accolades te tellen. Knippen op de volgende functie gaat mis:
// tussen twee functies kan nog van alles staan.
function functieTekst(bron, naam) {
  const start = bron.indexOf('function ' + naam + '(');
  if (start === -1) return '';
  let diepte = 0;
  let begonnen = false;
  for (let i = start; i < bron.length; i++) {
    if (bron[i] === '{') { diepte++; begonnen = true; }
    else if (bron[i] === '}') { diepte--; if (begonnen && diepte === 0) return bron.slice(start, i + 1); }
  }
  return bron.slice(start);
}

test('de animatielus doet per beeldje zo weinig mogelijk werk', () => {
  // Een innerHTML of een lus over alle akkoorden van het blad per beeldje laat de pagina op een
  // telefoon vastlopen. De nootregel hoort alleen bij een echte verandering geschreven te worden, en
  // het meelichten van grepen en liedtekst hoort bij een nieuwe maat te gebeuren (zetBladOpMaat).
  const lus = functieTekst(PAGINA, 'meespelTik');
  assert.match(lus, /if \(nootHtml !== MEES\.nootHtml\)/, 'de nootregel hoort alleen bij verandering geschreven te worden');
  // De snaren op de hals mogen per beeldje oplichten (dat zijn er zes), maar een ronde over alle
  // akkoorden van de liedtekst of alle grepen hoort hier niet.
  assert.ok(lus.indexOf("document.querySelectorAll('#songtekst .seg .ak')") === -1,
    'de liedtekst hoort niet in de lus te zitten');
  assert.ok(lus.indexOf("document.querySelectorAll('#spelen-inhoud .grepen figure')") === -1,
    'de grepen horen niet in de lus te zitten');
  const functie = functieTekst(PAGINA, 'zetBladOpMaat');
  assert.match(functie, /klinkt/, 'zetBladOpMaat hoort de grepen en de liedtekst te laten meelichten');
  assert.ok(functie.indexOf("behavior: 'smooth'") === -1, 'schuiven hoort meteen te gaan, niet vloeiend');
});

test('zonder tijdlijn of zonder akkoorden doet het niets', () => {
  const functie = PAGINA.slice(PAGINA.indexOf('function zetBladOpMaat('));
  assert.match(functie.slice(0, 400), /if \(!BLAD\.akkoorden \|\| iMaat < 0\) return;/, 'zonder akkoorden of maat hoort hij niets te doen');
});
