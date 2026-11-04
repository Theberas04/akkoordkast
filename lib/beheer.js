'use strict';
// Het beheerderswachtwoord en de sessies van de beheerder.
//
// De app is zelf te gebruiken door iedereen die hem open (liedjes zoeken, spelen, leren), maar
// iets toevoegen of veranderen op de machine hoort bij de beheerder: muziek uploaden, een map
// laten omzetten, een link naar mp3 halen, eigen liedjes bewerken, de back-up en de bijwerking.
//
// Het wachtwoord wordt nooit bewaard, alleen een scrypt-afdruk met een eigen zout per keer. Een
// sessie is een lange toevallige reeks die in de database staat met een vervaldatum; de browser
// krijgt hem als HttpOnly-koekje, zodat geen enkele pagina hem kan lezen.
const crypto = require('node:crypto');

const SCRYPT = { N: 16384, r: 8, p: 1, lengte: 32 };
const MIN_LENGTE = 8;
const SESSIE_DAGEN = 90;

// Een wachtwoord omzetten naar een afdruk: "scrypt$N$r$p$zout$afdruk".
function hashWachtwoord(wachtwoord) {
  const zout = crypto.randomBytes(16);
  const sleutel = crypto.scryptSync(String(wachtwoord), zout, SCRYPT.lengte,
    { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, zout.toString('hex'), sleutel.toString('hex')].join('$');
}

// Klopt het wachtwoord bij deze afdruk? De vergelijking gebeurt in constante tijd, zodat je aan
// de tijd die het kost niet kunt aflezen hoeveel tekens er goed waren.
function controleerWachtwoord(wachtwoord, opgeslagen) {
  if (!opgeslagen || typeof opgeslagen !== 'string') return false;
  const delen = String(opgeslagen).split('$');
  if (delen.length !== 6 || delen[0] !== 'scrypt') return false;
  const N = Number(delen[1]);
  const r = Number(delen[2]);
  const p = Number(delen[3]);
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false;
  const zout = Buffer.from(delen[4], 'hex');
  const afdruk = Buffer.from(delen[5], 'hex');
  if (!zout.length || !afdruk.length) return false;
  let proef;
  try {
    proef = crypto.scryptSync(String(wachtwoord), zout, afdruk.length, { N, r, p });
  } catch (e) {
    return false;
  }
  return proef.length === afdruk.length && crypto.timingSafeEqual(proef, afdruk);
}

function sterkGenoeg(wachtwoord) {
  return String(wachtwoord || '').length >= MIN_LENGTE;
}

function nieuwToken() {
  return crypto.randomBytes(32).toString('hex');
}

module.exports = { hashWachtwoord, controleerWachtwoord, sterkGenoeg, nieuwToken, MIN_LENGTE, SESSIE_DAGEN };
