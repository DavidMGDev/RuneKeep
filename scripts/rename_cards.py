"""Rename every extracted card from the scanner's page_NNN_card_RxC junk to real IDs, and
sort the Subclass folder into per-class folders.

What it does (all visually verified against the scans before this was written):
  - Domains/<Domain>/LL_page_...  ->  Domains/<Domain>/<domain>-<LL>-<n>.png
    (n = 1..k within the level, in rulebook page order; siblings .webp/_lod.webp follow)
  - Ancestry/page_...   -> Ancestry/<ancestry>.png    (the book lists the 18 alphabetically)
  - Community/page_...  -> Community/<community>.png  (the 9, alphabetical)
  - Subclass/page_...   -> Subclass/<Class>/<subclass>-<t>-<tier>.png
    The 54 subclass cards are three repeats of the same 18-subclass sequence:
    cards 1-18 Foundation, 19-36 Specialization, 37-54 Mastery (boundary cards eyeballed:
    18 = School of War Foundation, 19 = Troubadour Specialization, 37 = Troubadour Mastery).

Validates every expected count before touching anything; appends all moves to
scripts/card_renames.json. Dry run by default; --apply to move.

Usage:  python scripts/rename_cards.py [--apply]
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CARDS = ROOT / "assets" / "extracted_cards"
MAPPING_OUT = Path(__file__).resolve().parent / "card_renames.json"

ANCESTRIES = [
    "clank", "drakona", "dwarf", "elf", "faerie", "faun", "firbolg", "fungril", "galapa",
    "giant", "goblin", "halfling", "human", "infernis", "katari", "orc", "ribbet", "simiah",
]
COMMUNITIES = [
    "highborne", "loreborne", "orderborne", "ridgeborne", "seaborne", "slyborne",
    "underborne", "wanderborne", "wildborne",
]
# (class, subclass) in the book's order — repeats x3 as Foundation/Specialization/Mastery.
SUBCLASSES = [
    ("Bard", "troubadour"), ("Bard", "wordsmith"),
    ("Druid", "warden-of-the-elements"), ("Druid", "warden-of-renewal"),
    ("Guardian", "stalwart"), ("Guardian", "vengeance"),
    ("Ranger", "beastbound"), ("Ranger", "wayfinder"),
    ("Rogue", "nightwalker"), ("Rogue", "syndicate"),
    ("Seraph", "divine-wielder"), ("Seraph", "winged-sentinel"),
    ("Sorcerer", "elemental-origin"), ("Sorcerer", "primal-origin"),
    ("Warrior", "call-of-the-brave"), ("Warrior", "call-of-the-slayer"),
    ("Wizard", "school-of-knowledge"), ("Wizard", "school-of-war"),
]
TIERS = ["1-foundation", "2-specialization", "3-mastery"]


def page_key(p: Path):
    m = re.search(r"page_(\d+)_card_(\d+)x(\d+)", p.stem)
    if not m:
        sys.exit(f"unexpected filename: {p}")
    return tuple(int(g) for g in m.groups())


def expect(cond: bool, msg: str) -> None:
    if not cond:
        sys.exit(f"ABORT: {msg} — no files touched")


def main() -> None:
    apply = "--apply" in sys.argv
    moves: dict[str, str] = {}

    def plan(src: Path, dst: Path) -> None:
        moves[str(src.relative_to(ROOT)).replace("\\", "/")] = str(dst.relative_to(ROOT)).replace("\\", "/")

    # ---- Domains: <domain>-<LL>-<n> ----
    for dom_dir in sorted((CARDS / "Domains").iterdir()):
        if not dom_dir.is_dir():
            continue
        pngs = sorted(dom_dir.glob("[0-9][0-9]_page_*.png"), key=lambda p: (p.stem[:2], page_key(p)))
        expect(len(pngs) == 21, f"{dom_dir.name}: expected 21 cards, found {len(pngs)}")
        counter: dict[str, int] = {}
        for png in pngs:
            level = png.stem[:2]
            counter[level] = counter.get(level, 0) + 1
            for suffix in (".png", ".webp", "_lod.webp"):
                src = png.with_name(png.stem + suffix)
                if src.exists():
                    plan(src, dom_dir / f"{dom_dir.name.lower()}-{level}-{counter[level]}{suffix}")

    # ---- Ancestry / Community: real names, book order is alphabetical ----
    for folder, names in (("Ancestry", ANCESTRIES), ("Community", COMMUNITIES)):
        pngs = sorted((CARDS / folder).glob("page_*.png"), key=page_key)
        expect(len(pngs) == len(names), f"{folder}: expected {len(names)} cards, found {len(pngs)}")
        for png, name in zip(pngs, names):
            plan(png, CARDS / folder / f"{name}.png")

    # ---- Subclass: per-class folders, <subclass>-<t>-<tier> ----
    pngs = sorted((CARDS / "Subclass").glob("page_*.png"), key=page_key)
    expect(len(pngs) == 54, f"Subclass: expected 54 cards, found {len(pngs)}")
    for i, png in enumerate(pngs):
        cls, sub = SUBCLASSES[i % 18]
        plan(png, CARDS / "Subclass" / cls / f"{sub}-{TIERS[i // 18]}.png")

    if apply:
        for src_rel, dst_rel in moves.items():
            dst = ROOT / dst_rel
            dst.parent.mkdir(parents=True, exist_ok=True)
            (ROOT / src_rel).rename(dst)
    existing = json.loads(MAPPING_OUT.read_text()) if MAPPING_OUT.exists() else {}
    existing.update(moves)
    MAPPING_OUT.write_text(json.dumps(existing, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"{'moved' if apply else 'planned (dry run)'}: {len(moves)} files; mapping -> {MAPPING_OUT.name}")
    if not apply:
        for s, d in list(moves.items())[:6]:
            print(" ", s, "->", d)
        print("re-run with --apply to move")


if __name__ == "__main__":
    main()
