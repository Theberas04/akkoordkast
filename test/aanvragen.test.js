// Elke aanvraag aan de app hoort het profiel én het app-merk mee te sturen. De uploadknop deed dat niet
// (een eigen fetch in plaats van de gewone weg), waardoor de server een gewoon profiel zag en de
// beheerder werden geweigerd met "Dit hoort bij het beheerdersprofiel (Admin)".
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const PAGINA = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const REGELS = PAGINA.split('\n');

// Open routes waar geen profiel voor nodig is.
const OPEN = ['/api/versie'];

test('elke aanvraag aan de app stuurt het profiel en het app-merk mee', () => {
  const missers = [];
  REGELS.forEach((r, i) => {
    const m = r.match(/fetch\('(\/api\/[^'?]*)/);
    if (!m) return;
    if (OPEN.some(open => m[1].startsWith(open))) return;
    const stuk = REGELS.slice(i, i + 14).join('\n');
    const heeftProfiel = /x-profiel/.test(stuk);
    const heeftMerk = /x-akkoordkast/.test(stuk);
    if (!heeftProfiel || !heeftMerk) {
      missers.push('regel ' + (i + 1) + ' (' + m[1] + '): profiel ' + heeftProfiel + ', merk ' + heeftMerk);
    }
  });
  assert.deepStrictEqual(missers, [], 'aanvragen missen het profiel of het app-merk:\n' + missers.join('\n'));
});

test('de uploadknop stuurt ze ook mee', () => {
  const i = PAGINA.indexOf("fetch('/api/analyse?' + p.toString()");
  assert.ok(i > 0, 'de upload hoort er te zijn');
  const stuk = PAGINA.slice(i, i + 500);
  assert.match(stuk, /'x-profiel': String\(actiefProfiel\(\)\)/, 'de upload hoort het profiel mee te sturen');
  assert.match(stuk, /'x-akkoordkast': 'app'/, 'de upload hoort het app-merk mee te sturen');
});
