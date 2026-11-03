#!/usr/bin/env python3
"""Schermafbeeldingen van AkkoordKast maken met headless Chromium (CDP).

Chromium moet draaien met --remote-debugging-port=9226. De app moet draaien op
het adres dat je meegeeft (standaard http://127.0.0.1:8091) tegen een demo-database.

    python3 scripts/screenshots.py --basis http://127.0.0.1:8091 --doel docs/img
"""
import argparse
import os
import pathlib
import sys
import time

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from importlib import machinery  # noqa: E402

lader = machinery.SourceFileLoader('cdpclient', str(pathlib.Path(__file__).parent / 'cdp-client.py'))
cdp = lader.load_module()

PORTAAL = 9226


def tab(browser_url):
    b = cdp.CDP(cdp.maak_tab(PORTAAL, browser_url))
    b.call('Page.enable')
    b.call('Runtime.enable')
    return b


def schone_schil(b):
    """Service worker en caches wissen en opnieuw laden.

    Zonder dit serveert de service worker de oude app-schil uit de cache en lijkt
    een pagina die je net hebt aangepast onveranderd: elke schermafbeelding wordt
    dan de vorige versie.
    """
    b.js("(async()=>{ if(navigator.serviceWorker){ const rs=await navigator.serviceWorker.getRegistrations(); "
         "for(const r of rs){ await r.unregister(); } } if(window.caches){ const ks=await caches.keys(); "
         "for(const k of ks){ await caches.delete(k); } } return 'schoon'; })()")
    b.call('Page.reload', {'ignoreCache': True})
    wacht(b, 2.0)


def zet_formaat(b, breedte, hoogte):
    b.call('Emulation.setDeviceMetricsOverride',
           {'width': breedte, 'height': hoogte, 'deviceScaleFactor': 1, 'mobile': breedte < 700})
    b.call('Network.setCacheDisabled', {'cacheDisabled': True})


def wacht(b, seconden=1.2):
    b.call('Runtime.evaluate', {'expression': 'new Promise(r=>setTimeout(r,%d))' % int(seconden * 1000),
                                'awaitPromise': True})


def klik(b, selector):
    return b.js("(()=>{const el=document.querySelector(%r); if(!el) return 'ontbreekt'; el.click(); return 'ok';})()" % selector)


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--basis', default='http://127.0.0.1:8091')
    p.add_argument('--doel', default='docs/img')
    p.add_argument('--liedje', default='', help='id van het liedje dat op de speelpagina komt')
    args = p.parse_args()
    doel = pathlib.Path(args.doel)
    doel.mkdir(parents=True, exist_ok=True)

    b = tab(args.basis + '/')
    zet_formaat(b, 1440, 900)
    schone_schil(b)
    wacht(b, 1.0)

    # --- desktop: liedjes ---
    b.js("document.getElementById('zoek').value='';")
    klik(b, '#filter-wis')
    wacht(b, 1.5)
    print('liedjes op de pagina:', b.js("document.querySelectorAll('#liedlijst .lied').length"))
    b.schermafbeelding(str(doel / 'liedjes-desktop.png'), {'x': 0, 'y': 0, 'width': 1440, 'height': 900, 'scale': 1})

    # --- desktop: liedje spelen ---
    if args.liedje:
        b.js("window.scrollTo(0,0); openLiedje(%s);" % args.liedje)
    else:
        klik(b, '#liedlijst .lied [data-open]')
    wacht(b, 2.0)
    b.js("document.getElementById('beluister').click();")
    wacht(b, 6.0)
    print('speelpagina titel:', b.js("(document.querySelector('#spelen-inhoud h2')||{}).textContent"))
    b.schermafbeelding(str(doel / 'spelen-desktop.png'), {'x': 0, 'y': 0, 'width': 1440, 'height': 900, 'scale': 1})
    # grepen + bladmuziek apart, zodat de afbeelding details laat zien
    grepen = b.js("(()=>{const el=document.querySelector('.grepen'); if(!el) return null; const r=el.getBoundingClientRect(); return {x:r.left+scrollX,y:r.top+scrollY,width:r.width,height:r.height};})()")
    if grepen and grepen.get('height'):
        b.js("(()=>{const el=document.querySelector('.grepen'); window.scrollTo(0, el.getBoundingClientRect().top+scrollY-90);})()")
        wacht(b, 0.6)
        b.schermafbeelding(str(doel / 'grepen-desktop.png'), {'x': 0, 'y': 0, 'width': 1440, 'height': 900, 'scale': 1})

    # --- desktop: toevoegen ---
    klik(b, '#tab-toevoegen')
    wacht(b, 0.8)
    b.schermafbeelding(str(doel / 'toevoegen-desktop.png'), {'x': 0, 'y': 0, 'width': 1440, 'height': 900, 'scale': 1})

    # --- desktop: casten ---
    klik(b, '#tab-casten')
    wacht(b, 1.0)
    b.schermafbeelding(str(doel / 'casten-desktop.png'), {'x': 0, 'y': 0, 'width': 1440, 'height': 900, 'scale': 1})

    print('paginafouten desktop:', b.fouten())

    # --- telefoon ---
    t = tab(args.basis + '/')
    zet_formaat(t, 390, 844)
    schone_schil(t)
    wacht(t, 1.0)
    klik(t, '#filter-wis')
    wacht(t, 1.5)
    print('overflow telefoon (moet 0 zijn):', t.js(
        "(()=>{const b=document.documentElement; const over=[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>window.innerWidth+1); return {scrollWidth:b.scrollWidth, venster:window.innerWidth, over: over.slice(0,5).map(e=>e.id||e.className)};})()"))
    t.schermafbeelding(str(doel / 'liedjes-telefoon.png'), {'x': 0, 'y': 0, 'width': 390, 'height': 844, 'scale': 1})
    if args.liedje:
        t.js("window.scrollTo(0,0); openLiedje(%s);" % args.liedje)
    else:
        klik(t, '#liedlijst .lied [data-open]')
    wacht(t, 2.0)
    t.schermafbeelding(str(doel / 'spelen-telefoon.png'), {'x': 0, 'y': 0, 'width': 390, 'height': 844, 'scale': 1})
    t.js("(()=>{const el=document.querySelector('.songtekst'); if(el) window.scrollTo(0, el.getBoundingClientRect().top+scrollY-80);})()")
    wacht(t, 0.6)
    t.schermafbeelding(str(doel / 'bladmuziek-telefoon.png'), {'x': 0, 'y': 0, 'width': 390, 'height': 844, 'scale': 1})
    klik(t, '#tab-casten')
    wacht(t, 1.0)
    t.schermafbeelding(str(doel / 'casten-telefoon.png'), {'x': 0, 'y': 0, 'width': 390, 'height': 844, 'scale': 1})
    print('paginafouten telefoon:', t.fouten())
    print('geschreven naar', doel.resolve())


if __name__ == '__main__':
    main()
