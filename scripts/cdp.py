#!/usr/bin/env python3
"""Klein hulpstuk om in een draaiende headless Chromium te klikken en plaatjes te maken.

Er is geen websocket-bibliotheek nodig: dit praat rechtstreeks met het DevTools-protocol.
Waarom: met alleen `chrome --screenshot` krijg je een statisch plaatje, en kun je dus niet
controleren of een knop werkt. Hiermee wel.

Gebruik:
    chrome (zie hieronder) starten, dan:
    python3 scripts/cdp.py http://127.0.0.1:8091/#liedjes uit.png

Chromium starten (in deze container ontbreken systeembibliotheken; vandaar LD_LIBRARY_PATH):
    CH=$(ls -d ~/.hermes/tools/chromium-*/chrome-linux64/chrome | tail -1)
    LD_LIBRARY_PATH=$HOME/.local/lib "$CH" --headless=new --no-sandbox --disable-gpu \
      --hide-scrollbars --window-size=1450,1400 --remote-debugging-port=9226 \
      --user-data-dir=/tmp/ak-cdp about:blank
"""
import base64
import json
import os
import socket
import struct
import sys
import time
import urllib.parse
import urllib.request

POORT = int(os.environ.get('CDP_POORT', '9226'))


class Cdp:
    def __init__(self, url, poort=POORT):
        self.poort = poort
        doelnr = self._nieuw_doel(url)
        self.sock, self.pad = self._verbind(doelnr)
        self.nr = 0
        self.call('Page.enable')
        self.call('Runtime.enable')
        self.call('Network.enable')

    # --- HTTP-kant van DevTools ---
    def _http(self, pad):
        with urllib.request.urlopen(f'http://127.0.0.1:{self.poort}{pad}', timeout=15) as r:
            return json.loads(r.read().decode('utf-8'))

    def _nieuw_doel(self, url):
        for _ in range(10):
            try:
                self._http('/json/version')
                break
            except Exception:
                time.sleep(0.5)
        # Sinds Chrome 111 moet een nieuw tabblad met PUT worden aangevraagd; GET geeft 405.
        verzoek = urllib.request.Request(
            f'http://127.0.0.1:{self.poort}/json/new?' + urllib.parse.quote(url, safe=':/#?=&'),
            method='PUT')
        with urllib.request.urlopen(verzoek, timeout=15) as r:
            doel = json.loads(r.read().decode('utf-8'))
        return doel['webSocketDebuggerUrl']

    # --- websocket-kant ---
    def _verbind(self, ws_url):
        rest = ws_url.split('://', 1)[1]
        host, pad = rest.split('/', 1)
        hostnaam, _, poort = host.partition(':')
        s = socket.create_connection((hostnaam, int(poort or 80)), timeout=20)
        sleutel = base64.b64encode(os.urandom(16)).decode()
        vraag = (f'GET /{pad} HTTP/1.1\r\nHost: {host}\r\nUpgrade: websocket\r\n'
                 f'Connection: Upgrade\r\nSec-WebSocket-Key: {sleutel}\r\n'
                 f'Sec-WebSocket-Version: 13\r\n\r\n')
        s.sendall(vraag.encode())
        kop = b''
        while b'\r\n\r\n' not in kop:
            stuk = s.recv(4096)
            if not stuk:
                raise RuntimeError('geen antwoord van DevTools')
            kop += stuk
        if b'101' not in kop.split(b'\r\n')[0]:
            raise RuntimeError('websocket-handshake mislukt: ' + kop[:200].decode('utf-8', 'replace'))
        return s, b''

    def _stuur(self, tekst):
        data = tekst.encode('utf-8')
        kop = bytearray([0x81])
        n = len(data)
        if n < 126:
            kop.append(0x80 | n)
        elif n < 65536:
            kop.append(0x80 | 126)
            kop += struct.pack('>H', n)
        else:
            kop.append(0x80 | 127)
            kop += struct.pack('>Q', n)
        masker = os.urandom(4)
        kop += masker
        self.sock.sendall(bytes(kop) + bytes(b ^ masker[i % 4] for i, b in enumerate(data)))

    def _lees(self, n):
        while len(self.pad) < n:
            stuk = self.sock.recv(65536)
            if not stuk:
                raise RuntimeError('verbinding met DevTools weg')
            self.pad += stuk
        uit, self.pad = self.pad[:n], self.pad[n:]
        return uit

    def _ontvang(self):
        while True:
            eerste = self._lees(2)
            einde, opcode = eerste[0] & 0x80, eerste[0] & 0x0F
            gemaskeerd, lengte = eerste[1] & 0x80, eerste[1] & 0x7F
            if lengte == 126:
                lengte = struct.unpack('>H', self._lees(2))[0]
            elif lengte == 127:
                lengte = struct.unpack('>Q', self._lees(8))[0]
            masker = self._lees(4) if gemaskeerd else None
            data = self._lees(lengte)
            if masker:
                data = bytes(b ^ masker[i % 4] for i, b in enumerate(data))
            if opcode == 0x8:
                raise RuntimeError('DevTools sloot de verbinding')
            if opcode in (0x1, 0x2):
                return json.loads(data.decode('utf-8'))
            # ping/pong en vervolgstukken slaan we over

    def call(self, methode, **params):
        self.nr += 1
        self._stuur(json.dumps({'id': self.nr, 'method': methode, 'params': params}))
        while True:
            bericht = self._ontvang()
            if bericht.get('id') == self.nr:
                if 'error' in bericht:
                    raise RuntimeError(methode + ': ' + json.dumps(bericht['error']))
                return bericht.get('result', {})
            # gebeurtenissen (console, netwerk) bewaren we niet; die vragen we apart op

    def js(self, uitdrukking):
        uit = self.call('Runtime.evaluate', expression=uitdrukking, returnByValue=True, awaitPromise=True)
        return uit.get('result', {}).get('value')

    def wacht(self, seconden):
        time.sleep(seconden)

    def schermafbeelding(self, bestand):
        uit = self.call('Page.captureScreenshot', format='png')
        with open(bestand, 'wb') as f:
            f.write(base64.b64decode(uit['data']))
        return bestand


if __name__ == '__main__':
    url = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8091/'
    bestand = sys.argv[2] if len(sys.argv) > 2 else 'scherm.png'
    b = Cdp(url)
    b.wacht(2.5)
    print('titel:', b.js('document.title'))
    print(b.schermafbeelding(bestand))
