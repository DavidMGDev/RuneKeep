"""Generate src/data/catalog.ts — static requires + metadata for every card.

Metro can only bundle literal require() paths, so the catalog must be generated, not globbed at
runtime. Re-run whenever cards are added/renamed. Reads the asset tree, derives metadata from the
ID naming scheme (see scripts/rename_cards.py), and emits one typed entry per card with its
full-res + LOD pair.

Usage:  python scripts/generate_card_catalog.py
"""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CARDS = ROOT / "assets" / "extracted_cards"
OUT = ROOT / "src" / "data" / "catalog.ts"
REL = "../../assets/extracted_cards"

TIER_NAMES = {1: "Foundation", 2: "Specialization", 3: "Mastery"}

# v0.32.0: the real printed name of every domain card, read off the scans (see
# scripts/domain_title_strips.py — the rulebook stores these cards as flat images, so there is no text
# layer to pull from). Before this the catalog called them "Blade 8", which is where the card sits in
# the book rather than what it is called at the table. A card missing from the file falls back to the
# old positional label, so adding an expansion's cards never breaks the build.
TITLES: dict[str, str] = {
    k: v for k, v in json.loads((Path(__file__).parent / "domain_card_titles.json").read_text(encoding="utf-8")).items()
    if not k.startswith("_")
}


# The two Void packs (v0.25.0). Everything under assets/extracted_cards/Void is the OFFICIAL "The
# Void" expansion except this list, which is the earlier BETA holding the Blood domain and the five
# subclasses that were cut before release. Two packs, gated separately, because a table playing the
# published book should not be offered playtest content it cannot look up.
VOID_EXPANSION = "void"
BETA_EXPANSION = "thevoid"
BETA_SUBCLASSES = ("order-of-the-lycan", "order-of-the-mutant", "order-of-the-specter", "necromancy", "theurgy")
BETA_CARDS = frozenset(
    [f"blood-{lvl:02d}-{n}" for lvl in range(1, 11) for n in (1, 2, 3) if lvl == 1 or n <= 2]
    + [f"subclass-{s}-{t}-{name}" for s in BETA_SUBCLASSES for t, name in ((1, "foundation"), (2, "specialization"), (3, "mastery"))]
)

# The Hope and Fear ancestries are NOT catalog rows. They are authored as structured LibraryCards
# in src/data/void-ancestries.ts and seeded onto the expansion record, so that mixed-ancestry
# strike-through, markdown and stat effects all work on them. v0.12.3 deleted these six rows from
# the generated catalog BY HAND, and regenerating this file in v0.32.0 put them straight back, so
# every one of them appeared TWICE in the creator: once from the catalog and once from the
# expansion. Two cards sharing one id also means two image views sharing one recycling key, which
# is what made that end of the ancestry deck flicker.
#
# Excluding them HERE is the fix, for the same reason the beta split lives here: a hand edit to a
# generated file survives exactly until the next generation. `data-integrity.test.ts` fails if a
# structured ancestry ever reappears as a catalog row.
STRUCTURED_ANCESTRIES = frozenset(
    f"ancestry-{n}" for n in ("earthkin", "tidekin", "emberkin", "skykin", "aetheris", "gnome")
)


def ts_str(s: str) -> str:
    """A single-quoted TS string literal (card names carry apostrophes: "A Soldier's Bond")."""
    return "'" + s.replace("\\", "\\\\").replace("'", "\\'") + "'"


def title(slug: str) -> str:
    minor = {"of", "the"}
    words = slug.split("-")
    return " ".join(w if w in minor and i else w.capitalize() for i, w in enumerate(words))


entries: list[str] = []


def scan(base: Path, rel_prefix: str, exp: str = "") -> None:
    """Emit catalog entries for the domain/ancestry/community/subclass/transformation trees under `base`.
    `exp` (e.g. 'void') tags the card with its expansion; base-game cards pass '' (no expansion field)."""
    def tag_for(card_id: str) -> str:
        """The expansion tag for one card id.

        v0.32.0: the void/thevoid SPLIT lives here now. It was applied by hand to the generated file,
        so re-running this script silently reunited the two packs and moved the whole beta into the
        official one. `expansions.test.ts` caught it, but only after the fact; the generator being
        wrong is the actual bug.
        """
        e = BETA_EXPANSION if exp == VOID_EXPANSION and card_id in BETA_CARDS else exp
        return f" expansion: '{e}'," if e else ""


    dom_root = base / "Domains"
    if dom_root.is_dir():
        for dom_dir in sorted(p for p in dom_root.iterdir() if p.is_dir()):
            for f in sorted(dom_dir.glob("*.webp")):
                if f.stem.endswith("_lod"):
                    continue
                m = re.fullmatch(r"([a-z]+)-(\d\d)-(\d)", f.stem)
                assert m, f.name
                dom, level = m.group(1), int(m.group(2))
                rel = f"{rel_prefix}/Domains/{dom_dir.name}/{f.stem}"
                label = TITLES.get(f.stem, f"{dom_dir.name} {level}")
                entries.append(
                    f"  {{ id: '{f.stem}', kind: 'domain', label: {ts_str(label)}, domain: '{dom}', level: {level},{tag_for(f.stem)}"
                    f" source: require('{rel}.webp'), thumb: require('{rel}_lod.webp') }},"
                )

    anc = base / "Ancestry"
    if anc.is_dir():
        for f in sorted(anc.glob("*.webp")):
            if f.stem.endswith("_lod"):
                continue
            if f"ancestry-{f.stem}" in STRUCTURED_ANCESTRIES:
                continue  # authored as a structured card instead; see STRUCTURED_ANCESTRIES
            rel = f"{rel_prefix}/Ancestry/{f.stem}"
            entries.append(
                f"  {{ id: 'ancestry-{f.stem}', kind: 'ancestry', label: '{title(f.stem)}',{tag_for('ancestry-' + f.stem)}"
                f" source: require('{rel}.webp'), thumb: require('{rel}_lod.webp') }},"
            )

    com = base / "Community"
    if com.is_dir():
        for f in sorted(com.glob("*.webp")):
            if f.stem.endswith("_lod"):
                continue
            rel = f"{rel_prefix}/Community/{f.stem}"
            entries.append(
                f"  {{ id: 'community-{f.stem}', kind: 'community', label: '{title(f.stem)}',{tag_for('community-' + f.stem)}"
                f" source: require('{rel}.webp'), thumb: require('{rel}_lod.webp') }},"
            )

    sub_root = base / "Subclass"
    if sub_root.is_dir():
        for cls_dir in sorted(p for p in sub_root.iterdir() if p.is_dir()):
            for f in sorted(cls_dir.glob("*.webp")):
                if f.stem.endswith("_lod"):
                    continue
                m = re.fullmatch(r"(.+)-([123])-(foundation|specialization|mastery)", f.stem)
                assert m, f.name
                sub, tier = m.group(1), int(m.group(2))
                rel = f"{rel_prefix}/Subclass/{cls_dir.name}/{f.stem}"
                entries.append(
                    f"  {{ id: 'subclass-{f.stem}', kind: 'subclass', label: '{title(sub)} {TIER_NAMES[tier]}',"
                    f" className: '{cls_dir.name.lower()}', subclass: '{sub}', tier: {tier},{tag_for('subclass-' + f.stem)}"
                    f" source: require('{rel}.webp'), thumb: require('{rel}_lod.webp') }},"
                )

    tr = base / "Transformations"
    if tr.is_dir():
        for f in sorted(tr.glob("*.webp")):
            if f.stem.endswith("_lod"):
                continue
            rel = f"{rel_prefix}/Transformations/{f.stem}"
            entries.append(
                f"  {{ id: 'transformation-{f.stem}', kind: 'transformation', label: '{title(f.stem)}',{tag_for('transformation-' + f.stem)}"
                f" source: require('{rel}.webp'), thumb: require('{rel}_lod.webp') }},"
            )

# base-game cards (no expansion tag), then "The Void" official expansion (tagged expansion: 'void').
scan(CARDS, REL)
scan(CARDS / "Void", REL + "/Void", "void")

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(
    "/**\n"
    " * GENERATED by scripts/generate_card_catalog.py — do not edit by hand; re-run after asset\n"
    " * changes. Every playable card with its metadata and two-LOD require pair (#78). LOD thumbs\n"
    " * are gitignored build artifacts: run `python scripts/generate_lods.py` after a fresh clone\n"
    " * or Metro fails to resolve the `thumb` requires.\n"
    " */\n"
    "import type { DomainName, ClassName } from '@/constants/identity';\n\n"
    "export type CatalogKind = 'domain' | 'ancestry' | 'community' | 'subclass' | 'transformation';\n\n"
    "export interface CatalogCard {\n"
    "  id: string;\n"
    "  kind: CatalogKind;\n"
    "  /** Human label (gallery captions, pickers). */\n"
    "  label: string;\n"
    "  source: number;\n"
    "  thumb: number;\n"
    "  domain?: DomainName;\n"
    "  level?: number;\n"
    "  className?: ClassName;\n"
    "  subclass?: string;\n"
    "  tier?: 1 | 2 | 3;\n"
    "  /** Expansion this card belongs to (e.g. 'void'); undefined = base game. Gated by callers. */\n"
    "  expansion?: string;\n"
    "}\n\n"
    "export const CATALOG: CatalogCard[] = [\n" + "\n".join(entries) + "\n];\n\n"
    "const byId = new Map(CATALOG.map((c) => [c.id, c]));\n\n"
    "export function cardById(id: string): CatalogCard | undefined {\n"
    "  return byId.get(id);\n"
    "}\n",
    encoding="utf-8",
    newline="\n",
)
print(f"wrote {OUT.relative_to(ROOT)} with {len(entries)} cards")
