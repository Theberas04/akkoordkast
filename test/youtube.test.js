'use strict';
// Een YouTube-link aan een liedje koppelen. Alleen het video-id telt: zo komt er nooit een
// andere pagina in het venster, en blijft de koppeling werken als YouTube zijn adressen
// verandert.
const test = require('node:test');
const assert = require('node:assert');
const yt = require('../lib/youtube');
const { start, haal, post } = require('./hulp');

const ID = 'dQw4w9WgXcQ';

test('alle vormen van een YouTube-link leveren hetzelfde id', () => {
  const vormen = [
    'https://www.youtube.com/watch?v=' + ID,
    'http://youtube.com/watch?v=' + ID,
    'https://m.youtube.com/watch?v=' + ID,
    'https://music.youtube.com/watch?v=' + ID,
    'https://www.youtube.com/watch?v=' + ID + '&list=PL123&index=2',
    'https://www.youtube.com/watch?list=PL123&v=' + ID,
    'https://youtu.be/' + ID,
    'https://youtu.be/' + ID + '?t=42',
    'https://www.youtube.com/embed/' + ID,
    'https://www.youtube.com/shorts/' + ID,
    'https://www.youtube.com/live/' + ID,
    ID,
    '  https://youtu.be/' + ID + '  ',
  ];
  for (const vorm of vormen) {
    assert.equal(yt.videoId(vorm), ID, 'deze vorm werd niet herkend: ' + vorm);
  }
});

test('wat geen YouTube-link is levert niets op', () => {
  const fout = [
    '', '   ', 'geen link',
    'https://example.com/watch?v=' + ID,
    'https://youtube.com.evil.nl/watch?v=' + ID,     // nep-domein met youtube erin
    'javascript:alert(1)',
    'https://www.youtube.com/watch?v=tekort',
    'https://www.youtube.com/',
    'https://www.youtube.com/watch?v=' + ID + 'x',    // te lang
    'data:text/html,<script>alert(1)</script>',
    'x'.repeat(300),
  ];
  for (const vorm of fout) {
    assert.equal(yt.videoId(vorm), '', 'dit hoorde niets op te leveren: ' + vorm);
    assert.equal(yt.isYouTube(vorm), false);
  }
});

test('het insluitadres is altijd youtube-nocookie en het kijkadres youtube.com', () => {
  assert.equal(yt.insluitUrl(ID), 'https://www.youtube-nocookie.com/embed/' + ID + '?rel=0&modestbranding=1');
  assert.equal(yt.kijkUrl(ID), 'https://www.youtube.com/watch?v=' + ID);
  // Een volledige link mag ook
  assert.equal(yt.insluitUrl('https://youtu.be/' + ID), 'https://www.youtube-nocookie.com/embed/' + ID + '?rel=0&modestbranding=1');
  // En onzin levert niets op, zodat er geen leeg venster in de pagina komt
  assert.equal(yt.insluitUrl('javascript:alert(1)'), '');
  assert.equal(yt.kijkUrl('https://example.com/'), '');
});

test('een liedje onthoudt zijn YouTube-video, en alleen een echte YouTube-link', async () => {
  const omgeving = await start();
  try {
    const lijst = await haal(omgeving.basis, '/api/liedjes?aantal=1');
    const lied = lijst.data.liedjes[0];

    // Nog niets gekoppeld: wel een zoeklink om er een te vinden.
    const leeg = await haal(omgeving.basis, '/api/youtube?liedje=' + lied.id);
    assert.equal(leeg.status, 200);
    assert.equal(leeg.data.video, '');
    assert.equal(leeg.data.insluit, '');
    assert.match(leeg.data.zoek, /youtube\.com/);

    // Onzin en andermans domein weigeren.
    for (const fout of ['geen link', 'https://example.com/watch?v=' + ID, 'javascript:alert(1)']) {
      const geweigerd = await post(omgeving.basis, '/api/youtube', { liedje: lied.id, url: fout });
      assert.equal(geweigerd.status, 400, 'dit hoorde geweigerd te worden: ' + fout);
      assert.match(geweigerd.data.fout, /geen YouTube-link/);
    }

    // Een goede link koppelen.
    const gekoppeld = await post(omgeving.basis, '/api/youtube', { liedje: lied.id, url: 'https://youtu.be/' + ID + '?t=10' });
    assert.equal(gekoppeld.status, 200, JSON.stringify(gekoppeld.data));
    assert.equal(gekoppeld.data.video, ID);
    assert.equal(gekoppeld.data.insluit, 'https://www.youtube-nocookie.com/embed/' + ID + '?rel=0&modestbranding=1');
    assert.equal(gekoppeld.data.kijk, 'https://www.youtube.com/watch?v=' + ID);

    // En het liedje zelf weet het ook.
    const detail = await haal(omgeving.basis, '/api/liedjes/' + lied.id);
    assert.equal(detail.data.heeftVideo, true);
    assert.equal(detail.data.video.video, ID);
    assert.match(detail.data.video.insluit, /youtube-nocookie\.com\/embed\//);
    const inLijst = await haal(omgeving.basis, '/api/liedjes?compact=1&aantal=1');
    assert.equal(inLijst.data.liedjes[0].heeftVideo, true);

    // Losmaken.
    const weg = await post(omgeving.basis, '/api/youtube', { liedje: lied.id, weg: true });
    assert.equal(weg.status, 200);
    const na = await haal(omgeving.basis, '/api/youtube?liedje=' + lied.id);
    assert.equal(na.data.video, '');
    const detail2 = await haal(omgeving.basis, '/api/liedjes/' + lied.id);
    assert.equal(detail2.data.heeftVideo, false);
  } finally {
    await omgeving.stop();
  }
});
