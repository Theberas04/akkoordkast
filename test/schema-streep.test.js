// Een akkoordenschema waarvan de akkoorden uit de opname komen staat als |[Am7] |[Dm7] in de tekst.
// De ontleder maakte van elke maatstreep een eigen segment, waardoor het schema niet meer als raster
// herkend werd en het liedje als losse tekst met strepen op een eigen regel werd getekend.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const WORTEL = path.join(__dirname, '..');
const PAGINA = fs.readFileSync(path.join(WORTEL, 'public', 'index.html'), 'utf8');
const chordpro = require(path.join(WORTEL, 'lib', 'chordpro.js'));

test('een maatstreep tussen de haken levert een eigen segment zonder akkoord', () => {
  const segmenten = chordpro.splitSegmenten('|[C]    |[G]    |[Am]    |[F]');
  // Het eerste segment is de streep vóór het eerste akkoord: dat mag geen akkoord zijn.
  assert.strictEqual(segmenten[0].akkoord, null);
  assert.strictEqual(segmenten[0].tekst, '|');
  const metAkkoord = segmenten.filter(s => s.akkoord);
  assert.deepStrictEqual(metAkkoord.map(s => s.akkoord), ['C', 'G', 'Am', 'F']);
});

test('de pagina telt voor het raster alleen de segmenten met een akkoord', () => {
  assert.match(PAGINA, /var akkoordDelen = r\.segmenten\.filter\(function \(s\) \{ return !!s\.akkoord; \}\);/,
    'de akkoorddelen horen apart geteld te worden');
  assert.match(PAGINA, /var alleenAkkoorden = akkoordDelen\.length > 1 && streepDelen\.every/,
    'het raster hoort te kijken naar de akkoorddelen en de rest enkel strepen te laten zijn');
  assert.match(PAGINA, /'\<div class="schema"\>' \+ akkoordDelen\.map/,
    'het raster hoort over de akkoorddelen te gaan, niet over alle segmenten');
  assert.ok(PAGINA.indexOf("r.segmenten.every(function (s) { return !!s.akkoord; })") === -1,
    'de oude, te strenge herkenning hoort weg te zijn');
});

test('een regel met alleen strepen wordt nog steeds overgeslagen', () => {
  assert.match(PAGINA, /var alleenStrepen = streepDelen\.length > 0 && akkoordDelen\.length === 0;/);
});
