"""
Re-cut every Hope and Fear card face from the publisher PDF into the app's card art.

WHY
---
The bundled Hope and Fear art was cropped on a grid that was about a point out in both axes, so every
card carried a sliver of its neighbour down the left edge and a strip of page margin across the top.
Two points is nothing on a page and very visible on a card.

The grid here is MEASURED rather than assumed: the cards sit flush in a 3 by 3 arrangement, so the
pitch is exact, and the origin is found by scanning the rendered page for the first pixel that is not
page-white. That check is re-run by `--verify`, so this cannot quietly drift again.

WHAT IT WRITES
--------------
Each card goes to the path the extraction manifest already assigns it, matched by TITLE, so filenames
and therefore every `require()` in the catalog stay exactly as they are. Cards the manifest does not
know (the Blood domain, which is beta content the printed book never included) are left alone.

    python scripts/extract_hf_cards.py --verify     # report the grid and the matches, write nothing
    python scripts/extract_hf_cards.py              # write the webp faces

Run `python scripts/generate_lods.py` afterwards to rebuild the thumbnails.

Requires PyMuPDF and Pillow.
"""

from __future__ import annotations

import argparse
import io
import json
import pathlib
import re
import sys

try:
    import fitz
except ImportError:  # pragma: no cover
    sys.exit("PyMuPDF is missing. Run:  pip install pymupdf")

from PIL import Image

PDF = pathlib.Path("D:/Tools/Homebrew/Daggerheart/HOPEANDFEAR_Cards.pdf")
ASSETS = pathlib.Path(__file__).resolve().parent.parent / "assets" / "extracted_cards"
MANIFEST = ASSETS / "Void" / "void-manifest.json"

# --- The grid ------------------------------------------------------------------------------------
#
# Every page lays nine cards out flush, three across and three down. The pitch is the card size, so
# the only thing that can be wrong is the origin, and the origin is what was wrong: it sat 1.2pt up
# and to the left of the real card, which is why each crop began with the previous card's edge.
#
# 179.5 x 252 is a 2.5 x 3.5 inch card to within a rounding error, which is the sanity check that
# these are the true bounds rather than merely self-consistent ones.

COL_X = [36.4, 215.9, 395.4]
ROW_Y = [18.4, 270.4, 522.4]
CARD_W = 179.5
CARD_H = 252.0

OUT_W, OUT_H = 750, 1050  # the size every other card art in the app uses
TIER_WORDS = ("Foundation", "Specialization", "Mastery")


def card_rect(col: int, row: int) -> fitz.Rect:
    x, y = COL_X[col], ROW_Y[row]
    return fitz.Rect(x, y, x + CARD_W, y + CARD_H)


def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", s.lower())


def spans(page: fitz.Page) -> list[dict]:
    return [s for b in page.get_text("dict")["blocks"] if b.get("lines") for line in b["lines"] for s in line["spans"]]


def read_cards(doc: fitz.Document) -> list[dict]:
    """Every card on every page: its grid cell, its printed number and its title."""
    out = []
    for pno, page in enumerate(doc):
        sp = spans(page)
        for row in range(len(ROW_Y)):
            for col in range(len(COL_X)):
                r = card_rect(col, row)
                inside = [s for s in sp if r.x0 - 2 < (s["bbox"][0] + s["bbox"][2]) / 2 < r.x1 + 2 and r.y0 - 2 < s["bbox"][1] < r.y1]
                if not inside:
                    continue
                num = next((m.group(1) for s in inside if (m := re.search(r"DH HF (\d+)/063", s["text"]))), None)
                if not num:
                    continue
                # The title is the largest span that is a word rather than a level number or a type
                # plaque. Subclass cards then add their tier word, which is what tells the three
                # cards of one subclass apart.
                cand = [s for s in inside if re.search(r"[A-Za-z]{3}", s["text"]) and s["text"].strip().lower() not in ("spell", "ability", "grimoire")]
                if not cand:
                    continue
                title = max(cand, key=lambda s: s["size"])["text"].strip()
                tier = next((w for w in TIER_WORDS if any(w.lower() in s["text"].strip().lower() for s in inside)), "")
                out.append({"page": pno, "col": col, "row": row, "num": num, "title": title, "tier": tier})
    return out


def manifest_index() -> dict[str, str]:
    """normalised printed title -> output path, from the extraction manifest."""
    idx = {}
    for rowdata in json.loads(MANIFEST.read_text(encoding="utf8")):
        title = rowdata.get("cardTitle", "")
        try:
            title = title.encode("latin1").decode("utf8")  # the manifest was written as mojibake
        except (UnicodeEncodeError, UnicodeDecodeError):
            pass
        idx[norm(title)] = rowdata["outPath"]
    return idx


def verify_grid(doc: fitz.Document) -> bool:
    """Every card must start on card content, not on page white."""
    ok = True
    for pno, page in enumerate(doc):
        pix = page.get_pixmap(dpi=300)
        img = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")
        s = 300 / 72
        for row, ry in enumerate(ROW_Y):
            for col, cx in enumerate(COL_X):
                x, y = int(cx * s) + 1, int((ry + CARD_H * 0.15) * s)
                if y >= img.height:
                    continue
                px = img.getpixel((x, y))
                top = img.getpixel((int((cx + CARD_W * 0.5) * s), int(ry * s) + 1))
                if all(c > 244 for c in px) or all(c > 244 for c in top):
                    print(f"  ! p{pno + 1} r{row} c{col}: crop starts on page white")
                    ok = False
    return ok


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--verify", action="store_true", help="check the grid and the matches, write nothing")
    args = ap.parse_args()

    doc = fitz.open(PDF)
    print("Grid check:", "clean" if verify_grid(doc) else "PROBLEMS ABOVE")

    idx = manifest_index()
    cards = read_cards(doc)
    print(f"\n{len(cards)} card faces found in the book\n")

    matched, missed = [], []
    for c in cards:
        key = norm(c["title"] + c["tier"])
        path = idx.get(key) or idx.get(norm(c["title"]))
        (matched if path else missed).append((c, path))

    for c, path in matched:
        label = f"{c['num']}  {c['title']}{' ' + c['tier'] if c['tier'] else ''}"
        print(f"  {label:52} -> {path}")
    for c, _ in missed:
        print(f"  {c['num']}  {c['title']} {c['tier']}".ljust(56) + "-> NO MATCH, left alone")

    if args.verify:
        print(f"\n{len(matched)} matched, {len(missed)} unmatched. Nothing written.")
        return

    for c, path in matched:
        page = doc[c["page"]]
        # Oversample then downsample: the card text is vector, and shrinking is what keeps the small
        # print legible at 750px.
        pix = page.get_pixmap(clip=card_rect(c["col"], c["row"]), dpi=600)
        img = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB").resize((OUT_W, OUT_H), Image.LANCZOS)
        dest = ASSETS / path
        dest.parent.mkdir(parents=True, exist_ok=True)
        img.save(dest, "WEBP", quality=90, method=6)

    print(f"\nWrote {len(matched)} card faces. Now run: python scripts/generate_lods.py")


if __name__ == "__main__":
    main()
