---
name: runekeep-v0320-cards-engine
description: "v0.32.0 - domain cards carry REAL names read off the scans; the modifier engine gained stress/input variables, overwrite, floor and per-card muting; the expansion split was a hand edit in a GENERATED file"
metadata: 
  node_type: memory
  type: project
  originSessionId: 1859e40f-c67c-40af-8dd0-8ad1cbbfa612
  modified: 2026-08-03T01:50:33.031Z
---

**Read this before touching the modifier engine, the catalog generator, or any card-name lookup.**

## Domain cards are named now, and the names came from the images

`CATALOG` labelled them "Blade 8". They are their real titles as of v0.32.0 (all 231, base + Void).

The rulebook PDF stores domain cards as **flat images with no text layer** — `page.get_text()` on those
pages returns only "DOMAIN LEVEL 1". So there is no PDF ground truth here, unlike the ancestry work in
[[runekeep-hf-pdf-facts]]. The names were read off the card art:

- `scripts/domain_title_strips.py` crops the title band (y 0.465-0.560 of a 750x1050 scan) from every
  card in a domain and stacks the strips into one labelled contact sheet. Grimoire/long-text cards sit
  higher; re-run with TOP_FRAC 0.40 for those.
- The names live in `scripts/domain_card_titles.json`, consumed by `generate_card_catalog.py`. A card
  missing from the file falls back to the old positional label, so a new expansion never breaks a build.

**Never guess a domain card id from its level.** Each level has two cards and the ordering is not
meaningful: Frenzy is `blade-08-2`, Shadowhunter `midnight-08-1`, Eldritch Flesh `dread-08-2`. Three of
my six guesses were wrong before I looked at the strips.

## The engine grew four things (src/lib/modifiers.ts)

- `variable: 'stress'` — the CURRENT marked Stress. Reads the track, not the sheet. The sheet must
  RE-DERIVE when Stress changes, which `onTrack` does only when a live card actually uses it.
- `variable: 'input'` — a number the player types ON THAT CARD. Needs `EffectSource.key`; without a key
  it resolves to 0 rather than guessing. Stored in `file.numberInputs`, keyed by ref.
- `floor: true` on a formula — Daggerheart rounds UP, so that stays the default; "for every 2 Stress"
  is the exception and must not pay out at 1.
- `overwrite: true` — the stat BECOMES the value. Runs in a **third pass after both existing passes**,
  so source ordering cannot beat it. `mode: 'set'` was not enough: it only applied within its own pass.

`file.modifiersOffCardIds` mutes an equipped card's modifiers without unequipping it (domain cards get
a Toggle button). **Permanent effects are exempt** — muting cannot be stronger than unequipping.

## The trap that cost the most time

The **void / thevoid expansion split was a hand edit to `src/data/catalog.ts`, which is GENERATED.**
Re-running `generate_card_catalog.py` silently moved the whole beta pack into the official expansion.
`expansions.test.ts` caught it. The split lives in the generator now (`BETA_CARDS`). Before editing any
generated file, check whether the generator can express the change.

Regenerating the catalog changes card LABELS, which are printed on forged cards, so the forge signature
changes and every device re-forges its deck once. That is correct, not a bug — see
[[runekeep-forged-cache-perf]].

## fit-text, second lesson

`fitText` used to stop at a 6pt floor and return `floor(height/lineHeight)` as the line count — a
**fiction**, and the caller passed it to `numberOfLines`. Android will not honour a `lineHeight` below
the font's own natural line height, so those lines rendered taller there than the arithmetic said and
ran into the footer; Chrome honours it exactly, which is why it was Android-only. It now tightens
LEADING (`minRatio`) before shrinking type and fits by construction. Same family as
[[runekeep-card-text-platform]]: when a platform disagrees about text height, suspect line height.

See also [[runekeep-modifier-system]], [[runekeep-v0250-split-modifiers]].
