"""
Builds the table's Aggressive sound scheme (v0.47.16) into public/sounds/aggressive/.

Each file named in aggressive-files.txt is read from the source folder, its trailing silence trimmed, and written as
a small MP3 under a plain lowercase name (the slug the app asks for: see table-sound.ts). Loudness is levelled in the
app when a sound is decoded (src/lib/loudness.ts), and each cue caps how long it may ring, so neither is done here.

    python scripts/sounds/build-aggressive.py "<folder with the .wav files>"
"""
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', '..', 'public', 'sounds', 'aggressive')


def slug(name: str) -> str:
    return re.sub(r'[^a-z0-9]+', '-', os.path.splitext(name)[0].lower()).strip('-')


def main(src: str) -> None:
    os.makedirs(OUT, exist_ok=True)
    names = [n.strip() for n in open(os.path.join(HERE, 'aggressive-files.txt'), encoding='utf8') if n.strip()]
    slugs = [slug(n) for n in names]
    assert len(set(slugs)) == len(slugs), 'two files share a slug'
    for n, s in zip(names, slugs):
        subprocess.run([
            'ffmpeg', '-v', 'error', '-y', '-i', os.path.join(src, n),
            # Trailing silence off (reversed, the leading silence is the tail), then 128k MP3 at 44.1 kHz.
            '-af', 'areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse',
            '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '128k', os.path.join(OUT, s + '.mp3'),
        ], check=True)
    print(f'{len(names)} sounds written to {os.path.normpath(OUT)}')


if __name__ == '__main__':
    main(sys.argv[1])
