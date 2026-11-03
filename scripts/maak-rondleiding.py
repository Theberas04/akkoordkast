#!/usr/bin/env python3
"""Bouwt de rondleidingsvideo van AkkoordKast uit echte schermafbeeldingen.

Een diashow van de echte app-schermen (1280x720, 30 fps) met per scherm een
Nederlandse voice-over en een zachte muziekbed eronder. De vertelling wordt eerst
gemeten en bepaalt daarna de duur van elk scherm, zodat de stem nooit over het
verkeerde scherm valt.

    python3 scripts/maak-rondleiding.py --stem /tmp/ak-video --uit docs/img/rondleiding.mp4
"""
import argparse
import json
import pathlib
import re
import subprocess
import sys

WORTEL = pathlib.Path(__file__).resolve().parent.parent
DOCS = WORTEL / 'docs' / 'img'
FONT = '/home/hermes/.fonts/DejaVuSans-Bold.ttf'
FPS = 30
TITEL_S = 4.5
SLOT_S = 6.0
STEM_START = 0.45   # seconde na het begin van een scherm
STEM_STAART = 1.6   # stilte na de gesproken regel
MIN_S = 3.8


def duur(pad):
    uit = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                          '-of', 'csv=p=0', str(pad)], capture_output=True, text=True, check=True)
    return float(uit.stdout.strip())


def sh(*args):
    uit = subprocess.run(list(args), capture_output=True, text=True)
    if uit.returncode != 0:
        raise RuntimeError(' '.join(str(a) for a in args) + '\n' + uit.stderr[-2000:])
    return uit.stdout


SCENES = [
    {'beeld': DOCS / 'liedjes-desktop.png', 'stem': 'n1.mp3',
     'tekst': 'Meer dan duizend publiek-domein liedjes, doorzoekbaar'},
    {'beeld': DOCS / 'spelen-desktop.png', 'stem': 'n2.mp3',
     'tekst': 'Capo-advies en grepen per liedje'},
    {'beeld': DOCS / 'grepen-desktop.png', 'stem': 'n3.mp3',
     'tekst': 'Greepdiagrammen die meeschuiven met de capo'},
    {'beeld': DOCS / 'bladmuziek-telefoon.png', 'stem': 'n4.mp3',
     'tekst': 'Bladmuziek op je telefoon, ook te printen', 'telefoon': True},
    {'beeld': DOCS / 'toevoegen-desktop.png', 'stem': 'n5.mp3',
     'tekst': 'Eigen liedjes en opnames toevoegen'},
    {'beeld': DOCS / 'casten-desktop.png', 'stem': 'n6.mp3',
     'tekst': 'Begeleiding casten naar je Chromecast'},
]


def maak_scene(index, scene, stem_dir, werk):
    stem = stem_dir / scene['stem']
    lengte_stem = duur(stem)
    duur_scene = round(max(MIN_S, lengte_stem + STEM_START + STEM_STAART), 2)
    caption = werk / ('cap%d.txt' % index)
    caption.write_text(scene['tekst'], encoding='utf-8')
    uit = werk / ('scene%d.mp4' % index)
    if scene.get('telefoon'):
        keten = ("[0:v]scale=-2:600,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=0x0b1120,setsar=1,fps=%d,"
                 "drawbox=y=ih-96:h=96:color=0x0b1120@0.93:t=fill,"
                 "drawtext=fontfile=%s:textfile=%s:fontsize=30:fontcolor=white:x=(w-text_w)/2:y=h-64,"
                 "fade=t=in:st=0:d=0.4,fade=t=out:st=%.2f:d=0.5,format=yuv420p[v]"
                 % (FPS, FONT, caption, duur_scene - 0.5))
    else:
        keten = ("[0:v]scale=1280:-2,crop=1280:720,setsar=1,fps=%d,"
                 "drawbox=y=ih-96:h=96:color=0x0b1120@0.93:t=fill,"
                 "drawtext=fontfile=%s:textfile=%s:fontsize=30:fontcolor=white:x=(w-text_w)/2:y=h-64,"
                 "fade=t=in:st=0:d=0.4,fade=t=out:st=%.2f:d=0.5,format=yuv420p[v]"
                 % (FPS, FONT, caption, duur_scene - 0.5))
    sh('ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-loop', '1', '-t', str(duur_scene),
       '-i', str(scene['beeld']), '-filter_complex', keten, '-map', '[v]',
       '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-color_range', 'tv',
       '-pix_fmt', 'yuv420p', str(uit))
    gemeten = duur(uit)
    print('   scherm %d: stem %.2fs, beeld %.2fs (%s)' % (index, lengte_stem, gemeten, scene['tekst']))
    return {'bestand': uit, 'duur': duur_scene, 'stem': stem, 'stem_start': TITEL_S + 0}  # start volgt later


def maak_kaart(beeld, seconden, uit):
    sh('ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-loop', '1', '-t', str(seconden),
       '-i', str(beeld), '-vf', 'scale=1280:720,setsar=1,fps=%d,format=yuv420p' % FPS,
       '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-color_range', 'tv',
       '-pix_fmt', 'yuv420p', str(uit))
    return duur(uit)


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--stem', default='/tmp/ak-video', help='map met n1.mp3 … n6.mp3 en titel.png/slot.png')
    p.add_argument('--uit', default=str(DOCS / 'rondleiding.mp4'))
    p.add_argument('--werk', default='/tmp/ak-rondleiding')
    args = p.parse_args()
    stem_dir = pathlib.Path(args.stem)
    werk = pathlib.Path(args.werk)
    werk.mkdir(parents=True, exist_ok=True)

    print('== Schermen bouwen')
    scènes = [maak_scene(i + 1, s, stem_dir, werk) for i, s in enumerate(SCENES)]

    print('== Titel- en slotkaart')
    titel = werk / 'titel.mp4'
    slot = werk / 'slot.mp4'
    maak_kaart(stem_dir / 'titel.png', TITEL_S, titel)
    maak_kaart(stem_dir / 'slot.png', SLOT_S, slot)

    print('== Beeld aan elkaar zetten')
    lijst = werk / 'delen.txt'
    volgorde = [titel] + [s['bestand'] for s in scènes] + [slot]
    lijst.write_text(''.join("file '%s'\n" % f for f in volgorde))
    inhoud = werk / 'beeld.mp4'
    sh('ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0',
       '-i', str(lijst), '-c', 'copy', '-movflags', '+faststart', str(inhoud))
    totaal = duur(inhoud)
    print('   beeldduur %.2fs' % totaal)

    print('== Klok uitrekenen voor de voice-over')
    start = TITEL_S
    for s in scènes:
        s['stem_start'] = round(start + STEM_START, 3)
        start += s['duur']
        print('   %-45s stem op %5.2fs' % (s['stem'].name, s['stem_start']))
    if abs(start + SLOT_S - totaal) > 0.6:
        print('   LET OP: som van de schermen (%.2f) en de beeldduur (%.2f) lopen uiteen' % (start + SLOT_S, totaal))

    print('== Geluid maken')
    bed = werk / 'bed.wav'
    sh('ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
       '-f', 'lavfi', '-i', 'sine=f=130.81:d=%s' % totaal,
       '-f', 'lavfi', '-i', 'sine=f=131.60:d=%s' % totaal,
       '-f', 'lavfi', '-i', 'sine=f=196.00:d=%s' % totaal,
       '-f', 'lavfi', '-i', 'sine=f=196.90:d=%s' % totaal,
       '-filter_complex',
       "[0:a]volume=0.5[s0];[1:a]volume=0.34[s1];[2:a]volume=0.5[s2];[3:a]volume=0.34[s3];"
       "[s0][s1][s2][s3]amix=inputs=4:normalize=0,lowpass=f=720,tremolo=f=0.10:d=0.30,"
       "aecho=0.8:0.9:120|260:0.28|0.14,volume=0.5,"
       "afade=t=in:d=2.5,afade=t=out:st=%.2f:d=4[bed]" % (totaal - 4),
       '-map', '[bed]', '-ac', '2', '-ar', '44100', str(bed))

    invoer = []
    for s in scènes:
        invoer += ['-i', str(s['stem'])]
    invoer += ['-i', str(bed)]
    keten = []
    labels = []
    for i, s in enumerate(scènes):
        ms = int(s['stem_start'] * 1000)
        # Invoer 0 is het beeld; de vertellingen beginnen daarom bij 1.
        keten.append('[%d:a]aresample=44100,volume=1.4,adelay=%d|%d[v%d]' % (i + 1, ms, ms, i))
        labels.append('[v%d]' % i)
    bed_index = len(scènes) + 1
    keten.append('[%d:a]volume=0.9[bed]' % bed_index)
    labels.append('[bed]')
    filtergraph = ';'.join(keten) + ';' + ''.join(labels) + \
        'amix=inputs=%d:normalize=0:duration=longest,alimiter=limit=0.95[a]' % len(labels)

    uit = pathlib.Path(args.uit)
    sh('ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(inhoud), *invoer,
       '-filter_complex', filtergraph, '-map', '0:v', '-map', '[a]',
       '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-ar', '44100', '-ac', '2',
       '-t', str(totaal), '-movflags', '+faststart', str(uit))

    print('== Controle')
    info = sh('ffprobe', '-v', 'error', '-show_entries',
              'format=duration,size:stream=codec_name,codec_type,width,height,r_frame_rate,channels',
              '-of', 'default=noprint_wrappers=1', str(uit))
    print(info)
    json.dump({'scenes': [{'stem': s['stem'].name, 'start': s['stem_start'], 'duur': s['duur']} for s in scènes],
               'totaal': totaal},
              open(werk / 'tijden.json', 'w'), indent=1)
    print('geschreven:', uit, uit.stat().st_size, 'bytes')


if __name__ == '__main__':
    main()
