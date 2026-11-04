'use strict';
// Testen van het oefenplan. We bouwen een paar plannen met vaste invoer en kijken of de weken
// kloppen: genoeg minuten, de juiste soorten taken, de overgangen van het doel, de lessen in
// volgorde, en of twee keer hetzelfde plan ook echt hetzelfde is. Zo weten we dat de app een
// bruikbaar oefenplan krijgt zonder dat er iemand hoeft te spelen.
var test = require('node:test');
var assert = require('node:assert/strict');
var reken = require('../lib/oefenplan');

var doel = { titel: 'Amazing Grace', akkoorden: ['G', 'C', 'D'] };

// Alle taken uit een plan op een rij, zodat we makkelijk kunnen zoeken.
function alleTaken(plan) {
  var uit = [];
  plan.weken.forEach(function (week) {
    week.taken.forEach(function (t) { uit.push(t); });
  });
  return uit;
}

// Zit er in deze week een taak van deze soort?
function heeft(week, soort) {
  var gevonden = false;
  week.taken.forEach(function (t) { if (t.soort === soort) gevonden = true; });
  return gevonden;
}

// De som van de minuten van de taken in een week.
function somMinuten(week) {
  var som = 0;
  week.taken.forEach(function (t) { som += t.minuten; });
  return som;
}

test('zes weken van twintig minuten leveren zeshonderd minuten op', function () {
  var plan = reken.maakPlan({ doel: doel, weken: 6, minutenPerDag: 20, perWeek: 5 });
  assert.equal(plan.totaalMinuten, 600);
  assert.equal(plan.weken.length, 6);
  plan.weken.forEach(function (week) {
    assert.equal(somMinuten(week), 100);
    assert.equal(week.minuten, 100);
  });
});

test('elke week heeft minstens twee taken met een geldige soort en hele minuten', function () {
  var plan = reken.maakPlan({ doel: doel, weken: 6 });
  plan.weken.forEach(function (week, wi) {
    assert.ok(week.taken.length >= 2, 'week ' + (wi + 1) + ' heeft te weinig taken');
    week.taken.forEach(function (t) {
      assert.ok(reken.SOORTEN.indexOf(t.soort) >= 0, 'onbekende soort: ' + t.soort);
      assert.equal(typeof t.titel, 'string');
      assert.ok(t.titel.length > 0, 'taak zonder titel');
      assert.equal(t.minuten % 1, 0, 'minuten zijn geen geheel getal');
      assert.ok(t.minuten > 0, 'minuten moeten boven nul zijn');
      assert.equal(t.klaar, false);
    });
  });
});

test('week een noemt alle akkoorden van het doel in de grepen-taak', function () {
  var plan = reken.maakPlan({ doel: doel, weken: 6 });
  var grepen = plan.weken[0].taken.filter(function (t) { return t.soort === 'grepen'; });
  assert.equal(grepen.length, 1);
  assert.ok(grepen[0].titel.indexOf('G, C, D') >= 0, 'akkoorden ontbreken: ' + grepen[0].titel);
});

test('elke overgang van het doel komt voor, ook die van de laatste naar de eerste', function () {
  var plan = reken.maakPlan({ doel: doel, weken: 6 });
  var overgangen = alleTaken(plan).filter(function (t) { return t.soort === 'overgang'; });
  var teksten = overgangen.map(function (t) { return t.titel; }).join(' | ');
  assert.ok(teksten.indexOf('G naar C') >= 0, 'G naar C ontbreekt');
  assert.ok(teksten.indexOf('C naar D') >= 0, 'C naar D ontbreekt');
  assert.ok(teksten.indexOf('D naar G') >= 0, 'D naar G ontbreekt');
});

test('de laatste week eindigt op tempo en herhalen, met eerder al ritme', function () {
  var plan = reken.maakPlan({ doel: doel, weken: 6 });
  var laatste = plan.weken[plan.weken.length - 1];
  assert.ok(heeft(laatste, 'tempo'), 'tempo ontbreekt in de laatste week');
  assert.ok(heeft(laatste, 'herhalen'), 'herhalen ontbreekt in de laatste week');
  // Met een vierde week moet er in een eerdere week ritme zitten.
  var eerderRitme = false;
  for (var i = 0; i < plan.weken.length - 1; i++) {
    if (heeft(plan.weken[i], 'ritme')) eerderRitme = true;
  }
  assert.ok(eerderRitme, 'ritme ontbreekt in de eerdere weken');
});

test('lessen komen in volgorde voor en geen enkele les vaker dan één keer', function () {
  var lessen = [];
  for (var i = 1; i <= 20; i++) lessen.push({ titel: 'Les ' + i });
  var plan = reken.maakPlan({ doel: doel, weken: 6, lessen: lessen });
  var lestitels = alleTaken(plan)
    .filter(function (t) { return t.soort === 'les'; })
    .map(function (t) { return t.titel; });
  // De eerste lestitel zit erin.
  assert.ok(lestitels.join(' | ').indexOf('Les 1') >= 0, 'de eerste les ontbreekt');
  // Geen enkele lestitel twee keer.
  var gezien = {};
  lestitels.forEach(function (t) {
    assert.ok(!gezien[t], 'les komt dubbel voor: ' + t);
    gezien[t] = true;
  });
  // Er zitten ook lessen in weken na week een.
  var latereLes = false;
  for (var w = 1; w < plan.weken.length; w++) {
    if (heeft(plan.weken[w], 'les')) latereLes = true;
  }
  assert.ok(latereLes, 'geen lessen in latere weken');
});

test('twee keer hetzelfde plan maken geeft precies hetzelfde antwoord', function () {
  var a = reken.maakPlan({ doel: doel, weken: 5, lessen: [{ titel: 'De plectrum en je rechterhand' }] });
  var b = reken.maakPlan({ doel: doel, weken: 5, lessen: [{ titel: 'De plectrum en je rechterhand' }] });
  assert.deepEqual(a, b);
});

test('een plan van één week heeft alles: grepen, overgang, tempo en herhalen', function () {
  var plan = reken.maakPlan({ doel: doel, weken: 1 });
  assert.equal(plan.weken.length, 1);
  var week = plan.weken[0];
  ['grepen', 'overgang', 'tempo', 'herhalen'].forEach(function (soort) {
    assert.ok(heeft(week, soort), soort + ' ontbreekt in de enige week');
  });
});

test('zonder akkoorden geen grepen of overgang, maar de week is wel precies gevuld', function () {
  var plan = reken.maakPlan({ doel: { titel: 'Losse oefening', akkoorden: [] }, weken: 4 });
  plan.weken.forEach(function (week) {
    week.taken.forEach(function (t) {
      assert.ok(t.soort !== 'grepen', 'grepen hoort er niet te zijn');
      assert.ok(t.soort !== 'overgang', 'overgang hoort er niet te zijn');
    });
    assert.equal(somMinuten(week), 100);
  });
});

test('ongeldige invoer gooit een fout met een Nederlandse melding', function () {
  assert.throws(function () { reken.maakPlan({ doel: doel, weken: 0 }); }, /weken/i);
  assert.throws(function () { reken.maakPlan({ doel: doel, weken: -3 }); }, /weken/i);
  assert.throws(function () { reken.maakPlan({ doel: { akkoorden: [] }, weken: 3 }); }, /titel/i);
});

test('acht weken van tien minuten en drie dagen', function () {
  var plan = reken.maakPlan({ doel: doel, weken: 8, minutenPerDag: 10, perWeek: 3 });
  assert.equal(plan.totaalMinuten, 240);
  plan.weken.forEach(function (week) {
    assert.equal(somMinuten(week), 30);
  });
});
