'use strict';
// Tests voor de Spotify-koppeling: een link herkennen, de speler opbouwen en
// zonder sleutels netjes uitleggen wat er wel en niet kan.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const spotify = require('../lib/spotify');
const hulp = require('./hulp');

const VOORBEELD = '4cOdK2wGLETKBW3PvgPWqT';

test('een Spotify-link, -URI of losse id wordt herkend', () => {
  const verwacht = { soort: 'track', id: VOORBEELD };
  assert.deepEqual(spotify.leesLink('https://open.spotify.com/track/' + VOORBEELD + '?si=abc'), verwacht);
  assert.deepEqual(spotify.leesLink('https://open.spotify.com/intl-nl/track/' + VOORBEELD), verwacht);
  assert.deepEqual(spotify.leesLink('spotify:track:' + VOORBEELD), verwacht);
  assert.deepEqual(spotify.leesLink('  ' + VOORBEELD + '  '), verwacht);
  assert.deepEqual(spotify.leesLink('https://open.spotify.com/album/1DFixLWuPkv3KT3TnV35m3'), { soort: 'album', id: '1DFixLWuPkv3KT3TnV35m3' });
  assert.equal(spotify.leesLink('https://youtube.com/watch?v=abc'), null);
  assert.equal(spotify.leesLink(''), null);
  assert.equal(spotify.leesLink('mijn liedje'), null);
});

test('de speler-link en de uri worden netjes opgebouwd', () => {
  const koppeling = spotify.leesLink('https://open.spotify.com/track/' + VOORBEELD);
  assert.equal(spotify.uriVan(koppeling), 'spotify:track:' + VOORBEELD);
  assert.match(spotify.embedUrl(koppeling), /^https:\/\/open\.spotify\.com\/embed\/track\/4cOdK2wGLETKBW3PvgPWqT/);
});

test('de Web API wordt met de juiste vraag aangeroepen', async () => {
  const gezien = [];
  const antwoord = async (url, opties) => {
    gezien.push({ url, opties });
    if (url === spotify.TOKEN_URL) {
      return { ok: true, json: async () => ({ access_token: 'token-123', expires_in: 3600 }) };
    }
    return {
      ok: true,
      json: async () => ({
        tracks: {
          items: [{
            id: VOORBEELD, name: 'Amazing Grace', duration_ms: 185000, uri: 'spotify:track:' + VOORBEELD,
            artists: [{ name: 'The Choir' }], album: { name: 'Hymns' }, external_urls: { spotify: 'https://open.spotify.com/track/' + VOORBEELD }
          }]
        }
      })
    };
  };
  const token = await spotify.tokenMetClientId('id', 'secret', antwoord);
  assert.equal(token.token, 'token-123');
  assert.ok(gezien[0].opties.headers.authorization.startsWith('Basic '), 'de sleutels horen als Basic-auth mee te gaan');
  const uit = await spotify.zoek('amazing grace', { token: token.token, haalOp: antwoord });
  assert.equal(uit.length, 1);
  assert.equal(uit[0].titel, 'Amazing Grace');
  assert.equal(uit[0].duurSeconden, 185);
  assert.match(gezien[1].url, /api\.spotify\.com\/v1\/search/);
  assert.match(gezien[1].url, /q=amazing\+grace/);
});

test('zonder sleutels geeft zoeken een duidelijke uitleg', async () => {
  const omgeving = await hulp.start();
  const baas = await hulp.alsBeheerder(omgeving.basis);
  try {
    const status = await hulp.haal(omgeving.basis, '/api/spotify/status');
    assert.equal(status.status, 200);
    assert.equal(status.data.kanZoeken, false);
    assert.match(status.data.uitleg, /link/i);
    const zoek = await hulp.haal(omgeving.basis, '/api/spotify/zoek?q=amazing');
    assert.equal(zoek.status, 400);
    assert.match(zoek.data.fout, /Client ID/i);
  } finally {
    await omgeving.stop();
  }
});

test('een link koppelen aan een liedje werkt voor meegeleverde en eigen liedjes', async () => {
  const omgeving = await hulp.start();
  const baas = await hulp.alsBeheerder(omgeving.basis);
  try {
    for (const liedje of [1, 900000 + 1]) {
      const fout = await baas.post('/api/spotify/koppeling', { liedje, link: 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M' });
      if (liedje === 1) {
        assert.equal(fout.status, 201, JSON.stringify(fout.data));
      } else {
        assert.ok(fout.status === 404 || fout.status === 201, 'onverwachte status: ' + fout.status);
        continue;
      }
      assert.equal(fout.data.koppeling.soort, 'playlist');
      assert.match(fout.data.koppeling.embed, /embed\/playlist/);
    }
    const gelezen = await baas.haal('/api/spotify/koppeling?liedje=1');
    assert.equal(gelezen.data.koppeling.uri, 'spotify:playlist:37i9dQZF1DXcBWIGoYBM5M');
    const lied = await hulp.haal(omgeving.basis, '/api/liedjes/1');
    assert.ok(lied.data.spotify, 'de koppeling hoort bij het liedje mee te komen');
    assert.equal(lied.data.spotify.id, '37i9dQZF1DXcBWIGoYBM5M');
    const weg = await baas.haal('/api/spotify/koppeling?liedje=1', { method: 'DELETE' });
    assert.equal(weg.status, 200);
    const na = await baas.haal('/api/spotify/koppeling?liedje=1');
    assert.equal(na.data.koppeling, null);
  } finally {
    await omgeving.stop();
  }
});

test('een onzin-link wordt met uitleg geweigerd', async () => {
  const omgeving = await hulp.start();
  const baas = await hulp.alsBeheerder(omgeving.basis);
  try {
    const r = await baas.post('/api/spotify/koppeling', { liedje: 1, link: 'https://youtube.com/watch?v=abc' });
    assert.equal(r.status, 400);
    assert.match(r.data.fout, /Spotify-link/);
  } finally {
    await omgeving.stop();
  }
});

test('de pagina heeft de Spotify-onderdelen', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  for (const id of ['spotify-link', 'spotify-koppel', 'spotify-zoek', 'spotify-speler', 'spotify-client-id', 'spotify-instellingen']) {
    assert.ok(html.includes('id="' + id + '"'), 'id ontbreekt: ' + id);
  }
  assert.match(html, /open\.spotify\.com\/embed\/iframe-api/);
  assert.match(html, /playback_update/);
});
