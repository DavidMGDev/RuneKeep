"""
Decide which bundled "Hope and Fear" content is actually in Hope and Fear.

The app's official expansion was built from a pre-release sheet. The printed release turned out to be
a SUBSET of it, so the pack ships classes, subclasses and cards that no Hope and Fear book contains.
This script establishes which is which from the books themselves rather than from anyone's memory,
and prints a report that can be re-run and re-argued later.

The rule, from the owner: anything absent from the Hope and Fear PDFs belongs to The Void, a bundled
official expansion presented as the beta that tested most of Hope and Fear's content but not all of
it. Anything present stays in Hope and Fear.

    python scripts/audit_expansion_vs_pdf.py            # report
    python scripts/audit_expansion_vs_pdf.py --json     # machine-readable, for the data edit

Requires PyMuPDF.
"""

from __future__ import annotations

import argparse
import json
import pathlib
import re
import sys

try:
    import fitz
except ImportError:  # pragma: no cover
    sys.exit("PyMuPDF is missing. Run:  pip install pymupdf")

PDF_DIR = pathlib.Path("D:/Tools/Homebrew/Daggerheart")
PDFS = [
    "HOPEANDFEAR_Cards.pdf",
    "HOPEANDFEAR_Classes.pdf",
    "HOPEANDFEAR_Weapons.pdf",
    "HOPEANDFEAR_Adversaries.pdf",
]
SRC = pathlib.Path(__file__).resolve().parent.parent / "src"


def norm(s: str) -> str:
    """Fold to something two different typesetters would agree on."""
    s = s.replace("\u2019", "'").replace("\ufffd", "'").replace("\u2014", " ")
    s = re.sub(r"[^a-z0-9 ]+", " ", s.lower())
    return re.sub(r"\s+", " ", s).strip()


def book_text(names: list[str] | None = None) -> str:
    out = []
    for name in names or PDFS:
        path = PDF_DIR / name
        if not path.exists():
            print(f"  ! missing {path}", file=sys.stderr)
            continue
        doc = fitz.open(path)
        out.append("\n".join(p.get_text() for p in doc))
    return norm("\n".join(out))


# --- What the app currently ships as Hope and Fear ----------------------------------------------


def void_catalog() -> list[tuple[str, str, str]]:
    """(kind, id, label) for every catalog row tagged to the expansion."""
    src = (SRC / "data" / "catalog.ts").read_text(encoding="utf8")
    rows = []
    for line in src.splitlines():
        if "expansion: 'void'" not in line:
            continue
        cid = re.search(r"id: '([^']+)'", line)
        kind = re.search(r"kind: '([^']+)'", line)
        label = re.search(r"label: '([^']*)'", line)
        if cid and kind:
            rows.append((kind.group(1), cid.group(1), label.group(1) if label else ""))
    return rows


def void_classes() -> list[str]:
    src = (SRC / "constants" / "identity.ts").read_text(encoding="utf8")
    m = re.search(r"VOID_CLASSES: ClassName\[\] = \[([^\]]+)\]", src)
    return re.findall(r"'([^']+)'", m.group(1)) if m else []


def named_records(path: pathlib.Path) -> list[str]:
    """
    The name of each record in a hand-written table, one per line.

    Taking every `name:` in the file is wrong: a weapon's `feature: { name: "Quick" }` is a nested
    name, and counting those turns 40 weapons into 293 "items", most of which match the book because
    the book obviously contains the word "Quick". Only the name that follows the record's own id
    counts, so the record must be read as a whole rather than grepped.
    """
    if not path.exists():
        return []
    out = []
    for line in path.read_text(encoding="utf8").splitlines():
        m = re.search(r"id: [\"'][^\"']+[\"'],\s*name: [\"']([^\"']+)[\"']", line)
        if m:
            out.append(m.group(1))
    return out


def manifest_titles(category: str) -> dict[str, str]:
    """
    slug -> printed title, from the card-extraction manifest.

    Card titles live in the artwork, not in the catalog, so this is the only record of what each
    image actually says. The manifest was written as mojibake (utf-8 bytes read as latin-1), hence
    the round trip.
    """
    path = SRC.parent / "assets" / "extracted_cards" / "Void" / "void-manifest.json"
    if not path.exists():
        return {}
    out = {}
    for row in json.loads(path.read_text(encoding="utf8")):
        if row.get("category") != category:
            continue
        title = row.get("cardTitle", "")
        try:
            title = title.encode("latin1").decode("utf8")
        except (UnicodeEncodeError, UnicodeDecodeError):
            pass
        out[row["slug"]] = title.strip()
    return out


def subclass_family(card_id: str) -> str:
    """`subclass-pact-of-the-endless-2-specialization` -> `pact of the endless`."""
    stem = re.sub(r"^subclass-", "", card_id)
    stem = re.sub(r"-\d+-(foundation|specialization|mastery)$", "", stem)
    return stem.replace("-", " ")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--json", action="store_true", help="emit the verdict as JSON")
    args = ap.parse_args()

    books = book_text()
    if not books:
        sys.exit("No book text extracted; check the PDF paths.")

    # Scoping the search matters. "Summoner" appears once in the whole set, inside an adversary's
    # description ("a shapeshifting summoner"), which would otherwise read as proof that the Summoner
    # CLASS is in the book. A class is only a class if the class rules name it.
    classes_book = book_text(["HOPEANDFEAR_Classes.pdf"])
    rules_book = book_text(["HOPEANDFEAR_Classes.pdf", "HOPEANDFEAR_Cards.pdf"])

    verdict: dict[str, dict[str, list[str]]] = {}

    def judge(group: str, label: str, needle: str, corpus: str | None = None) -> None:
        found = norm(needle) in (corpus if corpus is not None else books)
        verdict.setdefault(group, {"hope_and_fear": [], "void": []})
        verdict[group]["hope_and_fear" if found else "void"].append(label)

    # Classes, by name.
    for key in void_classes():
        judge("classes", key, key if key != "bloodhunter" else "blood hunter", classes_book)

    # Subclasses, by family name (the three tier cards share one).
    seen: set[str] = set()
    for kind, cid, _label in void_catalog():
        if kind != "subclass":
            continue
        fam = subclass_family(cid)
        if fam in seen:
            continue
        seen.add(fam)
        judge("subclasses", fam, fam, rules_book)

    # Domain cards, by TITLE.
    #
    # Judging by the domain's NAME instead gives the wrong answer: the Cards book carries "BLOOD
    # DOMAIN" as a rotated label down the edge of two pages, so the string is present while not one
    # Blood card is. All 21 domain cards the book actually prints are Dread. The titles are not in the
    # catalog (they are baked into the card art) but the extraction manifest kept them.
    for slug, title in manifest_titles("domain").items():
        judge("domain cards", f"{slug}  {title}", title)

    # Communities, ancestries and transformations, by label.
    for kind, cid, label in void_catalog():
        if kind in ("community", "transformation"):
            judge(kind + "s", label or cid, label or cid.split("-", 1)[-1].replace("-", " "))

    # Ancestries live on the expansion record rather than the catalog.
    for name in re.findall(r"anc\(\s*'[^']+',\s*'([^']+)'", (SRC / "data" / "void-ancestries.ts").read_text(encoding="utf8")):
        judge("ancestries", name, name)

    # Equipment and loot tables that were authored for the pack.
    for name in named_records(SRC / "data" / "equipment-hf.ts"):
        judge("equipment", name, name)
    for name in named_records(SRC / "data" / "loot-hf.ts"):
        judge("loot", name, name)

    if args.json:
        print(json.dumps(verdict, indent=2))
        return

    print("Content the app ships as Hope and Fear, judged against the printed books\n")
    for group, sides in verdict.items():
        keep, move = sides["hope_and_fear"], sides["void"]
        print(f"{group.upper()}  ({len(keep)} stay, {len(move)} move)")
        for x in sorted(keep):
            print(f"    stays   {x}")
        for x in sorted(move):
            print(f"    -> VOID {x}")
        print()

    total_move = sum(len(s["void"]) for s in verdict.values())
    print(f"{total_move} item(s) move to The Void.")
    print("\nNames baked into card art cannot be read from the PDF, so domain CARDS are judged by")
    print("their domain and subclass CARDS by their family. Anything surprising here is worth a look")
    print("at the book before it is acted on.")


if __name__ == "__main__":
    main()
