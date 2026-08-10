---
name: runekeep_hf_pdf_facts
description: Ground truth extracted from the Hope and Fear PDFs (what is and is not in them) plus the committed ancestry line-marking generator
metadata: 
  node_type: memory
  type: project
  originSessionId: 1859e40f-c67c-40af-8dd0-8ad1cbbfa612
  modified: 2026-07-30T17:03:15.864Z
---

Established 2026-07-30 by extracting text and geometry directly from the publisher PDFs in
`D:\Tools\Homebrew\Daggerheart\`. These are measured facts, not recollection.

**Blood Hunter and Summoner are in NO Hope and Fear book.** Zero occurrences across
HOPEANDFEAR_Cards / _Classes / _Weapons / _Adversaries. Owner confirmed they belong in the new
official expansion "The Void" (the beta that tested most of Hope and Fear's content). The owner's
original instruction said the opposite by mistake, so re-read the rule not the example.

**HOPEANDFEAR_Classes.pdf covers only Assassin, Brawler, Warlock, Witch** (11 pages). It is not a
complete class list for the app's expansion.

**The Hope and Fear ancestry text in the app is already verbatim-correct.** All 12 features in
`src/data/void-ancestries.ts` diff clean against the printed cards (retranscribed in v0.24.0). A
report that it is "outdated" was wrong. The 6 ancestries in the app are exactly the 6 in the PDF.

**The PDFs carry real selectable text with coordinates**, so card content and line positions can be
extracted programmatically. Do not OCR and do not transcribe by eye.

**Ancestry card geometry** (HOPEANDFEAR_Cards.pdf page 6, 0-based index 5): a 3-wide by 2-tall grid,
column x = 35.2 / 214.7 / 394.7, row y = 17.2 / 269.2, card face **179.5 x 252** points. The image
plates measure 182.1 wide but overlap their neighbour, so cropping at plate width pulls in a sliver
of the next card. Order is column-major: Aetheris, Skykin, Earthkin, Tidekin, Emberkin, Gnome.

**`scripts/ancestry_marker.py` is the marking tool, and it is committed.** The base game's equivalent
HTML page was never committed and was lost, which forced the Hope and Fear ancestries to be marked
by hand a second time. The script crops the faces, pre-fills every strike position from the PDF's own
text block geometry (blocks are always title / flavour / feature 1 / feature 2 / footer), and writes
one self-contained HTML file. Regenerate rather than hunting for the output.

Gotcha when editing it: the HTML template must stay a **raw** Python string, or the `\n` escapes
inside the embedded JavaScript become real newlines and the page dies with "Invalid or unexpected
token".

Related: [[runekeep_void_expansion]], [[runekeep_card_system_v03]], [[runekeep_v0210_spellcast_martial]]
