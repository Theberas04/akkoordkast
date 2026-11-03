'use strict';
// Het oefenen per week: welke week hoort bij een dag, en wat zijn de totalen per week.
// Puur rekenwerk op de rijen uit de database, zodat het zonder server te testen is.

const DAG = 86400000;

function datumVan(moment) {
  const tekst = String(moment || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tekst)) return null;
  const d = new Date(tekst + 'T00:00:00Z');
  return Number.isNaN(d.getTime()) ? null : d;
}

// De maandag van de week waarin deze dag valt. Zondag hoort bij de week die op de
// maandag ervoor begon (dat is de ISO-afspraak, en zo werkt de agenda ook).
function maandagVan(datum) {
  const d = new Date(Date.UTC(datum.getUTCFullYear(), datum.getUTCMonth(), datum.getUTCDate()));
  const weekdag = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - (weekdag - 1));
  return d;
}

// '2026-W45'. Het jaartal is het jaar van de donderdag in die week, want daar hoort de
// week bij: 1 januari 2027 valt nog in week 53 van 2026.
function weekSleutel(datum) {
  const maandag = maandagVan(datum);
  const donderdag = new Date(maandag.getTime() + 3 * DAG);
  const jaar = donderdag.getUTCFullYear();
  const eersteMaandag = maandagVan(new Date(Date.UTC(jaar, 0, 4)));
  const week = Math.round((maandag.getTime() - eersteMaandag.getTime()) / (7 * DAG)) + 1;
  return jaar + '-W' + String(week).padStart(2, '0');
}

function weekLabel(sleutel) {
  const stuk = String(sleutel || '').split('-W');
  if (stuk.length !== 2) return String(sleutel || '');
  return 'week ' + stuk[1] + ' van ' + stuk[0];
}

// De maandag die bij een weeksleutel hoort.
function maandagVanWeek(sleutel) {
  const stuk = String(sleutel || '').split('-W');
  if (stuk.length !== 2) return '';
  const jaar = Number(stuk[0]);
  const week = Number(stuk[1]);
  if (!jaar || !week) return '';
  const eersteMaandag = maandagVan(new Date(Date.UTC(jaar, 0, 4)));
  return new Date(eersteMaandag.getTime() + (week - 1) * 7 * DAG).toISOString().slice(0, 10);
}

// De laatste N weken als sleutels, oudste eerst, met deze week achteraan.
function laatsteWeken(aantal, nu) {
  const nuDatum = nu instanceof Date ? nu : new Date(nu === undefined ? Date.now() : nu);
  const uit = [];
  for (let i = Math.max(1, Number(aantal) || 8) - 1; i >= 0; i--) {
    uit.push(weekSleutel(new Date(maandagVan(nuDatum).getTime() - i * 7 * DAG)));
  }
  return uit;
}

// De sessies per week: tijd, aantal keer, wissels en de akkoorden waarop geoefend is.
// Weken zonder oefening staan er ook in, met nullen — anders lijkt het of je niets deed.
function groepeerPerWeek(sessies, aantalWeken, nu) {
  const weken = laatsteWeken(aantalWeken, nu);
  const perWeek = {};
  for (const week of weken) {
    perWeek[week] = { week, sessies: 0, seconden: 0, wissels: 0, akkoorden: {} };
  }
  for (const rij of sessies || []) {
    const datum = datumVan(rij && rij.moment);
    if (!datum) continue;
    const week = weekSleutel(datum);
    const vak = perWeek[week];
    if (!vak) continue;
    vak.sessies += 1;
    vak.seconden += Number(rij.seconden) || 0;
    vak.wissels += Number(rij.wissels) || 0;
    for (const akkoord of String((rij && rij.akkoorden) || '').split(/\s+/).filter(Boolean)) {
      vak.akkoorden[akkoord] = (vak.akkoorden[akkoord] || 0) + 1;
    }
  }
  return weken.map(week => {
    const vak = perWeek[week];
    const akkoorden = Object.keys(vak.akkoorden)
      .map(akkoord => ({ akkoord, keer: vak.akkoorden[akkoord] }))
      .sort((a, b) => b.keer - a.keer || a.akkoord.localeCompare(b.akkoord))
      .slice(0, 5);
    return {
      week,
      label: weekLabel(week),
      maandag: maandagVanWeek(week),
      sessies: vak.sessies,
      minuten: Math.round(vak.seconden / 60),
      seconden: vak.seconden,
      wissels: vak.wissels,
      akkoorden
    };
  });
}

module.exports = { datumVan, maandagVan, maandagVanWeek, weekSleutel, weekLabel, laatsteWeken, groepeerPerWeek };
