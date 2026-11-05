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

test('de app-schil komt vers van de server, niet uit een oude cache', () => {
  // De pagina werd uit de cache geserveerd en kwam pas bij de tweede keer laden vers op. Daardoor bleef
  // een melding die al weg was toch staan ("ik krijg de melding nog"). De schil is nu netwerk-eerst.
  const sw = fs.readFileSync(path.join(wortel, 'public', 'sw.js'), 'utf8');
  assert.match(sw, /NETWERK_EERST/, 'er hoort een lijst te zijn die eerst van de server komt');
  for (const pad of ["'/'", "'/index.html'"]) {
    assert.ok(sw.includes(pad), pad + ' hoort netwerk-eerst te zijn');
  }
  assert.match(sw, /fetch\(e\.request\)\.then\(r => \{/, 'de pagina hoort opgehaald te worden');
  assert.match(sw, /catch\(uitCache\)/, 'en zonder internet terug te vallen op de cache');
  // En de cache-versie hoort bij deze versie van de app te horen.
  const versie = fs.readFileSync(path.join(wortel, 'server.js'), 'utf8')
    .match(/const VERSIE = '([^']+)'/)[1];
  assert.match(sw, new RegExp("akkoordkast-v\\d+"), 'de cache hoort een versienummer te hebben');
  assert.ok(versie.length > 0, 'de versie van de app hoort bekend te zijn');
});

test('de service worker haalt de pagina echt van de server, ook als de cache hem heeft', async () => {
  // Dit is de kern van de klacht "ik krijg de melding nog": de pagina zat in de cache en kwam pas bij
  // de tweede keer laden vers op. Daarom hier geen structuur-controle maar echt gedrag: de nep-cache
  // heeft de oude pagina, en de vraag is of de service worker de server vraagt.
  const bron = fs.readFileSync(path.join(wortel, 'public', 'sw.js'), 'utf8');
  const gevat = {};
  const cacheMap = new Map();
  const cache = {
    put: async (verzoek, antwoord) => { cacheMap.set(String(verzoek.url || verzoek), antwoord); },
    addAll: async () => {}
  };
  const nepCaches = {
    open: async () => cache,
    keys: async () => [],
    delete: async () => {},
    match: async verzoek => cacheMap.get(String(verzoek.url || verzoek))
  };
  let opgehaald = [];
  const nepFetch = async verzoek => { opgehaald.push(String(verzoek.url || verzoek)); return { ok: true, clone: () => ({}) }; };
  const nepSelf = {
    addEventListener: (naam, fn) => { gevat[naam] = fn; },
    skipWaiting: async () => {},
    clients: { claim: async () => {} }
  };
  new Function('self', 'caches', 'fetch', 'location', bron)(
    nepSelf, nepCaches, nepFetch, { origin: 'https://proef' });

  // De oude pagina staat al in de cache.
  cacheMap.set('https://proef/', { ok: true, oud: true });

  let wacht = null;
  gevat.fetch({
    request: { method: 'GET', url: 'https://proef/', headers: { get: () => null } },
    respondWith: belofte => { wacht = belofte; }
  });
  assert.ok(wacht, 'de service worker hoort iets terug te geven');
  await wacht;

  assert.deepEqual(opgehaald, ['https://proef/'],
    'de pagina hoort bij de server opgehaald te worden, ook als hij in de cache zit');

  // En de liedjes en het geluid blijven altijd live, nooit uit de cache.
  opgehaald = [];
  let geen = 'niets';
  gevat.fetch({
    request: { method: 'GET', url: 'https://proef/api/liedjes' },
    respondWith: () => { geen = 'onderschept'; }
  });
  assert.equal(geen, 'niets', 'de liedjes horen niet door de service worker te gaan');
  assert.deepEqual(opgehaald, [], 'en dus ook niet uit een cache te komen');
});

test('de microfoon op een telefoon: controle, terugval en de andere-app-hint', () => {
  // De klacht "ik kan de microfoon op mijn telefoon niet gebruiken": de app moet zelf kunnen vertellen
  // waar het misgaat, en niet stuklopen op toestellen die de strenge microfooninstellingen afwijzen.
  const html = fs.readFileSync(path.join(wortel, 'public', 'index.html'), 'utf8');

  // 1. Een controlepaneel dat de drie echte oorzaken noemt.
  assert.match(html, /id="stem-controle"/, 'er hoort een controlepaneel in de stemmerkaart te staan');
  assert.match(html, /function microfoonControle/, 'de controle hoort een functie te zijn');
  for (const stuk of ['beveiligd adres', 'microfoons gevonden']) {
    assert.ok(html.includes(stuk), 'de controle hoort "' + stuk + '" te melden');
  }

  // 2. Een pagina in een andere app herkennen (WhatsApp, Slack, Facebook, WebView).
  assert.match(html, /function inAndereApp/, 'andere apps horen herkend te worden');
  for (const merk of ['FBAN', 'Instagram', 'GSA', 'WebView', 'Slack']) {
    assert.ok(html.includes(merk), 'de herkenning hoort ' + merk + ' te dekken');
  }
  assert.match(html, /open hem in Chrome of Safari zelf/, 'en de app hoort te zeggen wat je dan moet doen');

  // 3. Alle microfoonvragen lopen via de terugval: eerst zonder hulpmiddelen, dan zonder eisen.
  assert.match(html, /function vraagMicrofoon/, 'er hoort één plek te zijn waar de microfoon gevraagd wordt');
  assert.match(html, /getUserMedia\(\{ audio: true \}\)/, 'met een terugval zonder eisen');
  const streng = (html.match(/getUserMedia\(\{\s*audio: \{ echoCancellation/g) || []).length;
  assert.equal(streng, 1, 'de strenge vraag hoort alleen nog in vraagMicrofoon te staan (nu ' + streng + ')');
  const viaFunctie = (html.match(/vraagMicrofoon\(\)/g) || []).length;
  assert.ok(viaFunctie >= 4, 'stemmer, akkoordentrainer, ritme-trainer en de functie zelf (nu ' + viaFunctie + ')');

  // 4. Bij een fout hoort de foutcode van de browser erbij te staan.
  assert.match(html, /foutcode: ' \+ e\.name/, 'de foutcode hoort in de melding te staan');

  // 5. En de pagina haalt de controle bij het openen.
  assert.match(html, /kijkMicrofoonRechten\(\);\nmicrofoonControle\(\);/, 'de controle hoort meteen te lopen');
});

test('de microfoon van de geinstalleerde app: de uitleg wijst naar de app, niet naar Chrome', () => {
  // De klacht met schermafbeelding: het scherm Rechten van de site toont geen microfoon, alleen meldingen,
  // met "Beheerd door AkkoordKast". De app draait dus als geinstalleerde app; dan zit de microfoon bij de
  // app zelf (Instellingen, Apps, AkkoordKast, Machtigingen) en niet bij Chrome.
  const html = fs.readFileSync(path.join(wortel, 'public', 'index.html'), 'utf8');
  const manifest = JSON.parse(fs.readFileSync(path.join(wortel, 'public', 'manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.display, 'standalone', 'de app hoort als app te draaien; daar gaat het hier om');

  assert.match(html, /function alsApp/, 'de app hoort te herkennen dat hij als app draait');
  assert.ok(html.includes("display-mode: standalone"), 'via de display-mode');
  assert.ok(html.includes('navigator.standalone'), 'en via de iOS-variant');

  // De uitleg noemt de app-route met de app-naam erbij.
  assert.ok(/Instellingen, Apps, AkkoordKast,/.test(html),
    'de uitleg hoort naar Instellingen, Apps, AkkoordKast te wijzen');
  // En het controlepaneel zegt het ook.
  assert.match(html, /je gebruikt de app als app/, 'het controlepaneel hoort de app-modus te melden');
  // Bij nul microfoons volgt de concrete stap, niet alleen een getal.
  assert.match(html, /microfoons gevonden: 0/, 'nul microfoons hoort apart behandeld te worden');
  assert.match(html, /de microfoon staat uit; zet hem aan via/, 'met de stap erbij');
  // En de gewone-site-route blijft ook staan, met het wegvegen van de rechten.
  assert.ok(html.includes('Rechten resetten'), 'de route via het slotje en Rechten resetten hoort te blijven');
});

test('als de app de microfoon niet mag aanvragen, is er een weg naar de browser', () => {
  // Schermafbeelding van App-rechten: alleen Meldingen toegestaan en "Geen rechten geweigerd" - de
  // microfoon is nooit gevraagd. Dan moet de app zelf een uitweg bieden: hetzelfde adres in de browser.
  const html = fs.readFileSync(path.join(wortel, 'public', 'index.html'), 'utf8');
  assert.match(html, /id="stem-open-chrome"/, 'er hoort een knop naar de browser te zijn');
  assert.match(html, /Open de app in Chrome/, 'met duidelijke tekst');
  assert.match(html, /open\.href = location\.origin/, 'het adres hoort uit location.origin te komen');
  assert.ok(html.includes('id="stem-in-chrome"'), 'de knop hoort een eigen vak te hebben');
  assert.match(html, /if \(alsApp\(\)\) \{\n\s+var weg = \$\('stem-in-chrome'\)/, 'en alleen bij de app-modus');
  // Het publieke adres van de app hoort niet in het repo te staan.
  assert.ok(!html.includes('werdensmedia.net'), 'het adres van de app mag niet in de pagina staan');
});

test('stemmen zonder microfoon is zichtbaar als uitweg', () => {
  // De microfoon van de geinstalleerde app is op sommige toestellen niet aan te vragen. De snaartononen
  // in de kaart Stemmen werken altijd; dat hoort er dan ook te staan.
  const html = fs.readFileSync(path.join(wortel, 'public', 'index.html'), 'utf8');
  assert.match(html, /Werkt de microfoon van je toestel niet\?/, 'de kaart Stemmen hoort de uitweg te noemen');
  assert.match(html, /op gehoor stemmen/, 'met uitleg hoe');
  assert.match(html, /Je kunt ook zonder microfoon stemmen/, 'de melding bij een fout hoort er ook naar te wijzen');
  // En de tonen zelf zijn er: zes snaren die een toon spelen.
  assert.match(html, /function tekenSnaren/, 'de snaartononen horen er te zijn');
  assert.match(html, /data-snaar/, 'met een knop per snaar');
});

test('de app legt een Cloudflare-fout bij het bijwerken uit', () => {
  // Klacht: "ik krijg een 502 melding". De foutpagina was Cloudflare Tunnel error 1033: de tunnel kon de
  // app even niet bereiken, meestal omdat de app net opnieuw opstartte na Bijwerken. Dat hoort er te staan.
  const html = fs.readFileSync(path.join(wortel, 'public', 'index.html'), 'utf8');
  assert.match(html, /Cloudflare 1033/, 'de kaart Beheer en bijwerken hoort 1033 te noemen');
  assert.match(html, /1033 of 502/, 'de melding bij Bijwerken ook');
  assert.match(html, /De app stopt zo en start opnieuw/, 'met de uitleg dat de app herstart');
  assert.match(html, /wacht dan tien tellen en ververs/, 'en wat je dan moet doen');
});

test('de microfoon-uitleg noemt ook Chrome zelf en de telefoon-instellingen', () => {
  // "In Chrome zelf kan ik de microfoon ook niet gebruiken" wijst naar de bovenliggende schakelaars: de
  // microfoon voor de Chrome-app, of de site-instelling van Chrome die op Blokkeren staat.
  const html = fs.readFileSync(path.join(wortel, 'public', 'index.html'), 'utf8');
  assert.match(html, /Site-instellingen, Microfoon/, 'de site-instelling van Chrome hoort erbij');
  assert.match(html, /Machtigingsbeheer, Microfoon/, 'en de centrale plek in de telefoon');
  assert.match(html, /in geen enkele site/, 'het moet duidelijk zijn dat dit de bovenliggende laag is');
  assert.match(html, /snaartononen: die werken altijd/, 'met de uitweg ernaast');
});
