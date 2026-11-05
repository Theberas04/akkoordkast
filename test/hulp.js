'use strict';
// In de proeven vult de app dit niet op de achtergrond aan: anders zou het werk van de proef
// ermee in de war kunnen lopen. De proef die dit juist wél wil, zet het zelf aan.
process.env.OPNAME_AUTO_UIT = '1';
// Testhulp: start de app op een vrije poort met een tijdelijke database en mediabibliotheek.
const fs = require('fs');
const os = require('os');
const path = require('path');

function maakOmgeving() {
  const wortel = fs.mkdtempSync(path.join(os.tmpdir(), 'akkoordkast-'));
  process.env.DB_PATH = path.join(wortel, 'test.db');
  process.env.MEDIA_DIR = path.join(wortel, 'media');
  process.env.DATA_DIR = wortel;
  process.env.PORT = '0';
  process.env.CAST_PYTHON = process.env.CAST_PYTHON || 'python3';
  fs.mkdirSync(process.env.MEDIA_DIR, { recursive: true });
  return wortel;
}

function start() {
  const wortel = maakOmgeving();
  delete require.cache[require.resolve('../server')];
  delete require.cache[require.resolve('../liedjes-bron')];
  const app = require('../server');
  return new Promise(resolve => {
    app.server.listen(0, '127.0.0.1', () => {
      const poort = app.server.address().port;
      resolve({
        app,
        wortel,
        basis: `http://127.0.0.1:${poort}`,
        async stop() {
          await new Promise(r => app.server.close(r));
          try { app.db.close(); } catch (e) {}
          fs.rmSync(wortel, { recursive: true, force: true });
        }
      });
    });
  });
}

async function haal(basis, pad, opties) {
  const r = await fetch(basis + pad, opties);
  const type = r.headers.get('content-type') || '';
  const data = type.includes('json') ? await r.json() : await r.text();
  return { status: r.status, data, type, headers: r.headers };
}

const post = (basis, pad, lichaam) => haal(basis, pad, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(lichaam || {})
});

// De beheerder worden, zoals de browser dat doet: een wachtwoord instellen, het koekje
// onthouden en daarna alles met dat koekje sturen. Zonder dit weigert de app alles wat iets
// toevoegt (dat is juist de bedoeling).
async function alsBeheerder(basis, wachtwoord = 'proefwachtwoord') {
  const eerste = await post(basis, '/api/beheer/wachtwoord', { wachtwoord });
  const koekje = String(eerste.headers.get('set-cookie') || '').split(';')[0];
  // Het toevoeggereedschap hoort bij het beheerdersprofiel, dus sturen we dat profiel mee
  // (in de app kies je het in de profielkiezer).
  const profielen = await haal(basis, '/api/profielen', { headers: { cookie: koekje } });
  const baas = (profielen.data.profielen || []).find(p => p.beheer);
  const profielKop = baas ? { 'x-profiel': String(baas.id) } : {};
  const metKoekje = (opties = {}) => Object.assign({}, opties, {
    // Een expliciet meegegeven profiel (voor de test met meerdere profielen) wint van het
    // beheerdersprofiel.
    headers: Object.assign({}, profielKop, opties.headers, { cookie: koekje })
  });
  return {
    wachtwoord,
    koekje,
    eerste,
    profiel: baas ? baas.id : 0,
    haal: (pad, opties) => haal(basis, pad, metKoekje(opties)),
    post: (pad, lichaam) => haal(basis, pad, metKoekje({
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(lichaam || {})
    })),
    del: pad => haal(basis, pad, metKoekje({ method: 'DELETE' }))
  };
}

// De handleiding hoort niet meer in het repo maar in de gegevensmap. Een proef die hem wil
// openen zet hier een klein exemplaar neer (met een beeld erbij), zoals de bijwerker dat doet.
function zetHandleiding(wortel) {
  const map = path.join(wortel, 'handleiding');
  fs.mkdirSync(path.join(map, 'img'), { recursive: true });
  fs.writeFileSync(path.join(map, 'index.html'),
    '<!doctype html><meta charset="utf-8"><title>AkkoordKast — handleiding</title>' +
    '<h1>AkkoordKast — handleiding</h1><h2>Meespelen met muziek</h2>' +
    '<img src="img/spelen-desktop.png" alt="Spelen">', 'utf8');
  fs.writeFileSync(path.join(map, 'img', 'spelen-desktop.png'), Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
  return map;
}

module.exports = { start, haal, post, maakOmgeving, alsBeheerder, zetHandleiding };
