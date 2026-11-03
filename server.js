'use strict';
// AkkoordKast — gitaar-songbook met capo-advies, grepen, audio en Chromecast.
// Eén Node-service: HTTP + node:sqlite + statische bestanden uit public/.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const chordpro = require('./lib/chordpro');
const capo = require('./lib/capo');
const grepen = require('./lib/grepen');
const gitaar = require('./lib/gitaar');
const theorie = require('./lib/theorie');
const bron = require('./liedjes-bron');

const PORT = Number(process.env.PORT || 8090);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const MEDIA_DIR = process.env.MEDIA_DIR || path.join(DATA_DIR, 'media');
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'akkoordkast.db');
const CAST_PYTHON = process.env.CAST_PYTHON || 'python3';
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const CAST_HELPER = path.join(__dirname, 'scripts', 'cast-helper.py');
const EIGEN_START = 900000;

fs.mkdirSync(MEDIA_DIR, { recursive: true });
fs.mkdirSync(path.join(MEDIA_DIR, 'audio'), { recursive: true });
fs.mkdirSync(path.join(MEDIA_DIR, 'preview'), { recursive: true });

// ---------------------------------------------------------------- database ---
const db = new DatabaseSync(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS liedjes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titel TEXT NOT NULL,
    artiest TEXT NOT NULL DEFAULT '',
    taal TEXT NOT NULL DEFAULT 'nl',
    genre TEXT NOT NULL DEFAULT 'Eigen',
    moeilijkheid INTEGER NOT NULL DEFAULT 2,
    toonsoort TEXT NOT NULL DEFAULT '',
    tempo INTEGER NOT NULL DEFAULT 84,
    strum TEXT NOT NULL DEFAULT 'D DU UDU',
    bron TEXT NOT NULL DEFAULT '',
    youtube TEXT NOT NULL DEFAULT '',
    notitie TEXT NOT NULL DEFAULT '',
    chordpro TEXT NOT NULL,
    audio_bestand TEXT NOT NULL DEFAULT '',
    audio_titel TEXT NOT NULL DEFAULT '',
    aangemaakt TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS instellingen (
    sleutel TEXT PRIMARY KEY,
    waarde TEXT NOT NULL DEFAULT ''
  );
`);

const SLEUTELS = ['cast_apparaat', 'cast_naam', 'laatste_liedje'];

function zetInstelling(sleutel, waarde) {
  db.prepare('INSERT INTO instellingen (sleutel, waarde) VALUES (?, ?) ON CONFLICT(sleutel) DO UPDATE SET waarde = excluded.waarde')
    .run(String(sleutel), String(waarde == null ? '' : waarde));
}
function leesInstelling(sleutel, standaard) {
  const rij = db.prepare('SELECT waarde FROM instellingen WHERE sleutel = ?').get(String(sleutel));
  return rij ? rij.waarde : (standaard === undefined ? '' : standaard);
}
function alleInstellingen() {
  const uit = {};
  for (const rij of db.prepare('SELECT sleutel, waarde FROM instellingen').all()) uit[rij.sleutel] = rij.waarde;
  return uit;
}

// ------------------------------------------------------------ eigen liedjes ---
function normaliseerLiedje(invoer) {
  const tekst = String(invoer.chordpro || '').trim();
  if (!tekst) throw new Error('Het liedje heeft geen ChordPro-tekst.');
  const model = chordpro.parse(tekst);
  const titel = String(invoer.titel || model.meta.titel || '').trim();
  if (!titel) throw new Error('Geef het liedje een titel.');
  return {
    titel: titel.slice(0, 160),
    artiest: String(invoer.artiest || model.meta.artiest || '').slice(0, 160),
    taal: (String(invoer.taal || 'nl').toLowerCase().slice(0, 5)) || 'nl',
    genre: String(invoer.genre || 'Eigen').slice(0, 40),
    moeilijkheid: Math.max(1, Math.min(5, parseInt(invoer.moeilijkheid, 10) || 2)),
    toonsoort: String(invoer.toonsoort || model.meta.toonsoort || model.akkoorden[0] || 'C').slice(0, 8),
    tempo: Math.max(40, Math.min(200, parseInt(invoer.tempo, 10) || model.meta.tempo || 84)),
    strum: String(invoer.strum || model.meta.strum || 'D DU UDU').slice(0, 40),
    bron: String(invoer.bron || '').slice(0, 200),
    youtube: String(invoer.youtube || '').slice(0, 300),
    notitie: String(invoer.notitie || '').slice(0, 500),
    chordpro: tekst.slice(0, 20000)
  };
}

function eigenRij(id) {
  const rij = db.prepare('SELECT * FROM liedjes WHERE id = ?').get(Number(id));
  if (!rij) return null;
  const model = chordpro.parse(rij.chordpro);
  const toonsoort = rij.toonsoort || model.meta.toonsoort || model.akkoorden[0] || 'C';
  return {
    id: EIGEN_START + rij.id,
    rijId: rij.id,
    titel: rij.titel,
    artiest: rij.artiest,
    taal: rij.taal,
    genre: rij.genre,
    moeilijkheid: rij.moeilijkheid,
    toonsoort,
    tempo: rij.tempo,
    strum: rij.strum,
    bron: rij.bron || 'Eigen invoer',
    youtube: rij.youtube,
    notitie: rij.notitie,
    chordpro: rij.chordpro,
    audio_bestand: rij.audio_bestand,
    audio_titel: rij.audio_titel,
    eigen: true,
    model,
    advies: capo.advies(model.akkoorden, toonsoort)
  };
}

function eigenLiedjes() {
  return db.prepare('SELECT id FROM liedjes ORDER BY titel COLLATE NOCASE').all().map(r => eigenRij(r.id));
}

function vindLiedje(id) {
  const n = Number(id);
  if (!Number.isFinite(n)) return null;
  if (n >= EIGEN_START) return eigenRij(n - EIGEN_START);
  const lied = bron.vind(n);
  return lied ? Object.assign({}, lied, { eigen: false, audio_bestand: '', audio_titel: '', notitie: '', youtube: lied.youtube || '' }) : null;
}

// ------------------------------------------------------------------ weergave ---
// Bouwt het complete beeld van een liedje: model, capo-advies, grepen en audio.
function weergave(lied, opties) {
  const o = Object.assign({ transpose: 0, capoStand: null }, opties || {});
  const stappen = Math.max(-11, Math.min(11, parseInt(o.transpose, 10) || 0));
  const mol = theorie.toonsoortVoorkeur(lied.toonsoort || 'C', stappen);
  const model = stappen ? chordpro.transponeerModel(lied.model, stappen, mol) : lied.model;
  const toonsoort = theorie.transponeerToonsoort(lied.toonsoort || 'C', stappen);
  const advies = capo.advies(model.akkoorden, toonsoort);
  const gekozenCapo = o.capoStand === null || o.capoStand === '' || o.capoStand === undefined
    ? advies.capo
    : Math.max(0, Math.min(12, parseInt(o.capoStand, 10) || 0));

  const akkoorden = theorie.uniek(model.akkoorden).map(naam => {
    const vorm = theorie.transponeer(naam, -gekozenCapo, false);
    return {
      naam,
      vorm,
      barre: grepen.isBarre(vorm),
      heeftDiagram: grepen.heeftGreep(vorm),
      svg: grepen.svgDiagram(vorm, { capo: gekozenCapo, toonNaam: naam === vorm ? naam : `${vorm} → ${naam}` })
    };
  });

  const reeks = chordpro.akkoordenReeks(model, 8);
  return {
    id: lied.id,
    titel: lied.titel,
    artiest: lied.artiest,
    taal: lied.taal,
    genre: lied.genre,
    moeilijkheid: lied.moeilijkheid,
    toonsoort,
    bron: lied.bron,
    youtube: lied.youtube,
    notitie: lied.notitie || '',
    eigen: !!lied.eigen,
    chordpro: lied.chordpro,
    tempo: lied.tempo,
    strum: lied.strum,
    transpositie: stappen,
    capo: gekozenCapo,
    advies,
    akkoorden,
    akkoordenReeks: reeks,
    model,
    audio: {
      opname: lied.audio_bestand ? `/media/audio/${lied.audio_bestand}` : '',
      opnameTitel: lied.audio_titel || '',
      preview: `/api/audio/preview?liedje=${lied.id}&capo=${gekozenCapo}&transpose=${stappen}&tempo=${lied.tempo}&strum=${encodeURIComponent(lied.strum)}`,
      youtube: lied.youtube || `https://www.youtube.com/results?search_query=${encodeURIComponent(`${lied.titel} ${lied.artiest}`)}`
    }
  };
}

function lijstItem(lied) {
  const advies = lied.advies;
  return {
    id: lied.id,
    titel: lied.titel,
    artiest: lied.artiest,
    taal: lied.taal,
    genre: lied.genre,
    moeilijkheid: lied.moeilijkheid,
    toonsoort: lied.toonsoort,
    akkoorden: theorie.uniek(lied.model.akkoorden),
    capo: advies.capo,
    capoTekst: advies.capo === 0 ? 'Zonder capo' : `Capo ${advies.capo} · ${advies.vormToonsoort}`,
    zonderCapo: advies.capo === 0,
    barrés: advies.akkoorden.filter(a => a.barre).length,
    bron: lied.bron,
    eigen: !!lied.eigen,
    heeftOpname: !!lied.audio_bestand,
    youtube: lied.youtube || '',
    tempo: lied.tempo
  };
}

function zoekLiedjes(query) {
  const q = (query.get('zoek') || '').trim().toLowerCase();
  const taal = (query.get('taal') || '').trim().toLowerCase();
  const genre = (query.get('genre') || '').trim().toLowerCase();
  const capoFilter = (query.get('capo') || '').trim().toLowerCase();
  const moeilijk = parseInt(query.get('moeilijkheid'), 10);
  const eigenFilter = (query.get('eigen') || '').trim();

  let uit = bron.alle().map(l => Object.assign({}, l, { eigen: false, audio_bestand: '', youtube: l.youtube || '', notitie: '' }));
  uit = uit.concat(eigenLiedjes());

  if (q) {
    uit = uit.filter(l => {
      const hooiberg = l.eigen
        ? [l.titel, l.artiest, l.genre, l.chordpro.replace(/\{[^}]*\}/g, ' ').replace(/\[[^\]]*\]/g, ' ')].join(' ').toLowerCase()
        : bron.zoekTekst(l);
      return hooiberg.includes(q);
    });
  }
  if (taal) uit = uit.filter(l => l.taal === taal);
  if (genre) uit = uit.filter(l => l.genre.toLowerCase() === genre);
  if (eigenFilter === '1') uit = uit.filter(l => l.eigen);
  if (eigenFilter === '0') uit = uit.filter(l => !l.eigen);
  if (Number.isFinite(moeilijk)) uit = uit.filter(l => l.moeilijkheid === moeilijk);
  if (capoFilter === 'ja') uit = uit.filter(l => l.advies.capo > 0);
  if (capoFilter === 'nee') uit = uit.filter(l => l.advies.capo === 0);
  return uit;
}

// ------------------------------------------------------------------- helpers ---
function json(res, code, data, extraKop) {
  const body = Buffer.from(JSON.stringify(data));
  const kop = Object.assign({
    'content-type': 'application/json; charset=utf-8',
    'content-length': body.length,
    'cache-control': 'no-store'
  }, extraKop || {});
  res.writeHead(code, kop);
  res.end(body);
}

function leesBody(req, limiet) {
  return new Promise((resolve, reject) => {
    const stukken = [];
    let lengte = 0;
    req.on('data', d => {
      lengte += d.length;
      if (lengte > (limiet || 4 * 1024 * 1024)) { reject(new Error('Verzoek te groot')); req.destroy(); return; }
      stukken.push(d);
    });
    req.on('end', () => resolve(Buffer.concat(stukken)));
    req.on('error', reject);
  });
}

function leesJsonBody(req) {
  return leesBody(req, 1024 * 1024).then(b => {
    if (!b.length) return {};
    try { return JSON.parse(b.toString('utf8')); } catch (e) { throw new Error('Ongeldige JSON in het verzoek.'); }
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.webm': 'audio/webm',
  '.mp4': 'video/mp4'
};

function stuurBestand(req, res, bestand, mime, kop) {
  let stat;
  try { stat = fs.statSync(bestand); } catch (e) { json(res, 404, { fout: 'Niet gevonden' }); return; }
  const type = mime || MIME[path.extname(bestand).toLowerCase()] || 'application/octet-stream';
  const bereik = req.headers.range;
  const hoofd = Object.assign({
    'content-type': type,
    'accept-ranges': 'bytes',
    'cache-control': 'public, max-age=300'
  }, kop || {});
  if (bereik) {
    const m = /bytes=(\d*)-(\d*)/.exec(bereik);
    if (m) {
      const van = m[1] ? parseInt(m[1], 10) : 0;
      const tot = m[2] ? parseInt(m[2], 10) : stat.size - 1;
      if (van >= stat.size || tot >= stat.size || van > tot) {
        res.writeHead(416, { 'content-range': `bytes */${stat.size}` });
        res.end();
        return;
      }
      hoofd['content-range'] = `bytes ${van}-${tot}/${stat.size}`;
      hoofd['content-length'] = tot - van + 1;
      res.writeHead(206, hoofd);
      fs.createReadStream(bestand, { start: van, end: tot }).pipe(res);
      return;
    }
  }
  hoofd['content-length'] = stat.size;
  res.writeHead(200, hoofd);
  fs.createReadStream(bestand).pipe(res);
}

// --------------------------------------------------------------------- audio ---
function veiligeNaam(naam) {
  return String(naam || '').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120);
}

const audioBezig = new Map();

function hashVan(obj) {
  return crypto.createHash('sha1').update(JSON.stringify(obj)).digest('hex').slice(0, 16);
}

// Genereert (met cache) een mp3/wav van de akkoordenreeks van een liedje.
function maakPreview(opties) {
  const sleutel = hashVan(opties);
  const mp3 = path.join(MEDIA_DIR, 'preview', `${sleutel}.mp3`);
  const wav = path.join(MEDIA_DIR, 'preview', `${sleutel}.wav`);
  if (fs.existsSync(mp3)) return { bestand: mp3, type: 'audio/mpeg' };
  if (fs.existsSync(wav)) return { bestand: wav, type: 'audio/wav' };
  if (audioBezig.has(sleutel)) return audioBezig.get(sleutel);

  const wavBuffer = gitaar.maakWav({
    akkoorden: opties.akkoorden,
    capo: opties.capo,
    bpm: opties.tempo,
    strum: opties.strum,
    rondes: opties.rondes
  });
  fs.writeFileSync(wav, wavBuffer);
  const omzetten = spawnSync(FFMPEG, ['-v', 'error', '-y', '-i', wav, '-codec:a', 'libmp3lame', '-b:a', '128k', mp3], { timeout: 30000 });
  if (omzetten.status === 0 && fs.existsSync(mp3)) {
    try { fs.unlinkSync(wav); } catch (e) {}
    return { bestand: mp3, type: 'audio/mpeg' };
  }
  return { bestand: wav, type: 'audio/wav' };
}

function previewVoorLiedje(lied, query) {
  const capoStand = query.get('capo');
  const stappen = parseInt(query.get('transpose'), 10) || 0;
  const mol = theorie.toonsoortVoorkeur(lied.toonsoort || 'C', stappen);
  const model = stappen ? chordpro.transponeerModel(lied.model, stappen, mol) : lied.model;
  const advies = capo.advies(model.akkoorden, theorie.transponeerToonsoort(lied.toonsoort || 'C', stappen));
  const gebruikCapo = capoStand === null || capoStand === '' ? advies.capo : Math.max(0, Math.min(12, parseInt(capoStand, 10) || 0));
  const eigenReeks = (query.get('reeks') || '').split(/[\s,]+/).filter(a => grepen.heeftGreep(theorie.transponeer(a, 0, false)));
  const reeks = eigenReeks.length ? eigenReeks.map(a => theorie.transponeer(a, 0, false)) : chordpro.akkoordenReeks(model, 8);
  return maakPreview({
    liedje: lied.id,
    akkoorden: reeks,
    capo: gebruikCapo,
    tempo: Math.max(40, Math.min(200, parseInt(query.get('tempo'), 10) || lied.tempo || 84)),
    strum: query.get('strum') || lied.strum || 'D DU UDU',
    rondes: Math.max(1, Math.min(6, parseInt(query.get('rondes'), 10) || 2))
  });
}

// ---------------------------------------------------------------------- cast ---
function castHelper(args, timeout) {
  if (!fs.existsSync(CAST_HELPER)) return { fout: 'cast-helper ontbreekt' };
  const uit = spawnSync(CAST_PYTHON, [CAST_HELPER].concat(args), {
    timeout: timeout || 25000,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024
  });
  const stdout = (uit.stdout || '').trim();
  if (!stdout) {
    const melding = (uit.stderr || '').trim().split('\n').slice(-3).join(' ') || 'onbekende fout';
    return { fout: melding };
  }
  try {
    return JSON.parse(stdout.split('\n').pop());
  } catch (e) {
    return { fout: 'Onleesbaar antwoord van de cast-helper: ' + stdout.slice(0, 200) };
  }
}

// ---------------------------------------------------------------- router ---
async function verwerk(req, res) {
  const basis = 'http://localhost';
  let url;
  try {
    let pad = req.url || '/';
    if (!pad.startsWith('/')) pad = '/' + pad.replace(/^\/+/, '');
    url = new URL(pad, basis);
  } catch (e) {
    json(res, 400, { fout: 'Ongeldige aanvraag' });
    return;
  }
  const methode = req.method || 'GET';
  const pad = url.pathname;
  const query = url.searchParams;

  if (pad === '/healthz') {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'x-akkoordkast': 'app' });
    res.end('ok');
    return;
  }

  if (pad === '/' || pad === '/index.html') {
    stuurBestand(req, res, path.join(__dirname, 'public', 'index.html'), MIME['.html'], { 'cache-control': 'no-cache' });
    return;
  }

  // --- liedjes ---
  if (pad === '/api/liedjes' && methode === 'GET') {
    const compact = query.get('compact') === '1';
    let uit = zoekLiedjes(query);
    const totaal = uit.length;
    const vanaf = Math.max(0, parseInt(query.get('vanaf'), 10) || 0);
    const aantal = Math.max(1, Math.min(200, parseInt(query.get('aantal'), 10) || (compact ? 48 : 200)));
    const pagina = uit.slice(vanaf, vanaf + aantal);
    json(res, 200, {
      totaal,
      vanaf,
      aantal: pagina.length,
      meer: vanaf + pagina.length < totaal,
      statistieken: bron.statistieken(),
      liedjes: pagina.map(lijstItem)
    });
    return;
  }

  if (pad === '/api/liedjes' && (methode === 'POST' || methode === 'PUT')) {
    const body = await leesJsonBody(req);
    let gegevens;
    try { gegevens = normaliseerLiedje(body); } catch (e) { json(res, 400, { fout: e.message }); return; }
    const nu = new Date().toISOString();
    const info = db.prepare(`INSERT INTO liedjes (titel, artiest, taal, genre, moeilijkheid, toonsoort, tempo, strum, bron, youtube, notitie, chordpro, aangemaakt)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      gegevens.titel, gegevens.artiest, gegevens.taal, gegevens.genre, gegevens.moeilijkheid,
      gegevens.toonsoort, gegevens.tempo, gegevens.strum, gegevens.bron, gegevens.youtube,
      gegevens.notitie, gegevens.chordpro, nu);
    const id = EIGEN_START + Number(info.lastInsertRowid);
    const nieuw = vindLiedje(id);
    json(res, 201, { ok: true, id, liedje: lijstItem(Object.assign({}, nieuw, { eigen: true })) });
    return;
  }

  const importMatch = pad.match(/^\/api\/liedjes\/import$/);
  if (importMatch && methode === 'POST') {
    const body = await leesJsonBody(req);
    // De pagina stuurt chordpro, een script of plaksel mag ook tekst heten.
    const ruweTekst = String(body.tekst || body.chordpro || '');
    if (!ruweTekst.trim()) { json(res, 400, { fout: 'Plak eerst ChordPro-tekst om te importeren.' }); return; }
    // Meerdere liedjes in één tekst: splits op een nieuwe {title: ...} na een lege regel.
    const blokken = ruweTekst.split(/\n(?=\s*\{\s*(?:title|t)\s*:)/i).map(b => b.trim()).filter(Boolean);
    const ids = [];
    let eersteFout = '';
    for (const blok of blokken) {
      const model = chordpro.parse(blok);
      let gegevens;
      try {
        gegevens = normaliseerLiedje(Object.assign({}, body, {
          chordpro: blok,
          titel: body.titel || model.meta.titel || `Geïmporteerd liedje ${ids.length + 1}`,
          toonsoort: body.toonsoort || model.meta.toonsoort || '',
          taal: body.taal || 'nl'
        }));
      } catch (e) {
        if (!eersteFout) eersteFout = e.message;
        continue;
      }
      const info = db.prepare(`INSERT INTO liedjes (titel, artiest, taal, genre, moeilijkheid, toonsoort, tempo, strum, bron, youtube, notitie, chordpro, aangemaakt)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        gegevens.titel, gegevens.artiest, gegevens.taal, gegevens.genre, gegevens.moeilijkheid,
        gegevens.toonsoort, gegevens.tempo, gegevens.strum, gegevens.bron || 'Import', gegevens.youtube,
        gegevens.notitie, gegevens.chordpro, new Date().toISOString());
      ids.push(EIGEN_START + Number(info.lastInsertRowid));
    }
    if (!ids.length) {
      json(res, 400, { ok: false, aantal: 0, ids: [], fout: eersteFout || 'Geen liedje herkend in deze tekst.' });
      return;
    }
    json(res, 201, { ok: true, aantal: ids.length, ids, fout: eersteFout || undefined });
    return;
  }

  let m = pad.match(/^\/api\/liedjes\/(\d+)$/);
  if (m && methode === 'GET') {
    const lied = vindLiedje(m[1]);
    if (!lied) { json(res, 404, { fout: 'Liedje niet gevonden' }); return; }
    zetInstelling('laatste_liedje', String(m[1]));
    json(res, 200, weergave(lied, { transpose: query.get('transpose'), capoStand: query.get('capo') }));
    return;
  }

  if (m && (methode === 'PUT' || methode === 'PATCH')) {
    const n = Number(m[1]);
    if (n < EIGEN_START) { json(res, 404, { fout: 'Meegeleverde liedjes kun je niet wijzigen. Maak er een eigen kopie van.' }); return; }
    const rijId = n - EIGEN_START;
    const bestaand = db.prepare('SELECT * FROM liedjes WHERE id = ?').get(rijId);
    if (!bestaand) { json(res, 404, { fout: 'Liedje niet gevonden' }); return; }
    const body = await leesJsonBody(req);
    const samen = Object.assign({}, bestaand, body, { chordpro: body.chordpro || bestaand.chordpro });
    let gegevens;
    try { gegevens = normaliseerLiedje(samen); } catch (e) { json(res, 400, { fout: e.message }); return; }
    db.prepare(`UPDATE liedjes SET titel=?, artiest=?, taal=?, genre=?, moeilijkheid=?, toonsoort=?, tempo=?, strum=?, bron=?, youtube=?, notitie=?, chordpro=? WHERE id=?`)
      .run(gegevens.titel, gegevens.artiest, gegevens.taal, gegevens.genre, gegevens.moeilijkheid,
        gegevens.toonsoort, gegevens.tempo, gegevens.strum, gegevens.bron, gegevens.youtube,
        gegevens.notitie, gegevens.chordpro, rijId);
    json(res, 200, { ok: true, id: n });
    return;
  }

  if (m && methode === 'DELETE') {
    const n = Number(m[1]);
    if (n < EIGEN_START) { json(res, 404, { fout: 'Meegeleverde liedjes kun je niet verwijderen.' }); return; }
    const rijId = n - EIGEN_START;
    const rij = db.prepare('SELECT audio_bestand FROM liedjes WHERE id = ?').get(rijId);
    if (!rij) { json(res, 404, { fout: 'Liedje niet gevonden' }); return; }
    if (rij.audio_bestand) {
      try { fs.unlinkSync(path.join(MEDIA_DIR, 'audio', rij.audio_bestand)); } catch (e) {}
    }
    db.prepare('DELETE FROM liedjes WHERE id = ?').run(rijId);
    json(res, 200, { ok: true });
    return;
  }

  // --- opname uploaden ---
  const uploadMatch = pad.match(/^\/api\/liedjes\/(\d+)\/audio$/);
  if (uploadMatch && methode === 'POST') {
    const n = Number(uploadMatch[1]);
    if (n < EIGEN_START) {
      json(res, 400, { fout: 'Audio kun je alleen aan je eigen liedjes hangen. Maak eerst een eigen versie van dit liedje.' });
      return;
    }
    const rijId = n - EIGEN_START;
    const bestaand = db.prepare('SELECT audio_bestand FROM liedjes WHERE id = ?').get(rijId);
    if (!bestaand) { json(res, 404, { fout: 'Liedje niet gevonden' }); return; }
    const soort = String(req.headers['content-type'] || '').toLowerCase();
    if (!/audio\/(mpeg|mp3|wav|x-wav|ogg|mp4|webm|m4a)/.test(soort)) {
      json(res, 400, { fout: 'Alleen audiobestanden (mp3, wav, ogg, m4a) zijn toegestaan.' });
      return;
    }
    const buffer = await leesBody(req, 40 * 1024 * 1024);
    const extentie = soort.includes('mpeg') || soort.includes('mp3') ? 'mp3'
      : soort.includes('wav') ? 'wav'
      : soort.includes('ogg') ? 'ogg'
      : soort.includes('webm') ? 'webm' : 'm4a';
    const naam = `${rijId}-${Date.now()}-${veiligeNaam(req.headers['x-bestandsnaam'] || 'opname')}`;
    const bestand = `${naam.replace(/\.[A-Za-z0-9]+$/, '')}.${extentie}`.slice(-160);
    fs.writeFileSync(path.join(MEDIA_DIR, 'audio', bestand), buffer);
    if (bestaand.audio_bestand && bestaand.audio_bestand !== bestand) {
      try { fs.unlinkSync(path.join(MEDIA_DIR, 'audio', bestaand.audio_bestand)); } catch (e) {}
    }
    db.prepare('UPDATE liedjes SET audio_bestand = ?, audio_titel = ? WHERE id = ?')
      .run(bestand, String(req.headers['x-audio-titel'] || 'Eigen opname').slice(0, 120), rijId);
    json(res, 201, { ok: true, bestand, url: `/media/audio/${bestand}` });
    return;
  }

  const audioDelMatch = pad.match(/^\/api\/liedjes\/(\d+)\/audio$/);
  if (audioDelMatch && methode === 'DELETE') {
    const n = Number(audioDelMatch[1]);
    if (n < EIGEN_START) { json(res, 400, { fout: 'Niet toegestaan.' }); return; }
    const rijId = n - EIGEN_START;
    const rij = db.prepare('SELECT audio_bestand FROM liedjes WHERE id = ?').get(rijId);
    if (!rij) { json(res, 404, { fout: 'Liedje niet gevonden' }); return; }
    if (rij.audio_bestand) {
      try { fs.unlinkSync(path.join(MEDIA_DIR, 'audio', rij.audio_bestand)); } catch (e) {}
    }
    db.prepare('UPDATE liedjes SET audio_bestand = ? WHERE id = ?').run('', rijId);
    json(res, 200, { ok: true });
    return;
  }

  // --- meegeleverde liedjes als eigen kopie ---
  const kopieMatch = pad.match(/^\/api\/liedjes\/(\d+)\/kopie$/);
  if (kopieMatch && methode === 'POST') {
    const bronLied = vindLiedje(kopieMatch[1]);
    if (!bronLied) { json(res, 404, { fout: 'Liedje niet gevonden' }); return; }
    const gegevens = normaliseerLiedje({
      titel: `${bronLied.titel} (eigen kopie)`,
      artiest: bronLied.artiest,
      taal: bronLied.taal,
      genre: 'Eigen',
      moeilijkheid: bronLied.moeilijkheid,
      toonsoort: bronLied.toonsoort,
      tempo: bronLied.tempo,
      strum: bronLied.strum,
      bron: bronLied.bron,
      youtube: bronLied.youtube,
      chordpro: bronLied.chordpro
    });
    const info = db.prepare(`INSERT INTO liedjes (titel, artiest, taal, genre, moeilijkheid, toonsoort, tempo, strum, bron, youtube, notitie, chordpro, aangemaakt)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      gegevens.titel, gegevens.artiest, gegevens.taal, gegevens.genre, gegevens.moeilijkheid,
      gegevens.toonsoort, gegevens.tempo, gegevens.strum, gegevens.bron, gegevens.youtube,
      '', gegevens.chordpro, new Date().toISOString());
    json(res, 201, { ok: true, id: EIGEN_START + Number(info.lastInsertRowid) });
    return;
  }

  // --- audio preview ---
  if (pad === '/api/audio/preview' && methode === 'GET') {
    const lied = vindLiedje(query.get('liedje'));
    if (!lied) { json(res, 404, { fout: 'Liedje niet gevonden' }); return; }
    let resultaat;
    try {
      resultaat = previewVoorLiedje(lied, query);
    } catch (e) {
      json(res, 400, { fout: e.message });
      return;
    }
    stuurBestand(req, res, resultaat.bestand, resultaat.type);
    return;
  }

  // --- instellingen ---
  if (pad === '/api/instellingen' && methode === 'GET') {
    json(res, 200, alleInstellingen());
    return;
  }
  if (pad === '/api/instellingen' && methode === 'POST') {
    const body = await leesJsonBody(req);
    for (const sleutel of SLEUTELS) {
      if (Object.prototype.hasOwnProperty.call(body, sleutel)) zetInstelling(sleutel, body[sleutel]);
    }
    json(res, 200, { ok: true, instellingen: alleInstellingen() });
    return;
  }

  // --- casten ---
  if (pad === '/api/cast/apparaten' && methode === 'GET') {
    const uit = castHelper(['apparaten'], 20000);
    json(res, 200, Object.assign({ apparaten: [], python: CAST_PYTHON }, uit));
    return;
  }
  if (pad === '/api/cast/start' && methode === 'POST') {
    const body = await leesJsonBody(req);
    let mediaUrl = String(body.url || '');
    let titel = String(body.titel || 'AkkoordKast');
    let artiest = String(body.artiest || '');
    let type = String(body.type || 'audio/mpeg');
    if (!mediaUrl && body.liedje) {
      const lied = vindLiedje(body.liedje);
      if (!lied) { json(res, 404, { fout: 'Liedje niet gevonden' }); return; }
      titel = lied.titel;
      artiest = lied.artiest;
      if (body.bron === 'opname' && lied.audio_bestand) {
        mediaUrl = `/media/audio/${lied.audio_bestand}`;
        type = lied.audio_bestand.endsWith('.mp3') ? 'audio/mpeg' : 'audio/wav';
      } else {
        const resultaat = previewVoorLiedje(lied, new URLSearchParams({
          capo: String(body.capo == null ? '' : body.capo),
          transpose: String(body.transpose || 0)
        }));
        mediaUrl = null; // hieronder omgezet naar een absolute URL
        const bestand = path.basename(resultaat.bestand);
        mediaUrl = `/api/audio/preview?liedje=${lied.id}&capo=${body.capo == null ? '' : body.capo}&transpose=${body.transpose || 0}`;
        type = resultaat.type;
        void bestand;
      }
    }
    if (!mediaUrl) { json(res, 400, { fout: 'Geen audio om te casten.' }); return; }
    const host = req.headers.host || `localhost:${PORT}`;
    const basis = (body.basis || `http://${host}`);
    const absoluut = mediaUrl.startsWith('http') ? mediaUrl : basis.replace(/\/$/, '') + mediaUrl;
    const poster = basis.replace(/\/$/, '') + '/icon-512.png';
    const uit = castHelper(['speel', String(body.apparaat || ''), absoluut, titel, artiest, type, poster], 30000);
    if (!uit.fout) {
      zetInstelling('cast_apparaat', String(body.apparaat || ''));
      zetInstelling('cast_naam', String(body.naam || ''));
    }
    json(res, uit.fout ? 502 : 200, uit);
    return;
  }
  if (pad === '/api/cast/stop' && methode === 'POST') {
    const body = await leesJsonBody(req);
    json(res, 200, castHelper(['stop', String(body.apparaat || '')], 20000));
    return;
  }
  if (pad === '/api/cast/volume' && methode === 'POST') {
    const body = await leesJsonBody(req);
    json(res, 200, castHelper(['volume', String(body.apparaat || ''), String(body.niveau)], 20000));
    return;
  }
  if (pad === '/api/cast/status' && methode === 'POST') {
    const body = await leesJsonBody(req);
    json(res, 200, castHelper(['status', String(body.apparaat || '')], 20000));
    return;
  }

  // --- media ---
  if (pad.startsWith('/media/')) {
    const rest = pad.slice('/media/'.length);
    if (rest.includes('..') || rest.includes('\0')) { json(res, 400, { fout: 'Ongeldige bestandsnaam' }); return; }
    const bestand = path.join(MEDIA_DIR, rest);
    if (!bestand.startsWith(MEDIA_DIR)) { json(res, 400, { fout: 'Ongeldige bestandsnaam' }); return; }
    stuurBestand(req, res, bestand);
    return;
  }

  // --- statische bestanden ---
  if (methode === 'GET' || methode === 'HEAD') {
    const rest = pad.replace(/^\/+/, '');
    if (rest.includes('..') || rest.includes('\0')) { json(res, 400, { fout: 'Ongeldige bestandsnaam' }); return; }
    const bestand = path.join(__dirname, 'public', rest);
    if (!bestand.startsWith(path.join(__dirname, 'public'))) { json(res, 400, { fout: 'Ongeldige bestandsnaam' }); return; }
    if (Object.prototype.hasOwnProperty.call(MIME, path.extname(bestand).toLowerCase()) && fs.existsSync(bestand) && fs.statSync(bestand).isFile()) {
      stuurBestand(req, res, bestand);
      return;
    }
  }

  json(res, 404, { fout: 'Not found' });
}

const server = http.createServer((req, res) => {
  Promise.resolve()
    .then(() => verwerk(req, res))
    .catch(e => {
      try { json(res, 500, { fout: e.message || 'Interne fout' }); } catch (x) { try { res.end(); } catch (y) {} }
    });
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`AkkoordKast luistert op http://0.0.0.0:${PORT} (${bron.alle().length} meegeleverde liedjes)`);
  });
}

module.exports = {
  server, db, verstuur: verwerk,
  weergave, lijstItem, zoekLiedjes, normaliseerLiedje, vindLiedje, eigenRij,
  maakPreview, previewVoorLiedje, castHelper, leesInstelling, zetInstelling,
  paden: { DATA_DIR, MEDIA_DIR, DB_PATH, CAST_HELPER, EIGEN_START, PORT }
};
