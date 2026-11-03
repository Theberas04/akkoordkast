'use strict';
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

module.exports = { start, haal, post, maakOmgeving };
