#!/usr/bin/env python3
"""Proef van de Spotify-koppeling in de browser: laadt de speler echt?

    python3 scripts/spotify-proef.py --basis http://127.0.0.1:8091 --liedje 1 --link https://open.spotify.com/playlist/...
"""
import argparse
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from importlib import machinery  # noqa: E402

lader = machinery.SourceFileLoader('cdpclient', str(pathlib.Path(__file__).parent / 'cdp-client.py'))
cdp = lader.load_module()

PORTAAL = 9226


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--basis', default='http://127.0.0.1:8091')
    p.add_argument('--liedje', default='1')
    p.add_argument('--link', required=True)
    p.add_argument('--doel', default='/tmp/sp')
    args = p.parse_args()
    doel = pathlib.Path(args.doel)
    doel.mkdir(parents=True, exist_ok=True)

    b = cdp.CDP(cdp.maak_tab(PORTAAL, args.basis + '/'))
    b.call('Page.enable')
    b.call('Runtime.enable')
    b.js("(async()=>{ if(navigator.serviceWorker){const rs=await navigator.serviceWorker.getRegistrations(); for(const r of rs){await r.unregister();}} if(window.caches){const ks=await caches.keys(); for(const k of ks){await caches.delete(k);}}})()")
    b.call('Page.reload', {'ignoreCache': True})
    b.call('Runtime.evaluate', {'expression': 'new Promise(r=>setTimeout(r,2000))', 'awaitPromise': True})
    b.call('Emulation.setDeviceMetricsOverride',
           {'width': 1280, 'height': 1000, 'deviceScaleFactor': 1, 'mobile': False})

    b.js("openLiedje(%s);" % args.liedje)
    b.call('Runtime.evaluate', {'expression': 'new Promise(r=>setTimeout(r,3000))', 'awaitPromise': True})
    print('titel:', b.js("(document.querySelector('#spelen-inhoud h2')||{}).textContent"))
    b.js("document.getElementById('spotify-link').value=%r;" % args.link)
    b.js("document.getElementById('spotify-koppel').click();")
    for _ in range(20):
        b.call('Runtime.evaluate', {'expression': 'new Promise(r=>setTimeout(r,500))', 'awaitPromise': True})
        klaar = b.js("document.querySelectorAll('#spotify-speler iframe').length")
        if klaar:
            break
    print('melding:', b.js("document.getElementById('spotify-melding').textContent"))
    print('iframe aanwezig:', b.js("document.querySelectorAll('#spotify-speler iframe').length"))
    print('iframe src:', b.js("(()=>{const f=document.querySelector('#spotify-speler iframe'); return f ? f.src : 'geen';})()"))
    print('iFrame-API geladen:', b.js("typeof window.SpotifyIframeApi"))
    print('controller:', b.js("!!window.SPOTIFY && !!SPOTIFY.controller"))
    print('koppeling in het liedje:', b.js("document.getElementById('spotify-link').value"))
    b.js("(()=>{const el=document.getElementById('spotify-speler'); if(el) window.scrollTo(0, el.getBoundingClientRect().top+scrollY-200);})()")
    b.call('Runtime.evaluate', {'expression': 'new Promise(r=>setTimeout(r,1500))', 'awaitPromise': True})
    b.schermafbeelding(str(doel / 'spotify-blok.png'))
    print('paginafouten:', b.fouten())
    print('geschreven naar', doel.resolve())


if __name__ == '__main__':
    main()
