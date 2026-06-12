"""Sort the extracted Daggerheart domain cards into per-domain folders and prefix each file
with its level.

How it works (no OCR needed):
  1. DOMAIN — every card carries its domain banner at the top-left. We sample the ribbon's
     left edge (x 38..55, y 60..200 on the 750x1050 scans), take the median RGB (robust to the
     glyph/number overlapping the patch), and classify it against the nine known banner colors
     in HSV space (hue for the saturated banners; saturation/value separate Bone's silver from
     Midnight's near-black).
  2. LEVEL — the scans are named page_NNN_card_RxC, which preserves the rulebook's reading
     order, and the book lists each domain's cards level-sorted. So within one domain, sorted
     by (page, row, col), the 21 cards are levels [1,1,1, 2,2, 3,3, ... 10,10] (Daggerheart
     core: three level-1 cards, two of each level 2-10).

Both steps are validated hard: every domain must end up with EXACTLY 21 cards or the script
aborts without touching a file. Run with --apply to actually move; default is a dry run.

Moves every sibling format together (.png, .webp, _lod.webp) and writes a JSON mapping
old relative path -> new relative path to scripts/domain_card_moves.json so the app code
can be refactored from it.

Usage:  python scripts/sort_domain_cards.py [--apply]
"""

from __future__ import annotations

import colorsys
import json
import re
import statistics
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
DOMAINS_DIR = ROOT / "assets" / "extracted_cards" / "Domains"
MAPPING_OUT = Path(__file__).resolve().parent / "domain_card_moves.json"

# Sample patch: the banner ribbon's left edge — pure gradient color on every card,
# clear of the white level box and the domain glyph.
PATCH = (38, 60, 55, 200)

CARDS_PER_DOMAIN = 21
# Daggerheart core: 3 cards at level 1, 2 at each of levels 2..10.
LEVELS = [1, 1, 1] + [lvl for lvl in range(2, 11) for _ in range(2)]

# Reference banner colors (median of the ribbon edge patch), measured from the scans.
# Bone and Midnight are classified by saturation/value, the rest by hue.
DOMAIN_HUES = {
    "Arcana": 287,  # violet purple
    "Blade": 357,  # crimson red
    "Codex": 222,  # deep blue
    "Grace": 327,  # magenta rose
    "Sage": 146,  # leaf green
    "Splendor": 48,  # bright gold
    "Valor": 23,  # ember orange
}


def hue_dist(a: float, b: float) -> float:
    d = abs(a - b) % 360
    return min(d, 360 - d)


def classify(rgb: tuple[int, int, int]) -> str:
    r, g, b = rgb
    h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
    h *= 360
    if v < 0.25:
        return "Midnight"  # near-black navy
    if s < 0.25:
        return "Bone"  # desaturated silver
    return min(DOMAIN_HUES, key=lambda d: hue_dist(h, DOMAIN_HUES[d]))


def banner_color(png: Path) -> tuple[int, int, int]:
    im = Image.open(png).convert("RGB")
    px = list(im.crop(PATCH).getdata())
    return tuple(int(statistics.median(p[i] for p in px)) for i in range(3))


def reading_order_key(png: Path):
    m = re.match(r"page_(\d+)_card_(\d+)x(\d+)", png.stem)
    if not m:
        sys.exit(f"unexpected filename: {png.name}")
    return tuple(int(g) for g in m.groups())


def main() -> None:
    apply = "--apply" in sys.argv
    pngs = sorted(DOMAINS_DIR.glob("page_*.png"), key=reading_order_key)
    if not pngs:
        sys.exit("no loose page_*.png files in Domains/ — nothing to do")

    by_domain: dict[str, list[Path]] = {}
    for png in pngs:
        rgb = banner_color(png)
        by_domain.setdefault(classify(rgb), []).append(png)

    print(f"{len(pngs)} cards classified:")
    for dom in sorted(by_domain):
        print(f"  {dom:9} {len(by_domain[dom])}")

    bad = {d: len(c) for d, c in by_domain.items() if len(c) != CARDS_PER_DOMAIN}
    if bad or len(by_domain) != 9:
        sys.exit(f"ABORT: expected 9 domains x {CARDS_PER_DOMAIN} cards, got {bad or len(by_domain)} — no files touched")

    moves: dict[str, str] = {}
    for dom, cards in by_domain.items():
        for level, png in zip(LEVELS, sorted(cards, key=reading_order_key)):
            for suffix in (".png", ".webp", "_lod.webp"):
                src = png.with_name(png.stem + suffix)
                if not src.exists():
                    continue
                dst = DOMAINS_DIR / dom / f"{level:02d}_{png.stem}{suffix}"
                moves[str(src.relative_to(ROOT)).replace("\\", "/")] = str(dst.relative_to(ROOT)).replace("\\", "/")
                if apply:
                    dst.parent.mkdir(parents=True, exist_ok=True)
                    src.rename(dst)

    MAPPING_OUT.write_text(json.dumps(moves, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"\n{'moved' if apply else 'planned (dry run)'}: {len(moves)} files; mapping -> {MAPPING_OUT.name}")
    if not apply:
        print("re-run with --apply to move files")


if __name__ == "__main__":
    main()
