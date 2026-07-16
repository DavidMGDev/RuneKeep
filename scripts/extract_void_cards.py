"""Extract card-face PNGs from the eight Daggerheart "The Void" homebrew PDFs.

The Void print-and-play sheets lay every card on a fixed 3x3 grid of 2.5"x3.5"
cards (cell ~= 750x1050 px @ 300 DPI, the same dimensions the app's existing deck
cards use). Each card page uses N full rows of 3 (subclass / ancestry / community /
transformation pages = 2 rows, most domain pages = 3 rows, the short domain pages =
1 row). Only SOME pages are card sheets; character-sheet / character-guide /
martial-form pages are skipped.

Grid geometry is read per page from the registration crop-marks printed in the page
margins (top/bottom margins -> the 4 vertical column lines; left margin -> the 4
horizontal row lines), so it is content-independent and robust to the variable text
height of subclass cards. Cards are cropped exactly at the crop-mark cut lines.

Outputs full-res PNG crops to  assets/temp/void-cards/<ClassName>/  plus a
void-cards/manifest.json mapping every file to its metadata. No webp/LOD conversion
(that pipeline runs later, see scripts/convert_cards_webp.py + generate_lods.py).

Re-runnable: overwrites existing crops and the manifest.

Usage:  python scripts/extract_void_cards.py
"""

from __future__ import annotations

import io
import json
import re
from pathlib import Path

import fitz  # PyMuPDF
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PDF_DIR = ROOT / "assets" / "temp" / "void-pdfs"
OUT_DIR = ROOT / "assets" / "temp" / "void-cards"

DPI = 300
INK = 245          # gray < INK counts as ink
MARGIN = 60        # px strip at each page edge to hunt for crop-mark ticks
TIER = ("Foundation", "Specialization", "Mastery")


# --------------------------------------------------------------------------- #
# Card list builders
# --------------------------------------------------------------------------- #
def slug(text: str) -> str:
    return re.sub(r"_+", "_", re.sub(r"[^a-z0-9]+", "_", text.lower())).strip("_")


def subclass_page(class_slug: str, subclasses: list[tuple[str, str]]) -> list[dict]:
    """subclasses = [(display_name, short_slug), ...] laid out one per row, 3 tiers/row."""
    cards = []
    for name, short in subclasses:
        for tier in TIER:
            cards.append({
                "contentType": "subclass",
                "subclass": name,
                "tier": tier,
                "cardTitle": f"{name} — {tier}",
                "file": f"{class_slug}_subclass_{short}_{tier.lower()}.png",
            })
    return cards


def domain_cards(domain: str, entries: list[tuple[int, str, str]]) -> list[dict]:
    """entries = [(level, title, type), ...] in page reading order."""
    return [{
        "contentType": "domain",
        "domain": domain,
        "level": lvl,
        "cardType": typ,
        "cardTitle": title,
        "file": f"{domain}_L{lvl}_{slug(title)}.png",
    } for lvl, title, typ in entries]


def simple_cards(content_type: str, prefix: str, titles: list[str]) -> list[dict]:
    return [{
        "contentType": content_type,
        "cardTitle": t,
        "file": f"{prefix}_{slug(t)}.png",
    } for t in titles]


# Shared domain card sets (identical across the two PDFs that print each domain) ----
DREAD_P4 = domain_cards("dread", [
    (1, "Blighting Strike", "Spell"), (1, "Voice of Dread", "Spell"), (1, "Umbral Veil", "Spell"),
    (2, "Hideous Retribution", "Spell"), (2, "Siphon Essence", "Spell"), (3, "Terrify", "Spell"),
    (3, "Shared Trauma", "Spell"), (4, "Chains of Affliction", "Spell"), (4, "Summon Horror", "Spell"),
])
DREAD_P5 = domain_cards("dread", [
    (5, "Spectral Mist", "Spell"), (5, "Dire Strike", "Spell"), (6, "Darkfire", "Spell"),
    (6, "Jump Scare", "Spell"), (7, "Dread-Touched", "Ability"), (7, "Wall of Hunger", "Spell"),
    (8, "Dark Army", "Spell"), (8, "Eldritch Flesh", "Spell"), (9, "Damnation", "Spell"),
])
DREAD_P6 = domain_cards("dread", [
    (9, "Savor the Anguish", "Spell"), (10, "Invoke Torment", "Spell"), (10, "Avatar of Terror", "Spell"),
])

BLOOD_P4 = domain_cards("blood", [
    (1, "Blood Spike", "Spell"), (1, "Lifeblood Talisman", "Spell"), (1, "Power Through Pain", "Ability"),
    (2, "Brand of Castigation", "Spell"), (2, "Palpitations", "Spell"), (3, "Blood Puppet", "Spell"),
    (3, "Burning Gore", "Spell"), (4, "Grisly Harpoon", "Spell"), (4, "Weave the Flesh", "Spell"),
])
BLOOD_P5 = domain_cards("blood", [
    (5, "Viscous Form", "Spell"), (5, "Parasite of the Will", "Spell"), (6, "Blood Bind", "Spell"),
    (6, "Life Link", "Spell"), (7, "Blood-Touched", "Ability"), (7, "Vampiric Strike", "Ability"),
    (8, "Vital Ward", "Spell"), (8, "Bleeding Tree", "Spell"), (9, "Ichor Wave", "Spell"),
])
BLOOD_P6 = domain_cards("blood", [
    (9, "Glyph of Hemorrhaging", "Spell"), (10, "Scabrous Adamance", "Ability"), (10, "Sanguine Feast", "Spell"),
])


# --------------------------------------------------------------------------- #
# Per-PDF specification.  Each page: {page, rows, cards}. rows*3 == len(cards).
# --------------------------------------------------------------------------- #
SPEC = [
    {
        "pdf": "Assassin-v1.5-The-Void.pdf", "class": "Assassin", "folder": "Assassin",
        "domains": ["Midnight", "Blade"],
        "pages": [
            {"page": 3, "rows": 2, "cards": subclass_page("assassin", [
                ("Executioners Guild", "executioners"), ("Poisoners Guild", "poisoners")])},
        ],
    },
    {
        "pdf": "Witch-v1.5-The-Void.pdf", "class": "Witch", "folder": "Witch",
        "domains": ["Dread", "Sage"],
        "pages": [
            {"page": 3, "rows": 2, "cards": subclass_page("witch", [
                ("Hedge", "hedge"), ("Moon", "moon")])},
            {"page": 4, "rows": 3, "cards": DREAD_P4},
            {"page": 5, "rows": 3, "cards": DREAD_P5},
            {"page": 6, "rows": 1, "cards": DREAD_P6},
        ],
    },
    {
        "pdf": "Warlock-v1.5-The-Void.pdf", "class": "Warlock", "folder": "Warlock",
        "domains": ["Dread", "Grace"],
        "pages": [
            {"page": 3, "rows": 2, "cards": subclass_page("warlock", [
                ("Pact of the Endless", "endless"), ("Pact of the Wrathful", "wrathful")])},
            {"page": 4, "rows": 3, "cards": DREAD_P4},
            {"page": 5, "rows": 3, "cards": DREAD_P5},
            {"page": 6, "rows": 1, "cards": DREAD_P6},
        ],
    },
    {
        "pdf": "Blood_Hunter_Void_2026_07_09.pdf", "class": "Blood Hunter", "folder": "BloodHunter",
        "domains": ["Blood", "Bone"],
        "pages": [
            {"page": 3, "rows": 3, "cards": subclass_page("bloodhunter", [
                ("Order of the Specter", "specter"), ("Order of the Mutant", "mutant"),
                ("Order of the Lycan", "lycan")])},
            {"page": 4, "rows": 3, "cards": BLOOD_P4},
            {"page": 5, "rows": 3, "cards": BLOOD_P5},
            {"page": 6, "rows": 1, "cards": BLOOD_P6},
        ],
    },
    {
        "pdf": "Summoner_Void_2026_07_09.pdf", "class": "Summoner", "folder": "Summoner",
        "domains": ["Blood", "Splendor"],
        "pages": [
            {"page": 3, "rows": 2, "cards": subclass_page("summoner", [
                ("Necromancy", "necromancy"), ("Theurgy", "theurgy")])},
            {"page": 4, "rows": 3, "cards": BLOOD_P4},
            {"page": 5, "rows": 3, "cards": BLOOD_P5},
            {"page": 6, "rows": 1, "cards": BLOOD_P6},
        ],
    },
    {
        "pdf": "Brawler-v1.5-The-Void.pdf", "class": "Brawler", "folder": "Brawler",
        "domains": ["Bone", "Valor"],
        "pages": [
            {"page": 4, "rows": 2, "cards": subclass_page("brawler", [
                ("Juggernaut", "juggernaut"), ("Martial Artist", "martial_artist")])},
        ],
    },
    {
        "pdf": "Heritage-v1.5-The-Void.pdf", "class": "Heritage", "folder": "Heritage",
        "domains": [],
        "pages": [
            {"page": 1, "rows": 2, "cards": simple_cards("ancestry", "ancestry",
                ["Earthkin", "Tidekin", "Emberkin", "Skykin", "Aetheris", "Gnome"])},
            {"page": 2, "rows": 2, "cards": simple_cards("community", "community",
                ["Duneborne", "Freeborne", "Frostborne", "Hearthborne", "Reborne", "Warborne"])},
        ],
    },
    {
        "pdf": "Transformations-v1.5-The-Void.pdf", "class": "Transformations", "folder": "Transformations",
        "domains": [],
        "pages": [
            {"page": 1, "rows": 2, "cards": simple_cards("transformation", "transformation",
                ["Vampire", "Werewolf", "Reanimated", "Shapeshifter", "Ghost", "Demigod"])},
        ],
    },
]


# --------------------------------------------------------------------------- #
# Crop-mark grid detection
# --------------------------------------------------------------------------- #
def _tick_centers(profile: np.ndarray, thresh: int = 2, min_gap: int = 12,
                  max_len: int = 160) -> list[int]:
    """Centres of short high-ink runs in a 1-D margin profile (the crop ticks)."""
    bands, start = [], None
    for i, v in enumerate(profile):
        if v > thresh and start is None:
            start = i
        elif v <= thresh and start is not None:
            bands.append([start, i]); start = None
    if start is not None:
        bands.append([start, len(profile)])
    merged: list[list[int]] = []
    for b in bands:
        if merged and b[0] - merged[-1][1] < min_gap:
            merged[-1][1] = b[1]
        else:
            merged.append(b)
    return [(a + b) // 2 for a, b in merged if (b - a) <= max_len]


def grid_lines(img: Image.Image) -> tuple[list[int], list[int]]:
    """Return (x column-cut lines, y row-cut lines) from the page's crop marks."""
    arr = np.asarray(img.convert("L"))
    H, W = arr.shape
    ink = (arr < INK).astype(np.int32)

    # Columns: vertical ticks live in the clean top & bottom margins.
    xs = _tick_centers(ink[0:MARGIN, :].sum(axis=0))
    if len(xs) != 4:
        xs = _tick_centers(ink[H - MARGIN:H, :].sum(axis=0))
    # Rows: horizontal ticks live in the LEFT margin (right margin holds the
    # rotated class/domain banner, so it is not reliable).
    ys = _tick_centers(ink[:, 0:145].sum(axis=1))

    if len(xs) != 4 or len(ys) != 4:
        raise RuntimeError(f"crop-mark detection failed: xs={xs} ys={ys}")
    return sorted(xs), sorted(ys)


def render(pdf_path: Path, page1: int) -> Image.Image:
    doc = fitz.open(pdf_path)
    page = doc.load_page(page1 - 1)
    pix = page.get_pixmap(matrix=fitz.Matrix(DPI / 72, DPI / 72), alpha=False)
    img = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")
    doc.close()
    return img


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #
def main() -> None:
    manifest: dict[str, dict] = {}
    per_pdf: dict[str, int] = {}
    grid_used: dict[str, dict] = {}
    total = 0

    for spec in SPEC:
        pdf_path = PDF_DIR / spec["pdf"]
        folder = OUT_DIR / spec["folder"]
        folder.mkdir(parents=True, exist_ok=True)
        count = 0

        for pg in spec["pages"]:
            page_no, rows, cards = pg["page"], pg["rows"], pg["cards"]
            assert len(cards) == rows * 3, \
                f"{spec['pdf']} p{page_no}: {len(cards)} cards != {rows}x3"

            img = render(pdf_path, page_no)
            xs, ys = grid_lines(img)
            grid_used[f"{spec['folder']} p{page_no}"] = {
                "rows": rows, "cols": 3, "xcuts": xs, "ycuts": ys[:rows + 1]}

            for idx, card in enumerate(cards):
                r, c = divmod(idx, 3)
                box = (xs[c], ys[r], xs[c + 1], ys[r + 1])
                img.crop(box).save(folder / card["file"])

                rel = f"{spec['folder']}/{card['file']}"
                entry = {
                    "file": rel,
                    "pdf": spec["pdf"],
                    "page": page_no,
                    "gridPos": f"R{r + 1}C{c + 1}",
                    "class": spec["class"],
                    "domain": card.get("domain"),
                    "cardTitle": card["cardTitle"],
                    "contentType": card["contentType"],
                }
                for extra in ("subclass", "tier", "level", "cardType"):
                    if extra in card:
                        entry[extra] = card[extra]
                if card["contentType"] in ("ancestry", "community", "transformation"):
                    entry["classDomains"] = None
                elif card["contentType"] == "subclass":
                    entry["classDomains"] = spec["domains"]
                manifest[rel] = entry
                count += 1

        per_pdf[spec["pdf"]] = count
        total += count
        print(f"  {spec['pdf']:<34} -> {count:>2} cards  ({spec['folder']}/)")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest_path = OUT_DIR / "manifest.json"
    with open(manifest_path, "w", encoding="utf-8") as fh:
        json.dump({
            "dpi": DPI,
            "cardSize": "~750x1050 (2.5x3.5in @ 300 DPI)",
            "total": total,
            "perPdf": per_pdf,
            "gridUsed": grid_used,
            "cards": manifest,
        }, fh, indent=2)

    print(f"\nTotal: {total} cards across {len(SPEC)} PDFs")
    print(f"Manifest: {manifest_path}")


if __name__ == "__main__":
    main()
