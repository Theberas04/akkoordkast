#!/usr/bin/env python3
"""Maakt de PWA-iconen (en de social card-achtergrond) met headless Chromium.

Chromium moet al draaien met --remote-debugging-port=9226. De SVG van de app wordt
op ware grootte gerenderd en als PNG vastgelegd, zodat er geen losse SVG-converter
nodig is (rsvg-convert, ImageMagick en Inkscape staan hier niet).
"""
import base64
import os
import pathlib
import sys
import tempfile

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from importlib import machinery  # noqa: E402

# cdp-client.py heeft een streepje in de naam; laad het als module.
lader = machinery.SourceFileLoader('cdpclient', str(pathlib.Path(__file__).parent / 'cdp-client.py'))
cdp = lader.load_module()

PUBLIC = pathlib.Path(__file__).resolve().parent.parent / 'public'
SVG = (PUBLIC / 'favicon.svg').read_text(encoding='utf-8')

HTML = """<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;background:transparent}
  .vak{width:%(maat)dpx;height:%(maat)dpx;display:flex;align-items:center;justify-content:center;
       background:%(achtergrond)s}
  .binnen{width:%(beeld)dpx;height:%(beeld)dpx}
  @media (prefers-color-scheme:dark){}
</style></head><body>
<div class="vak">%(svg)s</div>
</body></html>"""


def html_voor(maat, veilig=False, achtergrond='#0b1120'):
    # maskable iconen houden het beeld binnen de veilige zone van 80%%.
    beeld = int(maat * (0.62 if veilig else 1.0))
    svg = SVG.replace('<svg ', '<svg class="binnen" width="%d" height="%d" ' % (beeld, beeld), 1)
    return HTML % {'maat': maat, 'beeld': beeld, 'svg': svg, 'achtergrond': achtergrond}


def leg_vast(browser, html, pad, maat):
    tijdelijk = tempfile.NamedTemporaryFile('w', suffix='.html', delete=False, encoding='utf-8')
    tijdelijk.write(html)
    tijdelijk.close()
    b = cdp.CDP(cdp.maak_tab(9226, 'file://' + tijdelijk.name))
    b.call('Page.enable')
    b.call('Runtime.enable')
    b.call('Emulation.setDeviceMetricsOverride', {'width': maat, 'height': maat, 'deviceScaleFactor': 1, 'mobile': False})
    b.call('Runtime.evaluate', {'expression': 'new Promise(r=>setTimeout(r,220))', 'awaitPromise': True})
    b.schermafbeelding(str(pad), {'x': 0, 'y': 0, 'width': maat, 'height': maat, 'scale': 1})
    os.unlink(tijdelijk.name)
    print('geschreven:', pad, os.path.getsize(pad), 'bytes')


def main():
    taken = [
        (192, False, '#0b1120', PUBLIC / 'icon-192.png'),
        (512, False, '#0b1120', PUBLIC / 'icon-512.png'),
        (512, True, '#0b1120', PUBLIC / 'icon-512-maskable.png'),
        (180, False, '#0b1120', PUBLIC / 'apple-touch-icon.png'),
    ]
    for maat, veilig, achtergrond, pad in taken:
        leg_vast(None, html_voor(maat, veilig, achtergrond), pad, maat)


if __name__ == '__main__':
    main()
