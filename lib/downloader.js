'use strict';
// Een link omzetten naar een mp3 die in je eigen muziekmap komt te staan.
//
// Het zware werk doet yt-dlp (dat is het gereedschap dat filmpjes en muziek van heel veel
// websites kan ophalen); ffmpeg zet het geluid om naar mp3. De app start dat programma en
// houdt je op de hoogte van de voortgang.
//
// Twee dingen zijn hier bewust streng:
//   * alleen http- en https-links, en nooit een adres binnen je eigen netwerk — anders zou je
//     via de app bestanden van je eigen router of NAS kunnen ophalen;
//   * er loopt er één tegelijk, want omzetten naar mp3 kost de hele processor.
//
// Wat je downloadt blijft jouw verantwoordelijkheid: gebruik het voor materiaal dat je mag
// downloaden en bewaar het in je eigen map. De app stuurt niets naar buiten.
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const youtube = require('./youtube');

const STANDAARD_TIMEOUT_MS = 20 * 60 * 1000;
const MAX_LENGTE_LINK = 500;

// Adressen binnen het eigen netwerk, plus loopback en link-local.
const PRIVE = [
  /^localhost$/i,
  /^127\./,
  /^0\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^\[?::1\]?$/,
  /^\[?f[cd][0-9a-f]{2}:/i,
  /\.local$/i,
  /\.internal$/i,
];

function linkOk(link) {
  const tekst = String(link || '').trim();
  if (!tekst) return { ok: false, fout: 'Plak eerst een link.' };
  if (tekst.length > MAX_LENGTE_LINK) return { ok: false, fout: 'Die link is te lang.' };
  let adres;
  try {
    adres = new URL(tekst);
  } catch (e) {
    return { ok: false, fout: 'Dat is geen bruikbare link. Plak bijvoorbeeld https://www.youtube.com/watch?v=...' };
  }
  if (adres.protocol !== 'http:' && adres.protocol !== 'https:') {
    return { ok: false, fout: 'Alleen http- en https-links kunnen worden opgehaald.' };
  }
  if (PRIVE.some(p => p.test(adres.hostname))) {
    return { ok: false, fout: 'Deze link wijst naar je eigen netwerk. Die weigert de app, zodat je niet per ongeluk bestanden van je router of NAS ophaalt.' };
  }
  return { ok: true, url: adres.toString(), youtube: !!youtube.videoId(tekst) };
}

// Uit de uitvoer van yt-dlp het percentage halen, zodat de app kan laten zien hoe ver hij is.
function percentageUit(regel) {
  const treffer = String(regel).match(/\[download\]\s+([\d.]+)%/);
  if (!treffer) return null;
  const waarde = Number(treffer[1]);
  return Number.isFinite(waarde) ? Math.max(0, Math.min(100, waarde)) : null;
}

// Waar yt-dlp het bestand neerzet: "[ExtractAudio] Destination: /pad/liedje.mp3"
function bestandUit(regel) {
  const treffer = String(regel).match(/(?:Destination|has already been downloaded):\s*(.+?)\s*$/);
  if (!treffer) return '';
  const pad = treffer[1].replace(/^"|"$/g, '').trim();
  return /\.(mp3|m4a|opus|ogg|wav|flac|aac)$/i.test(pad) ? pad : '';
}

// Bij een afspeellijst of kanaal zegt yt-dlp bij welk nummer hij is: "Downloading item 3 of 12".
function itemUit(regel) {
  const treffer = String(regel).match(/Downloading item (\d+) of (\d+)/);
  if (!treffer) return null;
  return { item: Number(treffer[1]), totaal: Number(treffer[2]) };
}

// En de video-id die bij het nummer hoort: "[youtube] dQw4w9WgXcQ: Downloading webpage". Die
// bewaren we, zodat het liedje later ook de link terug heeft.
function videoUit(regel) {
  // Let op: "Destination" is ook elf letters, dus we eisen het woord Downloading erachter — anders
  // zou een bestandsregel als video-id gelezen worden.
  const treffer = String(regel).match(/^\[[^\]]+\]\s+([A-Za-z0-9_-]{11}):\s+Downloading /);
  return treffer ? treffer[1] : '';
}

function nieuwsteAudio(map) {
  let beste = '';
  let tijd = 0;
  let lijst = [];
  try {
    lijst = fs.readdirSync(map);
  } catch (e) {
    return '';
  }
  for (const naam of lijst) {
    if (!/\.(mp3|m4a|opus|ogg|wav|flac|aac)$/i.test(naam)) continue;
    const vol = path.join(map, naam);
    try {
      const st = fs.statSync(vol);
      if (st.isFile() && st.mtimeMs > tijd) {
        tijd = st.mtimeMs;
        beste = vol;
      }
    } catch (e) { /* overslaan */ }
  }
  return beste;
}

// Eén downloader per map. De server maakt er één aan bij het starten.
function maakDownloader(opties = {}) {
  const map = path.resolve(opties.map || '/tmp');
  const ytdlp = opties.ytdlp || 'yt-dlp';
  const timeout = opties.timeout || STANDAARD_TIMEOUT_MS;
  const stand = {
    status: 'leeg', procent: 0, bestand: '', fout: '', log: [], url: '', wanneer: '',
    reeks: false, item: 0, totaal: 0, video: '', bestanden: []
  };

  function log(regel) {
    const schoon = String(regel).replace(/\s+$/, '');
    if (!schoon) return;
    stand.log.push(schoon);
    if (stand.log.length > 40) stand.log.shift();
  }

  function start(link, opties = {}) {
    if (stand.status === 'bezig') {
      return { ok: false, fout: 'Er loopt al een download. Wacht tot die klaar is.' };
    }
    const gecontroleerd = linkOk(link);
    if (!gecontroleerd.ok) return { ok: false, fout: gecontroleerd.fout };

    // Een reeks: een hele afspeellijst of een kanaal van een artiest. Dan halen we de nummers één
    // voor één op (met een bovengrens, want een kanaal kan honderden filmpjes hebben) en wordt elk
    // nummer een eigen liedje.
    const reeks = !!opties.reeks;
    const max = Math.max(1, Math.min(200, parseInt(opties.max, 10) || 25));

    fs.mkdirSync(map, { recursive: true });
    Object.assign(stand, {
      status: 'bezig', procent: 0, bestand: '', fout: '', log: [], url: gecontroleerd.url,
      wanneer: new Date().toISOString(),
      reeks, item: 0, totaal: 0, video: '', bestanden: [],
    });
    log((reeks ? 'Bezig met de reeks: ' : 'Bezig met ophalen: ') + gecontroleerd.url);

    let klaar = false;
    const argumenten = [
      '-x', '--audio-format', 'mp3', '--audio-quality', '0',
      '--newline', '--no-warnings', '--embed-metadata',
    ];
    if (reeks) {
      // Door de nummering vooraan blijft de volgorde van de afspeellijst staan.
      argumenten.push('--playlist-end', String(max), '--ignore-errors',
        '-o', path.join(map, '%(playlist_index)02d - %(title)s.%(ext)s'));
    } else {
      argumenten.push('--no-playlist', '-o', path.join(map, '%(title)s.%(ext)s'));
    }
    argumenten.push('--', gecontroleerd.url);
    const kind = spawn(ytdlp, argumenten, { stdio: ['ignore', 'pipe', 'pipe'] });

    const klaarzetten = (status, velden) => {
      if (klaar) return;
      klaar = true;
      Object.assign(stand, { status }, velden || {});
      if (status === 'klaar') stand.procent = 100;
    };

    const limiet = reeks ? Math.max(timeout, 45 * 60 * 1000) : timeout;
    const stop = setTimeout(() => {
      log('Het duurt te lang; ik stop met ophalen.');
      try { kind.kill('SIGKILL'); } catch (e) { /* al weg */ }
      klaarzetten('fout', { fout: 'Het ophalen duurde te lang en is gestopt.' });
    }, limiet);

    const lees = (stroom) => {
      let rest = '';
      stroom.on('data', (brok) => {
        rest += brok.toString();
        const regels = rest.split('\n');
        rest = regels.pop();
        for (const regel of regels) {
          log(regel);
          const procent = percentageUit(regel);
          if (procent !== null) stand.procent = procent;
          const nummer = itemUit(regel);
          if (nummer) { stand.item = nummer.item; stand.totaal = nummer.totaal; }
          const video = videoUit(regel);
          if (video) stand.video = video;
          const bestand = bestandUit(regel);
          if (bestand) {
            stand.bestand = bestand;
            // Elk afgerond bestand onthouden we, zodat de app er een liedje van kan maken. Bij een
            // reeks zijn dat er meerdere.
            if (!stand.bestanden.some(b => b.bestand === bestand)) {
              stand.bestanden.push({ bestand, video: stand.video || '' });
            }
          }
        }
      });
    };
    lees(kind.stdout);
    lees(kind.stderr);

    kind.on('error', (fout) => {
      clearTimeout(stop);
      log('yt-dlp kon niet worden gestart: ' + fout.message);
      klaarzetten('fout', { fout: 'Het ophaalprogramma (yt-dlp) is niet gevonden op deze machine.' });
    });

    kind.on('close', (code) => {
      clearTimeout(stop);
      if (stand.status === 'fout') return; // de tijdslimiet was al afgegaan
      if (code !== 0) {
        const laatste = stand.log.filter(r => /ERROR|error/i.test(r)).slice(-1)[0] || '';
        klaarzetten('fout', { fout: 'Het ophalen is niet gelukt' + (laatste ? ': ' + laatste.replace(/^ERROR:\s*/i, '') : '.') });
        return;
      }
      let bestand = stand.bestand;
      if (!bestand || !fs.existsSync(bestand)) bestand = nieuwsteAudio(map);
      if (!bestand) {
        klaarzetten('fout', { fout: 'Er is niets opgeslagen. Misschien is het geen muziekfilmpje, of blokkeert de website het ophalen.' });
        return;
      }
      log('Klaar: ' + path.basename(bestand));
      klaarzetten('klaar', { bestand });
    });

    return { ok: true, url: gecontroleerd.url, youtube: gecontroleerd.youtube };
  }

  function standVan() {
    return {
      status: stand.status,
      procent: Math.round(stand.procent),
      bestand: stand.bestand,
      fout: stand.fout,
      url: stand.url,
      log: stand.log.slice(-8),
      reeks: stand.reeks,
      item: stand.item,
      totaal: stand.totaal,
      bestanden: stand.bestanden.slice(),
    };
  }

  return { start, standVan, map, ytdlp };
}

module.exports = { maakDownloader, linkOk, percentageUit, bestandUit, itemUit, videoUit, nieuwsteAudio, PRIVE };
