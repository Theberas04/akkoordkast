// Het aftelvlak dekte het hele beeld af: je zag je notenbalk, hals en noten niet meer tijdens het
// aftellen. En met herhalen aan kwam het bij elke ronde terug. Dit houdt beide tegen.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const PAGINA = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

test('het aftelvlak is een klein hoekje en dekt niets af', () => {
  assert.ok(PAGINA.indexOf('position:absolute;inset:0;display:grid;place-items:center') === -1,
    'het aftelvlak mag niet meer het hele beeld vullen');
  assert.match(PAGINA, /\.mees-aftel\{position:absolute;top:8px;right:10px;/, 'het aftelvlak hoort een klein hoekje te zijn');
  assert.match(PAGINA, /\.mees-aftel\{[^}]*pointer-events:none/, 'het aftelvlak mag geen tik tegenhouden');
  const stuk = PAGINA.slice(PAGINA.indexOf('.mees-aftel{'), PAGINA.indexOf('.mees-aftel span{'));
  assert.match(stuk, /font-size:1\.5rem/, 'het cijfer hoort klein te zijn');
  assert.ok(stuk.indexOf('font-size:3.4rem') === -1, 'het grote cijfer hoort weg te zijn');
});

test('bij herhalen komt het aftellen niet terug', () => {
  const regel = 'var inAftellen = tl.aftellen.aan && t < tl.aftellen.seconden';
  assert.ok(PAGINA.indexOf(regel) !== -1, 'de aftelregel hoort er te staan');
  assert.ok(PAGINA.indexOf(regel + ' && !speeltOpname') !== -1, 'niet over een opname heen');
  assert.ok(PAGINA.indexOf('!(MEES.lus && MEES.lus.aan)') !== -1,
    'het aftellen hoort alleen bij een nieuw begin te horen, niet bij elke herhaling');
});

test('over een opname of muziek heen komt er geen aftelpaneel', () => {
  // Bij 'Meespelen met je opname' staat het aftellen aan, en dan lag het paneel over de eerste
  // seconden van de muziek. Zolang er geluid speelt hoort het aftellen niet in beeld te komen.
  assert.ok(PAGINA.indexOf("var speeltOpname = !!(geluid && geluid.getAttribute('src'));") !== -1,
    'de pagina hoort te weten of er een opname speelt');
  assert.ok(PAGINA.indexOf('var inAftellen = tl.aftellen.aan && t < tl.aftellen.seconden && !speeltOpname') !== -1,
    'het aftellen hoort uit te blijven als er een opname speelt');
});

test('een element met hidden is ook echt verborgen', () => {
  // De echte oorzaak van het blijvende aftelpaneel: een eigen display-regel (display:flex) op het element
  // wint van de browserregel voor [hidden], waardoor het paneel altijd bleef staan.
  assert.ok(PAGINA.indexOf('[hidden]{display:none !important}') !== -1,
    'de pagina hoort een element met het hidden-attribuut echt te verbergen');
  const aftel = PAGINA.slice(PAGINA.indexOf('.mees-aftel{'), PAGINA.indexOf('.mees-aftel span{'));
  assert.match(aftel, /display:flex/, 'het aftelvlak hoort een klein hoekje te zijn');
});

test('de schakelaar aftellen bestaat nog en blijft werken', () => {
  assert.match(PAGINA, /id="mees-aftellen" type="checkbox"/);
  assert.match(PAGINA, /id="mees-aftel-nummer">4</, 'het cijfer hoort er nog te staan');
});
