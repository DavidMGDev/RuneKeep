"""Build one contact sheet of TITLE STRIPS per domain, so the card names can be read off the scans.

The domain cards are flat images in the rulebook PDF (no text layer), and the catalog only knows them
as "Blade 8" because that is all the filenames carry. Their real names are printed on the cards, so
this crops the title band out of every scan and stacks the 21 strips of a domain into one tall PNG,
each labelled with its card id.

That is all this does. Reading the sheet and writing the names into scripts/domain_card_titles.json is
a separate, deliberate step, because a wrong name here silently mislabels a card forever.

Usage:  python scripts/domain_title_strips.py [OUTDIR]
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
DOMAINS = ROOT / "assets" / "extracted_cards" / "Domains"

# The title band on a 750x1050 scan: the type plaque ("ABILITY"/"SPELL"/"GRIMOIRE") sits just above
# the name, and including it costs nothing and confirms the crop landed where we think it did.
TOP_FRAC = 0.465
BOT_FRAC = 0.560
OUT_W = 560          # strips are downscaled to this; the name stays comfortably legible
LABEL_W = 130        # gutter for the card id


def strips_for(domain_dir: Path) -> list[tuple[str, Image.Image]]:
    out = []
    for f in sorted(p for p in domain_dir.glob("*.webp") if not p.stem.endswith("_lod")):
        im = Image.open(f).convert("RGB")
        w, h = im.size
        band = im.crop((0, int(h * TOP_FRAC), w, int(h * BOT_FRAC)))
        scale = OUT_W / band.width
        band = band.resize((OUT_W, max(1, int(band.height * scale))), Image.LANCZOS)
        out.append((f.stem, band))
    return out


def sheet_for(domain_dir: Path, out_path: Path) -> None:
    strips = strips_for(domain_dir)
    if not strips:
        return
    row_h = strips[0][1].height
    sheet = Image.new("RGB", (LABEL_W + OUT_W, row_h * len(strips)), "#101318")
    draw = ImageDraw.Draw(sheet)
    for i, (name, band) in enumerate(strips):
        y = i * row_h
        sheet.paste(band, (LABEL_W, y))
        draw.text((8, y + row_h // 2 - 6), name, fill="#F2ECDC")
        draw.line([(0, y), (sheet.width, y)], fill="#3A4150")
    sheet.save(out_path)
    print(f"{out_path}  ({len(strips)} cards)")


def main() -> None:
    outdir = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "_titlestrips"
    outdir.mkdir(parents=True, exist_ok=True)
    roots = [DOMAINS, DOMAINS.parent / "Void" / "Domains"]
    for root in roots:
        if not root.is_dir():
            continue
        for d in sorted(p for p in root.iterdir() if p.is_dir()):
            sheet_for(d, outdir / f"{d.name.lower()}.png")


if __name__ == "__main__":
    main()
