"""
APK asset optimizer (#173) — run on the `apk-optimize` branch ONLY; `main` keeps the original
uncompressed assets so any change is non-destructively revertible (owner requirement).

1. assets/art/**/*.png  -> sibling .webp at quality 92 (near-lossless; PNG is a lossless source so
   this is the first lossy pass). The bloated 24-bit UI illustrations shrink ~80-90%. The original
   .png is removed (it lives on `main`).  Requires in art.ts / gear-stack.tsx / straight-carousel.tsx
   are repointed to .webp by update_art_requires.py.
2. assets/extracted_cards/**/*.webp (full-res, NOT *_lod) -> re-encode at quality 82, kept only if
   smaller (a second lossy pass, imperceptible at phone scale; the LOD thumbs are left untouched).

Usage:  python scripts/optimize_assets.py
"""
import io
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def mb(n):
    return f"{n / 1048576:.2f} MB"


def convert_art_pngs():
    art = os.path.join(ROOT, "assets", "art")
    before = after = 0
    n = 0
    for dirpath, _dirs, files in os.walk(art):
        for f in files:
            if not f.lower().endswith(".png"):
                continue
            src = os.path.join(dirpath, f)
            dst = src[:-4] + ".webp"
            im = Image.open(src).convert("RGBA")
            im.save(dst, "WEBP", quality=92, method=6)
            o, w = os.path.getsize(src), os.path.getsize(dst)
            before += o
            after += w
            n += 1
            os.remove(src)
    print(f"art png->webp: {n} files, {mb(before)} -> {mb(after)} (saved {mb(before - after)})")


def reencode_cards():
    cards = os.path.join(ROOT, "assets", "extracted_cards")
    before = after = 0
    changed = 0
    for dirpath, _dirs, files in os.walk(cards):
        for f in files:
            if not f.lower().endswith(".webp") or f.lower().endswith("_lod.webp"):
                continue
            src = os.path.join(dirpath, f)
            o = os.path.getsize(src)
            im = Image.open(src).convert("RGBA")
            buf = io.BytesIO()
            im.save(buf, "WEBP", quality=82, method=6)
            before += o
            if buf.tell() < o:  # only overwrite when actually smaller
                with open(src, "wb") as fh:
                    fh.write(buf.getvalue())
                after += buf.tell()
                changed += 1
            else:
                after += o
    print(f"cards re-encode q82: {changed} shrunk, {mb(before)} -> {mb(after)} (saved {mb(before - after)})")


if __name__ == "__main__":
    convert_art_pngs()
    reencode_cards()
