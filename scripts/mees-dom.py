#!/usr/bin/env python3
"""Kijkt in de levende pagina naar de meespeelweergave (tab, notenbalk, hals).

    python3 scripts/mees-dom.py --basis http://127.0.0.1:8092 --liedje 1
"""
import argparse
import sys

sys.path.insert(0, 'scripts')
from importlib import machinery  # noqa: E402

cdp = machinery.SourceFileLoader('cdpclient', 'scripts/cdp-client.py').load_module()
PORTAAL = 9226


def wacht(b, s):
    b.call('Runtime.evaluate', {'expression': 'new Promise(r=>setTimeout(r,%d))' % int(s * 1000), 'awaitPromise': True})


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--basis', default='http://127.0.0.1:8092')
    p.add_argument('--liedje', default='1')
    p.add_argument('--meespelen', action='store_true', help='ook op Meespelen klikken')
    args = p.parse_args()

    b = cdp.CDP(cdp.maak_tab(PORTAAL, args.basis + '/'))
    b.call('Page.enable')
    b.call('Runtime.enable')
    # de service worker serveert anders de oude app-schil uit zijn cache
    b.js("(async()=>{ if(navigator.serviceWorker){ const rs=await navigator.serviceWorker.getRegistrations(); for(const r of rs){ await r.unregister(); } } if(window.caches){ const ks=await caches.keys(); for(const k of ks){ await caches.delete(k); } } })()")
    b.call('Page.reload', {'ignoreCache': True})
    wacht(b, 2.0)
    print('geladen:', b.js("document.readyState + ' / ' + typeof openLiedje"))
    b.js("window.scrollTo(0,0); openLiedje(%s);" % args.liedje)
    for _ in range(10):
        wacht(b, 0.5)
        aantal = b.js("document.querySelectorAll('.tabmaat').length")
        if aantal:
            break
    print('tabmaten:', b.js("document.querySelectorAll('.tabmaat').length"),
          'noten in balk:', b.js("document.querySelectorAll('.nb-noot').length"),
          'sleutels:', b.js("typeof MEES==='object' ? Object.keys(MEES.tabEls).length : 'geen MEES'"))
    print('akkoorden in de balk:', b.js("[].slice.call(document.querySelectorAll('.nb-akkoord')).map(function(e){return e.textContent;}).join(' ')"))
    print('rijen maat 1:')
    rijen = b.js("""(()=>{const m=document.querySelectorAll('.tabmaat')[0]; if(!m) return 'geen'; const uit=[];
      [].forEach.call(m.querySelectorAll('.tabsnaar'), function(r){
        uit.push(r.querySelector('.snaam').textContent + '| ' + [].slice.call(r.querySelectorAll('.tabcel')).map(function(c){
          return c.textContent + (c.getAttribute('data-tabnoot') ? '[' + c.getAttribute('data-tabnoot') + ']' : ''); }).join(' '));
      }); return uit.join('\\n');})()""")
    print(rijen)
    if args.meespelen:
        print('klik Meespelen:', b.js("(()=>{const el=document.getElementById('mees-start'); if(!el) return 'ontbreekt'; el.click(); return 'ok';})()"))
        wacht(b, 3.0)
        print('tijd:', b.js("Math.round(document.getElementById('mees-audio').currentTime*100)/100"),
              'akkoord:', b.js("document.getElementById('mees-akkoord').textContent"),
              'noot:', b.js("document.getElementById('mees-noot').textContent"))
        print('aan in de balk:', b.js("[].slice.call(document.querySelectorAll('.nb-noot.aan')).map(function(e){return e.getAttribute('data-noot');}).join(' ')"),
              '| aan in tab:', b.js("[].slice.call(document.querySelectorAll('.tabcel.aan')).map(function(e){return e.getAttribute('data-tabnoot')+'='+e.textContent;}).join(' ')"),
              '| hals:', b.js("document.querySelectorAll('#mees-hals [data-snaar].klinkt').length"))
    print('fouten:', b.fouten())


if __name__ == '__main__':
    main()
