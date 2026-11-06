// Het blad mag de pagina niet terugtrekken naar het schema terwijl de gebruiker zelf scrolt. Dit is
// misgegaan: de meespeelversie schoof bij elke maat naar de maat die klinkt, en trok de pagina steeds
// terug zodra je naar onderen scrolde.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const PAGINA = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

test('zelf scrollen zet het volgen uit', () => {
  assert.match(PAGINA, /function volgUitBijEigenScroll\(\)/, 'de functie die het volgen uitzet hoort er te zijn');
  assert.match(PAGINA, /\['wheel', 'touchmove', 'touchstart'\]\.forEach/, 'muis, vinger en aanraking horen mee te tellen');
  assert.match(PAGINA, /document\.addEventListener\('keydown'/, 'ook met het toetsenbord scrollen hoort te tellen');
  assert.match(PAGINA, /function zetVolgen\(aan\)/, 'het volgen hoort aan en uit te kunnen');
  assert.match(PAGINA, /volgUitBijEigenScroll\(\);/, 'de luisteraars horen meteen aangezet te worden');
});

test('het blad schuift alleen als het volgen aan staat', () => {
  const start = PAGINA.indexOf('function zetBladOpMaat(');
  const stuk = PAGINA.slice(start, start + 3000);
  assert.match(stuk, /if \(!BLAD\.volgen\) return;/, 'zonder volgen mag er niet geschoven worden');
  assert.ok(stuk.indexOf('if (!BLAD.volgen) return;') < stuk.indexOf('scrollIntoView'),
    'de controle hoort vóór het schuiven te staan');
});

test('het volgen staat standaard aan en is met een vinkje te bedienen', () => {
  assert.match(PAGINA, /var BLAD = \{ akkoorden: 0, laatste: -1, volgen: true \};/);
  assert.match(PAGINA, /id="mees-volgen" type="checkbox"/, 'het vinkje hoort in de meespeelkaart te staan');
  assert.match(PAGINA, /\$\('mees-volgen'\)\.addEventListener\('change'/, 'het vinkje hoort iets te doen');
  assert.match(PAGINA, /vak\.checked = BLAD\.volgen;/, 'het vinkje hoort de stand te laten zien');
});

test('weer aanzetten springt terug naar de maat die klinkt', () => {
  assert.match(PAGINA, /var maat = BLAD\.laatste;\s*\n\s*BLAD\.laatste = -1;\s*\n\s*zetBladOpMaat\(maat\);/,
    'opnieuw aanzetten hoort het blad naar de klinkende maat te brengen');
});
