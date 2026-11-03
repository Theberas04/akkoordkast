#!/usr/bin/env python3
"""Proef van de meespeelmodus: laat de pagina echt meespelen en lees de toestand uit.

Chromium moet draaien met --remote-debugging-port=9226 en het magisch afspelen van
geluid moet toegestaan zijn (--autoplay-policy=no-user-gesture-required), anders
start de audio nooit zonder klik.

    python3 scripts/meespelen-proef.py --basis http://127.0.0.1:8092 --liedje 1 --doel /tmp/mees
"""
import argparse
import pathlib
import sys

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


def wacht(b, seconden=1.0):
    b.call('Runtime.evaluate', {'expression': 'new Promise(r=>setTimeout(r,%d))' % int(seconden * 1000),
                                'awaitPromise': True})


def toestand(b):
    return b.js("""(()=>{
      const q = s => document.querySelector(s);
      const uit = {
        akkoord: q('#mees-akkoord') ? q('#mees-akkoord').textContent : null,
        vorm: q('#mees-vorm') ? q('#mees-vorm').textContent : null,
        noot: q('#mees-noot') ? q('#mees-noot').textContent : null,
        volgende: q('#mees-volgende') ? q('#mees-volgende').textContent : null,
        tijd: q('#mees-audio') ? Math.round(q('#mees-audio').currentTime*100)/100 : null,
        duur: q('#mees-audio') ? Math.round(q('#mees-audio').duration*100)/100 : null,
        afspelen: q('#mees-audio') ? !q('#mees-audio').paused : null,
        cursor: q('#mees-cursor') ? q('#mees-cursor').getAttribute('x1') : null,
        aftellen: q('#mees-aftel') && !q('#mees-aftel').hidden,
        tellen: [...document.querySelectorAll('.mees-tel.aan')].map(e=>e.textContent),
        noten_aan: [...document.querySelectorAll('.nb-noot.aan')].map(e=>e.getAttribute('data-noot')),
        tab_aan: [...document.querySelectorAll('.tabcel.aan')].map(e=>e.textContent),
        grepen_aan: [...document.querySelectorAll('.grepen figure.klinkt')].map(e=>e.getAttribute('data-akkoord')),
        akkoorden_klad: [...document.querySelectorAll('#songtekst .seg .ak.klinkt')].length,
        hals_aan: [...document.querySelectorAll('#mees-hals [data-snaar].klinkt')].length,
        notenbalk_breedte: q('#mees-notenbalk svg') ? q('#mees-notenbalk svg').getAttribute('width') : null,
        noten_in_balk: document.querySelectorAll('.nb-noot').length,
        tabmaten: document.querySelectorAll('.tabmaat').length,
        melding: q('#mees-melding') ? q('#mees-melding').textContent : null
      };
      return uit;
    })()""")


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--basis', default='http://127.0.0.1:8092')
    p.add_argument('--liedje', default='1')
    p.add_argument('--doel', default='/tmp/mees')
    p.add_argument('--momenten', default='0.6,2.0,3.5,5.0,7.0')
    args = p.parse_args()
    doel = pathlib.Path(args.doel)
    doel.mkdir(parents=True, exist_ok=True)

    b = tab(args.basis + '/')
    b.call('Emulation.setDeviceMetricsOverride',
           {'width': 1440, 'height': 980, 'deviceScaleFactor': 1, 'mobile': False})
    b.call('Network.setCacheDisabled', {'cacheDisabled': True})
    b.js("(async()=>{ if(navigator.serviceWorker){ const rs=await navigator.serviceWorker.getRegistrations(); for(const r of rs){ await r.unregister(); } } if(window.caches){ const ks=await caches.keys(); for(const k of ks){ await caches.delete(k); } } })()")
    b.call('Page.reload', {'ignoreCache': True})
    wacht(b, 2.0)
    b.js("window.scrollTo(0,0); openLiedje(%s);" % args.liedje)
    wacht(b, 2.5)
    print('titel:', b.js("(document.querySelector('#spelen-inhoud h2')||{}).textContent"))
    print('klik Meespelen:', b.js("(()=>{const el=document.getElementById('mees-start'); if(!el) return 'ontbreekt'; el.click(); return 'ok';})()"))
    wacht(b, 2.0)

    vorige = None
    for i, moment in enumerate([float(x) for x in args.momenten.split(',')]):
        wacht(b, moment if i == 0 else moment - float(args.momenten.split(',')[i - 1]))
        t = toestand(b)
        print('t=%s' % t.get('tijd'), t)
        b.js("(()=>{const el=document.querySelector('.mees-beeld'); if(el) window.scrollTo(0, el.getBoundingClientRect().top+scrollY-150);})()")
        wacht(b, 0.2)
        b.schermafbeelding(str(doel / ('meespelen-%d.png' % i)), {'x': 0, 'y': 0, 'width': 1440, 'height': 980, 'scale': 1})
        vorige = t
    print('paginafouten:', b.fouten())
    print('geschreven naar', doel.resolve())


if __name__ == '__main__':
    main()
