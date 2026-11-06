// Tom was ingelogd als beheerder maar kon niets toevoegen: de keuzelijst op zijn scherm toonde Admin,
// terwijl de aanvragen met het oude profiel uit de opslag van de browser weggingen. De app weigerde dus
// terecht. Dit houdt het scherm en de opslag gelijk, ook over tabbladen heen.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const PAGINA = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

test('een tabblad loopt mee als in een ander tabblad van profiel wordt gewisseld', () => {
  assert.match(PAGINA, /window\.addEventListener\('storage'/, 'er hoort naar wijzigingen in de opslag geluisterd te worden');
  assert.match(PAGINA, /e\.key !== PROFIEL_SLEUTEL/, 'alleen een wijziging van het profiel telt');
  assert.match(PAGINA, /laadProfielen\(\)\.then\(function \(\) \{ wisselProfiel\(actiefProfiel\(\)\); \}\)/,
    'na een wissel elders hoort dit tabblad hetzelfde profiel te gebruiken');
});

test('een achtergelopen scherm herstelt zich als je terugkomt in het tabblad', () => {
  assert.match(PAGINA, /function gelijkTrekeen\(\)/, 'de controle op een verschil hoort er te zijn');
  assert.match(PAGINA, /if \(!sel \|\| String\(sel\.value\) === String\(actiefProfiel\(\)\)\) return;/,
    'er hoort niets te gebeuren als scherm en opslag al gelijk zijn');
  assert.match(PAGINA, /document\.addEventListener\('visibilitychange'/, 'terugkomen in het tabblad hoort te tellen');
  assert.match(PAGINA, /window\.addEventListener\('focus', gelijkTrekeen\)/, 'opnieuw in het venster klikken hoort te tellen');
});

test('laadProfielen levert een belofte op zodat erop verder gebouwd kan worden', () => {
  assert.match(PAGINA, /return api\('\/api\/profielen'\)\.then/, 'laadProfielen hoort zijn belofte door te geven');
  assert.match(PAGINA, /houdProfielGelijk\(\);/, 'de functie hoort meteen aangezet te worden');
});
