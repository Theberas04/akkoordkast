'use strict';
// Spotify koppelen aan AkkoordKast.
//
// Twee niveaus, zodat het altijd werkt:
//  1. Een link van een nummer herkennen en de Spotify-speler in de pagina zetten.
//     Daarvoor is niets nodig: geen account, geen sleutel. De speler vertelt zijn
//     positie terug via de iFrame-API, en daar laat de app de noten op meelopen.
//  2. Zoeken in Spotify en apparaten opvragen, als de gebruiker zelf een Client ID
//     en Secret invult (die blijven in de database van deze server staan).
const SOORTEN = ['track', 'album', 'playlist', 'artist', 'episode', 'show'];

// Een Spotify-link, -URI of losse id omzetten naar soort en id.
function leesLink(tekst) {
  const s = String(tekst || '').trim();
  if (!s) return null;
  let m = s.match(/spotify:(track|album|playlist|artist|episode|show):([A-Za-z0-9]{10,40})/);
  if (m) return { soort: m[1], id: m[2] };
  m = s.match(/open\.spotify\.com\/(?:[a-z-]+\/)?(track|album|playlist|artist|episode|show)\/([A-Za-z0-9]{10,40})/);
  if (m) return { soort: m[1], id: m[2] };
  m = s.match(/^([A-Za-z0-9]{22})$/);
  if (m) return { soort: 'track', id: m[1] };
  return null;
}

function uriVan(koppeling) {
  return `spotify:${koppeling.soort}:${koppeling.id}`;
}

function embedUrl(koppeling) {
  return `https://open.spotify.com/embed/${koppeling.soort}/${koppeling.id}?utm_source=generator`;
}

// Zoekt de kaart van een link op bij de Web API als we een token hebben; lukt dat
// niet, dan tonen we in elk geval de link zelf.
async function beschrijf(koppeling, token, haalOp) {
  const uit = {
    soort: koppeling.soort,
    id: koppeling.id,
    uri: uriVan(koppeling),
    embed: embedUrl(koppeling),
    titel: '',
    artiest: '',
    url: `https://open.spotify.com/${koppeling.soort}/${koppeling.id}`
  };
  if (!token || koppeling.soort !== 'track') return uit;
  try {
    const antwoord = await (haalOp || fetch)(`https://api.spotify.com/v1/tracks/${koppeling.id}`, {
      headers: { authorization: `Bearer ${token}` }
    });
    if (!antwoord.ok) return uit;
    const gegevens = await antwoord.json();
    uit.titel = gegevens.name || '';
    uit.artiest = (gegevens.artists || []).map(a => a.name).join(', ');
    uit.duurSeconden = Math.round((gegevens.duration_ms || 0) / 1000);
  } catch (e) { /* zonder titel verder */ }
  return uit;
}

// --------------------------------------------------------------- Web API ---

const TOKEN_URL = 'https://accounts.spotify.com/api/token';

async function tokenMetClientId(clientId, clientSecret, haalOp) {
  const post = haalOp || fetch;
  const lichaam = new URLSearchParams({ grant_type: 'client_credentials' });
  const antwoord = await post(TOKEN_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      authorization: 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
    },
    body: lichaam.toString()
  });
  if (!antwoord.ok) {
    throw new Error('Spotify gaf geen toegang met deze Client ID en Secret (status ' + antwoord.status + ').');
  }
  const gegevens = await antwoord.json();
  return {
    token: gegevens.access_token,
    verloopt: Date.now() + Math.max(60, Number(gegevens.expires_in) || 3600) * 1000
  };
}

async function zoek(term, opties) {
  const o = Object.assign({ token: '', markt: 'NL', aantal: 10, haalOp: fetch }, opties || {});
  if (!o.token) throw new Error('Spotify zoeken vraagt een eigen Client ID en Secret (zie het tabblad Casten).');
  const url = 'https://api.spotify.com/v1/search?' + new URLSearchParams({
    q: term, type: 'track', limit: String(o.aantal), market: o.markt
  }).toString();
  const antwoord = await o.haalOp(url, { headers: { authorization: `Bearer ${o.token}` } });
  if (!antwoord.ok) throw new Error('Spotify zoeken mislukte (status ' + antwoord.status + ').');
  const gegevens = await antwoord.json();
  return ((gegevens.tracks && gegevens.tracks.items) || []).map(t => ({
    id: t.id,
    titel: t.name,
    artiest: (t.artists || []).map(a => a.name).join(', '),
    album: (t.album && t.album.name) || '',
    duurSeconden: Math.round((t.duration_ms || 0) / 1000),
    uri: t.uri,
    url: t.external_urls ? t.external_urls.spotify : `https://open.spotify.com/track/${t.id}`,
    embed: embedUrl({ soort: 'track', id: t.id })
  }));
}

async function apparaten(token, haalOp) {
  if (!token) throw new Error('Spotify vraagt een eigen Client ID en Secret.');
  const post = haalOp || fetch;
  const antwoord = await post('https://api.spotify.com/v1/me/player/devices', {
    headers: { authorization: `Bearer ${token}` }
  });
  if (!antwoord.ok) {
    throw new Error('Spotify gaf geen apparatenlijst (status ' + antwoord.status + '). Een accountkoppeling met inlog is nodig voor afspelen op afstand.');
  }
  const gegevens = await antwoord.json();
  return (gegevens.devices || []).map(d => ({ id: d.id, naam: d.name, actief: !!d.is_active, soort: d.type }));
}

module.exports = { leesLink, uriVan, embedUrl, beschrijf, tokenMetClientId, zoek, apparaten, TOKEN_URL };
