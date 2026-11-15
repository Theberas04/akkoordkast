'use strict';
// De verzoeknummers: een eigen tabblad naast Leren waarmee je in het liedboek zoekt en met één tik
// verzoekjes doet — meerdere na elkaar, zonder het liedje te openen. Dit dekt de bedrading in de
// pagina en het veld waarop de tool "al verzocht" herkent.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const hulp = require('./hulp.js');

const PAGINA = () => fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

test('de tool is een eigen tabblad naast Leren en heeft een eigen scherm', () => {
  const html = PAGINA();
  assert.match(html, /var TABS = \[[^\]]*'verzoeknummers'/);
  assert.match(html, /if \(naam === 'verzoeknummers'\) vtLaad\(\)/);
  for (const id of ['tab-verzoeknummers', 'paneel-verzoeknummers', 'vt-zoek', 'vt-lijst', 'vt-melding', 'vt-vraag', 'vt-vraag-knop']) {
    assert.ok(html.includes('id="' + id + '"'), 'de pagina hoort ' + id + ' te hebben');
  }
  for (const fn of ['function vtLaad(', 'function vtLaadOpen(', 'function vtZoek(', 'function vtToonVraag(', 'function tekenVtLijst(']) {
    assert.ok(html.includes(fn), 'de functie hoort te bestaan: ' + fn);
  }
  assert.ok(html.includes('>Verzoeknummers<'), 'het tabblad hoort Verzoeknummers te heten');
  // Het losse venster en de werkbalkknop van 1.69/1.70 zijn vervangen door het tabblad.
  assert.ok(!html.includes('id="verzoek-tool"'), 'het oude losse venster hoort weg te zijn');
  assert.ok(!html.includes('id="verzoek-tool-knop"'), 'de oude werkbalkknop hoort weg te zijn');
});

test('de tool zoekt in het liedboek en hergebruikt het verzoekje-versturen', () => {
  const html = PAGINA();
  assert.ok(html.includes('<section id="paneel-verzoeknummers" class="paneel">'), 'de tool hoort een eigen paneel te hebben');
  assert.ok(html.includes("api('/api/liedjes?compact=1&aantal=30'"), 'de tool hoort via de api()-helper te zoeken');
  assert.ok(html.includes("meldingId: 'vt-melding'"), 'de melding hoort in de tool zelf te komen');
  assert.ok(html.includes('blijvend: true'), 'in de tool blijft "Verzocht" staan, ook na vier seconden');
  assert.ok(html.includes('v.profiel === actiefProfiel()'), 'open verzoekjes van dit profiel horen herkend te worden');
  // Ook liedjes die nog niet in het liedboek staan kun je vragen (vrije tekst).
  assert.ok(html.includes('opties.vraag ? { vraag: opties.vraag }'), 'een vrije vraag hoort als vraag verstuurd te worden');
  assert.ok(html.includes('nog niet in het liedboek'), 'de beheerder hoort te zien dat het nummer er nog niet is');
});

test('een verzoekje in de lijst draagt het profiel waarop de tool filtert', async () => {
  const omgeving = await hulp.start();
  try {
    const uit = await hulp.post(omgeving.basis, '/api/verzoek', { liedje: 1 });
    assert.equal(uit.status, 201, JSON.stringify(uit.data));
    const v = (uit.data.verzoeken || []).filter(x => !x.gedaan)[0];
    assert.ok(v, 'er hoort een open verzoekje te zijn');
    assert.equal(typeof v.profiel, 'number', 'het veld profiel hoort erbij te zitten (daarop herkent de tool "al verzocht")');
  } finally {
    await omgeving.stop();
  }
});
