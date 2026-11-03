#!/usr/bin/env python3
"""Drive a headless Chromium over CDP with the standard library only.

Use when you need real screenshots, real DOM state or the page's own JavaScript errors and
puppeteer-core is not available (no npm install, pruned scratch tree). Chromium must already be
running with --remote-debugging-port=<port> and LD_LIBRARY_PATH pointing at its NSS/NSPR libs.

    python3 cdp-client.py 9226 http://127.0.0.1:3816/ --js "document.title"
    python3 cdp-client.py 9226 http://127.0.0.1:3816/ --shot /tmp/page.png --wait 6
    python3 cdp-client.py 9226 about:blank --clip-js "document.querySelector('#advies').closest('.panel')" --shot /tmp/paneel.png

--clip-js takes a JS expression returning an element; its page-coordinate rectangle is used as the
screenshot clip, which is how you document a panel that sits below the fold (scrolling is often
undone by the app's own nav/tab handler). Always read --errors afterwards: a page that renders
nothing because of a ReferenceError passes every syntax check.
"""
import argparse, base64, json, os, socket, struct, sys, time, urllib.request


class CDP:
    def __init__(self, url, timeout=120):
        rest = url[5:]
        hostport, path = rest.split('/', 1)
        host, port = hostport.split(':')
        self.s = socket.create_connection((host, int(port)), timeout=timeout)
        key = base64.b64encode(os.urandom(16)).decode()
        self.s.sendall((f"GET /{path} HTTP/1.1\r\nHost: {hostport}\r\nUpgrade: websocket\r\n"
                        f"Connection: Upgrade\r\nSec-WebSocket-Key: {key}\r\n"
                        "Sec-WebSocket-Version: 13\r\n\r\n").encode())
        buf = b''
        while b'\r\n\r\n' not in buf:
            buf += self.s.recv(4096)
        self.rest = buf.split(b'\r\n\r\n', 1)[1]
        self.volgnummer = 0
        self.events = []

    def _lees(self, n):
        # Read exactly n bytes: a recv() may deliver far more than one frame header.
        while len(self.rest) < n:
            stuk = self.s.recv(65536)
            if not stuk:
                raise RuntimeError('verbinding gesloten')
            self.rest += stuk
        uit, self.rest = self.rest[:n], self.rest[n:]
        return uit

    def _stuur(self, data, opcode=1):
        frame = bytearray([0x80 | opcode])
        n = len(data)
        if n < 126:
            frame.append(0x80 | n)
        elif n < 65536:
            frame.append(0x80 | 126); frame += struct.pack('>H', n)
        else:
            frame.append(0x80 | 127); frame += struct.pack('>Q', n)
        mask = os.urandom(4)
        frame += mask
        frame += bytes(b ^ mask[i % 4] for i, b in enumerate(data))
        self.s.sendall(bytes(frame))

    def _ontvang(self):
        b1, b2 = self._lees(2)
        opcode, n = b1 & 0x0f, b2 & 0x7f
        if n == 126:
            n = struct.unpack('>H', self._lees(2))[0]
        elif n == 127:
            n = struct.unpack('>Q', self._lees(8))[0]
        return opcode, (self._lees(n) if n else b'')

    def call(self, method, params=None, timeout=120):
        self.volgnummer += 1
        nummer = self.volgnummer
        self._stuur(json.dumps({'id': nummer, 'method': method, 'params': params or {}}).encode())
        eind = time.time() + timeout
        while time.time() < eind:
            opcode, payload = self._ontvang()
            if opcode == 1:
                bericht = json.loads(payload.decode())
                if bericht.get('id') == nummer:
                    if 'error' in bericht:
                        raise RuntimeError(f"{method}: {bericht['error']}")
                    return bericht.get('result', {})
                self.events.append(bericht)
            elif opcode == 9:
                self._stuur(payload, opcode=10)
            elif opcode == 8:
                raise RuntimeError('browser sloot de verbinding')
        raise TimeoutError(f'{method} duurde te lang')

    def js(self, expressie, timeout=120):
        uit = self.call('Runtime.evaluate',
                        {'expression': expressie, 'returnByValue': True, 'awaitPromise': True},
                        timeout=timeout)
        return uit.get('result', {}).get('value')

    def fouten(self):
        uit = []
        for e in self.events:
            if e.get('method') == 'Runtime.exceptionThrown':
                d = e['params']['exceptionDetails']
                uit.append(d.get('text', '') + ' ' + (d.get('exception') or {}).get('description', '')[:300])
        return uit

    def schermafbeelding(self, pad, clip=None):
        params = {'format': 'png', 'captureBeyondViewport': bool(clip)}
        if clip:
            params['clip'] = clip
        data = self.call('Page.captureScreenshot', params)['data']
        with open(pad, 'wb') as bestand:
            bestand.write(base64.b64decode(data))
        return pad


def maak_tab(poort, url):
    aanvraag = urllib.request.Request(f'http://127.0.0.1:{poort}/json/new?{url}', method='PUT')
    with urllib.request.urlopen(aanvraag, timeout=30) as antwoord:
        return json.loads(antwoord.read().decode())['webSocketDebuggerUrl']


def main():
    p = argparse.ArgumentParser(description='CDP-probe met alleen de standaardbibliotheek.')
    p.add_argument('poort', type=int)
    p.add_argument('url')
    p.add_argument('--wait', type=float, default=6.0)
    p.add_argument('--js', action='append', default=[], help='JS-expressie(s) om uit te voeren')
    p.add_argument('--shot')
    p.add_argument('--clip-js', help='JS die een element teruggeeft; dat element wordt het kader')
    p.add_argument('--full', action='store_true', help='hele pagina in plaats van het venster')
    args = p.parse_args()

    b = CDP(maak_tab(args.poort, args.url))
    b.call('Page.enable')
    b.call('Runtime.enable')
    time.sleep(args.wait)
    for expressie in args.js:
        print(f'{expressie} => {b.js(expressie)!r}')
    if args.shot:
        clip = None
        if args.clip_js:
            clip = b.js("(()=>{const el="+args.clip_js+"; if(!el) return null;"
                            "const r=el.getBoundingClientRect();"
                            "return {x:Math.round(r.left+(window.scrollX||0)),y:Math.round(r.top+(window.scrollY||0)),"
                            "width:Math.round(r.width),height:Math.round(r.height),scale:1};})()")
            if not clip or not clip.get('width'):
                sys.exit('Kader niet gevonden (0 breed): is de tab of sub-tab wel zichtbaar?')
        elif args.full:
            maat = b.js("({w:Math.min(Math.max(document.body.scrollWidth,document.documentElement.scrollWidth),1500),"
                       "h:Math.min(Math.max(document.body.scrollHeight,document.documentElement.scrollHeight),4000)})")
            clip = {'x': 0, 'y': 0, 'width': maat['w'], 'height': maat['h'], 'scale': 1}
        print('screenshot:', b.schermafbeelding(args.shot, clip))
    fouten = b.fouten()
    print('paginafouten:', fouten if fouten else 'geen')


if __name__ == '__main__':
    main()
