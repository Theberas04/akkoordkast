'use strict';
// Weergave (licht/donker/automatisch): de standaard is donker; de knop in de kop schakelt. Het
// omzetten zelf gebeurt al vroeg in de <head> (geen flits), de knop en het onthouden staan in het
// app-script. Deze proef bewaakt de bedrading en de afspraken.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const lees = (naam) => fs.readFileSync(path.join(__dirname, '..', naam), 'utf8');

test('de weergavekeuze staat vroeg in de head (geen flits) en werkt per toestel', () => {
  const html = lees('public/index.html');
  const vroeg = html.indexOf('akkoordkast-weergave');
  assert.ok(vroeg > 0, 'de keuze hoort in localStorage te staan');
  assert.ok(vroeg < html.indexOf('</head>'), 'de keuze hoort al in de head gelezen te worden');
  assert.ok(html.includes("classList.add('licht')"), 'de lichte weergave hoort als klasse op <html> te staan');
  assert.ok(html.includes("document.documentElement.classList.toggle('licht', !donker)"),
    'de knop hoort dezelfde klasse te zetten');
});

test('de knop schakelt door drie standen: donker, licht, automatisch', () => {
  const html = lees('public/index.html');
  assert.ok(html.includes('id="weergave-knop"') && html.includes('id="weergave-icoon"'),
    'de kop hoort een weergaveknop te hebben');
  assert.ok(html.includes("var WEERGAVE_ORDE = ['donker', 'licht', 'auto']"),
    'de drie standen horen vast te liggen');
  assert.ok(html.includes('function weergaveZet(') && html.includes('function weergaveStart(') &&
    html.includes('function weergaveVoorkeur('), 'de functies horen te bestaan');
  assert.ok(html.includes("$('weergave-knop').addEventListener('click'"), 'de knop hoort te werken');
  assert.ok(html.includes("addEventListener('change'"), 'in de stand automatisch hoort de app het toestel te volgen');
  assert.ok(html.includes('#eef2f9'), 'de lichte achtergrondkleur hoort terug te komen in de meta theme-color');
});

test('de lichte weergave dekt de hardnekkige donkere plekken', () => {
  const html = lees('public/index.html');
  assert.ok(html.includes('html.licht{'), 'het lichte thema hoort als blok te bestaan');
  for (const stuk of ['html.licht header', 'html.licht .kaart', 'html.licht .lied',
    'html.licht input:not([type=range])', 'html.licht .knop.zacht', 'html.licht .melding',
    'html.licht .stem-meter', '[stroke="#cbd5e1"]', '[fill="#e2e8f0"]']) {
    assert.ok(html.includes(stuk), 'de lichte weergave mist: ' + stuk);
  }
  // De pauze- en podiumdelen horen donker te blijven (dat is hun functie op het podium).
  assert.ok(!/html\.licht[^{]*\.pauze|html\.licht[^{]*#pauze-scherm/.test(html),
    'het pauzescherm hoort donker te blijven');
});
