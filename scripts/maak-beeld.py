#!/usr/bin/env python3
"""Maakt de hero-banner, de social card en de titel- en slotkaart voor de rondleiding.

Alles met headless Chromium (CDP op poort 9226): HTML die de app-schermafbeeldingen
inbedt, zodat er geen losse SVG- of beeldconverter nodig is.

    python3 scripts/maak-beeld.py
"""
import base64
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from importlib import machinery  # noqa: E402

lader = machinery.SourceFileLoader('cdpclient', str(pathlib.Path(__file__).parent / 'cdp-client.py'))
cdp = lader.load_module()

WORTEL = pathlib.Path(__file__).resolve().parent.parent
DOCS = WORTEL / 'docs' / 'img'
PORTAAL = 9226

KLEUREN = {
    'bg': '#0b1120', 'pane': '#16223c', 'lijn': '#25365c',
    'tekst': '#e8eefc', 'tekst2': '#9fb0d0', 'amber': '#f5a524',
}


def data_url(pad):
    return 'data:image/png;base64,' + base64.b64encode(pathlib.Path(pad).read_bytes()).decode()


def basis_css():
    return """
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:%(bg)s;color:%(tekst)s;font-family:'DejaVu Sans',system-ui,sans-serif;
         -webkit-font-smoothing:antialiased}
    .amber{color:%(amber)s}
    .kaart{background:%(pane)s;border:1px solid %(lijn)s;border-radius:16px;overflow:hidden}
    .kaart img{display:block;width:100%%;height:100%%;object-fit:cover;object-position:top center}
    .pil{display:inline-block;background:#1c2b4a;border:1px solid %(lijn)s;border-radius:999px;
         padding:6px 14px;font-size:19px;color:%(tekst2)s}
    """ % KLEUREN


def schermafbeelding(html, pad, breedte, hoogte):
    import tempfile, os
    bestand = tempfile.NamedTemporaryFile('w', suffix='.html', delete=False, encoding='utf-8')
    bestand.write(html)
    bestand.close()
    b = cdp.CDP(cdp.maak_tab(PORTAAL, 'about:blank'))
    b.call('Page.enable')
    b.call('Runtime.enable')
    b.call('Emulation.setDeviceMetricsOverride',
           {'width': breedte, 'height': hoogte, 'deviceScaleFactor': 1, 'mobile': False})
    b.call('Page.navigate', {'url': 'file://' + bestand.name})
    b.call('Runtime.evaluate', {'expression': 'new Promise(r=>setTimeout(r,600))', 'awaitPromise': True})
    b.schermafbeelding(str(pad), {'x': 0, 'y': 0, 'width': breedte, 'height': hoogte, 'scale': 1})
    os.unlink(bestand.name)
    print('geschreven:', pad, pathlib.Path(pad).stat().st_size, 'bytes')


def hero():
    html = """<!DOCTYPE html><html><head><meta charset="utf-8"><style>%s
    .wrap{width:1600px;height:620px;display:grid;grid-template-columns:600px 1fr;
          align-items:center;gap:34px;padding:38px 44px;
          background:radial-gradient(1000px 500px at 12%% 20%%,#1b2a4d 0%%,%s 70%%)}
    h1{font-size:66px;line-height:1.03;letter-spacing:-1px}
    p.sub{font-size:25px;color:%s;margin-top:16px;line-height:1.35}
    .doos{display:flex;gap:10px;flex-wrap:wrap;margin-top:24px}
    .sterk{background:%s;color:#231400;border-radius:999px;padding:10px 20px;font-size:21px;font-weight:bold}
    .kaart{height:544px;box-shadow:0 26px 60px rgba(0,0,0,.5)}
    </style></head><body><div class="wrap">
      <div>
        <h1>Akkoord<span class="amber">Kast</span></h1>
        <p class="sub">Bladmuziek voor gitaar met akkoorden,<br>capo-advies, grepen, noten en audio.</p>
        <div class="doos">
          <span class="sterk">8.701 liedjes, vrij van rechten</span>
          <span class="pil">capo-advies &amp; grepen</span>
          <span class="pil">meespelen met noten en tab</span>
          <span class="pil">cursus: 26 gitaarlessen</span>
          <span class="pil">eigen muziekmap in &eacute;&eacute;n keer</span>
          <span class="pil">Spotify &amp; Chromecast</span>
        </div>
        <p class="sub" style="font-size:20px;margin-top:20px">Draait op je eigen Proxmox&#8209;server &middot; mobiel en op de pc</p>
      </div>
      <div class="kaart"><img src="%s"></div>
    </div></body></html>""" % (basis_css(), KLEUREN['bg'], KLEUREN['tekst2'], KLEUREN['amber'],
                              data_url(DOCS / 'spelen-desktop.png'))
    schermafbeelding(html, DOCS / 'hero.png', 1600, 620)


def social():
    html = """<!DOCTYPE html><html><head><meta charset="utf-8"><style>%s
    .wrap{width:1200px;height:630px;padding:44px 52px;display:grid;grid-template-rows:auto 1fr auto;
          background:radial-gradient(900px 460px at 18%% 16%%,#1b2a4d 0%%,%s 72%%)}
    h1{font-size:56px;letter-spacing:-1px}
    p.sub{font-size:23px;color:%s;margin-top:12px;max-width:640px;line-height:1.35}
    .kaart{height:330px;margin-top:26px}
    .onder{display:flex;gap:10px;align-items:center;font-size:20px;color:%s;margin-top:22px}
    .sterk{background:%s;color:#231400;border-radius:10px;padding:8px 16px;font-weight:bold}
    code{background:#0d1526;border:1px solid %s;border-radius:8px;padding:6px 12px;font-size:18px;color:%s}
    </style></head><body><div class="wrap">
      <div><h1>Akkoord<span class="amber">Kast</span></h1>
        <p class="sub">Gitaarsongbook met capo-advies, grepen, begeleidingsaudio en Chromecast &#8212; op je eigen server.</p></div>
      <div class="kaart"><img src="%s"></div>
      <div class="onder"><span class="sterk">Zelf installeren</span><code>install.sh op je Proxmox-host</code></div>
    </div></body></html>""" % (basis_css(), KLEUREN['bg'], KLEUREN['tekst2'], KLEUREN['tekst2'],
                              KLEUREN['amber'], KLEUREN['lijn'], KLEUREN['amber'],
                              data_url(DOCS / 'liedjes-desktop.png'))
    schermafbeelding(html, DOCS / 'social-card.png', 1200, 630)


def titelkaart():
    html = """<!DOCTYPE html><html><head><meta charset="utf-8"><style>%s
    .wrap{width:1280px;height:720px;display:flex;flex-direction:column;justify-content:center;align-items:center;
          gap:20px;text-align:center;background:radial-gradient(900px 520px at 50%% 30%%,#1b2a4d 0%%,%s 74%%)}
    h1{font-size:82px;letter-spacing:-2px}
    p{font-size:27px;color:%s;max-width:900px;line-height:1.4}
    .doos{display:flex;gap:12px;margin-top:8px}
    </style></head><body><div class="wrap">
      <h1>Akkoord<span class="amber">Kast</span></h1>
      <p>Gitaarbladmuziek met capo-advies, grepen, audio en Chromecast</p>
      <div class="doos"><span class="pil">rondleiding door de app</span><span class="pil">demo-gegevens</span></div>
    </div></body></html>""" % (basis_css(), KLEUREN['bg'], KLEUREN['tekst2'])
    schermafbeelding(html, pathlib.Path('/tmp/ak-video/titel.png'), 1280, 720)


def slotkaart():
    html = """<!DOCTYPE html><html><head><meta charset="utf-8"><style>%s
    .wrap{width:1280px;height:720px;display:flex;flex-direction:column;justify-content:center;align-items:center;
          gap:22px;text-align:center;background:radial-gradient(900px 520px at 50%% 34%%,#1b2a4d 0%%,%s 74%%)}
    h2{font-size:52px;letter-spacing:-1px}
    p{font-size:24px;color:%s;max-width:1000px;line-height:1.45}
    code{display:block;background:#0d1526;border:1px solid %s;border-radius:12px;padding:18px 26px;
          font-size:21px;color:%s;max-width:1080px;word-break:break-all;text-align:left;line-height:1.5}
    </style></head><body><div class="wrap">
      <h2>Zelf installeren op je Proxmox&#8209;host</h2>
      <code>bash -c "$(curl -fsSL https://raw.githubusercontent.com/Theberas04/akkoordkast/main/deploy/proxmox/install.sh)"</code>
      <p>Daarna opent de app op het adres van de container: liedjes, capo-advies,<br>begeleiding en casten naar je Chromecast.</p>
    </div></body></html>""" % (basis_css(), KLEUREN['bg'], KLEUREN['tekst2'], KLEUREN['lijn'], KLEUREN['amber'])
    schermafbeelding(html, pathlib.Path('/tmp/ak-video/slot.png'), 1280, 720)


if __name__ == '__main__':
    pathlib.Path('/tmp/ak-video').mkdir(parents=True, exist_ok=True)
    hero()
    social()
    titelkaart()
    slotkaart()
