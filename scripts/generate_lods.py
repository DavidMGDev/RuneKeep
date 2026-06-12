"""Generate the _lod.webp thumb for every card that lacks one.

LOD thumbs (188x263, WebP q70, LANCZOS — the #78 pipeline) are build artifacts: gitignored,
regenerated from the full-res .webp whenever missing. Run this after cloning (the app's
card-data.ts requires the thumbs of the cards it uses) or after adding new cards.

Usage:  python scripts/generate_lods.py
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image

CARDS = Path(__file__).resolve().parent.parent / "assets" / "extracted_cards"
SIZE = (188, 263)

made = 0
for webp in sorted(CARDS.rglob("*.webp")):
    if webp.stem.endswith("_lod"):
        continue
    lod = webp.with_name(webp.stem + "_lod.webp")
    if lod.exists():
        continue
    Image.open(webp).convert("RGB").resize(SIZE, Image.LANCZOS).save(lod, "WEBP", quality=70, method=6)
    made += 1
print(f"generated {made} LOD thumbs")
