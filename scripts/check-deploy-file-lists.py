#!/usr/bin/env python3
"""Check the file lists in a project's deploy scripts.

A quoted `FILES=(...)` array is easy to corrupt by patching: an edit that consumes a closing
quote keeps the line's quote count even, `bash -n` stays clean, and two names ride as one
element. The failure only shows on the host as `curl: (3) URL rejected: Malformed input to a
URL function` next to `Download mislukt: a.json b.json`. This script asserts the semantics:

  * every deploy script passes `bash -n`;
  * every element of the file list is ONE path, containing no space;
  * every element exists in the repository;
  * with --remote, every element answers HTTP 200 on the raw URL the script builds.

Usage:
  python3 check-deploy-file-lists.py [--repo DIR] [--deploy DIR] [--remote]

Exit code 0 = all lists are sound; 1 = at least one problem (printed with the script and the
offending element). Run it before pushing a change that touches any deploy script.

Werkt met twee stijlen: één `FILES=(...)`-array en verspreide arrays die in een
push-lus worden gebruikt (`for f in "${RUNTIME[@]}"; do pct push ...`). De array
wordt dan uitgeklapt zodat de namen zelf getoetst worden.
"""
import argparse
import re
import shlex
import subprocess
import sys
import time
import urllib.request
from pathlib import Path


# --- reading the lists --------------------------------------------------------------------

def bash_syntax_ok(pad: Path) -> str | None:
    """Return the syntax error, or None when the script parses."""
    uit = subprocess.run(['bash', '-n', str(pad)], capture_output=True, text=True)
    return None if uit.returncode == 0 else (uit.stderr.strip() or 'bash -n faalde')


def arrays(pad: Path) -> dict[str, list[str]]:
    """Elke `NAAM=(...)`-array uit een script, zodat `${NAAM[@]}` uitgeklapt kan worden."""
    tekst = pad.read_text()
    uit = {}
    for treffer in re.finditer(r'^([A-Za-z_][A-Za-z0-9_]*)=\((.*?)^\)[ ]*$', tekst, re.S | re.M):
        uit[treffer.group(1)] = shlex.split(treffer.group(2).replace('\\\n', ' '), comments=True)
    return uit


def klap_uit(body: str, bekend: dict[str, list[str]]) -> str:
    for naam, waarden in bekend.items():
        vervanging = ' '.join(waarden)
        body = body.replace('"${%s[@]}"' % naam, vervanging).replace('${%s[@]}' % naam, vervanging)
    return body


def bestandslijsten(pad: Path) -> list[list[str]]:
    """Every file list in a deploy script: the FILES array and any `for f in …; do pct push` loop."""
    tekst = pad.read_text()
    lijsten = []
    bekend = arrays(pad)
    for treffer in re.finditer(r'^FILES=\((.*?)^\)[ ]*$', tekst, re.S | re.M):
        lijsten.append(shlex.split(klap_uit(treffer.group(1).replace('\\\n', ' '), bekend), comments=True))
    # De lus moet op één regel staan; anders slokt de regex de tussenliggende code op.
    for treffer in re.finditer(r'for f in ([^\n]*); do[^\n]*pct push', tekst):
        lijsten.append(shlex.split(klap_uit(treffer.group(1), bekend), comments=True))
    return lijsten


def aangeroepen_bestanden(pad: Path) -> list[str]:
    """De scripts die dit script zelf uitvoert uit de map die het net gevuld heeft.

    `install.sh` roept `bash "$TARGET_DIR/deploy/proxmox/...sh"` aan. Staat zo'n bestand
    niet in zijn eigen FILES-lijst, dan valt dat pas op de host op met
    "No such file or directory" — precies de fout die deze controle moet voorkomen.
    """
    uit = []
    for regel in pad.read_text().split('\n'):
        if regel.lstrip().startswith('#'):   # commentaar noemt de aanroep als voorbeeld
            continue
        uit += [t.group(1) for t in
                re.finditer(r'\bbash\s+"?\$\{?(?:TARGET_DIR|STAGING)\}?/([\w./-]+)"?', regel)]
    return uit


def naar_repo_pad(element: str) -> str:
    """Strip the shell prefixes a list may carry so the element can be tested against the repo."""
    return re.sub(r'^\$\{?APP_DIR\}?/', '', element).strip('"')


def _waarde(tekst: str, naam: str) -> str | None:
    """The value of a shell assignment, with `${VAR:-default}` resolved to its default."""
    treffer = re.search(rf'^{naam}=(.*)$', tekst, re.M)
    if not treffer:
        return None
    waarde = treffer.group(1).strip().strip('"').strip("'")
    binnen = re.fullmatch(r'\$\{[^:}]+:-([^}]*)\}', waarde)
    return (binnen.group(1) if binnen else waarde).strip() or None


def raw_basis(pad: Path) -> str | None:
    """Resolve the RAW base URL a script builds its download URLs from."""
    tekst = pad.read_text()
    naam = _waarde(tekst, 'REPO_NAAM') or _waarde(tekst, 'REPO')
    eigenaar = _waarde(tekst, 'REPO_OWNER')
    branch = _waarde(tekst, 'BRANCH') or 'main'
    if not naam:
        return None
    if eigenaar and '/' not in naam:
        naam = f'{eigenaar}/{naam}'
    if '/' not in naam:
        return None
    return f'https://raw.githubusercontent.com/{naam}/{branch}'


# --- the checks ---------------------------------------------------------------------------

def controleer(repo: Path, deploy: Path, remote: bool) -> int:
    fouten = []
    gezien = 0
    for pad in sorted(deploy.glob('*.sh')):
        fout = bash_syntax_ok(pad)
        if fout:
            fouten.append(f'{pad.name}: bash -n faalt\n    {fout}')
        basis = raw_basis(pad) if remote else None
        alle_lijsten = bestandslijsten(pad)
        opgehaald = {naar_repo_pad(el) for lijst in alle_lijsten for el in lijst}
        for rel in aangeroepen_bestanden(pad):
            if rel not in opgehaald:
                fouten.append(f'{pad.name}: roept {rel} aan maar haalt het niet op (zet het in FILES)')
        for lijst in alle_lijsten:
            if not lijst:
                continue
            gezien += len(lijst)
            for element in lijst:
                if ' ' in element:
                    fouten.append(f'{pad.name}: element met een spatie -> "{element}" (namen aan elkaar geplakt)')
                    continue
                rel = naar_repo_pad(element)
                if rel.startswith('$') or not (repo / rel).exists():
                    fouten.append(f'{pad.name}: element bestaat niet in de repo -> {element}')
                    continue
                if basis:
                    url = f'{basis}/{rel}?cb={int(time.time())}'
                    try:
                        with urllib.request.urlopen(
                                urllib.request.Request(url, headers={'User-Agent': 'check-deploy-file-lists'}), timeout=45) as antwoord:
                            if antwoord.status != 200:
                                fouten.append(f'{pad.name}: {element} gaf HTTP {antwoord.status}')
                    except Exception as fout2:  # noqa: BLE001 - elk netwerkprobleem is een fout hier
                        fouten.append(f'{pad.name}: {element} niet op te halen ({fout2})')
    if fouten:
        print(f'{len(fouten)} probleem(en) in de bestandslijsten:')
        for fout in fouten:
            print('  -', fout)
        return 1
    print(f'ok: {gezien} bestandsnamen in {len(list(deploy.glob("*.sh")))} scripts, geen spaties, alles aanwezig'
          + (' en HTTP 200 op de ruwe URL' if remote else ''))
    return 0


def main() -> int:
    ontvanger = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ontvanger.add_argument('--repo', default='.', help='projectmap (default: huidige map)')
    ontvanger.add_argument('--deploy', default=None, help='map met de deploy-scripts (default: <repo>/deploy/proxmox)')
    ontvanger.add_argument('--remote', action='store_true', help='ook elke ruwe URL op HTTP 200 controleren')
    keuzes = ontvanger.parse_args()
    repo = Path(keuzes.repo).resolve()
    deploy = Path(keuzes.deploy).resolve() if keuzes.deploy else repo / 'deploy' / 'proxmox'
    if not deploy.is_dir():
        print(f'geen deploy-map gevonden: {deploy}', file=sys.stderr)
        return 1
    return controleer(repo, deploy, keuzes.remote)


if __name__ == '__main__':
    sys.exit(main())
