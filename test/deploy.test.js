'use strict';
// De deploykit: syntax, bestandslijsten en de afspraken die een verse installatie
// laten werken. Een bestand dat in de ene lijst staat en in de andere niet, is de
// klassieke oorzaak van "Cannot find module" in de container.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const WORTEL = path.join(__dirname, '..');
const DEPLOY = path.join(WORTEL, 'deploy', 'proxmox');

function lees(naam) {
  return fs.readFileSync(path.join(DEPLOY, naam), 'utf8');
}

function bestaatInRepo(pad) {
  return fs.existsSync(path.join(WORTEL, pad));
}

// Leest een shell-array met de naam TITEL uit een script.
function shellArray(tekst, titel) {
  const m = tekst.match(new RegExp(titel + '=\\(\\n([\\s\\S]*?)\\n\\)', 'm'));
  if (!m) return null;
  return m[1].split('\n')
    .map(r => r.trim())
    .filter(r => r && !r.startsWith('#'))   // commentaar in een lijst is geen bestandsnaam
    .map(r => r.replace(/^["']|["']$/g, ''));
}

// Leest de paden die naar de container worden gestuurd: pct push ... "$APP_DIR/$f".
function pushGroepen(tekst) {
  const groepen = [];
  const regels = tekst.split('\n');
  let huidige = null;
  for (const regel of regels) {
    const loop = regel.match(/^for f in "\$\{([A-Z]+)\[@\]\}"; do\s*(.*)$/);
    if (loop) {
      huidige = { naam: loop[1], regels: [regel] };
      groepen.push(huidige);
      continue;
    }
    if (huidige && /pct push/.test(regel)) huidige.regels.push(regel);
    if (huidige && /^done\s*$/.test(regel)) huidige = null;
  }
  // Alleen lussen die echt naar de container sturen (de downloadlus doet dat niet).
  return groepen.filter(g => g.regels.some(r => /pct push/.test(r)));
}

const SCRIPTS = fs.readdirSync(DEPLOY).filter(n => n.endsWith('.sh'));

test('elk deploy-script is syntactisch in orde', () => {
  for (const naam of SCRIPTS) {
    const pad = path.join(DEPLOY, naam);
    execFileSync('bash', ['-n', pad], { stdio: 'pipe' });
  }
  assert.ok(SCRIPTS.length >= 4, 'te weinig deploy-scripts: ' + SCRIPTS.join(', '));
});

test('geen enkel script heeft een oneven aantal aanhalingstekens per regel', () => {
  for (const naam of SCRIPTS) {
    // Regels die met een \ doorgaan vormen samen één regel: een quote mag daar pas op de
    // volgende regel sluiten. Daarom eerst die regels aan elkaar plakken en dan pas tellen.
    const fysiek = lees(naam).split('\n');
    const logisch = [];
    let bezig = '';
    let startregel = 0;
    fysiek.forEach((regel, i) => {
      if (!bezig) startregel = i + 1;
      bezig = bezig ? bezig + '\n' + regel : regel;
      if (regel.endsWith('\\')) return;
      logisch.push({ regel: bezig, nummer: startregel });
      bezig = '';
    });
    if (bezig) logisch.push({ regel: bezig, nummer: startregel });

    for (const { regel, nummer } of logisch) {
      const enkel = (regel.match(/'/g) || []).length;
      const dubbel = (regel.match(/"/g) || []).length;
      // Een apostrof in een Nederlands woord komt niet voor in deze scripts;
      // een oneven aantal betekent bijna altijd een afgebroken quote.
      assert.equal(enkel % 2, 0, `${naam}:${nummer} oneven aantal ' : ${regel.trim()}`);
      assert.equal(dubbel % 2, 0, `${naam}:${nummer} oneven aantal " : ${regel.trim()}`);
    }
  }
});

test('de downloadlijst van install.sh bestaat volledig in de repository', () => {
  const install = lees('install.sh');
  const files = shellArray(install, 'FILES');
  assert.ok(files, 'geen FILES-array in install.sh');
  assert.ok(files.length >= 17, 'downloadlijst te kort: ' + files.length);
  for (const f of files) {
    assert.ok(!f.includes(' '), 'bestandsnaam met een spatie: ' + f);
    assert.ok(bestaatInRepo(f), 'install.sh noemt een bestand dat niet bestaat: ' + f);
  }
  assert.equal(new Set(files).size, files.length, 'dubbele namen in de downloadlijst');
  assert.match(install, /case "\$f" in/, 'geen case-guard in de downloadlus');
  assert.match(install, /Interne fout: bestandsnaam met een spatie/, 'geen spatiescheiding-guard in de downloadlus');
});

test('de installer haalt elk script op dat hij zelf aanroept', () => {
  // install.sh voert iets uit met bash "$TARGET_DIR/deploy/proxmox/...". Staat dat bestand
  // niet in FILES, dan stopt de installatie met "No such file or directory" — en dat merk je
  // pas op de host van de gebruiker, na het ophalen van alle andere bestanden.
  const install = lees('install.sh');
  const files = shellArray(install, 'FILES');
  const zonderCommentaar = install.split('\n').filter(r => !r.trim().startsWith('#')).join('\n');
  const aangeroepen = [...zonderCommentaar.matchAll(/bash\s+"?\$\{?(?:TARGET_DIR|STAGING)\}?\/([\w./-]+)"?/g)].map(m => m[1]);
  assert.ok(aangeroepen.length >= 2, 'geen aangeroepen scripts gevonden in install.sh: ' + aangeroepen.join(', '));
  for (const rel of aangeroepen) {
    assert.ok(files.includes(rel), `install.sh roept ${rel} aan maar haalt het niet op`);
    assert.ok(bestaatInRepo(rel), `install.sh noemt ${rel}, maar dat bestaat niet in de repo`);
  }
  assert.ok(aangeroepen.some(r => r.includes('create-akkoordkast-lxc')),
    'de installer hoort de container-maker aan te roepen');
});

test('de updater haalt alles op wat hij in de container zet, en niet minder', () => {
  const install = shellArray(lees('install.sh'), 'FILES');
  const update = shellArray(lees('update-from-github.sh'), 'FILES');
  assert.ok(update.length >= 17, 'downloadlijst van de updater te kort');
  for (const f of update) {
    assert.ok(install.includes(f), `install.sh haalt ${f} niet op, terwijl de updater het nodig heeft`);
  }
  // De updater hoeft de deploy-scripts zelf niet op te halen: hij draait al.
  const gepusht = pushGroepen(lees('update-from-github.sh'))
    .flatMap(g => shellArray(lees('update-from-github.sh'), g.naam));
  for (const f of gepusht) {
    assert.ok(update.includes(f), `de updater pusht ${f} zonder het op te halen`);
  }
  assert.equal(new Set(update).size, update.length, 'dubbele namen in de downloadlijst van de updater');
});

test('alles wat naar de container gaat, wordt ook opgehaald en bestaat', () => {
  const install = shellArray(lees('install.sh'), 'FILES');
  for (const naam of ['provision-akkoordkast.sh', 'update-from-github.sh']) {
    const tekst = lees(naam);
    const groepen = pushGroepen(tekst);
    assert.ok(groepen.length >= 3, `${naam}: geen push-lussen gevonden`);
    for (const groep of groepen) {
      const lijst = shellArray(tekst, groep.naam);
      assert.ok(lijst, `${naam}: array ${groep.naam} niet gevonden`);
      for (const f of lijst) {
        assert.ok(groep.regels.some(r => r.includes(`$APP_DIR/$f`)),
          `${naam}: ${f} wordt niet naar de container gestuurd`);
        if (naam === 'provision-akkoordkast.sh') {
          assert.ok(install.includes(f), `install.sh haalt ${f} niet op, terwijl provisioning het nodig heeft`);
        } else {
          assert.ok(install.includes(f), `install.sh haalt ${f} niet op voor de updater`);
        }
        assert.ok(bestaatInRepo(f), `${naam}: ${f} bestaat niet in de repository`);
        assert.ok(lees('update-from-github.sh').includes(f), `update-from-github.sh kent ${f} niet`);
      }
    }
  }
});

test('provisioning en updater sturen dezelfde groepen naar de container', () => {
  const groepen = naam => pushGroepen(lees(naam)).map(g => g.naam + ':' + shellArray(lees(naam), g.naam).join(','));
  assert.deepEqual(groepen('update-from-github.sh'), groepen('provision-akkoordkast.sh'));
});

test('elk bestand dat server.js requiret, staat in de downloadlijsten', () => {
  const server = fs.readFileSync(path.join(WORTEL, 'server.js'), 'utf8');
  const modules = [...server.matchAll(/require\('\.\/([^']+)'\)/g)].map(m => m[1]);
  assert.ok(modules.length >= 5, 'te weinig requires gevonden');
  const install = lees('install.sh');
  for (const mod of modules) {
    const pad = mod.endsWith('.js') ? mod : mod + '.js';
    assert.ok(bestaatInRepo(pad), 'module ontbreekt in de repository: ' + pad);
    assert.ok(install.includes(pad), 'install.sh haalt ' + pad + ' niet op');
  }
  // de lib-modules van de app zelf
  for (const lib of ['lib/theorie.js', 'lib/grepen.js', 'lib/chordpro.js', 'lib/capo.js', 'lib/gitaar.js']) {
    assert.ok(install.includes(lib), 'install.sh mist ' + lib);
  }
  assert.ok(install.includes('scripts/cast-helper.py'), 'install.sh mist de cast-hulp');
  assert.ok(install.includes('song-data/liedjes.json'), 'install.sh mist de liedjes-dataset');
});

test('de container-maker haalt sjablonen van een opslag die sjablonen aankan', () => {
  // Deze fout kostte een echte installatie: 'pveam list local-lvm' stopt met
  // "storage 'local-lvm' does not support templates". Sjablonen (vztmpl) en de
  // containerschijf (rootdir) zitten op een standaardinstallatie op verschillende opslag.
  const tekst = lees('create-akkoordkast-lxc.sh');
  assert.doesNotMatch(tekst, /pveam (list|download) "\$OPSLAG"/,
    'sjablonen mogen niet op de containerschijf-opslag gezocht worden');
  assert.match(tekst, /--content vztmpl/, 'de sjabloonopslag wordt niet op vztmpl gezocht');
  assert.match(tekst, /--content rootdir/, 'de containerschijf-opslag wordt niet op rootdir gezocht');
  assert.match(tekst, /SJABLOON_OPSLAG=/, 'de sjabloonopslag is niet instelbaar');
  assert.match(tekst, /^OPSLAG="\$\{OPSLAG:-/m, 'de containerschijf-opslag is niet instelbaar');
  assert.match(tekst, /kies_sjabloon/, 'geen keuze uit de aangeboden sjablonen');
  assert.match(tekst, /alles="\$\(cat\)"/, 'de sjabloonkeuze leest de invoer niet één keer in');
  assert.match(tekst, /pct create "\$CTID"/, 'de container wordt niet aangemaakt');
  assert.match(tekst, /bridge=\$BRIDGE/, 'de bridge is niet instelbaar');
  assert.match(tekst, /--net0/, 'er wordt geen netwerk aan de container gegeven');
});

test('de installatie laat het apparaat zijn eigen bestanden serveren, zonder proxy', () => {
  const provision = lees('provision-akkoordkast.sh');
  assert.doesNotMatch(provision, /nginx/, 'er hoort geen nginx in de installatie te zitten');
  assert.match(provision, /AmbientCapabilities=CAP_NET_BIND_SERVICE/);
  assert.match(provision, /Environment=PORT=/, 'de poort hoort in de systemd-unit te staan');
  assert.match(provision, /CAST_PYTHON=/, 'het pad naar de cast-hulp hoort in de unit te staan');
  assert.match(provision, /node:sqlite/, 'de installatie hoort node:sqlite te controleren');
});

test('de systemd-eenheid van de app is compleet en door systemd te lezen', () => {
  // Uit een echte installatie: "Failed to restart akkoordkast.service: Unit
  // akkoordkast.service has a bad unit file setting." De eenheid had geen ExecStart=, dus
  // de dienst startte nooit. systemd zelf zegt dan "Service has no ExecStart= ... Refusing."
  // Daarom laten we systemd-analyze hier meelezen in plaats van alleen naar de tekst te kijken.
  const tekst = lees('provision-akkoordkast.sh');
  const m = tekst.match(/cat > "\$UNIT" <<UNITEOF\n([\s\S]*?)\nUNITEOF/);
  assert.ok(m, 'geen systemd-eenheid gevonden in provision-akkoordkast.sh');
  const waarden = {
    GEBRUIKER: 'akkoordkast', APP_DIR: '/opt/akkoordkast', DATA_DIR: '/var/lib/akkoordkast',
    POORT: '80', MUZIEKMAP: '/home/akkoordkast/muziek',
  };
  let unit = m[1];
  for (const [naam, waarde] of Object.entries(waarden)) unit = unit.split('$' + naam).join(waarde);

  assert.match(unit, /^ExecStart=\/usr\/bin\/node \/opt\/akkoordkast\/server\.js$/m,
    'de eenheid start de app niet (ExecStart ontbreekt of wijst niet naar server.js)');
  assert.match(unit, /^WorkingDirectory=\/opt\/akkoordkast$/m, 'geen werkmap');
  assert.match(unit, /^User=/m, 'geen gebruiker: de dienst zou als root draaien');
  assert.match(unit, /MUSIC_DIR=/, 'de muziekmap wordt niet meegegeven');
  assert.match(unit, /AmbientCapabilities=CAP_NET_BIND_SERVICE/, 'geen recht om poort 80 te openen');
  assert.match(unit, /^WantedBy=multi-user\.target$/m, 'de dienst wordt niet mee gestart bij het opstarten');
  const nietIngevuld = unit.match(/\$[A-Z_]+\b/);
  assert.equal(nietIngevuld, null, 'een variabele is niet ingevuld: ' + (nietIngevuld || '')[0]);

  // En echt door systemd laten lezen.
  const eenheidPad = path.join(os.tmpdir(), 'akkoordkast-eenheid.service');
  fs.writeFileSync(eenheidPad, unit + '\n');
  let uit = '';
  try {
    uit = execFileSync('systemd-analyze', ['verify', eenheidPad], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (fout) {
    if (fout.code === 'ENOENT') return;   // geen systemd op deze machine: tekstuele controle is genoeg
    uit = String(fout.stdout || '') + String(fout.stderr || '');
  }
  assert.doesNotMatch(uit, /bad unit file setting|Refusing/, 'systemd keurt de eenheid af: ' + uit);
  fs.unlinkSync(eenheidPad);
});

test('de gezondheidscontrole eist de app-marker en een node-proces op de poort', () => {
  for (const naam of ['provision-akkoordkast.sh', 'update-from-github.sh']) {
    const tekst = lees(naam);
    assert.match(tekst, /x-akkoordkast/, `${naam}: controleert de app-marker niet`);
    assert.match(tekst, /grep -q node/, `${naam}: controleert niet of node op de poort luistert`);
    assert.doesNotMatch(tekst, /curl[^\n|]*\|\s*grep -q/, `${naam}: curl met pipefail en grep -q breekt op een gebroken pijp`);
  }
});

test('de scripts accepteren het container-id ook via bash -c (nummer in $0)', () => {
  // De documentatie zegt 'bash -c "$(curl ...)" <CTID>'. Dat zet het nummer in $0 en niet in
  // $1, terwijl alle drie de scripts $1 lazen: het id kwam nooit aan en de opdracht stopte met
  // 'Gebruik: bash provision-akkoordkast.sh <CTID>'. Daarom nu alle drie de vormen, en de
  // uitlezing echt uitgevoerd.
  for (const naam of ['provision-akkoordkast.sh', 'update-from-github.sh', 'check-akkoordkast.sh']) {
    const tekst = lees(naam);
    assert.match(tekst, /case "\$\{0:-\}" in/, `${naam}: $0 wordt niet bekeken`);
    assert.match(tekst, /\*\[!0-9\]\*/, `${naam}: een niet-cijferige $0 (de scriptnaam) wordt niet afgewezen`);
    assert.match(tekst, /CTID="\$\{1:-\$\{CTID:-\$KANDIDAAT0\}\}"/, `${naam}: leest niet alle drie de vormen`);
  }

  // En echt uitvoeren: dezelfde regels, op drie manieren aangeroepen.
  const bron = lees('provision-akkoordkast.sh');
  const van = bron.indexOf('# Het container-id kan');
  const tot = bron.indexOf('CTID="${1:-${CTID:-$KANDIDAAT0}}"', van) + 'CTID="${1:-${CTID:-$KANDIDAAT0}}"'.length;
  const stuk = bron.slice(van, tot) + '\necho "CTID=[$CTID]"\n';
  const echt = (args, env) => execFileSync('bash', args, {
    encoding: 'utf8', env: Object.assign({}, process.env, env || {}),
  }).trim();
  assert.equal(echt(['-c', stuk, '108']), 'CTID=[108]', 'het id uit $0 komt niet aan');
  assert.equal(echt(['-c', stuk], { CTID: '107' }), 'CTID=[107]', 'CTID= uit de omgeving komt niet aan');
  const tijdelijk = path.join(os.tmpdir(), 'akkoordkast-ctid.sh');
  fs.writeFileSync(tijdelijk, '#!/usr/bin/env bash\n' + stuk);
  assert.equal(echt([tijdelijk, '106']), 'CTID=[106]', 'het eerste argument komt niet aan');
  assert.equal(echt([tijdelijk]), 'CTID=[]', 'zonder id hoort er niets te staan');
  fs.unlinkSync(tijdelijk);
});

test('een NAS zonder schrijfrechten levert een alleen-lezen koppeling op', () => {
  // Uit een echte installatie: de NAS gaf de host geen schrijfrechten en het koppelscript
  // rolde daarop terug, waardoor de app bleef zeggen dat de map er niet was. Schrijven is
  // voor deze app niet nodig (hij leest de muziek en zet de omgekeerde audio in
  // /var/lib/akkoordkast), dus nu wordt de map alleen-lezen gekoppeld — met READONLY=nee
  // als je het oude gedrag wilt.
  const tekst = lees('nas-koppelen.sh');
  assert.match(tekst, /READONLY="\$\{READONLY:-\}"/, 'geen READONLY-schakelaar');
  assert.match(tekst, /nofail,ro,vers=3/, 'de alleen-lezen fstab-regel ontbreekt');
  assert.match(tekst, /SCHRIJFBAAR=0/, 'de schrijfbaarheid wordt niet bijgehouden');
  assert.match(tekst, /\[ "\$SCHRIJFBAAR" = "1" \] && ! pct exec/, 'de schrijftest in de container is niet gekoppeld aan SCHRIJFBAAR');
  assert.match(tekst, /FSTAB="\$\{FSTAB:-\/etc\/fstab\}"/, 'het fstab-pad is niet instelbaar, dus niet te testen');

  // En het gedrag echt uitvoeren: hetzelfde stukje script, met een map waarin niet
  // geschreven mag worden.
  const regels = tekst.split('\n');
  const start = regels.findIndex(r => r.includes('Lees- en schrijftest op de host'));
  const einde = regels.findIndex((r, i) => i > start && r.includes('opnieuw gekoppeld'));
  const slot = regels.findIndex((r, i) => i > einde && r === 'fi');
  assert.ok(start > 0 && slot > einde, 'kon het schrijfbaarheidsblok niet vinden');
  const blok = regels.slice(start, slot + 1).join('\n');

  const werk = fs.mkdtempSync(path.join(os.tmpdir(), 'akkoordkast-ro-'));
  const bin = path.join(werk, 'bin');
  fs.mkdirSync(bin);
  for (const naam of ['mount', 'umount', 'mountpoint']) {
    fs.writeFileSync(path.join(bin, naam), '#!/bin/sh\nexit 0\n');
    fs.chmodSync(path.join(bin, naam), 0o755);
  }
  const proefmap = path.join(werk, 'koppelpunt');
  const fstab = path.join(werk, 'fstab');

  const harnas = (readonly) => {
    fs.rmSync(proefmap, { recursive: true, force: true });
    fs.mkdirSync(proefmap);
    fs.chmodSync(proefmap, 0o555);            // hier mag een gewone gebruiker niet schrijven
    fs.writeFileSync(fstab, '192.168.1.100:/mnt/Nas/Nas-Opslag/Muziek ' + proefmap + ' nfs _netdev,nofail,vers=3,soft,timeo=100 0 0\n');
    const kop = [
      '#!/usr/bin/env bash',
      'zeg() { printf \'%s\\n\' "$*"; }',
      'fout() { printf \'%s\\n\' "$*" >&2; }',
      'terugrol() { echo "TERUGROL"; }',
      'HOST_MNT=' + proefmap,
      'NAS_PROTO=nfs',
      'NAS_HOST=192.168.1.100',
      'NAS_EXPORT=/mnt/Nas/Nas-Opslag/Muziek',
      'FSTAB=' + fstab,
      'FSTAB_BAK=' + fstab + '.bak',
      'FSTAB_REGEL="192.168.1.100:/mnt/Nas/Nas-Opslag/Muziek ' + proefmap + ' nfs _netdev,nofail,vers=3,soft,timeo=100 0 0"',
      'READONLY="' + (readonly || '') + '"',
    ].join('\n');
    const pad = path.join(werk, 'harnas-' + (readonly || 'leeg') + '.sh');
    fs.writeFileSync(pad, kop + '\n' + blok + '\necho "SCHRIJFBAAR=$SCHRIJFBAAR"\n');
    const env = Object.assign({}, process.env, { PATH: bin + ':' + process.env.PATH });
    let uit;
    try {
      uit = { code: 0, tekst: execFileSync('bash', [pad], { encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'] }) };
    } catch (fout2) {
      uit = { code: fout2.status, tekst: String(fout2.stdout || '') + String(fout2.stderr || '') };
    }
    return { uit, fstabInhoud: fs.readFileSync(fstab, 'utf8') };
  };

  // Als root schrijven de rechten niet tegen; dan slaan we het gedragsdeel over.
  fs.mkdirSync(path.join(werk, 'rechtenproef'));
  try {
    fs.chmodSync(path.join(werk, 'rechtenproef'), 0o555);
    fs.writeFileSync(path.join(werk, 'rechtenproef', 'x'), 'x');
    fs.rmSync(path.join(werk, 'rechtenproef'), { recursive: true, force: true });
    return;   // we draaien als root: alleen de tekstuele controle hierboven
  } catch (e) { /* gewone gebruiker: doorpakken */ }

  const automatisch = harnas('');
  assert.match(automatisch.uit.tekst, /alleen-lezen/, 'een onschrijfbare map levert geen alleen-lezen koppeling op');
  assert.match(automatisch.uit.tekst, /SCHRIJFBAAR=0/, 'de map blijft als schrijfbaar gemarkeerd');
  assert.doesNotMatch(automatisch.uit.tekst, /TERUGROL/, 'het script rolt nog terug op een onschrijfbare map');
  assert.match(automatisch.fstabInhoud, /nofail,ro,/, 'de fstab-regel is niet alleen-lezen gemaakt');

  const streng = harnas('nee');
  assert.match(streng.uit.tekst, /TERUGROL/, 'READONLY=nee rolt niet terug');
  assert.equal(streng.uit.code, 1, 'READONLY=nee hoort met een fout te eindigen');
  fs.rmSync(werk, { recursive: true, force: true });
});

test('de updater wacht lang genoeg en kan terugrollen', () => {
  const tekst = lees('update-from-github.sh');
  assert.match(tekst, /seq 1 60/, 'de wachttijd is te kort voor een langzame start');
  assert.match(tekst, /sleep 2/, 'de wachttijd tussen pogingen ontbreekt');
  assert.match(tekst, /APP_DIR\.bak/, 'geen reservekopie voor terugrollen');
  assert.match(tekst, /cmp -s/, 'de updater controleert niet of de nieuwe bestanden geserveerd worden');
  assert.match(tekst, /Cache-Control: no-cache/);
});

test('de updater en de installer raken de database en de media niet aan', () => {
  for (const naam of ['install.sh', 'update-from-github.sh']) {
    const tekst = lees(naam);
    assert.doesNotMatch(tekst, /rm -rf \/var\/lib\/akkoordkast/, `${naam} mag de gegevensmap niet wissen`);
  }
});

test('er is een alleen-lezen diagnose-script met een Wat nu-blok', () => {
  const tekst = lees('check-akkoordkast.sh');
  assert.match(tekst, /Alleen-lezen/);
  assert.match(tekst, /Wat nu\?/);
  assert.match(tekst, /node:sqlite/);
  // alleen de regels die het script echt uitvoert mogen niets veranderen
  const uitgevoerd = tekst.split('\n').filter(r => /^\s*binnen\s/.test(r)).join('\n');
  assert.ok(uitgevoerd.length > 100, 'geen binnen-opdrachten gevonden');
  assert.doesNotMatch(uitgevoerd, /rm -rf/);
  assert.doesNotMatch(uitgevoerd, /systemctl restart/);
  assert.doesNotMatch(uitgevoerd, /systemctl stop/);
  assert.doesNotMatch(uitgevoerd, /pip install/);
});

test('de bestandslijsten-checker van het deploygereedschap is groen', () => {
  const uit = execFileSync('python3', [path.join(WORTEL, 'scripts', 'check-deploy-file-lists.py')],
    { cwd: WORTEL, encoding: 'utf8' });
  assert.doesNotMatch(uit, /FOUT|fout:/i, uit);
  assert.match(uit, /ok|OK|geen probleem/i);
});

test('elke liedjes-dataset staat in de index en in alle installatielijsten', () => {
  const wortel = path.join(__dirname, '..');
  const index = JSON.parse(fs.readFileSync(path.join(wortel, 'song-data', 'datasets.json'), 'utf8'));
  const inIndex = index.datasets.map(d => d.bestand.replace(/^song-data\//, ''));
  const opSchijf = fs.readdirSync(path.join(wortel, 'song-data'))
    .filter(n => n.endsWith('.json'))
    .filter(n => !/^manifest|^datasets\.json$|^SPEC/i.test(n))
    .sort();
  assert.deepEqual(inIndex.slice().sort(), opSchijf, 'de index dekt niet alle datasets');

  const scripts = ['install.sh', 'provision-akkoordkast.sh', 'update-from-github.sh'];
  for (const naam of scripts) {
    const bron = fs.readFileSync(path.join(wortel, 'deploy', 'proxmox', naam), 'utf8');
    for (const bestand of opSchijf.concat(['datasets.json'])) {
      assert.ok(bron.includes('song-data/' + bestand), naam + ' mist song-data/' + bestand);
    }
  }

  // en de app laadt precies de datasets uit de index
  const bron = require('../liedjes-bron');
  const geladen = bron.perBestand().map(b => b.bestand).sort();
  assert.deepEqual(geladen, opSchijf, 'de app laadt niet de datasets uit de index');
});
