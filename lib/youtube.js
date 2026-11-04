'use strict';
// Een YouTube-video aan een liedje koppelen, zodat je in de app kunt meespelen met de versie
// die jij bedoelt. De app speelt de video via de officiële insluiting van YouTube
// (youtube-nocookie.com) — hij downloadt niets. Dat is bewust: het downloaden van andermans
// muziek mag niet, en de app hoort geen auteursrechtelijke opnamen op je server te zetten.
//
// Deze module haalt alleen het video-id uit een link. Alles wat geen YouTube-link is levert
// een leeg id op, zodat er nooit een willekeurige pagina in het venster belandt.
const PATRONEN = [
  // https://www.youtube.com/watch?v=ID  (en music.youtube.com, m.youtube.com)
  /^(?:https?:\/\/)?(?:www\.|m\.|music\.)?youtube\.com\/watch\?(?:.*&)?v=([A-Za-z0-9_-]{11})(?:[&#].*)?$/i,
  // https://youtu.be/ID
  /^(?:https?:\/\/)?youtu\.be\/([A-Za-z0-9_-]{11})(?:[?#].*)?$/i,
  // https://www.youtube.com/embed/ID  en  /shorts/ID  en  /live/ID
  /^(?:https?:\/\/)?(?:www\.|m\.|music\.)?youtube\.com\/(?:embed|shorts|live|v)\/([A-Za-z0-9_-]{11})(?:[?#].*)?$/i,
  // Alleen het id zelf
  /^([A-Za-z0-9_-]{11})$/,
];

function videoId(link) {
  const tekst = String(link || '').trim();
  if (!tekst || tekst.length > 200) return '';
  for (const patroon of PATRONEN) {
    const treffer = tekst.match(patroon);
    if (treffer) return treffer[1];
  }
  return '';
}

function isYouTube(link) {
  return !!videoId(link);
}

// Het adres dat in het venster komt. nocookie: minder van jouw gegevens naar YouTube.
function insluitUrl(id) {
  const schoon = videoId(id) || (String(id || '').length === 11 ? String(id) : '');
  if (!schoon) return '';
  return `https://www.youtube-nocookie.com/embed/${schoon}?rel=0&modestbranding=1`;
}

// Het adres om in een nieuw tabblad te openen.
function kijkUrl(id) {
  const schoon = videoId(id) || (String(id || '').length === 11 ? String(id) : '');
  if (!schoon) return '';
  return `https://www.youtube.com/watch?v=${schoon}`;
}

module.exports = { videoId, isYouTube, insluitUrl, kijkUrl };
