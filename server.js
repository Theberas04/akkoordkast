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
const tijdlijn = require('./lib/tijdlijn');
const analyse = require('./lib/analyse');
const spotify = require('./lib/spotify');
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
  CREATE TABLE IF NOT EXISTS imports (
    pad TEXT PRIMARY KEY,
    grootte INTEGER NOT NULL DEFAULT 0,
    liedje_id INTEGER NOT NULL DEFAULT 0,
    wanneer TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS spotify_koppelingen (
    liedje_id INTEGER PRIMARY KEY,
    uri TEXT NOT NULL DEFAULT '',
    soort TEXT NOT NULL DEFAULT 'track',
    id TEXT NOT NULL DEFAULT '',
    titel TEXT NOT NULL DEFAULT '',
    artiest TEXT NOT NULL DEFAULT '',
    embed TEXT NOT NULL DEFAULT '',
    toegevoegd TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS instellingen (
    sleutel TEXT PRIMARY KEY,
    waarde TEXT NOT NULL DEFAULT ''
  );
`);

// Migratie: een liedje kan een herkend akkoordschema per maat en een maatsoort
// hebben (gevuld door de muziekanalyse van een upload).
for (const kolom of [
  "ALTER TABLE liedjes ADD COLUMN akkoorden_per_maat TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE liedjes ADD COLUMN maatsoort INTEGER NOT NULL DEFAULT 4",
  "ALTER TABLE liedjes ADD COLUMN eerste_tel REAL NOT NULL DEFAULT 0",
  "ALTER TABLE liedjes ADD COLUMN tekst TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE liedjes ADD COLUMN tekst_van TEXT NOT NULL DEFAULT ''"
]) {
  try { db.exec(kolom); } catch (e) { /* de kolom bestaat al */ }
}

const SLEUTELS = ['cast_apparaat', 'cast_naam', 'laatste_liedje', 'spotify_client_id', 'spotify_client_secret', 'spotify_markt', 'spotify_token', 'spotify_token_verloopt'];

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
    maatsoort: Math.max(2, Math.min(12, Number(rij.maatsoort) || 4)),
    eersteTel: Number(rij.eerste_tel) || 0,
    akkoordenPerMaat: leesAkkoordenPerMaat(rij.akkoorden_per_maat),
    tekst: rij.tekst || '',
    tekst_van: rij.tekst_van || '',
    noten: [],
    audio_bestand: rij.audio_bestand,
    audio_titel: rij.audio_titel,
    eigen: true,
    model,
    advies: capo.advies(model.akkoorden, toonsoort)
  };
}

function leesAkkoordenPerMaat(tekst) {
  if (!tekst) return [];
  try {
    const lijst = JSON.parse(tekst);
    return Array.isArray(lijst) ? lijst.filter(a => typeof a === 'string' && a) : [];
  } catch (e) { return []; }
}

// Het akkoordschema als ChordPro-schema: vier maten per regel.
function schemaAlsChordpro(titel, toonsoort, tempo, perMaat) {
  const regels = [];
  for (let i = 0; i < perMaat.length; i += 4) {
    regels.push(perMaat.slice(i, i + 4).map(a => `[${a}]\u2014\u2014\u2014`).join('   '));
    regels.push('');
  }
  return `{title: ${titel}}\n{key: ${toonsoort}}\n{tempo: ${tempo}}\n\n${regels.join('\n').trim()}`;
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
    const greepInfo = grepen.greep(vorm);
    return {
      naam,
      vorm,
      barre: grepen.isBarre(vorm),
      heeftDiagram: grepen.heeftGreep(vorm),
      frets: greepInfo ? greepInfo.frets : [],
      vingers: greepInfo ? greepInfo.vingers : [],
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
    heeftMelodie: !!(lied.noten && lied.noten.length),
    melodie: lied.noten || [],
    // een liedje dat uit een upload is herkend, heeft een akkoordschema per maat
    akkoordenPerMaat: lied.akkoordenPerMaat || [],
    heeftEigenOpname: !!(lied.audio_bestand && lied.akkoordenPerMaat && lied.akkoordenPerMaat.length),
    tekst: lied.tekst || '',
    tekstVan: lied.tekst_van || '',
    spotify: koppelingVan(lied.id),
    maatsoort: lied.maatsoort || 4,
    licentie: lied.licentie || '',
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

// ---------------------------------------------------------------- meespelen ---
// Eén plan bepaalt zowel de audio als de tijdlijn: het beeld kan daardoor niet
// losraken van het geluid.

// Zet een WAV-buffer om naar mp3 (met ffmpeg) en bewaar hem in de cache.
function bewaarAudio(sleutel, wavBuffer) {
  const mp3 = path.join(MEDIA_DIR, 'preview', `${sleutel}.mp3`);
  const wav = path.join(MEDIA_DIR, 'preview', `${sleutel}.wav`);
  if (fs.existsSync(mp3)) return { bestand: mp3, type: 'audio/mpeg' };
  if (fs.existsSync(wav)) return { bestand: wav, type: 'audio/wav' };
  fs.writeFileSync(wav, wavBuffer);
  const omzetten = spawnSync(FFMPEG, ['-v', 'error', '-y', '-i', wav, '-codec:a', 'libmp3lame', '-b:a', '128k', mp3], { timeout: 30000 });
  if (omzetten.status === 0 && fs.existsSync(mp3)) {
    try { fs.unlinkSync(wav); } catch (e) {}
    return { bestand: mp3, type: 'audio/mpeg' };
  }
  return { bestand: wav, type: 'audio/wav' };
}

function waarheidsgetrouw(query, naam, standaard, min, max) {
  const waarde = query.get(naam);
  if (waarde === null || waarde === '') return standaard;
  return Math.max(min, Math.min(max, parseInt(waarde, 10) || standaard));
}

// Het plan van een liedje in de meespeelstand.
function meespeelPlan(lied, query) {
  const stappen = parseInt(query.get('transpose'), 10) || 0;
  const mol = theorie.toonsoortVoorkeur(lied.toonsoort || 'C', stappen);
  const model = stappen ? chordpro.transponeerModel(lied.model, stappen, mol) : lied.model;
  const advies = capo.advies(model.akkoorden, theorie.transponeerToonsoort(lied.toonsoort || 'C', stappen));
  const capoRuw = query.get('capo');
  const gebruikCapo = capoRuw === null || capoRuw === '' || capoRuw === 'auto'
    ? advies.capo
    : Math.max(0, Math.min(12, parseInt(capoRuw, 10) || 0));
  const tempo = waarheidsgetrouw(query, 'tempo', lied.tempo || 84, 40, 200);
  const maatsoort = waarheidsgetrouw(query, 'maatsoort', lied.maatsoort || 4, 2, 8);
  const strum = query.get('strum') || lied.strum || 'D DU UDU';
  const heeftMelodie = !!(lied.noten && lied.noten.length);

  // Akkoorden per maat: bij een liedje met melodie liggen de akkoorden vast per maat,
  // anders speelt elk akkoord van de reeks één maat en herhaalt het aantal rondes.
  const perMaat = (lied.akkoordenPerMaat && lied.akkoordenPerMaat.length)
    ? lied.akkoordenPerMaat.map(a => theorie.transponeer(a, stappen, mol))
    : chordpro.akkoordenReeks(model, 8);
  // een liedje met melodie en een eigen opname spelen één keer: het beeld moet
  // bij de muziek blijven horen
  const rondes = (heeftMelodie || meespeelEigenAudio(lied)) ? 1 : waarheidsgetrouw(query, 'rondes', 3, 1, 8);

  const metEigenAudio = meespeelEigenAudio(lied) && query.get('bron') !== 'synth';
  const plan = tijdlijn.maakPlan({
    akkoorden: perMaat,
    rondes: rondes,
    capo: gebruikCapo,
    bpm: tempo,
    maatsoort: maatsoort,
    strum: strum,
    // de melodie schuift mee met de transpose, niet met de capo: je zingt even hoog
    noten: (lied.noten || []).map(n => ({ start: n.start, duur: n.duur, midi: n.midi + stappen })),
    aftellen: metEigenAudio ? false : query.get('aftellen') !== '0',
    klik: query.get('klik') === '1',
    // de opname begint niet altijd op de eerste tel: schuif de maten op
    vertraging: metEigenAudio ? (lied.eersteTel || 0) : 0
  });
  return plan;
}

function meespeelVoorLiedje(lied, query) {
  return meespeelPlan(lied, query);
}

// Speelt dit liedje met een eigen opname mee? Dan is de opname de muziek en
// loopt het herkende akkoordschema daarlangs.
function meespeelEigenAudio(lied) {
  return !!(lied.audio_bestand && lied.akkoordenPerMaat && lied.akkoordenPerMaat.length);
}

// Dezelfde query, maar dan voor het audio-adres onder de tijdlijn.
function meespeelQuery(query) {
  const params = new URLSearchParams();
  for (const sleutel of ['liedje', 'capo', 'transpose', 'tempo', 'maatsoort', 'strum', 'rondes', 'aftellen', 'klik']) {
    const waarde = query.get(sleutel);
    if (waarde !== null && waarde !== '') params.set(sleutel, waarde);
  }
  return params.toString();
}

function maakMeespeelAudio(lied, query) {
  const plan = meespeelPlan(lied, query);
  const sleutel = hashVan({
    soort: 'meespelen',
    liedje: lied.id,
    capo: plan.capo,
    bpm: plan.bpm,
    maatsoort: plan.maatsoort,
    strum: plan.strum,
    aftellen: plan.aftellen.aan,
    klik: plan.klik,
    maten: plan.maten.map(m => m.akkoord),
    noten: plan.noten.map(n => [n.midi, n.startSeconden, n.duurSeconden]),
    duur: plan.duurSeconden
  });
  const mp3 = path.join(MEDIA_DIR, 'preview', `${sleutel}.mp3`);
  const wav = path.join(MEDIA_DIR, 'preview', `${sleutel}.wav`);
  if (fs.existsSync(mp3)) return { bestand: mp3, type: 'audio/mpeg' };
  if (fs.existsSync(wav)) return { bestand: wav, type: 'audio/wav' };
  if (audioBezig.has(sleutel)) return audioBezig.get(sleutel);
  const resultaat = bewaarAudio(sleutel, gitaar.maakPlanWav(plan));
  audioBezig.set(sleutel, resultaat);
  return resultaat;
}

// ------------------------------------------------------------------ spotify ---
function spotifyInstellingen() {
  const inst = alleInstellingen();
  return {
    clientId: String(inst.spotify_client_id || ''),
    clientSecret: String(inst.spotify_client_secret || ''),
    markt: String(inst.spotify_markt || 'NL').toUpperCase().slice(0, 2) || 'NL'
  };
}

// Een token voor de Web API, met cache. Alleen als de gebruiker zelf een
// Client ID en Secret heeft ingevuld.
async function spotifyToken() {
  const inst = spotifyInstellingen();
  if (!inst.clientId || !inst.clientSecret) return '';
  const bewaard = String(alleInstellingen().spotify_token || '');
  const verloopt = Number(alleInstellingen().spotify_token_verloopt || 0);
  if (bewaard && verloopt > Date.now() + 30000) return bewaard;
  const nieuw = await spotify.tokenMetClientId(inst.clientId, inst.clientSecret);
  zetInstelling('spotify_token', nieuw.token);
  zetInstelling('spotify_token_verloopt', String(nieuw.verloopt));
  return nieuw.token;
}

function koppelingVan(liedjeId) {
  const rij = db.prepare('SELECT * FROM spotify_koppelingen WHERE liedje_id = ?').get(Number(liedjeId));
  if (!rij) return null;
  return {
    liedje: rij.liedje_id,
    uri: rij.uri,
    soort: rij.soort,
    id: rij.id,
    titel: rij.titel,
    artiest: rij.artiest,
    embed: rij.embed,
    url: `https://open.spotify.com/${rij.soort}/${rij.id}`
  };
}

// --------------------------------------------------- muziek- en videoanalyse ---

// Bestandsnaam opschonen tot een titel die je kunt herkennen.
function titelUitBestandsnaam(naam) {
  return String(naam || '')
    .replace(/\.[A-Za-z0-9]{2,5}$/, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s*-\s*/g, ' - ')
    .replace(/\b(official|video|lyrics|lyric|audio|hd|hq|4k|mp3|mp4|live|clip|remaster(ed)?)\b/gi, ' ')
    .replace(/\(\s*\)|\[\s*\]/g, ' ')               // lege haakjes na het schrappen
    .replace(/^\s*\d{1,3}[\s.\-]+/, '')
    .replace(/[\s\-_(]+$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 120) || 'Eigen opname';
}

function zonderLidwoorden(tekst) {
  return String(tekst || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\b(de|het|een|the|a|an|van|of|my|mijn)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Lijkt de bestandsnaam op een liedje uit de bibliotheek? Dan kunnen we meteen
// het bestaande akkoordschema en de grepen laten zien.
function zoekInBibliotheek(titel) {
  const gezocht = zonderLidwoorden(titel);
  if (gezocht.length < 4) return null;
  let beste = null;
  for (const lied of bron.alle()) {
    const naam = zonderLidwoorden(lied.titel);
    if (!naam) continue;
    if (naam === gezocht) return { id: lied.id, titel: lied.titel, toonsoort: lied.toonsoort, soort: 'gelijk' };
    if (naam.length >= 6 && (gezocht.includes(naam) || naam.includes(gezocht))) {
      const verschil = Math.abs(naam.length - gezocht.length);
      if (!beste || verschil < beste.verschil) {
        beste = { id: lied.id, titel: lied.titel, toonsoort: lied.toonsoort, soort: 'lijkt-op', verschil };
      }
    }
  }
  return beste;
}

// De woorden van een liedje uit de bibliotheek, zonder de akkoorden erboven.
function woordenVan(gevonden) {
  if (!gevonden) return { tekst: '', van: '' };
  const lied = bron.vind(gevonden.id);
  if (!lied) return { tekst: '', van: '' };
  const woorden = chordpro.zonderAkkoorden(lied.chordpro || '');
  return { tekst: woorden.slice(0, 8000), van: `${lied.titel} (${lied.id})` };
}

// Geluid uit een upload halen en daar een akkoordschema van maken.
function analyseerUpload(bestandPad, opties) {
  const o = Object.assign({ maatsoort: 0 }, opties || {});
  const wavPad = path.join(MEDIA_DIR, 'preview', `upload-${Date.now()}.wav`);
  const omzetten = spawnSync(FFMPEG, ['-v', 'error', '-y', '-i', bestandPad, '-ac', '1', '-ar', '22050', '-vn', wavPad], { timeout: 180000 });
  if (omzetten.status !== 0 || !fs.existsSync(wavPad)) {
    throw new Error('Het geluid uit dit bestand kon niet worden gelezen. Is het een echt geluids- of videobestand?');
  }
  try {
    const { samples, rate } = analyse.leesWav(fs.readFileSync(wavPad));
    return analyse.analyseer(samples, rate, o);
  } finally {
    try { fs.unlinkSync(wavPad); } catch (e) {}
  }
}

function maakMp3Van(bestandPad, naam) {
  const mp3Pad = path.join(MEDIA_DIR, 'audio', naam);
  const omzetten = spawnSync(FFMPEG, ['-v', 'error', '-y', '-i', bestandPad, '-vn', '-codec:a', 'libmp3lame', '-b:a', '128k', mp3Pad], { timeout: 180000 });
  if (omzetten.status !== 0 || !fs.existsSync(mp3Pad)) {
    try { fs.unlinkSync(mp3Pad); } catch (e) {}
    return null;
  }
  return naam;
}

// ------------------------------------------------- een hele muziekmap in één keer ---
// Dezelfde herkenning als bij één upload, maar dan over een map op deze machine.
const AUDIO_EXT = ['.mp3', '.m4a', '.aac', '.wav', '.ogg', '.opus', '.flac', '.webm', '.mp4', '.m4v', '.mov', '.mkv'];
const MAX_DIEPTE = 4;
const MAX_PER_RONDE = 500;

// Welke geluids- en videobestanden liggen er in deze map?
function scanBestanden(mapPad) {
  const map = path.resolve(String(mapPad || '').trim());
  if (!String(mapPad || '').trim()) return { fout: 'Geef een map op, bijvoorbeeld /home/tom/muziek.' };
  if (!fs.existsSync(map)) return { fout: 'Deze map bestaat niet op deze machine: ' + map };
  let isMap = false;
  try { isMap = fs.statSync(map).isDirectory(); } catch (e) { isMap = false; }
  if (!isMap) return { fout: 'Dit is geen map: ' + map };
  const bestanden = [];
  const loop = (map2, diepte) => {
    let inhoud;
    try { inhoud = fs.readdirSync(map2, { withFileTypes: true }); } catch (e) { return; }
    for (const ent of inhoud) {
      if (ent.name.startsWith('.')) continue;
      const vol = path.join(map2, ent.name);
      if (ent.isDirectory()) {
        if (diepte < MAX_DIEPTE) loop(vol, diepte + 1);
        continue;
      }
      if (!AUDIO_EXT.includes(path.extname(ent.name).toLowerCase())) continue;
      let grootte = 0;
      try { grootte = fs.statSync(vol).size; } catch (e) { continue; }
      if (grootte < 1024) continue;
      const al = db.prepare('SELECT liedje_id FROM imports WHERE pad = ?').get(vol);
      bestanden.push({ pad: vol, naam: ent.name, grootte, alGedaan: al ? al.liedje_id : null });
    }
  };
  loop(map, 0);
  bestanden.sort((a, b) => a.pad.localeCompare(b.pad));
  const nieuwe = bestanden.filter(b => !b.alGedaan);
  return {
    map,
    bestanden,
    aantal: bestanden.length,
    nieuw: nieuwe.length,
    alGedaan: bestanden.length - nieuwe.length,
    grootteTotaal: bestanden.reduce((n, b) => n + b.grootte, 0),
    open: nieuwe.slice(0, MAX_PER_RONDE)
  };
}

// Eén bestand uit de map herkennen en er een eigen liedje van maken.
function herkenBestand(bestand) {
  const uitkomst = analyseerUpload(bestand.pad, {});
  const titel = titelUitBestandsnaam(bestand.naam);
  const gevonden = zoekInBibliotheek(titel);
  const schoon = veiligeNaam(bestand.naam.replace(/\.[A-Za-z0-9]+$/, ''));
  const mp3Naam = 'scan-' + (schoon || 'opname') + '-' + Date.now().toString(36) + '.mp3';
  let gelukt = null;
  if (path.extname(bestand.naam).toLowerCase() === '.mp3') {
    try {
      fs.copyFileSync(bestand.pad, path.join(MEDIA_DIR, 'audio', mp3Naam));
      gelukt = mp3Naam;
    } catch (e) { gelukt = null; }
  }
  if (!gelukt) gelukt = maakMp3Van(bestand.pad, mp3Naam);
  const accordeerschema = uitkomst.akkoordenPerMaat.length
    ? schemaAlsChordpro(titel, uitkomst.toonsoort, Math.round(uitkomst.tempo), uitkomst.akkoordenPerMaat)
    : `{title: ${titel}}\n{key: ${uitkomst.toonsoort}}\n`;
  const notitie = `Automatisch herkend uit de muziekmap (${uitkomst.aantalMaten} maten, zekerheid ${Math.round(uitkomst.gemiddeldeZekerheid * 100)}%). Controleer het schema en pas het gerust aan.`;
  const nu = new Date().toISOString();
  const woorden = woordenVan(gevonden);
  const info = db.prepare(`INSERT INTO liedjes (titel, artiest, taal, genre, moeilijkheid, toonsoort, tempo, strum, bron, youtube, notitie, chordpro, aangemaakt, akkoorden_per_maat, maatsoort, eerste_tel, tekst, tekst_van)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    titel, '', 'nl', gevonden ? 'Overgenomen' : 'Eigen opname', 2, uitkomst.toonsoort,
    Math.max(40, Math.min(200, Math.round(uitkomst.tempo))), 'D DU UDU',
    gevonden ? `Herkend uit de muziekmap; lijkt op "${gevonden.titel}"` : 'Herkend uit de muziekmap',
    '', notitie, accordeerschema, nu, JSON.stringify(uitkomst.akkoordenPerMaat),
    uitkomst.maatsoort, Math.max(0, Number(uitkomst.eersteTelSeconden) || 0),
    woorden.tekst, woorden.van);
  if (gelukt) {
    db.prepare('UPDATE liedjes SET audio_bestand = ?, audio_titel = ? WHERE id = ?')
      .run(gelukt, `Opname: ${titel}`.slice(0, 120), Number(info.lastInsertRowid));
  }
  db.prepare('INSERT INTO imports (pad, grootte, liedje_id, wanneer) VALUES (?,?,?,?) ON CONFLICT(pad) DO UPDATE SET liedje_id = excluded.liedje_id, wanneer = excluded.wanneer')
    .run(bestand.pad, bestand.grootte, Number(info.lastInsertRowid), nu);
  return {
    id: EIGEN_START + Number(info.lastInsertRowid),
    titel,
    bestand: bestand.naam,
    pad: bestand.pad,
    gevonden: gevonden ? gevonden.titel : '',
    tempo: Math.round(uitkomst.tempo * 10) / 10,
    maatsoort: uitkomst.maatsoort,
    toonsoort: uitkomst.toonsoort,
    aantalMaten: uitkomst.aantalMaten,
    woorden: woorden.tekst ? woorden.tekst.split('\n').length : 0,
    zekerheid: Math.round(uitkomst.gemiddeldeZekerheid * 100),
    akkoorden: uitkomst.akkoordenPerMaat,
    heeftAudio: !!gelukt,
    metBeeld: !!gelukt
  };
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

// Voor de leermodus: het diagram plus de posities en de klinkende noten. De pagina
// speelt die noten zelf met Web Audio, dus de leermodus werkt ook zonder internet
// en zonder geluidsbestanden.
function greepVoorLeren(naam) {
  const g = grepen.greep(naam) || {};
  return {
    naam,
    vorm: naam,
    frets: g.frets || [],
    vingers: g.vingers || [],
    barre: g.barre || null,
    isBarre: grepen.isBarre(naam),
    aantalVingers: grepen.aantalVingers(naam),
    noten: grepen.noten(naam, 0).map(n => n.midi),
    svg: grepen.svgDiagram(naam, { toonNaam: naam })
  };
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

  // --- lesmateriaal: de grepen met hun noten, zodat de pagina ze ook kan laten horen ---
  if (pad === '/api/grepen' && methode === 'GET') {
    json(res, 200, { grepen: grepen.alleGrepen().map(naam => greepVoorLeren(naam)) });
    return;
  }
  if (pad === '/api/greep' && methode === 'GET') {
    const naam = (query.get('akkoord') || '').trim();
    if (!grepen.heeftGreep(naam)) { json(res, 404, { fout: 'Geen greep voor ' + naam }); return; }
    json(res, 200, greepVoorLeren(naam));
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

  // --- meespelen: de tijdlijn die het beeld met het geluid laat meelopen ---
  if (pad === '/api/meespelen' && methode === 'GET') {
    const lied = vindLiedje(query.get('liedje'));
    if (!lied) { json(res, 404, { fout: 'Liedje niet gevonden' }); return; }
    let plan;
    try {
      plan = meespeelVoorLiedje(lied, query);
    } catch (e) {
      json(res, 400, { fout: e.message });
      return;
    }
    const metOpname = meespeelEigenAudio(lied) && query.get('bron') !== 'synth';
    json(res, 200, {
      liedje: {
        id: lied.id,
        titel: lied.titel,
        artiest: lied.artiest,
        heeftMelodie: !!(lied.noten && lied.noten.length),
        eigenAudio: metOpname
      },
      tijdlijn: tijdlijn.tijdlijnVanPlan(plan),
      audio: metOpname ? `/media/audio/${lied.audio_bestand}` : `/api/meespelen/audio?${meespeelQuery(query)}`
    });
    return;
  }
  if (pad === '/api/meespelen/audio' && methode === 'GET') {
    const lied = vindLiedje(query.get('liedje'));
    if (!lied) { json(res, 404, { fout: 'Liedje niet gevonden' }); return; }
    let resultaat;
    try {
      resultaat = maakMeespeelAudio(lied, query);
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

  // --- muziek of video uploaden en er het akkoordschema bij zoeken ---
  if (pad === '/api/analyse' && methode === 'POST') {
    const soort = String(req.headers['content-type'] || '').toLowerCase();
    if (!/^(audio|video)\//.test(soort)) {
      json(res, 400, { fout: 'Stuur een geluids- of videobestand (mp3, m4a, wav, ogg, webm of mp4).' });
      return;
    }
    let buffer;
    try {
      buffer = await leesBody(req, 200 * 1024 * 1024);
    } catch (e) {
      json(res, 400, { fout: 'Dit bestand is groter dan 200 MB.' });
      return;
    }
    if (buffer.length < 1024) { json(res, 400, { fout: 'Het bestand is leeg of te klein.' }); return; }
    // de bestandsnaam komt als URL-gecodeerde kop binnen (spa_ties en haakjes)
    let naamKop = String(req.headers['x-bestandsnaam'] || 'opname');
    try { naamKop = decodeURIComponent(naamKop); } catch (e) { /* laat staan */ }
    const ruweNaam = veiligeNaam(naamKop);
    const tijdelijk = path.join(MEDIA_DIR, 'preview', `upload-${Date.now()}-${ruweNaam}`);
    fs.writeFileSync(tijdelijk, buffer);
    let uitkomst;
    try {
      uitkomst = analyseerUpload(tijdelijk, {
        maatsoort: query.get('maatsoort') ? waarheidsgetrouw(query, 'maatsoort', 0, 0, 12) : 0
      });
    } catch (e) {
      try { fs.unlinkSync(tijdelijk); } catch (x) {}
      json(res, 400, { fout: e.message });
      return;
    }
    const titel = titelUitBestandsnaam(naamKop);
    const gevonden = zoekInBibliotheek(titel);
    const mp3Naam = maakMp3Van(tijdelijk, `upload-${Date.now()}-${ruweNaam.replace(/\.[A-Za-z0-9]+$/, '')}.mp3`.slice(-160));
    try { fs.unlinkSync(tijdelijk); } catch (e) {}
    const accordeerschema = uitkomst.akkoordenPerMaat.length
      ? schemaAlsChordpro(titel, uitkomst.toonsoort, Math.round(uitkomst.tempo), uitkomst.akkoordenPerMaat)
      : `{title: ${titel}}\n{key: ${uitkomst.toonsoort}}\n`;
    const nu = new Date().toISOString();
    const notitie = `Automatisch herkend uit een upload (${uitkomst.aantalMaten} maten, zekerheid ${Math.round(uitkomst.gemiddeldeZekerheid * 100)}%). Controleer het schema en pas het gerust aan.`;
    const woorden = woordenVan(gevonden);
    const info = db.prepare(`INSERT INTO liedjes (titel, artiest, taal, genre, moeilijkheid, toonsoort, tempo, strum, bron, youtube, notitie, chordpro, aangemaakt, akkoorden_per_maat, maatsoort, eerste_tel, tekst, tekst_van)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      titel, '', 'nl', gevonden ? 'Overgenomen' : 'Eigen opname', 2, uitkomst.toonsoort,
      Math.max(40, Math.min(200, Math.round(uitkomst.tempo))), 'D DU UDU',
      gevonden ? `Herkend uit upload; lijkt op "${gevonden.titel}"` : 'Herkend uit upload',
      '', notitie, accordeerschema, nu,
      JSON.stringify(uitkomst.akkoordenPerMaat), uitkomst.maatsoort,
      Math.max(0, Number(uitkomst.eersteTelSeconden) || 0),
      woorden.tekst, woorden.van);
    const id = EIGEN_START + Number(info.lastInsertRowid);
    if (mp3Naam) {
      db.prepare('UPDATE liedjes SET audio_bestand = ?, audio_titel = ? WHERE id = ?')
        .run(mp3Naam, `Opname: ${titel}`.slice(0, 120), Number(info.lastInsertRowid));
    }
    json(res, 201, {
      ok: true,
      id,
      titel,
      analyse: {
        tempo: Math.round(uitkomst.tempo * 10) / 10,
        maatsoort: uitkomst.maatsoort,
        toonsoort: uitkomst.toonsoort,
        akkoordenPerMaat: uitkomst.akkoordenPerMaat,
        gemiddeldeZekerheid: uitkomst.gemiddeldeZekerheid,
        aantalMaten: uitkomst.aantalMaten,
        seconden: uitkomst.seconden
      },
      gevonden: gevonden || null,
      audio: mp3Naam ? `/media/audio/${mp3Naam}` : ''
    });
    return;
  }

  // --- een hele muziekmap in één keer ---
  if (pad === '/api/scan' && methode === 'GET') {
    const uit = scanBestanden(query.get('map'));
    if (uit.fout) { json(res, 400, { fout: uit.fout }); return; }
    json(res, 200, {
      map: uit.map,
      aantal: uit.aantal,
      nieuw: uit.nieuw,
      alGedaan: uit.alGedaan,
      grootteTotaal: uit.grootteTotaal,
      bestanden: uit.bestanden.slice(0, 500)
    });
    return;
  }
  if (pad === '/api/scan' && methode === 'POST') {
    const body = await leesJsonBody(req);
    const uit = scanBestanden(body.map);
    if (uit.fout) { json(res, 400, { fout: uit.fout }); return; }
    const limiet = Math.max(1, Math.min(MAX_PER_RONDE, parseInt(body.limiet, 10) || 8));
    const teDoen = uit.open.slice(0, limiet);
    const gedaan = [];
    const mislukt = [];
    for (const bestand of teDoen) {
      try {
        gedaan.push(herkenBestand(bestand));
      } catch (e) {
        mislukt.push({ bestand: bestand.naam, pad: bestand.pad, fout: e.message });
        db.prepare('INSERT INTO imports (pad, grootte, liedje_id, wanneer) VALUES (?,?,0,?) ON CONFLICT(pad) DO NOTHING')
          .run(bestand.pad, bestand.grootte, new Date().toISOString());
      }
    }
    const na = scanBestanden(body.map);
    json(res, gedaan.length || mislukt.length ? 201 : 200, {
      map: uit.map,
      gedaan: gedaan.length,
      mislukt: mislukt.length,
      klaar: na.nieuw === 0,
      rest: na.nieuw,
      totaal: na.aantal,
      liedjes: gedaan,
      fouten: mislukt
    });
    return;
  }

  // --- spotify ---
  if (pad === '/api/spotify/status' && methode === 'GET') {
    const inst = spotifyInstellingen();
    json(res, 200, {
      kanZoeken: !!(inst.clientId && inst.clientSecret),
      markt: inst.markt,
      uitleg: inst.clientId && inst.clientSecret
        ? 'Zoeken in Spotify staat aan. Voor afspelen op afstand is een accountkoppeling met inlog nodig; in de app zelf speelt de Spotify-speler gewoon af.'
        : 'Koppelen en meespelen werkt met alleen een link. Voor zoeken vul je een eigen Client ID en Secret in bij Instellingen.'
    });
    return;
  }
  if (pad === '/api/spotify/instellingen' && methode === 'POST') {
    const body = await leesJsonBody(req);
    if (Object.prototype.hasOwnProperty.call(body, 'client_id')) zetInstelling('spotify_client_id', String(body.client_id || '').trim().slice(0, 120));
    if (Object.prototype.hasOwnProperty.call(body, 'client_secret')) zetInstelling('spotify_client_secret', String(body.client_secret || '').trim().slice(0, 120));
    if (Object.prototype.hasOwnProperty.call(body, 'markt')) zetInstelling('spotify_markt', String(body.markt || 'NL').toUpperCase().slice(0, 2));
    zetInstelling('spotify_token', '');
    const inst = spotifyInstellingen();
    let proef = { ok: true };
    try {
      if (inst.clientId && inst.clientSecret) {
        const token = await spotifyToken();
        const gevonden = await spotify.zoek('test', { token, markt: inst.markt, aantal: 1 });
        proef = { ok: true, gevonden: gevonden.length };
      }
    } catch (e) {
      proef = { ok: false, fout: e.message };
    }
    json(res, proef.ok ? 200 : 400, { ok: proef.ok, kanZoeken: !!(inst.clientId && inst.clientSecret), fout: proef.fout });
    return;
  }
  if (pad === '/api/spotify/zoek' && methode === 'GET') {
    const term = String(query.get('q') || '').trim();
    if (term.length < 2) { json(res, 400, { fout: 'Typ minstens twee letters.' }); return; }
    try {
      const token = await spotifyToken();
      const inst = spotifyInstellingen();
      const uit = await spotify.zoek(term, { token, markt: inst.markt, aantal: Math.max(1, Math.min(20, parseInt(query.get('aantal'), 10) || 8)) });
      json(res, 200, { zoekterm: term, resultaten: uit });
    } catch (e) {
      json(res, 400, { fout: e.message });
    }
    return;
  }
  if (pad === '/api/spotify/koppeling' && methode === 'GET') {
    const lied = vindLiedje(query.get('liedje'));
    if (!lied) { json(res, 404, { fout: 'Liedje niet gevonden' }); return; }
    json(res, 200, { koppeling: koppelingVan(lied.id) });
    return;
  }
  if (pad === '/api/spotify/koppeling' && methode === 'POST') {
    const body = await leesJsonBody(req);
    const lied = vindLiedje(body.liedje);
    if (!lied) { json(res, 404, { fout: 'Liedje niet gevonden' }); return; }
    const koppeling = spotify.leesLink(body.link || body.uri || '');
    if (!koppeling) {
      json(res, 400, { fout: 'Dat lijkt geen Spotify-link. Plak bijvoorbeeld https://open.spotify.com/track/… of spotify:track:…' });
      return;
    }
    let token = '';
    try { token = await spotifyToken(); } catch (e) { token = ''; }
    const kaart = await spotify.beschrijf(koppeling, token);
    db.prepare(`INSERT INTO spotify_koppelingen (liedje_id, uri, soort, id, titel, artiest, embed, toegevoegd)
      VALUES (?,?,?,?,?,?,?,?)
      ON CONFLICT(liedje_id) DO UPDATE SET uri = excluded.uri, soort = excluded.soort, id = excluded.id,
        titel = excluded.titel, artiest = excluded.artiest, embed = excluded.embed, toegevoegd = excluded.toegevoegd`)
      .run(Number(lied.id), kaart.uri, kaart.soort, kaart.id, kaart.titel || '', kaart.artiest || '', kaart.embed, new Date().toISOString());
    json(res, 201, { ok: true, koppeling: koppelingVan(lied.id) });
    return;
  }
  if (pad === '/api/spotify/koppeling' && methode === 'DELETE') {
    const lied = vindLiedje(query.get('liedje'));
    if (!lied) { json(res, 404, { fout: 'Liedje niet gevonden' }); return; }
    db.prepare('DELETE FROM spotify_koppelingen WHERE liedje_id = ?').run(Number(lied.id));
    json(res, 200, { ok: true });
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
      } else if (body.bron === 'meespelen') {
        const params = new URLSearchParams({
          liedje: String(lied.id),
          capo: String(body.capo == null ? '' : body.capo),
          transpose: String(body.transpose || 0),
          tempo: String(body.tempo || lied.tempo || 84),
          aftellen: body.aftellen === false ? '0' : '1',
          klik: body.klik ? '1' : '0'
        });
        const resultaat = maakMeespeelAudio(lied, params);
        type = resultaat.type;
        mediaUrl = `/api/meespelen/audio?${params.toString()}`;
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
