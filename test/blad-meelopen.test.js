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
  assert.match(PAGINA, /document\.querySelector\('\.seg\[data-ak="/, 'het akkoord hoort in de hele pagina gezocht te worden');
});

test('zonder tijdlijn of zonder akkoorden doet het niets', () => {
  const functie = PAGINA.slice(PAGINA.indexOf('function zetBladOpMaat('));
  assert.match(functie.slice(0, 400), /if \(!BLAD\.akkoorden \|\| iMaat < 0\) return;/, 'zonder akkoorden of maat hoort hij niets te doen');
});
