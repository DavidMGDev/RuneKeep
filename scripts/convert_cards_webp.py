"""Convert every card PNG under assets/extracted_cards/ to WebP and drop the PNG.

Quality q86 / method 6 — the exact pipeline the 36 in-app deck cards already use (#65):
visually indistinguishable on the 750x1050 scans at ~8x smaller. The PNG masters stay
recoverable from git history. PNGs that already have a .webp sibling are just deleted;
_lod.webp thumbs are NOT generated here (made on demand when a card enters the app).

Usage:  python scripts/convert_cards_webp.py
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image

CARDS = Path(__file__).resolve().parent.parent / "assets" / "extracted_cards"
QUALITY = 86

converted = skipped = 0
for png in sorted(CARDS.rglob("*.png")):
    webp = png.with_suffix(".webp")
    if webp.exists():
        skipped += 1
    else:
        Image.open(png).convert("RGB").save(webp, "WEBP", quality=QUALITY, method=6)
        converted += 1
    png.unlink()

total_webp = sum(1 for _ in CARDS.rglob("*.webp"))
total_png = sum(1 for _ in CARDS.rglob("*.png"))
size_mb = sum(f.stat().st_size for f in CARDS.rglob("*.webp")) / 1e6
print(f"converted {converted}, deleted {converted + skipped} PNGs ({skipped} had a webp already)")
print(f"now: {total_webp} webp / {total_png} png, {size_mb:.1f} MB total")
