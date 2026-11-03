#!/usr/bin/env node
'use strict';
// Zet demo-gegevens in een wegwerp-database voor schermafbeeldingen en de rondleiding.
// Gebruikt de HTTP-API van de app, zodat de demo altijd door de eigen validatie gaat.
// Idempotent: bestaat de demo al, dan wordt er niets toegevoegd.
const fs = require('fs');
const path = require('path');

const BASIS = process.env.BASIS || 'http://127.0.0.1:8091';

const DEMO = [
  {
    titel: 'Sinterklaasje bonne bonne bonne',
    artiest: 'Traditioneel (Sinterklaaslied)',
    taal: 'nl',
    genre: 'Sinterklaas',
    moeilijkheid: 1,
    toonsoort: 'C',
    tempo: 104,
    strum: 'D D U U D U',
    bron: 'Eigen invoer (publiek domein, traditioneel)',
    youtube: 'https://www.youtube.com/results?search_query=Sinterklaasje+bonne+bonne+bonne',
    notitie: 'Met de capo op 2 speel je hem makkelijk in D-vormen.',
    chordpro: [
      '{title: Sinterklaasje bonne bonne bonne}',
      '{key: C}',
      '{tempo: 104}',
      '{comment: Refrein}',
      '[C]Sinterklaasje bonne bonne bonne,',
      '[G7]gooi wat in mijn [C]schoentje,',
      '[C]gooi wat in mijn laarsje,',
      '[G7]dank je Sinter[C]klaasje.',
      '',
      '{comment: Couplet 1}',
      '[C]Sinterklaas zit op zijn paard,',
      '[G7]met zijn mijter [C]op,',
      '[C]hij heeft in zijn hand een [F]grote zak,',
      '[G7]vol met lekkers [C]op.'
    ].join('\n')
  },
  {
    titel: 'O dennenboom',
    artiest: 'Traditioneel (Duitse herkomst, 19e eeuw)',
    taal: 'nl',
    genre: 'Kerst',
    moeilijkheid: 2,
    toonsoort: 'G',
    tempo: 92,
    strum: 'D DU UDU',
    bron: 'Eigen invoer (publiek domein, traditioneel)',
    youtube: 'https://www.youtube.com/results?search_query=O+dennenboom+kerstlied',
    notitie: 'Eerste regel twee keer, dan het refrein — let op de D7 naar G.',
    chordpro: [
      '{title: O dennenboom}',
      '{key: G}',
      '{tempo: 92}',
      '{comment: Refrein}',
      '[G]O dennenboom, o [D7]dennenboom,',
      'wat zijn je [G]takken mooi!',
      '[G]O dennenboom, o [D7]dennenboom,',
      'wat zijn je [G]takken [C]mooi!',
      '',
      '{comment: Couplet 1}',
      '[G]Want in de winter [C]koud en [G]lang,',
      '[D7]blijf jij zo groen als [G]altijd,',
      '[G]geen blad dat van je [C]takken [G]valt,',
      '[D7]ook al is het [G]winter.'
    ].join('\n')
  }
];

async function haal(pad, opties) {
  const r = await fetch(BASIS + pad, opties);
  const tekst = await r.text();
  let data = {};
  try { data = JSON.parse(tekst); } catch (e) {}
  if (!r.ok) throw new Error(pad + ' → ' + r.status + ' ' + (data.fout || tekst.slice(0, 120)));
  return data;
}

async function main() {
  const lijst = await haal('/api/liedjes?compact=1&eigen=1&aantal=200');
  const bestaande = new Set(lijst.liedjes.map(l => l.titel));
  console.log('eigen liedjes in de demo-database:', bestaande.size);
  const nieuw = [];
  for (const lied of DEMO) {
    if (bestaande.has(lied.titel)) { console.log('bestaat al:', lied.titel); continue; }
    const r = await haal('/api/liedjes/import', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(lied)
    });
    nieuw.push(r.ids[0]);
    console.log('toegevoegd:', lied.titel, '→ id', r.ids[0]);
  }

  // Van het eerste demo-liedje ook echt een opname: de eigen begeleiding als mp3.
  const doel = nieuw[0];
  if (doel) {
    const wav = await fetch(`${BASIS}/api/audio/preview?liedje=${doel}`);
    const audio = Buffer.from(await wav.arrayBuffer());
    const up = await fetch(`${BASIS}/api/liedjes/${doel}/audio`, {
      method: 'POST',
      headers: {
        'content-type': wav.headers.get('content-type') || 'audio/mpeg',
        'x-bestandsnaam': 'sinterklaas-begeleiding.mp3',
        'x-audio-titel': 'Eigen begeleiding (demo)'
      },
      body: audio
    });
    const uit = await up.json();
    console.log('opname bij id', doel, '→', uit.url || uit.fout);
  }

  await haal('/api/instellingen', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ cast_apparaat: '192.168.1.100', cast_naam: 'Chromecast woonkamer' })
  });
  console.log('demo-gegevens staan klaar op', BASIS);
}

main().catch(e => { console.error('demo-gegevens mislukt:', e.message); process.exit(1); });
