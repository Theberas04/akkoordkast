#!/usr/bin/env python3
"""Proef van het scherm 'een hele muziekmap in één keer'.

    python3 scripts/scan-proef.py --basis http://127.0.0.1:8091 --map /tmp/muziekmap2 --doel /tmp/scan

Maakt twee schermafbeeldingen: de map met wat erin zit, en het resultaat na het omzetten.
"""
import argparse
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from importlib import machinery  # noqa: E402

lader = machinery.SourceFileLoader('cdpclient', str(pathlib.Path(__file__).parent / 'cdp-client.py'))
cdp = lader.load_module()

PORTAAL = 9226


def wacht(b, seconden):
    b.call('Runtime.evaluate', {'expression': 'new Promise(r=>setTimeout(r,%d))' % int(seconden * 1000), 'awaitPromise': True})


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--basis', default='http://127.0.0.1:8091')
    p.add_argument('--map', required=True)
    p.add_argument('--doel', default='/tmp/scan')
    args = p.parse_args()
    doel = pathlib.Path(args.doel)
    doel.mkdir(parents=True, exist_ok=True)

    b = cdp.CDP(cdp.maak_tab(PORTAAL, args.basis + '/'))
    b.call('Page.enable')
    b.call('Runtime.enable')
    b.js("(async()=>{ if(navigator.serviceWorker){const rs=await navigator.serviceWorker.getRegistrations(); for(const r of rs){await r.unregister();}} if(window.caches){const ks=await caches.keys(); for(const k of ks){await caches.delete(k);}}})()")
    b.call('Page.reload', {'ignoreCache': True})
    wacht(b, 2.5)
    b.call('Emulation.setDeviceMetricsOverride', {'width': 1180, 'height': 1080, 'deviceScaleFactor': 1, 'mobile': False})

    # naar het tabblad Toevoegen
    b.js("(()=>{const k=[...document.querySelectorAll('.tab')].find(e=>/toevoegen/i.test(e.textContent)); if(k) k.click();})()")
    wacht(b, 1.0)
    b.js("document.getElementById('scan-map').value=%r;" % args.map)
    b.js("document.getElementById('scan-kijk').click();")
    wacht(b, 3.0)
    print('melding na kijken:', b.js("document.getElementById('scan-melding').textContent"))
    b.js("(()=>{const el=document.getElementById('scan-map'); window.scrollTo(0, el.getBoundingClientRect().top+window.scrollY-180);})()")
    wacht(b, 0.8)
    # geen clip: bij een sticky kop geeft een uitgesneden opname een spookbalk midden in het beeld
    b.schermafbeelding(str(doel / 'muziekmap-gevonden.png'))

    b.js("document.getElementById('scan-start').click();")
    for _ in range(40):
        wacht(b, 2.0)
        tekst = b.js("document.getElementById('scan-melding').textContent || ''")
        if 'Klaar' in tekst:
            break
    print('melding na omzetten:', b.js("document.getElementById('scan-melding').textContent"))
    print('regels in de lijst:', b.js("document.querySelectorAll('#scan-lijst .scan-regel').length"))
    # de app springt na het omzetten naar de liedjeslijst; terug naar Toevoegen voor het beeld
    b.js("document.getElementById('tab-toevoegen').click();")
    wacht(b, 1.0)
    b.js("(()=>{const el=document.getElementById('scan-lijst'); window.scrollTo(0, el.getBoundingClientRect().top+window.scrollY-330);})()")
    wacht(b, 1.0)
    b.schermafbeelding(str(doel / 'muziekmap-klaar.png'))
    print('paginafouten:', b.fouten())
    print('geschreven naar', doel.resolve())


if __name__ == '__main__':
    main()
