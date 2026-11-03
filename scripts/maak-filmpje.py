#!/usr/bin/env python3
"""Bouwt een filmpje van schermafbeeldingen met een Nederlandse voice-over.

Hetzelfde idee als scripts/maak-rondleiding.py, maar de schermen komen uit een
JSON-bestand, zodat er meerdere filmpjes naast elkaar kunnen bestaan:

    python3 scripts/maak-filmpje.py --scenes filmpjes/nieuwe-functies.json \
        --stem /tmp/ak-video --uit docs/img/nieuwe-functies.mp4

Elke scène is {"beeld": pad, "stem": bestandsnaam, "tekst": onderschrift,
"telefoon": true/false}. De vertelling wordt eerst gemeten en bepaalt daarna hoe lang
het scherm in beeld blijft, zodat de stem nooit over het verkeerde scherm valt.
"""
import argparse
import json
import pathlib
import subprocess
import sys

WORTEL = pathlib.Path(__file__).resolve().parent.parent
DOCS = WORTEL / 'docs' / 'img'
FONT = '/home/hermes/.fonts/DejaVuSans-Bold.ttf'
FPS = 30
TITEL_S = 4.5
SLOT_S = 5.0
STEM_START = 0.45
STEM_STAART = 1.5
MIN_S = 3.6


def duur(pad):
    uit = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                          '-of', 'csv=p=0', str(pad)], capture_output=True, text=True, check=True)
    return float(uit.stdout.strip())


def sh(*args):
    uit = subprocess.run(list(args), capture_output=True, text=True)
    if uit.returncode != 0:
        raise RuntimeError(' '.join(str(a) for a in args) + '\n' + uit.stderr[-2000:])
    return uit.stdout


def maak_scene(index, scene, stem_dir, werk):
    stem = stem_dir / scene['stem']
    lengte_stem = duur(stem)
    duur_scene = round(max(MIN_S, lengte_stem + STEM_START + STEM_STAART), 2)
    caption = werk / ('cap%d.txt' % index)
    caption.write_text(scene['tekst'], encoding='utf-8')
    uit = werk / ('scene%d.mp4' % index)
    if scene.get('telefoon'):
        schaal = "scale=-2:600,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=0x0b1120"
    else:
        schaal = "scale=1280:-2,crop=1280:720"
    keten = ("[0:v]%s,setsar=1,fps=%d,"
             "drawbox=y=ih-104:h=104:color=0x0b1120@0.93:t=fill,"
             "drawtext=fontfile=%s:textfile=%s:fontsize=29:fontcolor=white:x=(w-text_w)/2:y=h-66,"
             "fade=t=in:st=0:d=0.4,fade=t=out:st=%.2f:d=0.5,format=yuv420p[v]"
             % (schaal, FPS, FONT, caption, duur_scene - 0.5))
    sh('ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-loop', '1', '-t', str(duur_scene),
       '-i', str(scene['beeld']), '-filter_complex', keten, '-map', '[v]',
       '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-color_range', 'tv',
       '-pix_fmt', 'yuv420p', str(uit))
    print('   scherm %d: stem %.2fs, beeld %.2fs (%s)' % (index, lengte_stem, duur(uit), scene['tekst']))
    return {'bestand': uit, 'duur': duur_scene, 'stem': stem, 'stem_start': 0}


def maak_kaart(beeld, seconden, uit):
    sh('ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-loop', '1', '-t', str(seconden),
       '-i', str(beeld), '-vf', 'scale=1280:720,setsar=1,fps=%d,format=yuv420p' % FPS,
       '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-color_range', 'tv',
       '-pix_fmt', 'yuv420p', str(uit))
    return duur(uit)


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--scenes', required=True, help='JSON met de schermen van dit filmpje')
    p.add_argument('--stem', default='/tmp/ak-video', help='map met de ingesproken regels')
    p.add_argument('--uit', default=str(DOCS / 'filmpje.mp4'))
    p.add_argument('--werk', default='/tmp/ak-filmpje')
    p.add_argument('--titel', default='titel.png')
    p.add_argument('--slot', default='slot.png')
    args = p.parse_args()

    stem_dir = pathlib.Path(args.stem)
    werk = pathlib.Path(args.werk)
    werk.mkdir(parents=True, exist_ok=True)
    scènes_def = json.loads(pathlib.Path(args.scenes).read_text())
    for s in scènes_def:
        beeld = pathlib.Path(s['beeld'])
        if not beeld.is_absolute():
            beeld = WORTEL / beeld
        s['beeld'] = beeld
        if not beeld.exists():
            print('LET OP: beeld ontbreekt:', beeld)
            sys.exit(1)
        if not (stem_dir / s['stem']).exists():
            print('LET OP: stem ontbreekt:', stem_dir / s['stem'])
            sys.exit(1)

    print('== Schermen bouwen')
    scènes = [maak_scene(i + 1, s, stem_dir, werk) for i, s in enumerate(scènes_def)]

    print('== Titel- en slotkaart')
    titel = werk / 'titel.mp4'
    slot = werk / 'slot.mp4'
    maak_kaart(stem_dir / args.titel, TITEL_S, titel)
    maak_kaart(stem_dir / args.slot, SLOT_S, slot)

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
        print('   %-16s stem op %5.2fs' % (s['stem'].name, s['stem_start']))

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
       "aecho=0.8:0.9:120|260:0.28|0.14,volume=0.45,"
       "afade=t=in:d=2.5,afade=t=out:st=%.2f:d=3.5[bed]" % (totaal - 3.5),
       '-map', '[bed]', '-ac', '2', '-ar', '44100', str(bed))

    invoer = []
    for s in scènes:
        invoer += ['-i', str(s['stem'])]
    invoer += ['-i', str(bed)]
    keten = []
    labels = []
    for i, s in enumerate(scènes):
        ms = int(s['stem_start'] * 1000)
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
    print(sh('ffprobe', '-v', 'error', '-show_entries',
             'format=duration,size:stream=codec_name,codec_type,width,height,r_frame_rate,channels',
             '-of', 'default=noprint_wrappers=1', str(uit)))
    json.dump({'scenes': [{'stem': s['stem'].name, 'start': s['stem_start'], 'duur': s['duur']} for s in scènes],
               'totaal': totaal}, open(werk / 'tijden.json', 'w'), indent=1)
    print('geschreven:', uit, uit.stat().st_size, 'bytes')


if __name__ == '__main__':
    main()
