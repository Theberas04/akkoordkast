'use strict';
// De versie in de app, de uitleg bij een geblokkeerde microfoon, en het bijwerken vanuit de app.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const hulp = require('./hulp');

const wortel = path.join(__dirname, '..');

test('de versie is op te vragen en de pagina zet hem in de kop', async () => {
  const omgeving = await hulp.start();
  try {
    const uit = await hulp.haal(omgeving.basis, '/api/versie');
    assert.equal(uit.status, 200, 'de versie hoort zonder inloggen op te vragen te zijn');
    assert.match(String(uit.data.versie), /^\d+\.\d+\.\d+$/, 'de versie hoort er als 1.2.3 uit te zien');
    assert.ok(uit.data.liedjes > 1000, 'het aantal liedjes hoort erbij te staan');
  } finally {
    await omgeving.stop();
  }
  const html = fs.readFileSync(path.join(wortel, 'public', 'index.html'), 'utf8');
  assert.match(html, /id="kop-versie"/, 'de versie hoort in de kop van de app te staan');
  assert.match(html, /\/api\/versie\?r=/, 'de pagina hoort de versie zelf op te halen');
});

test('de microfoon-uitleg dekt alle gevallen en wordt overal gebruikt', () => {
  const html = fs.readFileSync(path.join(wortel, 'public', 'index.html'), 'utf8');
  assert.match(html, /function microfoonUitleg/, 'er hoort een uitleg te zijn bij een microfoon die niet werkt');
  for (const naam of ['NotAllowedError', 'NotFoundError', 'NotReadableError', 'isSecureContext']) {
    assert.ok(html.includes(naam), 'de uitleg hoort ' + naam + ' te noemen');
  }
  assert.match(html, /Machtigingen of Site-instellingen/,
    'de stappen om de microfoon aan te zetten horen erin te staan');
  const gebruik = (html.match(/microfoonUitleg\(/g) || []).length;
  assert.ok(gebruik >= 4, 'de stemmer, de ritme-trainer en het opnemen horen de uitleg te gebruiken (nu ' + gebruik + ')');
});

test('de bijwerker in de container staat klaar en raakt de gegevens niet aan', () => {
  const script = path.join(wortel, 'scripts', 'bijwerken-in-de-app.sh');
  assert.ok(fs.existsSync(script), 'de bijwerker hoort er te zijn');
  assert.ok(fs.statSync(script).mode & 0o111, 'de bijwerker hoort uitvoerbaar te zijn');
  const inhoud = fs.readFileSync(script, 'utf8');
  assert.match(inhoud, /codeload\.github\.com/, 'de bijwerker hoort het archief van GitHub te halen');
  assert.match(inhoud, /node --check/, 'de nieuwe bestanden horen eerst gecontroleerd te worden');
  assert.match(inhoud, /DATA_DIR\/bijwerken-/, 'van de oude bestanden hoort een reservekopie te komen');
  for (const naam of ['akkoordkast.db', 'media/', 'handleiding']) {
    assert.ok(!new RegExp('rm -rf[^\\n]*\\$APP_DIR/' + naam).test(inhoud),
      'de bijwerker mag ' + naam + ' niet weghalen');
  }
  const eenheid = fs.readFileSync(path.join(wortel, 'deploy', 'proxmox', 'provision-akkoordkast.sh'), 'utf8');
  assert.match(eenheid, /Environment=UPDATE_SCRIPT=\$APP_DIR\/scripts\/bijwerken-in-de-app\.sh/,
    'de dienst hoort de bijwerker te kennen');
  assert.match(eenheid, /Restart=always/, 'de dienst hoort vanzelf opnieuw te starten na het bijwerken');
});

test('de app start zichzelf opnieuw na een bijwerking en de pagina wacht daarop', () => {
  const server = fs.readFileSync(path.join(wortel, 'server.js'), 'utf8');
  assert.match(server, /herstart: true/, 'de app hoort te melden dat hij opnieuw start');
  const html = fs.readFileSync(path.join(wortel, 'public', 'index.html'), 'utf8');
  assert.match(html, /De (nieuwe bestanden staan er\. )?app start opnieuw op/,
    'de pagina hoort te vertellen dat de app opnieuw start');
  assert.match(html, /data\.herstart/, 'de pagina hoort op de herstart te wachten in plaats van blind te verversen');
});

test('de app weet welke commit hij draait, ook zonder git-map', async () => {
  // Een installatie uit een archief heeft geen .git; de commit komt dan uit de gegevensmap (die het
  // bijwerkscript vult) of uit de omgeving. Zonder dit stond er "Je draait de nieuwste versie ()".
  const fs = require('fs');
  const path = require('path');
  const bewaard = { GIT_COMMIT: process.env.GIT_COMMIT, VERSIE_COMMIT: process.env.VERSIE_COMMIT };
  const omgeving = await hulp.start();
  try {
    delete process.env.GIT_COMMIT;
    delete process.env.VERSIE_COMMIT;
    fs.writeFileSync(path.join(omgeving.app.paden.DATA_DIR, 'commit.txt'), 'ABCDEF0123456789abcdef0123456789abcdef01\n');

    const uitBestand = await hulp.haal(omgeving.basis, '/api/versie');
    assert.equal(uitBestand.status, 200, JSON.stringify(uitBestand.data));
    assert.equal(uitBestand.data.commit, 'abcdef0', 'de commit uit de gegevensmap: ' + JSON.stringify(uitBestand.data));

    // De omgeving gaat vóór het bestand, en ook daarvan de korte vorm.
    process.env.GIT_COMMIT = '1234567890abcdef1234567890abcdef12345678';
    const uitOmgeving = await hulp.haal(omgeving.basis, '/api/versie');
    assert.equal(uitOmgeving.data.commit, '1234567', JSON.stringify(uitOmgeving.data));

    // Onzin in het bestand levert geen halve commit op.
    delete process.env.GIT_COMMIT;
    fs.writeFileSync(path.join(omgeving.app.paden.DATA_DIR, 'commit.txt'), 'geen commit hier\n');
    const onzin = omgeving.app.korteCommit ? omgeving.app.korteCommit() : null;
    if (onzin !== null) {
      assert.ok(!onzin || /^[0-9a-f]{7}$/.test(onzin), 'onzin hoort geen commit op te leveren: ' + onzin);
    }
  } finally {
    if (bewaard.GIT_COMMIT) process.env.GIT_COMMIT = bewaard.GIT_COMMIT;
    if (bewaard.VERSIE_COMMIT) process.env.VERSIE_COMMIT = bewaard.VERSIE_COMMIT;
    await omgeving.stop();
  }
});
