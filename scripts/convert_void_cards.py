"""Convert the extracted "The Void" card PNGs into the app's bundled card-asset format.

Reads assets/temp/void-cards/manifest.json, maps every PNG to the RuneKeep card-asset
naming scheme, and writes each as a full-res .webp (750x1050, q86/method6 — the
convert_cards_webp.py pipeline) plus a matching _lod.webp thumb (188x263, q70/LANCZOS —
the generate_lods.py pipeline), under assets/extracted_cards/Void/.

DEDUPE: the Blood domain is shared by Blood Hunter + Summoner and Dread by Witch + Warlock;
content is identical, so only ONE set of each domain is emitted (first source encountered
wins — Blood Hunter for Blood, Witch for Dread).

Output tree:
  Void/Domains/<Blood|Dread>/<domain>-<LL>-<n>.webp   (LL = 2-digit level, n = 1..k in level)
  Void/Ancestry/<slug>.webp
  Void/Community/<slug>.webp
  Void/Subclass/<Class>/<subclass-slug>-<tier>-<foundation|specialization|mastery>.webp
  Void/Transformations/<slug>.webp
  Void/Summons/<slug>.webp                              (summon-entity cards, if any)

Also writes Void/void-manifest.json (a flat list of the output records).

Re-runnable: it overwrites its own outputs and rewrites the manifest each run.

Usage:  python scripts/convert_void_cards.py
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets" / "temp" / "void-cards"
OUT = ROOT / "assets" / "extracted_cards" / "Void"

FULL_SIZE = (750, 1050)
LOD_SIZE = (188, 263)
FULL_QUALITY = 86
LOD_QUALITY = 70

# manifest "class" -> on-disk subclass directory name
CLASS_DIR = {
    "Assassin": "Assassin",
    "Witch": "Witch",
    "Warlock": "Warlock",
    "Blood Hunter": "BloodHunter",
    "Summoner": "Summoner",
    "Brawler": "Brawler",
}
TIER_NUM = {"Foundation": 1, "Specialization": 2, "Mastery": 3}


def slugify(name: str) -> str:
    """lowercase, non-alphanumerics -> hyphens, collapsed & trimmed."""
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def save_pair(src_png: Path, out_rel: str) -> None:
    """Resize src to 750x1050 -> .webp, plus a 188x263 _lod.webp thumb."""
    dst = OUT / out_rel
    dst.parent.mkdir(parents=True, exist_ok=True)
    full = Image.open(src_png).convert("RGB").resize(FULL_SIZE, Image.LANCZOS)
    full.save(dst, "WEBP", quality=FULL_QUALITY, method=6)
    lod = dst.with_name(dst.stem + "_lod.webp")
    full.resize(LOD_SIZE, Image.LANCZOS).save(lod, "WEBP", quality=LOD_QUALITY, method=6)


def main() -> None:
    manifest = json.loads((SRC / "manifest.json").read_text(encoding="utf-8"))
    cards: dict = manifest["cards"]

    records: list[dict] = []
    domain_seen: dict[tuple[str, str], str] = {}       # (domain, title) -> outPath (dedupe)
    domain_level_n: dict[tuple[str, int], int] = {}     # (domain, level) -> last n used
    ambiguous: list[str] = []

    for c in cards.values():
        ct = c["contentType"]
        src_png = SRC / c["file"]
        title = c["cardTitle"]

        if ct == "domain":
            domain = c["domain"]                        # 'blood' | 'dread'
            level = int(c["level"])
            dedup_key = (domain, title)
            if dedup_key in domain_seen:
                continue                                # identical card from the other class
            n = domain_level_n.get((domain, level), 0) + 1
            domain_level_n[(domain, level)] = n
            dom_dir = domain.capitalize()               # Blood | Dread
            slug = f"{domain}-{level:02d}-{n}"
            out_rel = f"Domains/{dom_dir}/{slug}.webp"
            domain_seen[dedup_key] = out_rel
            rec = {
                "outPath": f"Void/{out_rel}",
                "category": "domain",
                "domain": domain,
                "level": level,
                "slug": slug,
                "cardTitle": title,
            }

        elif ct == "subclass":
            cdir = CLASS_DIR.get(c["class"])
            if cdir is None:
                ambiguous.append(f"{title}: unknown class {c['class']!r}")
                continue
            sub_slug = slugify(c["subclass"])
            tnum = TIER_NUM.get(c["tier"])
            if tnum is None:
                ambiguous.append(f"{title}: unknown tier {c['tier']!r}")
                continue
            slug = f"{sub_slug}-{tnum}-{c['tier'].lower()}"
            out_rel = f"Subclass/{cdir}/{slug}.webp"
            rec = {
                "outPath": f"Void/{out_rel}",
                "category": "subclass",
                "class": cdir,
                "subclass": c["subclass"],
                "tier": tnum,
                "slug": slug,
                "cardTitle": title,
            }

        elif ct == "ancestry":
            slug = slugify(title)
            out_rel = f"Ancestry/{slug}.webp"
            rec = {
                "outPath": f"Void/{out_rel}",
                "category": "ancestry",
                "slug": slug,
                "cardTitle": title,
            }

        elif ct == "community":
            slug = slugify(title)
            out_rel = f"Community/{slug}.webp"
            rec = {
                "outPath": f"Void/{out_rel}",
                "category": "community",
                "slug": slug,
                "cardTitle": title,
            }

        elif ct == "transformation":
            slug = slugify(title)
            out_rel = f"Transformations/{slug}.webp"
            rec = {
                "outPath": f"Void/{out_rel}",
                "category": "transformation",
                "slug": slug,
                "cardTitle": title,
            }

        elif ct in ("summon", "entity", "summon-entity"):
            slug = slugify(title)
            out_rel = f"Summons/{slug}.webp"
            rec = {
                "outPath": f"Void/{out_rel}",
                "category": "summon",
                "slug": slug,
                "cardTitle": title,
            }

        else:
            # class-sheet pages / anything non-card -> skip
            continue

        save_pair(src_png, out_rel)
        records.append(rec)

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "void-manifest.json").write_text(
        json.dumps(records, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    # ---- report ----
    by_cat: dict[str, int] = {}
    for r in records:
        by_cat[r["category"]] = by_cat.get(r["category"], 0) + 1
    print(f"wrote {len(records)} webp pairs to {OUT}")
    for cat in sorted(by_cat):
        print(f"  {cat}: {by_cat[cat]}")
    if ambiguous:
        print("AMBIGUOUS / skipped:")
        for a in ambiguous:
            print(f"  - {a}")


if __name__ == "__main__":
    main()
