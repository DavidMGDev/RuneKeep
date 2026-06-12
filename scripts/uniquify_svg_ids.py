"""Prefix every id= / url(#...) in the art SVGs with the file's slug.

react-native-svg registers defs ids GLOBALLY: nine class banners all defining id="Gradient1"
meant whichever mounted last repainted every other banner's gradients (the "banners mixed
between cards" bug). Idempotent — skips ids already carrying the slug prefix.

Usage:  python scripts/uniquify_svg_ids.py
"""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FOLDERS = ["assets/art/classBanners", "assets/art/cardElements", "assets/art/new"]

total = 0
for folder in FOLDERS:
    for svg in sorted((ROOT / folder).glob("*.svg")):
        slug = re.sub(r"[^a-z0-9]+", "", (folder.split("/")[-1] + svg.stem).lower())
        text = svg.read_text(encoding="utf-8")
        if f'id="{slug}' in text:
            continue  # already prefixed
        ids = set(re.findall(r'id="([^"]+)"', text))
        if not ids:
            continue
        for i in sorted(ids, key=len, reverse=True):
            text = text.replace(f'id="{i}"', f'id="{slug}{i}"')
            text = text.replace(f"url(#{i})", f"url(#{slug}{i})")
            text = text.replace(f'href="#{i}"', f'href="#{slug}{i}"')
        svg.write_text(text, encoding="utf-8", newline="\n")
        total += 1
        print(f"prefixed {len(ids):3d} ids in {folder}/{svg.name}")
print(f"done — {total} files rewritten")
