#!/usr/bin/env python3
"""Proef van de upload: een mp3 (of mp4) uploaden en kijken wat de app herkent.

    python3 scripts/upload-proef.py --basis http://127.0.0.1:8091 --bestand "/tmp/Mijn Proefliedje.mp3" --doel /tmp/up
"""
import argparse
import pathlib
import sys
import time

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from importlib import machinery  # noqa: E402

lader = machinery.SourceFileLoader('cdpclient', str(pathlib.Path(__file__).parent / 'cdp-client.py'))
cdp = lader.load_module()

PORTAAL = 9226


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--basis', default='http://127.0.0.1:8091')
    p.add_argument('--bestand', required=True)
    p.add_argument('--titel', default='')
    p.add_argument('--doel', default='/tmp/up')
    args = p.parse_args()
    doel = pathlib.Path(args.doel)
    doel.mkdir(parents=True, exist_ok=True)

    b = cdp.CDP(cdp.maak_tab(PORTAAL, args.basis + '/'))
    b.call('Page.enable')
    b.call('Runtime.enable')
    b.call('DOM.enable')
    b.js("(async()=>{ if(navigator.serviceWorker){const rs=await navigator.serviceWorker.getRegistrations(); for(const r of rs){await r.unregister();}} if(window.caches){const ks=await caches.keys(); for(const k of ks){await caches.delete(k);}}})()")
    b.call('Page.reload', {'ignoreCache': True})
    b.call('Runtime.evaluate', {'expression': 'new Promise(r=>setTimeout(r,2000))', 'awaitPromise': True})
    b.call('Emulation.setDeviceMetricsOverride',
           {'width': 1280, 'height': 940, 'deviceScaleFactor': 1, 'mobile': False})

    b.js("document.getElementById('tab-toevoegen').click();")
    b.call('Runtime.evaluate', {'expression': 'new Promise(r=>setTimeout(r,600))', 'awaitPromise': True})
    if args.titel:
        b.js("document.getElementById('upload-titel').value=%r" % args.titel)

    document = b.call('DOM.getDocument', {'depth': -1})
    knoop = b.call('DOM.querySelector', {'nodeId': document['root']['nodeId'], 'selector': '#upload-bestand'})
    b.call('DOM.setFileInputFiles', {'files': [str(pathlib.Path(args.bestand).resolve())], 'nodeId': knoop['nodeId']})
    print('bestand gekozen:', pathlib.Path(args.bestand).name)

    b.js("document.getElementById('upload-start').click();")
    for i in range(60):
        b.call('Runtime.evaluate', {'expression': 'new Promise(r=>setTimeout(r,1000))', 'awaitPromise': True})
        klaar = b.js("(()=>{const el=document.getElementById('upload-uitkomst'); return el && !el.hidden;})()")
        melding = b.js("document.getElementById('upload-melding').textContent")
        if klaar or (melding and 'mislukt' in str(melding).lower()):
            break
    print('melding:', b.js("document.getElementById('upload-melding').textContent"))
    print('uitkomst zichtbaar:', b.js("(()=>{const el=document.getElementById('upload-uitkomst'); return el && !el.hidden;})()"))
    print('herkend:', b.js("(()=>{const el=document.getElementById('upload-uitkomst'); return el ? el.textContent.slice(0,400) : 'geen';})()"))
    b.js("window.scrollTo(0,0);")
    b.call('Runtime.evaluate', {'expression': 'new Promise(r=>setTimeout(r,300))', 'awaitPromise': True})
    b.schermafbeelding(str(doel / 'upload-herkend.png'))

    if b.js("(()=>{return !!document.getElementById('upload-open');})()"):
        b.js("document.getElementById('upload-open').click();")
        b.call('Runtime.evaluate', {'expression': 'new Promise(r=>setTimeout(r,2500))', 'awaitPromise': True})
        print('geopend liedje:', b.js("(document.querySelector('#spelen-inhoud h2')||{}).textContent"))
        print('tijdlijn geladen:', b.js("(()=>{return !!document.querySelector('.nb-noot, #mees-notenbalk svg');})()"))
        b.js("document.getElementById('mees-start').click();")
        b.call('Runtime.evaluate', {'expression': 'new Promise(r=>setTimeout(r,2500))', 'awaitPromise': True})
        print('eigen opname actief:', b.js("(()=>{const a=document.getElementById('mees-audio'); return a ? a.src.split('/').pop() : 'geen';})()"))
        print('tijd:', b.js("Math.round(document.getElementById('mees-audio').currentTime*100)/100"),
              'akkoord:', b.js("document.getElementById('mees-akkoord').textContent"))
        b.js("(()=>{const el=document.querySelector('.mees-beeld'); if(el) window.scrollTo(0, el.getBoundingClientRect().top+scrollY-140);})()")
        b.call('Runtime.evaluate', {'expression': 'new Promise(r=>setTimeout(r,600))', 'awaitPromise': True})
        b.schermafbeelding(str(doel / 'meespelen-opname.png'))
    print('paginafouten:', b.fouten())
    print('geschreven naar', doel.resolve())


if __name__ == '__main__':
    main()
