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
const week = require('./lib/week');
const backup = require('./lib/backup');
const overgangen = require('./lib/overgangen');
const analyse = require('./lib/analyse');
const spotify = require('./lib/spotify');
const muziekbestand = require('./lib/muziekbestand');
const youtube = require('./lib/youtube');
const downloader = require('./lib/downloader');
const beheer = require('./lib/beheer');
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
const GESTART = new Date().toISOString();
const VERSIE = '1.3';
// Een update-script binnen de container mag alleen als het er echt staat en
// uitvoerbaar is; standaard is dat niet zo, want bijwerken hoort op de host te
// gebeuren (daar zit pct en systemctl).
const UPDATE_SCRIPT = process.env.UPDATE_SCRIPT || '';

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
  CREATE TABLE IF NOT EXISTS liedje_youtube (
    liedje_id INTEGER PRIMARY KEY,
    video TEXT NOT NULL,
    wanneer TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS liedje_muziek (
    liedje_id INTEGER PRIMARY KEY,
    pad TEXT NOT NULL,
    titel TEXT NOT NULL DEFAULT '',
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
  -- Wie is de beheerder? Alleen de afdruk van het wachtwoord (nooit het wachtwoord zelf) en
  -- de sessies die hij heeft openstaan, met een vervaldatum.
  CREATE TABLE IF NOT EXISTS sessies (
    token TEXT PRIMARY KEY,
    tot INTEGER NOT NULL DEFAULT 0,
    wanneer TEXT NOT NULL DEFAULT ''
  );
  -- Wie gebruikt de app: elk profiel heeft zijn eigen favorieten, labels,
  -- speelgeschiedenis en oefensessies.
  CREATE TABLE IF NOT EXISTS profielen (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    naam TEXT NOT NULL,
    aangemaakt TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS favorieten (
    profiel_id INTEGER NOT NULL,
    liedje_id INTEGER NOT NULL,
    aangeemaakt TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (profiel_id, liedje_id)
  );
  CREATE TABLE IF NOT EXISTS labels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profiel_id INTEGER NOT NULL,
    naam TEXT NOT NULL,
    aangemaakt TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS liedje_labels (
    profiel_id INTEGER NOT NULL,
    liedje_id INTEGER NOT NULL,
    label_id INTEGER NOT NULL,
    PRIMARY KEY (profiel_id, liedje_id, label_id)
  );
  -- Laatst gespeeld: één rij per liedje per profiel, met hoe vaak en wanneer.
  CREATE TABLE IF NOT EXISTS gespeeld (
    profiel_id INTEGER NOT NULL,
    liedje_id INTEGER NOT NULL,
    moment TEXT NOT NULL DEFAULT '',
    aantal INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (profiel_id, liedje_id)
  );
  CREATE TABLE IF NOT EXISTS oefensessies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profiel_id INTEGER NOT NULL,
    moment TEXT NOT NULL DEFAULT '',
    soort TEXT NOT NULL DEFAULT '',
    seconden INTEGER NOT NULL DEFAULT 0,
    wissels INTEGER NOT NULL DEFAULT 0,
    akkoorden TEXT NOT NULL DEFAULT ''
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS setlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profiel_id INTEGER NOT NULL,
    naam TEXT NOT NULL DEFAULT '',
    gemaakt TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS setlist_liedjes (
    setlist_id INTEGER NOT NULL,
    liedje_id INTEGER NOT NULL,
    volgorde INTEGER NOT NULL DEFAULT 0
  );
`);

// Er is altijd minstens één profiel: zonder profiel weet de app niet van wie de
// favorieten zijn.
if (!db.prepare('SELECT COUNT(*) AS n FROM profielen').get().n) {
  db.prepare('INSERT INTO profielen (naam, aangemaakt) VALUES (?, ?)').run('Standaard', new Date().toISOString());
}

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
// --- de beheerder ------------------------------------------------------------
// Lezen (zoeken, spelen, leren, je favorieten) kan iedereen. Iets toevoegen of veranderen op
// de machine hoort bij de beheerder: muziek uploaden, een map laten omzetten, een link naar
// mp3 halen, eigen liedjes bewerken, de back-up en de bijwerking.
const SESSIEKOEKJE = 'ak_beheer';
const SLEUTEL_WACHTWOORD = 'beheer_hash';
const GEVOELIGE_INSTELLINGEN = ['spotify_client_id', 'spotify_client_secret', 'spotify_token', 'spotify_token_verloopt'];
const MAX_POGINGEN = 10;
const POGINGVENSTER_MS = 15 * 60 * 1000;
const pogingen = new Map();   // per adres: hoeveel keer fout, en sinds wanneer

function leesCookies(req) {
  const uit = {};
  for (const stuk of String(req.headers.cookie || '').split(';')) {
    const i = stuk.indexOf('=');
    if (i < 0) continue;
    const naam = stuk.slice(0, i).trim();
    if (!naam) continue;
    uit[naam] = decodeURIComponent(stuk.slice(i + 1).trim());
  }
  return uit;
}

function wachtwoordAfdruk() {
  return leesInstelling(SLEUTEL_WACHTWOORD, '');
}

function isBeheerder(req) {
  const token = leesCookies(req)[SESSIEKOEKJE] || '';
  if (!token) return false;
  let rij = null;
  try {
    rij = db.prepare('SELECT tot FROM sessies WHERE token = ?').get(token);
  } catch (e) {
    return false;
  }
  if (!rij) return false;
  if (Number(rij.tot) < Date.now()) {
    db.prepare('DELETE FROM sessies WHERE token = ?').run(token);
    return false;
  }
  return true;
}

function beginSessie(res) {
  const token = beheer.nieuwToken();
  const tot = Date.now() + beheer.SESSIE_DAGEN * 24 * 60 * 60 * 1000;
  db.prepare('INSERT INTO sessies (token, tot, wanneer) VALUES (?, ?, ?)')
    .run(token, tot, new Date().toISOString());
  // Oude sessies opruimen, zodat de tabel niet vol loopt.
  db.prepare('DELETE FROM sessies WHERE tot < ?').run(Date.now());
  res.setHeader('set-cookie', SESSIEKOEKJE + '=' + token + '; HttpOnly; SameSite=Lax; Path=/; Max-Age=' +
    (beheer.SESSIE_DAGEN * 24 * 60 * 60));
  return token;
}

function beeindigSessie(req, res) {
  const token = leesCookies(req)[SESSIEKOEKJE] || '';
  if (token) db.prepare('DELETE FROM sessies WHERE token = ?').run(token);
  res.setHeader('set-cookie', SESSIEKOEKJE + '=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
}

// Te veel foute pogingen van hetzelfde adres? Dan even niet meer.
function teVeelPogingen(req) {
  const adres = String(req.socket && req.socket.remoteAddress || '?');
  const nu = Date.now();
  const staat = pogingen.get(adres);
  if (!staat || nu - staat.sinds > POGINGVENSTER_MS) {
    pogingen.set(adres, { aantal: 0, sinds: nu });
    return false;
  }
  return staat.aantal >= MAX_POGINGEN;
}

function telPoging(req, goed) {
  const adres = String(req.socket && req.socket.remoteAddress || '?');
  if (goed) {
    pogingen.delete(adres);
    return;
  }
  const staat = pogingen.get(adres) || { aantal: 0, sinds: Date.now() };
  staat.aantal += 1;
  pogingen.set(adres, staat);
}

// Wat de beheerder wel en niet mag: alles wat iets toevoegt of verandert.
function beheerNodig(pad, methode) {
  if (methode === 'GET' || methode === 'HEAD') return false;
  if (pad === '/api/beheer' || pad.startsWith('/api/beheer/')) return false;
  if (pad === '/api/mappen' || pad === '/api/mappen/weg') return true;
  if (pad === '/api/muziek' || pad === '/api/youtube') return true;
  if (pad === '/api/wachter') return true;
  if (/^\/api\/(upload|download|scan|backup|update|analyse|import)/.test(pad)) return true;
  if (/^\/api\/liedjes(\/|$)/.test(pad)) return true;
  if (/^\/api\/media\//.test(pad)) return true;
  if (/^\/api\/spotify\//.test(pad)) return true;
  return false;
}

function alleInstellingen() {
  const uit = {};
  for (const rij of db.prepare('SELECT sleutel, waarde FROM instellingen').all()) uit[rij.sleutel] = rij.waarde;
  return uit;
}

// ----------------------------------------------------------------- profielen ---
function profielLijst() {
  return db.prepare('SELECT id, naam, aangemaakt FROM profielen ORDER BY id').all();
}

// Welk profiel hoort bij dit verzoek? De pagina stuurt 'x-profiel' mee; onbekend of
// ontbrekend valt terug op het eerste profiel. Zo blijft een oude bladwijzer werken.
function profielVan(req, query) {
  const gevraagd = Number((req && req.headers && req.headers['x-profiel']) || (query && query.get('profiel')) || 0);
  if (gevraagd) {
    const rij = db.prepare('SELECT id FROM profielen WHERE id = ?').get(gevraagd);
    if (rij) return rij.id;
  }
  const eerste = db.prepare('SELECT MIN(id) AS id FROM profielen').get();
  return Number(eerste && eerste.id) || 1;
}

// Alles wat de pagina van dit profiel nodig heeft om sterretjes, labels en de
// geschiedenis te tonen — in één keer, zodat de liedlijst niet per liedje hoeft te
// vragen.
function persoonlijk(profielId) {
  const favorieten = db.prepare('SELECT liedje_id FROM favorieten WHERE profiel_id = ?').all(profielId)
    .map(r => Number(r.liedje_id));
  const labels = db.prepare(`SELECT l.id, l.naam, COUNT(ll.liedje_id) AS aantal
      FROM labels l LEFT JOIN liedje_labels ll ON ll.label_id = l.id AND ll.profiel_id = l.profiel_id
      WHERE l.profiel_id = ? GROUP BY l.id ORDER BY l.naam`).all(profielId)
    .map(r => ({ id: Number(r.id), naam: r.naam, aantal: Number(r.aantal) }));
  const perLiedje = {};
  for (const rij of db.prepare('SELECT liedje_id, label_id FROM liedje_labels WHERE profiel_id = ?').all(profielId)) {
    const id = Number(rij.liedje_id);
    if (!perLiedje[id]) perLiedje[id] = [];
    perLiedje[id].push(Number(rij.label_id));
  }
  const gespeeld = {};
  for (const rij of db.prepare('SELECT liedje_id, moment, aantal FROM gespeeld WHERE profiel_id = ?').all(profielId)) {
    gespeeld[Number(rij.liedje_id)] = { moment: rij.moment, aantal: Number(rij.aantal) };
  }
  return { favorieten, labels, perLiedje, gespeeld };
}

// De oefensessies van dit profiel: per dag de tijd en de wissels, plus een reeks
// voor de grafiek en de akkoorden waarop het meest geoefend is.
function oefenstatistieken(profielId, dagen) {
  const aantalDagen = Math.max(1, Math.min(365, Number(dagen) || 14));
  const perDag = {};
  let totaalSeconden = 0;
  let totaalWissels = 0;
  const akkoordTelling = {};
  for (const rij of db.prepare(`SELECT moment, soort, seconden, wissels, akkoorden FROM oefensessies
      WHERE profiel_id = ? ORDER BY moment`).all(profielId)) {
    const dag = String(rij.moment || '').slice(0, 10);
    if (!dag) continue;
    if (!perDag[dag]) perDag[dag] = { dag, seconden: 0, wissels: 0, sessies: 0 };
    perDag[dag].seconden += Number(rij.seconden) || 0;
    perDag[dag].wissels += Number(rij.wissels) || 0;
    perDag[dag].sessies += 1;
    totaalSeconden += Number(rij.seconden) || 0;
    totaalWissels += Number(rij.wissels) || 0;
    for (const akkoord of String(rij.akkoorden || '').split(/\s+/).filter(Boolean)) {
      akkoordTelling[akkoord] = (akkoordTelling[akkoord] || 0) + 1;
    }
  }
  // De laatste N dagen op een rij, ook de dagen zonder oefening (voor de grafiek).
  const reeks = [];
  for (let i = aantalDagen - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const sleutel = d.toISOString().slice(0, 10);
    reeks.push(perDag[sleutel] || { dag: sleutel, seconden: 0, wissels: 0, sessies: 0 });
  }
  // Hoeveel dagen op een rij is er geoefend, tot en met vandaag of gisteren?
  let reeksDagen = 0;
  const vandaag = new Date();
  for (let i = 0; i < 400; i++) {
    const d = new Date(vandaag);
    d.setDate(d.getDate() - i);
    const sleutel = d.toISOString().slice(0, 10);
    const gehad = perDag[sleutel] && perDag[sleutel].seconden > 0;
    if (gehad) reeksDagen++;
    else if (i > 0 || true) { if (i === 0 && !gehad) continue; break; }
  }
  const lastige = Object.entries(akkoordTelling)
    .map(([akkoord, aantal]) => ({ akkoord, aantal }))
    .sort((a, b) => b.aantal - a.aantal || a.akkoord.localeCompare(b.akkoord))
    .slice(0, 8);
  return {
    dagen: reeks,
    vandaag: reeks[reeks.length - 1],
    totaalSeconden,
    totaalWissels,
    aantalDagenGeoefend: Object.keys(perDag).length,
    reeksDagen,
    geoefendeAkkoorden: lastige
  };
}

// ------------------------------------------------------------------- versie ---
function korteCommit() {
  const r = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: __dirname, encoding: 'utf8', timeout: 5000 });
  return r && r.status === 0 ? String(r.stdout || '').trim() : '';
}

function updateMogelijk() {
  if (!UPDATE_SCRIPT) return false;
  try {
    return fs.existsSync(UPDATE_SCRIPT) && !!(fs.statSync(UPDATE_SCRIPT).mode & 0o111);
  } catch (e) { return false; }
}

// De opdracht die de gebruiker op de host moet draaien als bijwerken vanuit de app
// niet kan. Bewust letterlijk, zodat hij hem kan kopiëren.
function updateCommando() {
  return 'bash -c "$(curl -fsSL https://raw.githubusercontent.com/Theberas04/akkoordkast/main/deploy/proxmox/update-from-github.sh)" <CTID>';
}

// Wat staat er op GitHub? Alleen om te melden dat er iets nieuws is; lukt het niet
// (geen internet), dan zeggen we dat gewoon.
async function laatsteVersieOpGitHub() {
  const controller = new AbortController();
  const stop = setTimeout(() => controller.abort(), 6000);
  try {
    const antwoord = await fetch('https://api.github.com/repos/Theberas04/akkoordkast/commits/main', {
      headers: { 'accept': 'application/vnd.github+json', 'user-agent': 'akkoordkast' },
      signal: controller.signal
    });
    if (!antwoord.ok) throw new Error('GitHub antwoordde ' + antwoord.status);
    const data = await antwoord.json();
    return {
      sha: String(data.sha || '').slice(0, 7),
      boodschap: String((data.commit && data.commit.message) || '').split('\n')[0].slice(0, 120),
      datum: String((data.commit && data.commit.author && data.commit.author.date) || '')
    };
  } catch (e) {
    return { fout: 'Kon GitHub niet bereiken: ' + e.message };
  } finally {
    clearTimeout(stop);
  }
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
  const o = Object.assign({ transpose: 0, capoStand: null, beheer: false }, opties || {});
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
    heeftMuziek: !!muziekVanLiedje(lied.id),
    heeftVideo: !!videoVanLiedje(lied.id),
    beheer: !!o.beheer,
    // Waar een opgehaald mp3-bestand terechtkomt (de app laat dat pad zien bij het plakken
    // van een link).
    download: { map: DOWNLOAD_DIR, ytdlp: OPHAAL.ytdlp },
    muziek: muziekBeeld(lied),
    video: videoBeeld(lied),
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
    tempo: lied.tempo,
    // Van het actieve profiel: is dit een favoriet, welke labels hangen eraan en
    // wanneer is het voor het laatst gespeeld?
    favoriet: !!lied.favoriet,
    labels: lied.labels || [],
    gespeeld: lied.gespeeld || ''
  };
}

// Zet bij een liedje wat dit profiel ermee te maken heeft: favoriet, labels en
// wanneer het voor het laatst gespeeld is.
function metPersoonlijk(lied, persoon) {
  return Object.assign({}, lied, {
    favoriet: persoon.favorieten.includes(lied.id),
    labels: (persoon.perLiedje[lied.id] || []).map(id => {
      const label = persoon.labels.find(l => l.id === id);
      return label ? label.naam : '';
    }).filter(Boolean),
    gespeeld: (persoon.gespeeld[lied.id] || {}).moment || ''
  });
}

function zoekLiedjes(query, profielId) {
  const q = (query.get('zoek') || '').trim().toLowerCase();
  const taal = (query.get('taal') || '').trim().toLowerCase();
  const genre = (query.get('genre') || '').trim().toLowerCase();
  const artiest = (query.get('artiest') || '').trim().toLowerCase();
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
  // op artiest zoeken we met een gedeeltelijke overeenkomst: in de grote bundels
  // staat de verzameling als "artiest" ("Kerr's Merry Melodies (Glasgow, 1870-1880)")
  if (artiest) uit = uit.filter(l => (l.artiest || '').toLowerCase().includes(artiest));
  if (eigenFilter === '1') uit = uit.filter(l => l.eigen);
  if (eigenFilter === '0') uit = uit.filter(l => !l.eigen);
  if (Number.isFinite(moeilijk)) uit = uit.filter(l => l.moeilijkheid === moeilijk);
  if (capoFilter === 'ja') uit = uit.filter(l => l.advies.capo > 0);
  if (capoFilter === 'nee') uit = uit.filter(l => l.advies.capo === 0);

  // De filters van dit profiel: alleen mijn favorieten, of juist één label.
  const alleenFavoriet = (query.get('favoriet') || '').trim() === '1';
  const labelFilter = parseInt(query.get('label'), 10);
  const gesorteerd = (query.get('sorteer') || '').trim().toLowerCase();
  if (alleenFavoriet || Number.isFinite(labelFilter)) {
    const persoon = persoonlijk(profielId || 1);
    if (alleenFavoriet) {
      uit = uit.filter(l => persoon.favorieten.includes(l.id));
    }
    if (Number.isFinite(labelFilter)) {
      uit = uit.filter(l => (persoon.perLiedje[l.id] || []).includes(labelFilter));
    }
  }
  // 'Laatst gespeeld' laat zien wat je het laatst onder handen had, nieuwste eerst.
  if (gesorteerd === 'gespeeld') {
    const persoon = persoonlijk(profielId || 1);
    uit = uit.filter(l => persoon.gespeeld[l.id])
      .sort((a, b) => String(persoon.gespeeld[b.id].moment).localeCompare(String(persoon.gespeeld[a.id].moment)));
  }
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

// ------------------------------------------------------------------ setlists ---
// Een setlist is een rij liedjes in een vaste volgorde, per profiel: wat je op een
// optreden achter elkaar speelt. De volgorde wordt na elke wijziging opnieuw
// genummerd, zodat omhoog en omlaag altijd klopt.

function setlistVan(profielId, id) {
  const rij = db.prepare('SELECT * FROM setlists WHERE id = ? AND profiel_id = ?').get(Number(id), profielId);
  if (!rij) return null;
  const ids = db.prepare('SELECT liedje_id FROM setlist_liedjes WHERE setlist_id = ? ORDER BY volgorde ASC').all(rij.id)
    .map(r => r.liedje_id);
  return { id: rij.id, naam: rij.naam, gemaakt: rij.gemaakt, liedjes: ids };
}

function setlistsVan(profielId) {
  return db.prepare('SELECT id, naam, gemaakt FROM setlists WHERE profiel_id = ? ORDER BY naam COLLATE NOCASE ASC').all(profielId)
    .map(r => ({
      id: r.id,
      naam: r.naam,
      gemaakt: r.gemaakt,
      aantal: db.prepare('SELECT COUNT(*) AS n FROM setlist_liedjes WHERE setlist_id = ?').get(r.id).n
    }));
}

// Wat de app van een setlist nodig heeft: de liedjes met toonsoort, capo, tempo en
// grepen, zodat de setlist te printen is zonder elk liedje apart op te halen.
function setlistBeeld(setlist) {
  const liedjes = setlist.liedjes.map(id => {
    const lied = vindLiedje(id);
    if (!lied) return null;
    const w = weergave(lied);
    return {
      id: w.id,
      titel: w.titel,
      artiest: w.artiest,
      toonsoort: w.toonsoort,
      capo: w.capo,
      tempo: w.tempo,
      strum: w.strum,
      moeilijkheid: w.moeilijkheid,
      maatsoort: w.maatsoort,
      akkoorden: theorie.uniek(w.model.akkoorden),
      bron: w.bron,
      licentie: w.licentie,
      eigen: w.eigen
    };
  }).filter(Boolean);
  return { id: setlist.id, naam: setlist.naam, gemaakt: setlist.gemaakt, aantal: liedjes.length, liedjes };
}

// De volgorde van een setlist opnieuw wegschrijven.
function bewaarVolgorde(setlistId, ids) {
  db.prepare('DELETE FROM setlist_liedjes WHERE setlist_id = ?').run(setlistId);
  const invoegen = db.prepare('INSERT INTO setlist_liedjes (setlist_id, liedje_id, volgorde) VALUES (?, ?, ?)');
  ids.forEach((liedjeId, i) => invoegen.run(setlistId, liedjeId, i));
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
  if (!perMaat.length) {
    throw new Error('Van dit liedje is alleen de tekst overgeleverd: er is geen melodie of ' +
      'akkoordschema om mee te spelen.');
  }
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

// Welke muziek speelt er mee bij dit liedje? Een eigen opname (die je uploadde, met het
// herkende akkoordschema) gaat voor; anders een muziekbestand uit je eigen map — dan speel
// je mee met de echte muziek in plaats van met de gitaarsynthesizer.
function eigenAudioUrl(lied) {
  if (lied.audio_bestand && lied.akkoordenPerMaat && lied.akkoordenPerMaat.length) {
    return `/media/audio/${lied.audio_bestand}`;
  }
  const m = muziekVanLiedje(lied.id);
  if (m && m.bestaat) return `/api/muziek/bestand?liedje=${lied.id}`;
  return '';
}

// Speelt dit liedje met eigen audio mee? Dan is die audio de muziek en loopt het
// akkoordschema daarlangs.
function meespeelEigenAudio(lied) {
  return !!eigenAudioUrl(lied);
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
// Eén ronde van de mapscanner: pak de eerste open bestanden en zet ze om. Dezelfde
// code loopt ook op de achtergrond (de wachter hieronder), zodat je er niet aan hoeft
// te denken als er nieuwe muziek in de map staat.
function scanRonde(mapPad, limiet) {
  const uit = scanBestanden(mapPad);
  if (uit.fout) return { fout: uit.fout };
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
  const na = scanBestanden(mapPad);
  return {
    map: uit.map,
    gedaan: gedaan.length,
    mislukt: mislukt.length,
    klaar: na.nieuw === 0,
    rest: na.nieuw,
    totaal: na.aantal,
    liedjes: gedaan,
    fouten: mislukt,
    wanneer: new Date().toISOString()
  };
}

// De wachter: kijkt op de achtergrond of er nieuwe muziek in de map staat en of er
// een nieuwe versie van de app is. Alles wordt bewaard in de instellingen, zodat de
// kaart in de app kan laten zien wat er gebeurd is — ook na een herstart.
// De map die de app zelf voorstelt: met MUSIC_DIR in de omgeving (bijvoorbeeld een
// NAS- of Drive-koppeling) hoef je dat pad niet elke keer in te typen.
const STANDAARD_MUZIEKMAP = String(process.env.MUSIC_DIR || '').trim();

// Waar een opgehaald mp3-bestand komt te staan. Bij voorkeur in de muziekmap zelf, in een
// eigen ondermap, zodat de app het meteen kan vinden en afspelen. Is er geen muziekmap
// bekend, dan komt het in de map met de gegevens van de app.
const DOWNLOAD_DIR = path.resolve(String(process.env.DOWNLOAD_DIR || '').trim() ||
  (STANDAARD_MUZIEKMAP ? path.join(STANDAARD_MUZIEKMAP, 'Gedownload') : path.join(DATA_DIR, 'gedownload')));

const OPHAAL = downloader.maakDownloader({ map: DOWNLOAD_DIR, ytdlp: process.env.YTDLP || 'yt-dlp' });
let ophaalLiedje = 0;
let ophaalWacht = null;

// Zodra het ophalen klaar is, hangt de app het bestand meteen aan het liedje, zodat je het
// kunt meespelen. Ligt het bestand buiten de mappen die de app kent, dan wordt de
// downloadmap eerst toegevoegd — anders mag de app het bestand niet openen (dat is de
// veiligheidsregel: alleen bestanden binnen de aangewezen mappen).
function bewaakOphaal(liedjeId) {
  if (ophaalWacht) clearInterval(ophaalWacht);
  ophaalWacht = setInterval(() => {
    const stand = OPHAAL.standVan();
    if (stand.status === 'bezig') return;
    clearInterval(ophaalWacht);
    ophaalWacht = null;
    if (stand.status !== 'klaar' || !stand.bestand) return;
    try {
      const mappen = leesMappen();
      if (!muziekbestand.veilig(stand.bestand, [DOWNLOAD_DIR])) {
        console.log('opgehaald bestand valt buiten de downloadmap; ik koppel het niet:', stand.bestand);
        return;
      }
      if (!mappen.includes(DOWNLOAD_DIR)) zetMappen(mappen.concat([DOWNLOAD_DIR]));
      zetLiedjeMuziek(liedjeId, stand.bestand, path.basename(stand.bestand));
      console.log('opgehaald en gekoppeld aan liedje ' + liedjeId + ': ' + path.basename(stand.bestand));
    } catch (fout) {
      console.log('koppelen van het opgehaalde bestand mislukte:', fout.message);
    }
  }, 700);
}

// Wat de app van het ophalen laat zien: de stand, plus of het bestand al aan dit liedje hangt.
function ophaalBeeld(liedjeId) {
  const stand = OPHAAL.standVan();
  const eigen = Number(liedjeId) || 0;
  const vanDitLiedje = eigen && ophaalLiedje === eigen;
  const m = eigen ? muziekVanLiedje(eigen) : null;
  return {
    map: DOWNLOAD_DIR,
    ytdlp: OPHAAL.ytdlp,
    status: vanDitLiedje ? stand.status : 'leeg',
    procent: vanDitLiedje ? stand.procent : 0,
    bestand: vanDitLiedje ? (stand.bestand ? path.basename(stand.bestand) : '') : '',
    fout: vanDitLiedje ? stand.fout : '',
    log: vanDitLiedje ? stand.log : [],
    url: vanDitLiedje ? stand.url : '',
    bezig: stand.status === 'bezig',
    gekoppeld: !!(m && m.bestaat)
  };
}

// De app kan naar meerdere mappen kijken: de map op deze machine, de NAS-map die als
// koppeling in de container staat, enzovoort. De lijst staat in de instellingen.
function leesMappen() {
  let lijst = [];
  try { lijst = JSON.parse(leesInstelling('scan_mappen', '[]')); } catch (e) { lijst = []; }
  if (!Array.isArray(lijst)) lijst = [];
  const enkel = String(leesInstelling('scan_map', '') || '').trim();
  if (enkel) lijst.push(enkel);
  if (!lijst.length && STANDAARD_MUZIEKMAP) lijst.push(STANDAARD_MUZIEKMAP);
  const uit = [];
  for (const stuk of lijst) {
    const schoon = String(stuk || '').trim();
    if (!schoon) continue;
    const p = path.resolve(schoon);
    if (!uit.includes(p)) uit.push(p);
  }
  return uit;
}

// --- de muziek van een liedje -------------------------------------------------
// Welk audiobestand uit de muziekmappen hoort bij dit liedje? De app haalt zelf geen
// opnamen van internet (auteursrecht): je koppelt een bestand dat je al hebt, en de app
// speelt dat mee terwijl de akkoorden en de hals meelopen.

function muziekVanLiedje(liedjeId) {
  const rij = db.prepare('SELECT pad, titel, wanneer FROM liedje_muziek WHERE liedje_id = ?')
    .get(Number(liedjeId) || 0);
  if (!rij || !rij.pad) return null;
  const pad = String(rij.pad);
  let bestaat = false;
  try {
    bestaat = fs.statSync(pad).isFile();
  } catch (e) {
    bestaat = false;
  }
  return { pad, titel: String(rij.titel || ''), wanneer: String(rij.wanneer || ''), bestaat };
}

function zetLiedjeMuziek(liedjeId, pad, titel) {
  db.prepare('INSERT INTO liedje_muziek (liedje_id, pad, titel, wanneer) VALUES (?, ?, ?, ?) ' +
    'ON CONFLICT(liedje_id) DO UPDATE SET pad = excluded.pad, titel = excluded.titel, wanneer = excluded.wanneer')
    .run(Number(liedjeId) || 0, String(pad), String(titel || ''), new Date().toISOString());
}

function wisLiedjeMuziek(liedjeId) {
  db.prepare('DELETE FROM liedje_muziek WHERE liedje_id = ?').run(Number(liedjeId) || 0);
}

// Voor de lijst: welke liedjes hebben al muziek? Eén vraag in plaats van één per liedje.
function liedjesMetMuziek() {
  const uit = new Set();
  try {
    for (const rij of db.prepare('SELECT liedje_id FROM liedje_muziek').all()) uit.add(Number(rij.liedje_id));
  } catch (e) {
    /* geen tabel: dan niets */
  }
  return uit;
}

// --- een YouTube-video aan een liedje ----------------------------------------
// De app speelt de video via de officiele insluiting van YouTube. Hij downloadt niets: dat
// mag niet van andermans muziek, en de app hoort geen auteursrechtelijke opnamen te bewaren.

function videoVanLiedje(liedjeId) {
  const rij = db.prepare('SELECT video, wanneer FROM liedje_youtube WHERE liedje_id = ?')
    .get(Number(liedjeId) || 0);
  const id = rij ? youtube.videoId(rij.video) : '';
  if (!id) return null;
  return { video: id, wanneer: rij ? String(rij.wanneer || '') : '' };
}

function zetLiedjeVideo(liedjeId, videoId) {
  db.prepare('INSERT INTO liedje_youtube (liedje_id, video, wanneer) VALUES (?, ?, ?) ' +
    'ON CONFLICT(liedje_id) DO UPDATE SET video = excluded.video, wanneer = excluded.wanneer')
    .run(Number(liedjeId) || 0, String(videoId), new Date().toISOString());
}

function wisLiedjeVideo(liedjeId) {
  db.prepare('DELETE FROM liedje_youtube WHERE liedje_id = ?').run(Number(liedjeId) || 0);
}

function liedjesMetVideo() {
  const uit = new Set();
  try {
    for (const rij of db.prepare('SELECT liedje_id FROM liedje_youtube').all()) uit.add(Number(rij.liedje_id));
  } catch (e) {
    /* geen tabel: niets */
  }
  return uit;
}

function videoBeeld(lied) {
  const v = videoVanLiedje(lied.id);
  return {
    video: v ? v.video : '',
    insluit: v ? youtube.insluitUrl(v.video) : '',
    kijk: v ? youtube.kijkUrl(v.video) : '',
    // De zoeklink blijft bruikbaar als je nog geen video hebt gekozen.
    zoek: lied.youtube || `https://www.youtube.com/results?search_query=${encodeURIComponent(`${lied.titel} ${lied.artiest}`)}`
  };
}

function muziekBeeld(lied) {
  const m = muziekVanLiedje(lied.id);
  return {
    pad: m ? m.pad : '',
    titel: m ? m.titel : '',
    bestaat: !!(m && m.bestaat),
    url: m ? `/api/muziek/bestand?liedje=${lied.id}` : '',
    mappen: leesMappen(),
  };
}

function zetMappen(lijst) {
  const schoon = [];
  for (const stuk of lijst) {
    const naam = String(stuk || '').trim();
    if (!naam) continue;
    const p = path.resolve(naam);
    if (!schoon.includes(p)) schoon.push(p);
  }
  zetInstelling('scan_mappen', JSON.stringify(schoon));
  zetInstelling('scan_map', schoon[0] || '');
  WACHTER.mappen = schoon;
  WACHTER.map = schoon[0] || '';
  return schoon;
}

// Wat de app van één map laat zien: staat hij hier, en hoeveel muziek ligt erin?
function mapBeeld(pad) {
  const p = path.resolve(String(pad || '').trim() || '.');
  const beeld = { pad: p, bestaat: false, isMap: false, aantal: 0, nieuw: 0, fout: '' };
  let stat = null;
  try { stat = fs.statSync(p); } catch (e) { stat = null; }
  if (!stat) {
    beeld.fout = 'Deze map is er niet op deze machine. Staat de koppeling naar de NAS er wel?';
    return beeld;
  }
  if (!stat.isDirectory()) {
    beeld.fout = 'Dit is geen map.';
    return beeld;
  }
  beeld.bestaat = true;
  beeld.isMap = true;
  const uit = scanBestanden(p);
  if (uit.fout) { beeld.fout = uit.fout; return beeld; }
  beeld.aantal = uit.aantal;
  beeld.nieuw = uit.nieuw;
  return beeld;
}

function mappenBeeld() {
  const mappen = leesMappen().map(mapBeeld);
  const standaardPad = STANDAARD_MUZIEKMAP ? path.resolve(STANDAARD_MUZIEKMAP) : '';
  return {
    mappen,
    standaard: STANDAARD_MUZIEKMAP,
    voorstel: standaardPad && !mappen.some(m => m.pad === standaardPad) ? standaardPad : ''
  };
}

const WACHTER = {
  aan: leesInstelling('wacht_map_aan', '0') === '1',
  minuten: Math.max(5, Math.min(24 * 60, parseInt(leesInstelling('wacht_map_minuten', '360'), 10) || 360)),
  map: leesInstelling('scan_map', STANDAARD_MUZIEKMAP),
  mappen: leesMappen(),
  laatste: leesInstelling('wacht_map_laatste', ''),
  verslag: leesInstelling('wacht_map_verslag', ''),
  perRonde: Math.max(1, Math.min(50, parseInt(leesInstelling('wacht_map_per_ronde', '8'), 10) || 8)),
  versieLaatste: leesInstelling('wacht_versie_laatste', ''),
  versieNieuw: leesInstelling('wacht_versie_nieuw', ''),
  bezig: false,
  timer: null
};

function wachterBeeld() {
  return {
    aan: WACHTER.aan,
    minuten: WACHTER.minuten,
    map: WACHTER.map,
    mappen: leesMappen(),
    standaardMap: STANDAARD_MUZIEKMAP,
    laatste: WACHTER.laatste,
    verslag: WACHTER.verslag,
    perRonde: WACHTER.perRonde,
    versieLaatste: WACHTER.versieLaatste,
    versieNieuw: WACHTER.versieNieuw,
    updateMogelijk: updateMogelijk(),
    updateCommando: updateCommando()
  };
}

// ------------------------------------------------------------- back-up ---
// Een kopie van alles wat je zelf hebt gemaakt — profielen, favorieten, setlists,
// oefencijfers, je eigen liedjes en de instellingen — naar een map die jij kiest,
// bijvoorbeeld op de NAS. De app bewaart de laatste N en ruimt de rest op.
// De voorgestelde back-upmap staat *in* de muziekmap. Reden: de container ziet alleen wat
// daar gekoppeld is, en een map naast de muziekmap (bijvoorbeeld /mnt/Nas/Nas-Opslag/backup)
// bestaat binnen de container niet. Zo werkt het voorstel meteen, ook op een NAS. De app
// slaat geluidsbestanden over bij het scannen, dus die JSON-bestanden storen niet.
const STANDAARD_BACKUPMAP = String(process.env.BACKUP_DIR || '').trim() ||
  (STANDAARD_MUZIEKMAP ? path.join(STANDAARD_MUZIEKMAP, 'akkoordkast-backup') : '');

const BACKUP = {
  aan: leesInstelling('backup_aan', '0') === '1',
  map: leesInstelling('backup_map', STANDAARD_BACKUPMAP),
  bewaren: Math.max(1, Math.min(100, parseInt(leesInstelling('backup_bewaren', '10'), 10) || 10)),
  laatste: leesInstelling('backup_laatste', ''),
  verslag: leesInstelling('backup_verslag', ''),
  bezig: false
};

function backupBestanden(mapPad) {
  if (!mapPad) return [];
  let namen = [];
  try {
    namen = fs.readdirSync(mapPad).filter(n => /^akkoordkast-backup-.*\.json$/.test(n));
  } catch (e) {
    return [];
  }
  return namen.map(naam => {
    const pad = path.join(mapPad, naam);
    let stat = null;
    try { stat = fs.statSync(pad); } catch (e) { stat = null; }
    return { naam, pad, grootte: stat ? stat.size : 0, wanneer: stat ? stat.mtime.toISOString() : '' };
  }).sort((a, b) => a.naam.localeCompare(b.naam));
}

function maakBackup() {
  const mapPad = BACKUP.map;
  if (!mapPad) return { ok: false, fout: 'Er is nog geen map gekozen voor de back-up.' };
  try {
    fs.mkdirSync(mapPad, { recursive: true });
  } catch (e) {
    return { ok: false, fout: 'De map ' + mapPad + ' kan ik niet maken of bereiken: ' + e.message };
  }
  const nu = new Date();
  const inhoud = backup.maakInhoud({
    liedjes: db.prepare('SELECT * FROM liedjes').all(),
    profielen: db.prepare('SELECT * FROM profielen').all(),
    favorieten: db.prepare('SELECT * FROM favorieten').all(),
    labels: db.prepare('SELECT * FROM labels').all(),
    liedje_labels: db.prepare('SELECT * FROM liedje_labels').all(),
    gespeeld: db.prepare('SELECT * FROM gespeeld').all(),
    oefensessies: db.prepare('SELECT * FROM oefensessies').all(),
    setlists: db.prepare('SELECT * FROM setlists').all(),
    setlist_liedjes: db.prepare('SELECT * FROM setlist_liedjes').all(),
    instellingen: db.prepare('SELECT sleutel, waarde FROM instellingen').all()
  }, nu);

  const naam = backup.bestandsnaam(nu);
  const doel = path.join(mapPad, naam);
  try {
    fs.writeFileSync(doel, JSON.stringify(inhoud, null, 1), 'utf8');
  } catch (e) {
    return { ok: false, fout: 'Schrijven in ' + mapPad + ' lukt niet: ' + e.message +
      ' Controleer of de koppeling er is en of de app erin mag schrijven.' };
  }

  const weg = [];
  for (const oud of backup.teVerwijderen(backupBestanden(mapPad).map(b => b.naam), BACKUP.bewaren)) {
    try { fs.unlinkSync(path.join(mapPad, oud)); weg.push(oud); } catch (e) { /* laat staan */ }
  }

  let grootte = 0;
  try { grootte = fs.statSync(doel).size; } catch (e) { grootte = 0; }
  BACKUP.laatste = nu.toISOString();
  BACKUP.verslag = 'Back-up gemaakt (' + Math.round(grootte / 1024) + ' kB)' +
    (weg.length ? ' · ' + weg.length + ' oude opgeruimd' : '');
  zetInstelling('backup_laatste', BACKUP.laatste);
  zetInstelling('backup_verslag', BACKUP.verslag);
  return {
    ok: true,
    bestand: naam,
    pad: doel,
    grootte,
    opgeruimd: weg,
    samenvatting: backup.samenvatting(inhoud),
    verslag: BACKUP.verslag
  };
}

function backupBeeld() {
  const bestaat = !!BACKUP.map && fs.existsSync(BACKUP.map);
  return {
    aan: BACKUP.aan,
    map: BACKUP.map,
    standaardMap: STANDAARD_BACKUPMAP,
    bewaren: BACKUP.bewaren,
    bestaat,
    laatste: BACKUP.laatste,
    verslag: BACKUP.verslag,
    bestanden: bestaat ? backupBestanden(BACKUP.map).slice(-10).reverse() : []
  };
}

// De automatische ronde: één keer per dag, als het aanstaat. Wordt vanuit de wachter
// aangeroepen, die toch al elke minuut kijkt of er iets te doen is.
function misschienBackup() {
  if (!BACKUP.aan || BACKUP.bezig || !BACKUP.map) return;
  const vorige = BACKUP.laatste ? new Date(BACKUP.laatste).getTime() : 0;
  if (vorige && Date.now() - vorige < 24 * 60 * 60 * 1000) return;
  BACKUP.bezig = true;
  try {
    const uit = maakBackup();
    if (!uit.ok) {
      BACKUP.verslag = 'Let op: ' + uit.fout;
      zetInstelling('backup_verslag', BACKUP.verslag);
    }
  } catch (e) {
    BACKUP.verslag = 'Let op: ' + e.message;
    zetInstelling('backup_verslag', BACKUP.verslag);
  }
  BACKUP.bezig = false;
}

async function wachterRonde(metVersie) {
  if (WACHTER.bezig) return;
  WACHTER.bezig = true;
  const mappen = leesMappen();
  WACHTER.mappen = mappen;
  WACHTER.map = mappen[0] || '';
  if (!mappen.length) {
    WACHTER.laatste = new Date().toISOString();
    WACHTER.verslag = 'Nog geen muziekmap ingesteld.';
    zetInstelling('wacht_map_laatste', WACHTER.laatste);
    zetInstelling('wacht_map_verslag', WACHTER.verslag);
  } else {
    try {
      let gedaan = 0, mislukt = 0, rest = 0, totaal = 0;
      const ontbreekt = [];
      for (const map of mappen) {
        const uit = scanRonde(map, WACHTER.perRonde);
        if (uit.fout) { ontbreekt.push(map); continue; }
        gedaan += uit.gedaan || 0;
        mislukt += uit.mislukt || 0;
        rest += uit.rest || 0;
        totaal += uit.totaal || 0;
      }
      const delen = [];
      if (gedaan || mislukt) {
        delen.push(gedaan + ' omgezet' + (mislukt ? ', ' + mislukt + ' mislukt' : '') + ' · nog ' + rest + ' te doen');
      } else if (!ontbreekt.length) {
        delen.push('Niets nieuws in ' + (mappen.length > 1 ? 'de mappen' : 'de map') + ' (' + totaal + ' bestanden).');
      }
      if (ontbreekt.length) {
        delen.push('Let op: ' + ontbreekt.join(', ') + ' is er niet (meer). Staat de koppeling nog?');
      }
      WACHTER.laatste = new Date().toISOString();
      WACHTER.verslag = delen.join(' · ');
      zetInstelling('wacht_map_laatste', WACHTER.laatste);
      zetInstelling('wacht_map_verslag', WACHTER.verslag);
    } catch (e) {
      WACHTER.verslag = 'Let op: ' + e.message;
      zetInstelling('wacht_map_verslag', WACHTER.verslag);
    }
  }
  if (metVersie) {
    try {
      const laatste = await laatsteVersieOpGitHub();
      WACHTER.versieLaatste = new Date().toISOString();
      const hier = korteCommit();
      WACHTER.versieNieuw = laatste && laatste.sha && hier && laatste.sha !== hier && !hier.startsWith(laatste.sha)
        ? laatste.sha
        : '';
      zetInstelling('wacht_versie_laatste', WACHTER.versieLaatste);
      zetInstelling('wacht_versie_nieuw', WACHTER.versieNieuw);
    } catch (e) { /* geen internet? dan proberen we het later opnieuw */ }
  }
  WACHTER.bezig = false;
}

// Elke minuut kijken of het tijd is. Een timer van een minuut is licht genoeg en
// overleeft een klok die een uurtje verspringt.
function startWachter() {
  if (WACHTER.timer) clearInterval(WACHTER.timer);
  WACHTER.timer = setInterval(() => {
    misschienBackup();
    const nu = Date.now();
    const vorigeVersie = WACHTER.versieLaatste ? Date.parse(WACHTER.versieLaatste) : 0;
    const versieToe = nu - vorigeVersie >= 6 * 3600 * 1000;
    if (WACHTER.aan) {
      const vorige = WACHTER.laatste ? Date.parse(WACHTER.laatste) : 0;
      if (nu - vorige >= WACHTER.minuten * 60000) { wachterRonde(true); return; }
    }
    // Naar een nieuwe versie kijken doet de app ook als het map-bijhouden uit staat.
    if (versieToe) wachterRonde(true);
  }, 60000);
  if (WACHTER.timer.unref) WACHTER.timer.unref();
  // Bij het starten één keer kijken of er iets nieuws is, zodat de kaart meteen klopt.
  setTimeout(() => { wachterRonde(true); }, 4000).unref();
}

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
  // --- akkoordenboek: van elk akkoord alle posities over de hals ---
  const akkoordPosities = naam => ({
    naam,
    noten: grepen.noten(naam, 0).map(n => n.midi),
    isBarre: grepen.isBarre(naam),
    posities: grepen.posities(naam).map(p => ({
      naam: p.naam,
      beschrijving: p.beschrijving || '',
      vanaf: p.vanaf,
      frets: p.frets,
      vingers: p.vingers,
      barre: p.barre || null,
      noten: p.noten,
      svg: grepen.svgDiagramVanGreep(p, { toonNaam: naam })
    }))
  });
  if (pad === '/api/akkoordenboek' && methode === 'GET') {
    const een = (query.get('akkoord') || '').trim();
    if (een) {
      if (!grepen.heeftGreep(een)) { json(res, 404, { fout: 'Geen greep voor ' + een }); return; }
      json(res, 200, akkoordPosities(een));
      return;
    }
    json(res, 200, { akkoorden: grepen.alleGrepen().map(akkoordPosities) });
    return;
  }

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

  // --- profielen ---
  if (pad === '/api/profielen' && methode === 'GET') {
    json(res, 200, { profielen: profielLijst(), actief: profielVan(req, query) });
    return;
  }
  // --- beheerder: wachtwoord instellen, inloggen, uitloggen ---
  if (pad === '/api/beheer' && methode === 'GET') {
    json(res, 200, {
      ingesteld: !!wachtwoordAfdruk(),
      ingelogd: isBeheerder(req),
      minLengte: beheer.MIN_LENGTE,
      dagen: beheer.SESSIE_DAGEN
    });
    return;
  }
  if (pad === '/api/beheer/wachtwoord' && methode === 'POST') {
    const body = await leesJsonBody(req);
    const nieuw = String(body.wachtwoord || '');
    const afdruk = wachtwoordAfdruk();
    // De eerste keer mag het zonder inloggen (er is nog niets om in te loggen); daarna alleen
    // als je de beheerder bent, en met het oude wachtwoord erbij.
    if (afdruk) {
      if (!isBeheerder(req)) { json(res, 403, { fout: 'Log eerst in als beheerder.' }); return; }
      if (!beheer.controleerWachtwoord(String(body.oud || ''), afdruk)) {
        json(res, 401, { fout: 'Het oude wachtwoord klopt niet.' });
        return;
      }
    }
    if (!beheer.sterkGenoeg(nieuw)) {
      json(res, 400, { fout: 'Kies een wachtwoord van minstens ' + beheer.MIN_LENGTE + ' tekens.' });
      return;
    }
    zetInstelling(SLEUTEL_WACHTWOORD, beheer.hashWachtwoord(nieuw));
    // Iedereen die nog ingelogd was moet opnieuw inloggen; deze sessie zetten we meteen klaar,
    // zodat je niet direct na het instellen weer moet inloggen.
    db.prepare('DELETE FROM sessies').run();
    beginSessie(res);
    json(res, 200, { ok: true, ingesteld: true, ingelogd: true });
    return;
  }
  if (pad === '/api/beheer/inloggen' && methode === 'POST') {
    const body = await leesJsonBody(req);
    if (teVeelPogingen(req)) {
      json(res, 429, { fout: 'Te veel foute pogingen. Probeer het over een kwartier weer.' });
      return;
    }
    const afdruk = wachtwoordAfdruk();
    if (!afdruk) { json(res, 400, { fout: 'Er is nog geen beheerderswachtwoord ingesteld.' }); return; }
    if (!beheer.controleerWachtwoord(String(body.wachtwoord || ''), afdruk)) {
      telPoging(req, false);
      json(res, 401, { fout: 'Dat wachtwoord klopt niet.' });
      return;
    }
    telPoging(req, true);
    beginSessie(res);
    json(res, 200, { ok: true, ingelogd: true });
    return;
  }
  if (pad === '/api/beheer/uitloggen' && methode === 'POST') {
    beeindigSessie(req, res);
    json(res, 200, { ok: true, ingelogd: false });
    return;
  }

  // Alles wat iets toevoegt of verandert, is voor de beheerder.
  if (beheerNodig(pad, methode) && !isBeheerder(req)) {
    json(res, 403, {
      fout: 'Alleen de beheerder kan muziek en liedjes toevoegen. Log in bij het tabblad Toevoegen.',
      beheer: true
    });
    return;
  }

  if (pad === '/api/profielen' && methode === 'POST') {
    const body = await leesJsonBody(req);
    const naam = String(body.naam || '').trim().slice(0, 40);
    if (!naam) { json(res, 400, { fout: 'Geef het profiel een naam.' }); return; }
    if (profielLijst().some(p => p.naam.toLowerCase() === naam.toLowerCase())) {
      json(res, 409, { fout: 'Er is al een profiel met die naam.' });
      return;
    }
    const info = db.prepare('INSERT INTO profielen (naam, aangemaakt) VALUES (?, ?)').run(naam, new Date().toISOString());
    json(res, 201, { ok: true, profiel: { id: Number(info.lastInsertRowid), naam }, profielen: profielLijst() });
    return;
  }
  const profielMatch = pad.match(/^\/api\/profielen\/(\d+)$/);
  if (profielMatch && (methode === 'PUT' || methode === 'PATCH')) {
    const body = await leesJsonBody(req);
    const naam = String(body.naam || '').trim().slice(0, 40);
    if (!naam) { json(res, 400, { fout: 'Geef het profiel een naam.' }); return; }
    const id = Number(profielMatch[1]);
    if (!db.prepare('SELECT id FROM profielen WHERE id = ?').get(id)) { json(res, 404, { fout: 'Profiel niet gevonden' }); return; }
    db.prepare('UPDATE profielen SET naam = ? WHERE id = ?').run(naam, id);
    json(res, 200, { ok: true, profielen: profielLijst() });
    return;
  }
  if (profielMatch && methode === 'DELETE') {
    const id = Number(profielMatch[1]);
    if (!db.prepare('SELECT id FROM profielen WHERE id = ?').get(id)) { json(res, 404, { fout: 'Profiel niet gevonden' }); return; }
    if (profielLijst().length <= 1) { json(res, 400, { fout: 'Het laatste profiel kun je niet verwijderen.' }); return; }
    for (const tabel of ['favorieten', 'liedje_labels', 'labels', 'gespeeld', 'oefensessies']) {
      db.prepare(`DELETE FROM ${tabel} WHERE profiel_id = ?`).run(id);
    }
    db.prepare('DELETE FROM profielen WHERE id = ?').run(id);
    json(res, 200, { ok: true, profielen: profielLijst() });
    return;
  }

  // --- wat dit profiel heeft: favorieten, labels, geschiedenis ---
  if (pad === '/api/persoonlijk' && methode === 'GET') {
    const profielId = profielVan(req, query);
    const p = persoonlijk(profielId);
    json(res, 200, {
      profiel: profielId,
      profielen: profielLijst(),
      favorieten: p.favorieten,
      labels: p.labels,
      perLiedje: p.perLiedje,
      gespeeld: p.gespeeld
    });
    return;
  }

  // --- een liedje al dan niet favoriet maken ---
  if (pad === '/api/favoriet' && methode === 'POST') {
    const body = await leesJsonBody(req);
    const profielId = profielVan(req, query);
    if (!vindLiedje(body.liedje)) { json(res, 404, { fout: 'Liedje niet gevonden' }); return; }
    const nummer = Number(body.liedje);
    const aan = body.aan === undefined ? true : !!body.aan;
    if (aan) {
      db.prepare('INSERT INTO favorieten (profiel_id, liedje_id, aangeemaakt) VALUES (?, ?, ?) ON CONFLICT(profiel_id, liedje_id) DO NOTHING')
        .run(profielId, nummer, new Date().toISOString());
    } else {
      db.prepare('DELETE FROM favorieten WHERE profiel_id = ? AND liedje_id = ?').run(profielId, nummer);
    }
    json(res, 200, { ok: true, favoriet: aan, liedje: nummer });
    return;
  }

  // --- labels van dit profiel ---
  if (pad === '/api/labels' && methode === 'GET') {
    json(res, 200, { labels: persoonlijk(profielVan(req, query)).labels });
    return;
  }
  if (pad === '/api/labels' && methode === 'POST') {
    const body = await leesJsonBody(req);
    const profielId = profielVan(req, query);
    const naam = String(body.naam || '').trim().slice(0, 30);
    if (!naam) { json(res, 400, { fout: 'Geef het label een naam.' }); return; }
    const bestaand = db.prepare('SELECT id FROM labels WHERE profiel_id = ? AND LOWER(naam) = LOWER(?)').get(profielId, naam);
    if (bestaand) { json(res, 200, { ok: true, id: Number(bestaand.id), labels: persoonlijk(profielId).labels }); return; }
    const info = db.prepare('INSERT INTO labels (profiel_id, naam, aangemaakt) VALUES (?, ?, ?)').run(profielId, naam, new Date().toISOString());
    json(res, 201, { ok: true, id: Number(info.lastInsertRowid), labels: persoonlijk(profielId).labels });
    return;
  }
  const labelMatch = pad.match(/^\/api\/labels\/(\d+)$/);
  if (labelMatch && methode === 'DELETE') {
    const profielId = profielVan(req, query);
    const id = Number(labelMatch[1]);
    const rij = db.prepare('SELECT id FROM labels WHERE id = ? AND profiel_id = ?').get(id, profielId);
    if (!rij) { json(res, 404, { fout: 'Label niet gevonden' }); return; }
    db.prepare('DELETE FROM liedje_labels WHERE profiel_id = ? AND label_id = ?').run(profielId, id);
    db.prepare('DELETE FROM labels WHERE id = ? AND profiel_id = ?').run(id, profielId);
    json(res, 200, { ok: true, labels: persoonlijk(profielId).labels });
    return;
  }

  // --- een label aan een liedje hangen of eraf halen ---
  if (pad === '/api/liedje-label' && methode === 'POST') {
    const body = await leesJsonBody(req);
    const profielId = profielVan(req, query);
    if (!vindLiedje(body.liedje)) { json(res, 404, { fout: 'Liedje niet gevonden' }); return; }
    const nummer = Number(body.liedje);
    let labelId = Number(body.label);
    if (!labelId && body.naam) {
      const naam = String(body.naam).trim().slice(0, 30);
      if (!naam) { json(res, 400, { fout: 'Geef het label een naam.' }); return; }
      const bestaand = db.prepare('SELECT id FROM labels WHERE profiel_id = ? AND LOWER(naam) = LOWER(?)').get(profielId, naam);
      labelId = bestaand ? Number(bestaand.id)
        : Number(db.prepare('INSERT INTO labels (profiel_id, naam, aangemaakt) VALUES (?, ?, ?)').run(profielId, naam, new Date().toISOString()).lastInsertRowid);
    }
    if (!db.prepare('SELECT id FROM labels WHERE id = ? AND profiel_id = ?').get(labelId, profielId)) {
      json(res, 404, { fout: 'Label niet gevonden' });
      return;
    }
    const aan = body.aan === undefined ? true : !!body.aan;
    if (aan) {
      db.prepare('INSERT INTO liedje_labels (profiel_id, liedje_id, label_id) VALUES (?, ?, ?) ON CONFLICT(profiel_id, liedje_id, label_id) DO NOTHING')
        .run(profielId, nummer, labelId);
    } else {
      db.prepare('DELETE FROM liedje_labels WHERE profiel_id = ? AND liedje_id = ? AND label_id = ?').run(profielId, nummer, labelId);
    }
    json(res, 200, { ok: true, aan, labels: persoonlijk(profielId).labels });
    return;
  }

  // --- een liedje als gespeeld noteren (voor 'laatst gespeeld') ---
  if (pad === '/api/gespeeld' && methode === 'POST') {
    const body = await leesJsonBody(req);
    const profielId = profielVan(req, query);
    if (!vindLiedje(body.liedje)) { json(res, 404, { fout: 'Liedje niet gevonden' }); return; }
    db.prepare(`INSERT INTO gespeeld (profiel_id, liedje_id, moment, aantal) VALUES (?, ?, ?, 1)
        ON CONFLICT(profiel_id, liedje_id) DO UPDATE SET moment = excluded.moment, aantal = aantal + 1`)
      .run(profielId, Number(body.liedje), new Date().toISOString());
    json(res, 200, { ok: true });
    return;
  }

  // --- een oefensessie opslaan (de trainer stuurt dit na het stoppen) ---
  if (pad === '/api/oefenen' && methode === 'POST') {
    const body = await leesJsonBody(req);
    const profielId = profielVan(req, query);
    const soort = String(body.soort || '').slice(0, 20) || 'oefening';
    const seconden = Math.max(0, Math.min(4 * 3600, Math.round(Number(body.seconden) || 0)));
    const wissels = Math.max(0, Math.min(100000, Math.round(Number(body.wissels) || 0)));
    const akkoorden = Array.isArray(body.akkoorden) ? body.akkoorden.slice(0, 40).map(a => String(a).slice(0, 8)).join(' ') : '';
    if (!seconden && !wissels) { json(res, 400, { fout: 'Een lege oefensessie slaan we niet op.' }); return; }
    db.prepare('INSERT INTO oefensessies (profiel_id, moment, soort, seconden, wissels, akkoorden) VALUES (?, ?, ?, ?, ?, ?)')
      .run(profielId, new Date().toISOString(), soort, seconden, wissels, akkoorden);
    json(res, 201, { ok: true, statistieken: oefenstatistieken(profielId, 14) });
    return;
  }

  // --- oefenstatistieken van dit profiel ---
  if (pad === '/api/oefenen/statistieken' && methode === 'GET') {
    const profielId = profielVan(req, query);
    const p = persoonlijk(profielId);
    const statistieken = oefenstatistieken(profielId, query.get('dagen'));
    // hoe vaak elk liedje gespeeld is, nieuwste eerst — dat is meteen 'laatst gespeeld'
    const gespeeldeLiedjes = Object.entries(p.gespeeld)
      .map(([id, g]) => {
        const lied = vindLiedje(Number(id));
        return lied ? { id: Number(id), titel: lied.titel, artiest: lied.artiest, moment: g.moment, aantal: g.aantal } : null;
      })
      .filter(Boolean)
      .sort((a, b) => String(b.moment).localeCompare(String(a.moment)))
      .slice(0, 20);
    json(res, 200, {
      profiel: profielId,
      statistieken,
      gespeeldeLiedjes,
      aantalFavorieten: p.favorieten.length,
      aantalLabels: p.labels.length
    });
    return;
  }

  // --- de wachter: automatisch nieuwe muziek omzetten en naar updates kijken ---
  if (pad === '/api/wachter' && methode === 'GET') {
    json(res, 200, wachterBeeld());
    return;
  }
  if (pad === '/api/wachter' && methode === 'POST') {
    const body = await leesJsonBody(req);
    if (body.aan !== undefined) {
      WACHTER.aan = !!body.aan;
      zetInstelling('wacht_map_aan', WACHTER.aan ? '1' : '0');
    }
    if (body.minuten !== undefined) {
      WACHTER.minuten = Math.max(5, Math.min(24 * 60, parseInt(body.minuten, 10) || WACHTER.minuten));
      zetInstelling('wacht_map_minuten', String(WACHTER.minuten));
    }
    if (body.mappen !== undefined && Array.isArray(body.mappen)) {
      zetMappen(body.mappen);
    }
    if (body.map !== undefined) {
      // De eerste map blijft de hoofdmap; de rest van de lijst blijft staan.
      const eerste = String(body.map || '').trim();
      const rest = leesMappen().slice(1);
      zetMappen(eerste ? [eerste].concat(rest) : rest);
    }
    if (body.perRonde !== undefined) {
      WACHTER.perRonde = Math.max(1, Math.min(50, parseInt(body.perRonde, 10) || WACHTER.perRonde));
      zetInstelling('wacht_map_per_ronde', String(WACHTER.perRonde));
    }
    json(res, 200, { ok: true, wachter: wachterBeeld() });
    return;
  }
  if (pad === '/api/wachter/nu' && methode === 'POST') {
    await wachterRonde(true);
    json(res, 200, { ok: true, wachter: wachterBeeld() });
    return;
  }

  // --- back-up ---
  if (pad === '/api/backup' && methode === 'GET') {
    json(res, 200, backupBeeld());
    return;
  }
  if (pad === '/api/backup' && methode === 'POST') {
    const body = await leesJsonBody(req);
    if (body.aan !== undefined) {
      BACKUP.aan = !!body.aan;
      zetInstelling('backup_aan', BACKUP.aan ? '1' : '0');
    }
    if (body.map !== undefined) {
      const mapPad = String(body.map || '').trim();
      if (mapPad && !path.isAbsolute(mapPad)) {
        json(res, 400, { fout: 'Gebruik een volledig pad voor de back-upmap, bijvoorbeeld /mnt/Nas/Nas-Opslag/akkoordkast-backup.' });
        return;
      }
      BACKUP.map = mapPad ? path.resolve(mapPad) : '';
      zetInstelling('backup_map', BACKUP.map);
    }
    if (body.bewaren !== undefined) {
      BACKUP.bewaren = Math.max(1, Math.min(100, parseInt(body.bewaren, 10) || BACKUP.bewaren));
      zetInstelling('backup_bewaren', String(BACKUP.bewaren));
    }
    json(res, 200, { ok: true, backup: backupBeeld() });
    return;
  }
  if (pad === '/api/backup/nu' && methode === 'POST') {
    const uit = maakBackup();
    if (!uit.ok) { json(res, 400, { fout: uit.fout, backup: backupBeeld() }); return; }
    json(res, 201, { ok: true, uitkomst: uit, backup: backupBeeld() });
    return;
  }

  // --- oefenen per week ---
  if (pad === '/api/oefenen/weken' && methode === 'GET') {
    const profielId = profielVan(req, query);
    const aantal = Math.max(1, Math.min(52, parseInt(query.get('weken'), 10) || 8));
    const rijen = db.prepare('SELECT moment, seconden, wissels, akkoorden FROM oefensessies WHERE profiel_id = ?').all(profielId);
    json(res, 200, { weken: week.groepeerPerWeek(rijen, aantal), aantal });
    return;
  }

  // --- versie en bijwerken ---
  if (pad === '/api/versie' && methode === 'GET') {
    json(res, 200, {
      versie: VERSIE,
      commit: korteCommit(),
      gestart: GESTART,
      liedjes: bron.alle().length,
      updateMogelijk: updateMogelijk(),
      updateScript: updateMogelijk() ? UPDATE_SCRIPT : '',
      updateCommando: updateCommando(),
      muziekmap: STANDAARD_MUZIEKMAP
    });
    return;
  }
  if (pad === '/api/versie/controle' && methode === 'GET') {
    const laatste = await laatsteVersieOpGitHub();
    const hier = korteCommit();
    const nieuwer = !!(laatste.sha && hier && laatste.sha !== hier && !hier.startsWith(laatste.sha));
    json(res, 200, {
      hier: hier,
      laatste: laatste,
      nieuwer: nieuwer,
      updateMogelijk: updateMogelijk(),
      updateCommando: updateCommando()
    });
    return;
  }
  if (pad === '/api/update' && methode === 'POST') {
    if (!updateMogelijk()) {
      json(res, 400, {
        fout: 'Bijwerken vanuit de app staat niet aan op deze machine. Draai de opdracht hieronder op je Proxmox-host.',
        commando: updateCommando()
      });
      return;
    }
    const r = spawnSync('bash', [UPDATE_SCRIPT], { cwd: __dirname, encoding: 'utf8', timeout: 180000 });
    const uitvoer = ((r.stdout || '') + (r.stderr || '')).slice(-4000);
    if (r.status === 0) {
      json(res, 200, { ok: true, uitvoer: uitvoer, commando: UPDATE_SCRIPT });
    } else {
      json(res, 500, {
        fout: 'Het bijwerken stopte met code ' + r.status + '. De oude versie blijft draaien.',
        uitvoer: uitvoer,
        commando: UPDATE_SCRIPT
      });
    }
    return;
  }

  // --- liedjesboek: de hele selectie met bladmuziek, om in één keer te printen ---
  if (pad === '/api/boek' && methode === 'GET') {
    const profielId = profielVan(req, query);
    const max = Math.max(1, Math.min(120, parseInt(query.get('max'), 10) || 40));
    const uit = zoekLiedjes(query, profielId);
    const liedjes = uit.slice(0, max).map(lied => {
      const weer = weergave(lied, { transpose: query.get('transpose'), capoStand: query.get('capo') });
      return {
        id: weer.id,
        titel: weer.titel,
        artiest: weer.artiest,
        toonsoort: weer.toonsoort,
        tempo: weer.tempo,
        capo: weer.capo,
        strum: weer.strum,
        maatsoort: weer.maatsoort,
        transpositie: weer.transpositie,
        model: weer.model,
        akkoorden: weer.akkoorden,
        eigen: weer.eigen,
        bron: weer.bron,
        licentie: weer.licentie
      };
    });
    json(res, 200, {
      totaal: uit.length,
      aantal: liedjes.length,
      afgekapt: uit.length > liedjes.length,
      liedjes
    });
    return;
  }

  // --- artiesten (voor het filter) ---
  if (pad === '/api/artiesten' && methode === 'GET') {
    json(res, 200, { artiesten: bron.artiesten() });
    return;
  }

  // --- liedjes ---
  // --- setlists en optreden ---
  if (pad === '/api/setlists' && methode === 'GET') {
    json(res, 200, { profiel: profielVan(req, query), setlists: setlistsVan(profielVan(req, query)) });
    return;
  }
  if (pad === '/api/setlists' && methode === 'POST') {
    const profielId = profielVan(req, query);
    const body = await leesJsonBody(req);
    const naam = String(body.naam || '').trim().slice(0, 60) || 'Nieuwe setlist';
    const info = db.prepare('INSERT INTO setlists (profiel_id, naam, gemaakt) VALUES (?, ?, ?)')
      .run(profielId, naam, new Date().toISOString());
    const id = Number(info.lastInsertRowid);
    json(res, 201, { ok: true, setlist: setlistBeeld(setlistVan(profielId, id)), setlists: setlistsVan(profielId) });
    return;
  }
  const setlistMatch = pad.match(/^\/api\/setlists\/(\d+)$/);
  if (setlistMatch && methode === 'GET') {
    const profielId = profielVan(req, query);
    const setlist = setlistVan(profielId, setlistMatch[1]);
    if (!setlist) { json(res, 404, { fout: 'Setlist niet gevonden' }); return; }
    json(res, 200, setlistBeeld(setlist));
    return;
  }
  if (setlistMatch && (methode === 'PUT' || methode === 'PATCH')) {
    const profielId = profielVan(req, query);
    const setlist = setlistVan(profielId, setlistMatch[1]);
    if (!setlist) { json(res, 404, { fout: 'Setlist niet gevonden' }); return; }
    const body = await leesJsonBody(req);
    const naam = String(body.naam || '').trim().slice(0, 60);
    if (naam) db.prepare('UPDATE setlists SET naam = ? WHERE id = ?').run(naam, setlist.id);
    json(res, 200, { ok: true, setlist: setlistBeeld(setlistVan(profielId, setlist.id)), setlists: setlistsVan(profielId) });
    return;
  }
  if (setlistMatch && methode === 'DELETE') {
    const profielId = profielVan(req, query);
    const setlist = setlistVan(profielId, setlistMatch[1]);
    if (!setlist) { json(res, 404, { fout: 'Setlist niet gevonden' }); return; }
    db.prepare('DELETE FROM setlist_liedjes WHERE setlist_id = ?').run(setlist.id);
    db.prepare('DELETE FROM setlists WHERE id = ?').run(setlist.id);
    json(res, 200, { ok: true, setlists: setlistsVan(profielId) });
    return;
  }
  const overgangMatch = pad.match(/^\/api\/setlists\/(\d+)\/overgangen$/);
  if (overgangMatch && methode === 'GET') {
    const profielId = profielVan(req, query);
    const setlist = setlistVan(profielId, overgangMatch[1]);
    if (!setlist) { json(res, 404, { fout: 'Setlist niet gevonden' }); return; }
    const beeld = setlistBeeld(setlist);
    json(res, 200, {
      setlist: beeld.naam,
      aantal: beeld.liedjes.length,
      overgangen: overgangen.overgangenVan(beeld.liedjes)
    });
    return;
  }
  const setlistLiedMatch = pad.match(/^\/api\/setlists\/(\d+)\/liedjes$/);
  if (setlistLiedMatch && methode === 'POST') {
    const profielId = profielVan(req, query);
    const setlist = setlistVan(profielId, setlistLiedMatch[1]);
    if (!setlist) { json(res, 404, { fout: 'Setlist niet gevonden' }); return; }
    const body = await leesJsonBody(req);
    const liedjeId = Number(body.liedje);
    const actie = String(body.actie || 'bij').trim().toLowerCase();
    if (!Number.isFinite(liedjeId) || !vindLiedje(liedjeId)) { json(res, 404, { fout: 'Liedje niet gevonden' }); return; }
    let ids = setlist.liedjes.slice();
    if (actie === 'bij') {
      if (ids.indexOf(liedjeId) === -1) ids.push(liedjeId);
    } else if (actie === 'af') {
      ids = ids.filter(x => x !== liedjeId);
    } else if (actie === 'leeg') {
      ids = [];
    } else if (actie === 'omhoog' || actie === 'omlaag') {
      const nu = ids.indexOf(liedjeId);
      const naar = actie === 'omhoog' ? nu - 1 : nu + 1;
      if (nu === -1) { json(res, 400, { fout: 'Dat liedje staat niet in deze setlist.' }); return; }
      if (naar >= 0 && naar < ids.length) {
        ids[nu] = ids[naar];
        ids[naar] = liedjeId;
      }
    } else if (actie === 'boven') {
      ids = [liedjeId].concat(ids.filter(x => x !== liedjeId));
    } else {
      json(res, 400, { fout: 'Onbekende actie: ' + actie });
      return;
    }
    bewaarVolgorde(setlist.id, ids);
    json(res, 200, {
      ok: true,
      actie,
      setlist: setlistBeeld(setlistVan(profielId, setlist.id)),
      setlists: setlistsVan(profielId)
    });
    return;
  }

  if (pad === '/api/liedjes' && methode === 'GET') {
    const compact = query.get('compact') === '1';
    const profielId = profielVan(req, query);
    const persoon = persoonlijk(profielId);
    let uit = zoekLiedjes(query, profielId);
    const totaal = uit.length;
    const vanaf = Math.max(0, parseInt(query.get('vanaf'), 10) || 0);
    const aantal = Math.max(1, Math.min(200, parseInt(query.get('aantal'), 10) || (compact ? 48 : 200)));
    const pagina = uit.slice(vanaf, vanaf + aantal);
    const metMuziek = liedjesMetMuziek();
    const metVideo = liedjesMetVideo();
    json(res, 200, {
      totaal,
      vanaf,
      aantal: pagina.length,
      meer: vanaf + pagina.length < totaal,
      statistieken: bron.statistieken(),
      profiel: profielId,
      liedjes: pagina.map(l => Object.assign(lijstItem(metPersoonlijk(l, persoon)),
        { heeftMuziek: metMuziek.has(l.id), heeftVideo: metVideo.has(l.id) }))
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
    const profielId = profielVan(req, query);
    const persoon = persoonlijk(profielId);
    const antwoord = weergave(lied, {
      transpose: query.get('transpose'), capoStand: query.get('capo'), beheer: isBeheerder(req)
    });
    const nummer = Number(m[1]);
    antwoord.favoriet = persoon.favorieten.includes(nummer);
    antwoord.labels = (persoon.perLiedje[nummer] || []).map(id => {
      const label = persoon.labels.find(l => l.id === id);
      return label ? { id: label.id, naam: label.naam } : null;
    }).filter(Boolean);
    antwoord.gespeeld = (persoon.gespeeld[nummer] || {}).moment || '';
    antwoord.gespeeldAantal = (persoon.gespeeld[nummer] || {}).aantal || 0;
    json(res, 200, antwoord);
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

  // --- een link omzetten naar een mp3 in je eigen map ---
  if (pad === '/api/download' && methode === 'GET') {
    const lied = vindLiedje(query.get('liedje'));
    if (!lied) { json(res, 404, { fout: 'Liedje niet gevonden' }); return; }
    json(res, 200, Object.assign({ liedje: { id: lied.id, titel: lied.titel } }, ophaalBeeld(lied.id)));
    return;
  }
  if (pad === '/api/download' && methode === 'POST') {
    const body = await leesJsonBody(req);
    const lied = vindLiedje(body.liedje);
    if (!lied) { json(res, 404, { fout: 'Liedje niet gevonden' }); return; }
    if (body.stop) {
      // Alleen de stand wissen; een lopende download laten we met rust.
      if (ophaalLiedje === lied.id) { ophaalLiedje = 0; }
      json(res, 200, Object.assign({ ok: true }, ophaalBeeld(lied.id)));
      return;
    }
    const gestart = OPHAAL.start(body.url);
    if (!gestart.ok) { json(res, 400, { fout: gestart.fout }); return; }
    ophaalLiedje = lied.id;
    // De link zelf ook bewaren, zodat je hem later terugziet naast het bestand.
    const id = youtube.videoId(body.url);
    if (id) zetLiedjeVideo(lied.id, id);
    bewaakOphaal(lied.id);
    json(res, 200, Object.assign({ ok: true }, ophaalBeeld(lied.id)));
    return;
  }

  // --- een YouTube-video aan een liedje koppelen ---
  if (pad === '/api/youtube' && methode === 'GET') {
    const lied = vindLiedje(query.get('liedje'));
    if (!lied) { json(res, 404, { fout: 'Liedje niet gevonden' }); return; }
    json(res, 200, Object.assign({ liedje: { id: lied.id, titel: lied.titel } }, videoBeeld(lied)));
    return;
  }
  if (pad === '/api/youtube' && methode === 'POST') {
    const body = await leesJsonBody(req);
    const lied = vindLiedje(body.liedje);
    if (!lied) { json(res, 404, { fout: 'Liedje niet gevonden' }); return; }
    if (body.weg) {
      wisLiedjeVideo(lied.id);
      json(res, 200, { ok: true, video: '', insluit: '', kijk: '' });
      return;
    }
    const id = youtube.videoId(body.url);
    if (!id) {
      json(res, 400, { fout: 'Dat is geen YouTube-link. Plak bijvoorbeeld https://www.youtube.com/watch?v=... of https://youtu.be/...' });
      return;
    }
    zetLiedjeVideo(lied.id, id);
    json(res, 200, Object.assign({ ok: true, video: id }, videoBeeld(lied)));
    return;
  }

  // --- de muziek van een liedje: een bestand uit je eigen muziekmap ---
  if (pad === '/api/muziek' && methode === 'GET') {
    const lied = vindLiedje(query.get('liedje'));
    if (!lied) { json(res, 404, { fout: 'Liedje niet gevonden' }); return; }
    const beeld = muziekBeeld(lied);
    json(res, 200, {
      liedje: { id: lied.id, titel: lied.titel, artiest: lied.artiest },
      pad: beeld.pad,
      titel: beeld.titel,
      bestaat: beeld.bestaat,
      url: beeld.url,
      mappen: beeld.mappen
    });
    return;
  }
  if (pad === '/api/muziek' && methode === 'POST') {
    const body = await leesJsonBody(req);
    const lied = vindLiedje(body.liedje);
    if (!lied) { json(res, 404, { fout: 'Liedje niet gevonden' }); return; }
    const mappen = leesMappen();

    if (body.weg) {
      wisLiedjeMuziek(lied.id);
      json(res, 200, { ok: true, pad: '', url: '' });
      return;
    }

    if (body.kies) {
      // Alleen bestanden binnen de muziekmappen van de gebruiker, en alleen audio.
      const pad = muziekbestand.veilig(body.kies, mappen);
      if (!pad) { json(res, 400, { fout: 'Dat bestand ligt niet in een van je muziekmappen.' }); return; }
      let stat = null;
      try { stat = fs.statSync(pad); } catch (e) { stat = null; }
      if (!stat || !stat.isFile()) { json(res, 400, { fout: 'Dat bestand bestaat niet (meer).' }); return; }
      if (!muziekbestand.isAudio(pad)) { json(res, 400, { fout: 'Dat is geen audiobestand.' }); return; }
      const titel = muziekbestand.titelVan(pad);
      zetLiedjeMuziek(lied.id, pad, titel);
      json(res, 200, { ok: true, pad, titel, url: `/api/muziek/bestand?liedje=${lied.id}` });
      return;
    }

    // Anders: zoeken in de mappen naar muziek die bij dit liedje past.
    const uit = muziekbestand.zoek(mappen, lied, { max: 20 });
    json(res, 200, {
      liedje: { id: lied.id, titel: lied.titel, artiest: lied.artiest },
      mappen,
      bekeken: uit.bekeken,
      kandidaten: uit.kandidaten
    });
    return;
  }
  if (pad === '/api/muziek/bestand' && methode === 'GET') {
    const lied = vindLiedje(query.get('liedje'));
    if (!lied) { json(res, 404, { fout: 'Liedje niet gevonden' }); return; }
    const m = muziekVanLiedje(lied.id);
    if (!m) { json(res, 404, { fout: 'Aan dit liedje hangt nog geen muziekbestand.' }); return; }
    // Bij elk verzoek opnieuw controleren of het pad nog binnen een muziekmap valt: de
    // mappen kunnen intussen veranderd zijn, en dit is de plek waar een bestand de deur uit gaat.
    const pad = muziekbestand.veilig(m.pad, leesMappen());
    if (!pad || !fs.existsSync(pad)) {
      json(res, 404, { fout: 'Het muziekbestand staat er niet meer. Staat de koppeling naar de NAS er wel?' });
      return;
    }
    stuurBestand(req, res, pad, muziekbestand.mimeVan(pad));
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
      audio: metOpname ? eigenAudioUrl(lied) : `/api/meespelen/audio?${meespeelQuery(query)}`,
      bron: metOpname
        ? ((lied.audio_bestand && lied.akkoordenPerMaat && lied.akkoordenPerMaat.length) ? 'opname' : 'muziek')
        : 'synth'
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
    const gevraagd = SLEUTELS.filter(sleutel => Object.prototype.hasOwnProperty.call(body, sleutel));
    const gevoelig = gevraagd.filter(sleutel => GEVOELIGE_INSTELLINGEN.indexOf(sleutel) >= 0);
    if (gevoelig.length && !isBeheerder(req)) {
      json(res, 403, { fout: 'Alleen de beheerder kan de Spotify-sleutels instellen.' });
      return;
    }
    for (const sleutel of gevraagd) zetInstelling(sleutel, body[sleutel]);
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
  // --- muziekmappen: welke mappen kijkt de app na? ---
  if (pad === '/api/mappen' && methode === 'GET') {
    json(res, 200, mappenBeeld());
    return;
  }
  if (pad === '/api/mappen' && methode === 'POST') {
    const body = await leesJsonBody(req);
    const ingevoerd = String(body.pad || '').trim();
    if (!ingevoerd) {
      json(res, 400, { fout: 'Geef een map op, bijvoorbeeld /mnt/Nas/Nas-Opslag/Muziek.' });
      return;
    }
    if (!path.isAbsolute(ingevoerd)) {
      json(res, 400, { fout: 'Gebruik een volledig pad, vanaf de hoofdmap (/). Bijvoorbeeld /mnt/Nas/Nas-Opslag/Muziek.' });
      return;
    }
    const p = path.resolve(ingevoerd);
    const beeld = mapBeeld(p);
    if (!beeld.bestaat || !beeld.isMap) {
      json(res, 400, { fout: (beeld.fout || 'Deze map kan ik niet gebruiken.') + ' Pad: ' + p });
      return;
    }
    const lijst = leesMappen();
    if (!lijst.includes(p)) lijst.push(p);
    zetMappen(lijst);
    json(res, 201, mappenBeeld());
    return;
  }
  if (pad === '/api/mappen/weg' && methode === 'POST') {
    const body = await leesJsonBody(req);
    const ingevoerd = String(body.pad || '').trim();
    if (!ingevoerd) {
      json(res, 400, { fout: 'Geef de map op die weg moet.' });
      return;
    }
    const p = path.resolve(ingevoerd);
    zetMappen(leesMappen().filter(m => m !== p));
    json(res, 200, mappenBeeld());
    return;
  }

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
    const limiet = Math.max(1, Math.min(MAX_PER_RONDE, parseInt(body.limiet, 10) || 8));

    // Eén map meegegeven? Dan doen we precies die map, zoals altijd.
    if (String(body.map || '').trim()) {
      const uit = scanRonde(body.map, limiet);
      if (uit.fout) { json(res, 400, { fout: uit.fout }); return; }
      // De map onthouden, zodat de wachter hem ook weet.
      if (uit.map) {
        const p = path.resolve(uit.map);
        const lijst = leesMappen();
        if (!lijst.includes(p)) { lijst.push(p); zetMappen(lijst); }
      }
      json(res, uit.gedaan || uit.mislukt ? 201 : 200, uit);
      return;
    }

    // Geen map meegegeven? Dan alle mappen die in de app staan, één ronde.
    const mappen = leesMappen();
    if (!mappen.length) {
      json(res, 400, { fout: 'Er staat nog geen muziekmap in de app. Voeg er eerst een toe.' });
      return;
    }
    let gedaan = 0, mislukt = 0, rest = 0, totaal = 0;
    const liedjes = [], fouten = [], perMap = [];
    for (const map of mappen) {
      const uit = scanRonde(map, limiet);
      if (uit.fout) {
        perMap.push({ map, fout: uit.fout });
        fouten.push({ bestand: map, pad: map, fout: uit.fout });
        continue;
      }
      gedaan += uit.gedaan || 0;
      mislukt += uit.mislukt || 0;
      rest += uit.rest || 0;
      totaal += uit.totaal || 0;
      for (const l of (uit.liedjes || [])) liedjes.push(l);
      for (const f of (uit.fouten || [])) fouten.push(f);
      perMap.push({ map, gedaan: uit.gedaan, mislukt: uit.mislukt, rest: uit.rest, totaal: uit.totaal });
    }
    json(res, gedaan || mislukt ? 201 : 200, {
      mappen: perMap,
      gedaan,
      mislukt,
      rest,
      totaal,
      klaar: rest === 0,
      liedjes,
      fouten,
      wanneer: new Date().toISOString()
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
    // Naast public/ is er één map die de browser ook mag lezen: lib/. Daar staat de
    // rekenkunde die zowel de server als de app gebruikt (bijvoorbeeld de metronoom).
    if (/^lib\/[a-z0-9-]+\.js$/.test(rest)) {
      stuurBestand(req, res, path.join(__dirname, rest), MIME['.js'], { 'cache-control': 'public, max-age=300' });
      return;
    }
    // De handleiding hoort bij een map met een eigen pagina: /handleiding/ opent hem.
    if (rest === 'handleiding' || rest === 'handleiding/') {
      stuurBestand(req, res, path.join(__dirname, 'public', 'handleiding', 'index.html'),
        MIME['.html'], { 'cache-control': 'no-cache' });
      return;
    }
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
    startWachter();
  });
}

module.exports = {
  server, db, verstuur: verwerk,
  wachterBeeld, wachterRonde, startWachter, scanRonde,
  weergave, lijstItem, zoekLiedjes, normaliseerLiedje, vindLiedje, eigenRij,
  maakPreview, previewVoorLiedje, castHelper, leesInstelling, zetInstelling,
  paden: { DATA_DIR, MEDIA_DIR, DB_PATH, CAST_HELPER, EIGEN_START, PORT }
};
