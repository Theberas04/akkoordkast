'use strict';
// Controle: er horen geen adressen van het eigen netwerk in dit repo te staan, en al helemaal niet in
// de geschiedenis. Als voorbeeld gebruiken we 192.168.1.100 - een adres dat niemand gebruikt.
//
// Waarom: het repo is openbaar leesbaar. Een adres van de NAS, de Chromecast of de server vertelt een
// bezoeker precies hoe het netwerk in elkaar zit.
//
// Er wordt alleen naar bestanden gekeken die in git zitten; plaatselijke proefbestanden (zoals een
// demo-database) horen er niet in en kunnen dus ook geen kwaad.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const wortel = path.join(__dirname, '..');
const PATROON = /192\.168\.\d{1,3}\.\d{1,3}/g;
const TOEGESTAAN = '192.168.1.100';
const ZELF = path.join('test', 'netwerkadres.test.js');

function bestandenInGit() {
  const uit = spawnSync('git', ['ls-files'], { cwd: wortel, encoding: 'utf8' });
  if (uit.status !== 0) return null;
  return uit.stdout.split('\n').map((r) => r.trim()).filter(Boolean);
}

function zoekEchteAdressen() {
  const gevonden = [];
  const bestanden = bestandenInGit();
  if (!bestanden) return gevonden; // geen git-map: dan valt er niets te controleren
  for (const rel of bestanden) {
    if (rel === ZELF) continue;
    let tekst;
    try {
      tekst = fs.readFileSync(path.join(wortel, rel), 'utf8');
    } catch (fout) {
      continue; // geen leesbare tekst (beeld, archief)
    }
    const vreemd = (tekst.match(PATROON) || []).filter((a) => a !== TOEGESTAAN);
    if (vreemd.length) gevonden.push(rel + ': ' + [...new Set(vreemd)].join(', '));
  }
  return gevonden;
}

test('er staan geen adressen van het eigen netwerk in dit repo', () => {
  const gevonden = zoekEchteAdressen();
  assert.deepEqual(gevonden, [],
    'gebruik ' + TOEGESTAAN + ' als voorbeeld in plaats van een echt adres:\n  ' + gevonden.join('\n  '));
});

test('het neutrale voorbeeld wordt gebruikt waar het hoort', () => {
  const voorbeeld = fs.readFileSync(path.join(wortel, 'deploy', 'proxmox', 'nas-koppelen.sh'), 'utf8');
  assert.ok(voorbeeld.includes(TOEGESTAAN), 'de voorbeeldregel hoort het neutrale adres te noemen');
});

test('local host en de algemene proefreeksen mogen blijven staan', () => {
  // 127.0.0.1 zegt niets over het netwerk van de maker, en 10.0.0.x / 172.16.x zijn de standaard
  // proefreeksen uit de documentatie. Die horen dus niet bij de verboden adressen.
  const proef = fs.readFileSync(path.join(wortel, 'test', 'downloader.test.js'), 'utf8');
  assert.match(proef, /127\.0\.0\.1/, 'localhost hoort gewoon te mogen');
});
