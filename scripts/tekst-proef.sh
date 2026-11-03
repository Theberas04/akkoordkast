#!/usr/bin/env bash
# Demo opnieuw opbouwen, de muziekmap opnieuw scannen en de liedjestekst in beeld brengen.
set -e
cd /home/hermes/akkoordkast
export FONTCONFIG_FILE=/home/hermes/.local/fontconfig/fonts.conf
BASIS=http://127.0.0.1:8091

PID=$(ss -ltnp 2>/dev/null | grep ':8091' | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2 || true)
[ -n "$PID" ] && kill "$PID" && sleep 1
rm -rf data-demo
DATA_DIR=/home/hermes/akkoordkast/data-demo PORT=8091 nohup node server.js >/tmp/ak-8091.log 2>&1 &
sleep 3
BASIS=$BASIS node scripts/demo-gegevens.js

echo "== muziekmap scannen via het scherm =="
python3 scripts/scan-proef.py --basis $BASIS --map /tmp/muziekmap2 --doel /tmp/scan
cp /tmp/scan/muziekmap-gevonden.png docs/img/muziekmap-gevonden.png
cp /tmp/scan/muziekmap-klaar.png docs/img/muziekmap-klaar.png

echo "== liedjestekst bij een eigen opname in beeld =="
python3 - <<'PY'
import pathlib, sys
sys.path.insert(0, 'scripts')
from importlib import machinery
cdp = machinery.SourceFileLoader('cdpclient', 'scripts/cdp-client.py').load_module()
b = cdp.CDP(cdp.maak_tab(9226, 'http://127.0.0.1:8091/'))
b.call('Page.enable'); b.call('Runtime.enable')
b.js("(async()=>{ if(navigator.serviceWorker){const rs=await navigator.serviceWorker.getRegistrations(); for(const r of rs){await r.unregister();}} if(window.caches){const ks=await caches.keys(); for(const k of ks){await caches.delete(k);}}})()")
b.call('Page.reload', {'ignoreCache': True})
b.call('Runtime.evaluate', {'expression': 'new Promise(r=>setTimeout(r,2500))', 'awaitPromise': True})
b.call('Emulation.setDeviceMetricsOverride', {'width': 1180, 'height': 1000, 'deviceScaleFactor': 1, 'mobile': False})
# zoek het herkende liedje op en open het
b.js("(()=>{const z=document.getElementById('zoek'); z.value='Amazing Grace'; z.dispatchEvent(new Event('input'));})()")
b.call('Runtime.evaluate', {'expression': 'new Promise(r=>setTimeout(r,1200))', 'awaitPromise': True})
print('gevonden in de lijst:', b.js("document.querySelectorAll('#liedjes-lijst .liedje, #liedjes-lijst li').length"))
b.js("(()=>{const knoppen=[...document.querySelectorAll('#liedjes-lijst *')].filter(e=>/Amazing Grace/i.test(e.textContent) && e.onclick!==undefined); const eerste=knoppen[knoppen.length-1]; if(eerste) eerste.click();})()")
b.call('Runtime.evaluate', {'expression': 'new Promise(r=>setTimeout(r,2500))', 'awaitPromise': True})
print('titel op het scherm:', b.js("(document.querySelector('#spelen-inhoud h2')||{}).textContent"))
print('woordenblok aanwezig:', b.js("!!document.querySelector('.woorden')"))
b.js("(()=>{const d=document.querySelector('.woorden'); if(d){d.open=true; window.scrollTo(0, d.getBoundingClientRect().top+scrollY-260);}})()")
b.call('Runtime.evaluate', {'expression': 'new Promise(r=>setTimeout(r,1200))', 'awaitPromise': True})
b.schermafbeelding('docs/img/liedjestekst-bij-opname.png', {'x': 0, 'y': 0, 'width': 1180, 'height': 1000, 'scale': 1})
print('paginafouten:', b.fouten())
PY

echo "== klaar =="
ls -la --time-style=+%H:%M docs/img/ | grep -E "muziekmap|liedjestekst"
