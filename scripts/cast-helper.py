#!/usr/bin/env python3
"""Chromecast-hulp voor AkkoordKast.

Gebruik (alles levert één regel JSON op stdout):
  cast-helper.py apparaten
  cast-helper.py speel <ip-of-uuid> <url> <titel> <artiest> <content-type> [poster-url]
  cast-helper.py stop <ip-of-uuid>
  cast-helper.py volume <ip-of-uuid> <0.0-1.0>
  cast-helper.py status <ip-of-uuid>

Fouten worden als {"fout": "..."} teruggemeld, zodat de Node-server altijd
hetzelfde formaat ziet en de pagina een leesbare melding kan tonen.
"""
import json
import re
import sys
from typing import NoReturn


def uit(gegevens) -> None:
    sys.stdout.write(json.dumps(gegevens, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def fout(melding: str, **extra) -> NoReturn:
    gegevens = {"fout": melding}
    gegevens.update(extra)
    uit(gegevens)
    sys.exit(0)


def laad():
    try:
        import pychromecast  # noqa: F401
    except Exception as e:  # ImportError of kapotte installatie
        fout(
            "pychromecast is niet geïnstalleerd: %s" % e,
            hint="Installeer het als root in de container: apt-get install -y python3-pip && "
                 "python3 -m pip install --break-system-packages pychromecast",
        )
    import pychromecast

    return pychromecast


def zoek(pychromecast, kies, timeout=8.0):
    """Zoekt Chromecasts op het netwerk en houdt er één over (ip, uuid of naam)."""
    try:
        apparaten, browser = pychromecast.get_listed_chromecasts(timeout=timeout)
    except Exception as e:
        fout("Zoeken naar Chromecasts mislukte: %s" % e)
        return None, None
    gekozen = None
    for cc in apparaten:
        info = cc.cast_info
        if kies in (info.host, str(info.uuid), info.friendly_name):
            gekozen = cc
            break
    if gekozen is None and len(apparaten) >= 1:
        # Onbekende keuze: gebruik de eerste die gevonden is.
        gekozen = apparaten[0]
    if gekozen is None and kies and re.match(r"^\d{1,3}(\.\d{1,3}){3}$", kies):
        # Geen discovery-resultaat (multicast geblokkeerd?): direct op het IP verbinden.
        try:
            gekozen = pychromecast.get_chromecast_from_host((kies, 8009, None, None, kies))
        except Exception as e:
            fout("Direct verbinden met %s mislukte: %s" % (kies, e))
    if gekozen is None:
        fout("Geen Chromecast gevonden op dit netwerk.")
    return gekozen, browser


def omschrijf(cc):
    info = cc.cast_info
    return {
        "naam": info.friendly_name,
        "ip": info.host,
        "poort": info.port,
        "uuid": str(info.uuid),
        "model": getattr(info, "model_name", "") or "",
        "type": getattr(info, "cast_type", "") or "",
    }


def commando_apparaten(pychromecast, args):
    try:
        apparaten, browser = pychromecast.get_listed_chromecasts(timeout=8.0)
    except Exception as e:
        fout("Zoeken naar Chromecasts mislukte: %s" % e)
    lijst = [omschrijf(cc) for cc in apparaten]
    try:
        pychromecast.discovery.stop_discovery(browser)
    except Exception:
        pass
    uit({"apparaten": lijst, "aantal": len(lijst)})


def commando_speel(pychromecast, args):
    if len(args) < 2:
        fout("Gebruik: speel <apparaat> <url> [titel] [artiest] [content-type] [poster]")
    kies, url = args[0], args[1]
    titel = args[2] if len(args) > 2 else "AkkoordKast"
    artiest = args[3] if len(args) > 3 else ""
    inhoudstype = args[4] if len(args) > 4 else "audio/mpeg"
    poster = args[5] if len(args) > 5 else ""
    cc, browser = zoek(pychromecast, kies)
    try:
        cc.wait(timeout=15)
    except Exception as e:
        fout("Verbinden met %s mislukte: %s" % (kies, e))
    try:
        cc.media_controller.play_media(
            url,
            inhoudstype,
            title=titel,
            thumb=poster or None,
            artist=artiest or None,
        )
        cc.media_controller.block_until_active(timeout=20)
    except Exception as e:
        fout("Afspelen op %s mislukte: %s" % (kies, e))
    uit({"ok": True, "apparaat": omschrijf(cc), "url": url, "titel": titel})


def commando_stop(pychromecast, args):
    if not args:
        fout("Gebruik: stop <apparaat>")
    cc, browser = zoek(pychromecast, args[0])
    try:
        cc.wait(timeout=15)
        cc.media_controller.stop()
    except Exception as e:
        fout("Stoppen mislukte: %s" % e)
    uit({"ok": True, "gestopt": omschrijf(cc)["naam"]})


def commando_volume(pychromecast, args):
    if len(args) < 2:
        fout("Gebruik: volume <apparaat> <0.0-1.0>")
    try:
        niveau = max(0.0, min(1.0, float(args[1])))
    except ValueError:
        fout("Ongeldig volumeniveau: %s" % args[1])
    cc, browser = zoek(pychromecast, args[0])
    try:
        cc.wait(timeout=15)
        cc.set_volume(niveau)
    except Exception as e:
        fout("Volume instellen mislukte: %s" % e)
    uit({"ok": True, "niveau": niveau, "apparaat": omschrijf(cc)["naam"]})


def commando_status(pychromecast, args):
    if not args:
        fout("Gebruik: status <apparaat>")
    cc, browser = zoek(pychromecast, args[0])
    try:
        cc.wait(timeout=15)
    except Exception as e:
        fout("Verbinden mislukte: %s" % e)
    mc = cc.media_controller
    uit({
        "ok": True,
        "apparaat": omschrijf(cc),
        "status": getattr(mc.status, "player_state", "") or "",
        "titel": getattr(mc.status, "title", "") or "",
        "artiest": getattr(mc.status, "artist", "") or "",
        "volume": getattr(cc.status, "volume_level", None),
    })


COMMANDOS = {
    "apparaten": commando_apparaten,
    "speel": commando_speel,
    "stop": commando_stop,
    "volume": commando_volume,
    "status": commando_status,
}


def main():
    if len(sys.argv) < 2 or sys.argv[1] not in COMMANDOS:
        fout("Onbekend commando. Kies uit: " + ", ".join(sorted(COMMANDOS)))
    pychromecast = laad()
    COMMANDOS[sys.argv[1]](pychromecast, sys.argv[2:])


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as e:  # nooit een kale traceback naar Node sturen
        fout("Onverwachte fout in de cast-helper: %s" % e)
