---
name: runekeep_v0340_moodboard
description: "v0.34.0: the card-text overflow was the DEVICE font scale all along (measured 1.15 from a screenshot, three ways) so forged cards set allowFontScaling={false}; regenerating catalog.ts re-adds the six H&F ancestry rows that v0.12.3 deleted BY HAND, which duplicated every one of them and is what made the ancestry deck flicker; the trash missed tombstoned cards and restore never lifted the tombstone; the moodboard lives in src/features/character-sheet/moodboard with lib/moodboard + lib/snap"
metadata: 
  node_type: memory
  type: project
  originSessionId: 1859e40f-c67c-40af-8dd0-8ad1cbbfa612
  modified: 2026-08-03T13:07:01.085Z
---

Released 2026-08-03 (PR #408, PRD issue #407, docs/prd/v0.34.0-moodboard.md).

## The card-text overflow was the OS FONT SCALE. Case closed, with a measurement.

Four releases chased this. The answer was never in `fit-text`, which has now been verified correct
twice. Working back from a screenshot where the card drew 648 image px for its 230 design px:

| string | rendered | declared |
|---|---|---|
| body's first line | 9.67 | 8.5 |
| footer copyright | 7.13 | 6.3 |
| title | 20.2 | 17 |

All ~1.15 = Android's second text-size step. The device multiplies every size AFTER the app has chosen
one to fit a fixed box, so a body computed to fill its box exactly overflows by whatever the user's
accessibility setting adds. `forged-card.tsx` now routes every `<Text>` through a local `CardText`
wrapper carrying `allowFontScaling: false` + `includeFontPadding: false`; `card-markdown.tsx` matches.

**Diagnostic order for any future "text overflows on one platform" report:** stale forged cache →
`includeFontPadding` → **device font scale** → only then the estimator. See
[[runekeep_card_text_platform]] for the measured Archivo numbers.

## Regenerating catalog.ts duplicates the Hope and Fear ancestries

`src/data/void-ancestries.ts` authors the six H&F ancestries as structured LibraryCards on the
expansion record, and v0.12.3 deleted their rows from the GENERATED catalog by hand. Regenerating in
v0.32.0 put them back, so each appeared TWICE in the creator's ancestry deck.

**That is almost certainly the flicker** reported across v0.33.0 and v0.33.1: two cards with one id is
two carousel slots with one React key and two expo-image views with one recycling key, at the end of
the deck, which is exactly where it happened and nowhere else. The v0.33.0 and v0.33.1 fixes were both
real improvements aimed at the wrong thing.

`STRUCTURED_ANCESTRIES` in `scripts/generate_card_catalog.py` excludes them now, next to the beta split
(same lesson: a hand edit to a generated file survives until the next generation). `data-integrity`
fails on any structured ancestry in CATALOG, and on any duplicate id at all.

## The trash: tombstone vs splice

Deleting a card does BOTH, depending on what it is: an authored card is spliced out of its collection
AND tombstoned in `removedCardIds`; a catalog card is only tombstoned, because splicing would corrupt
the file. `restoreCard` only ever undid the splice, so restoring an authored card put the object back
into a file that went on hiding it. And `recoverableCards` only walked the authored collections, so a
deleted armor never reached the trash. Both fixed; restore also takes a category, because deleting
drops `cardCategory[id]` and nothing put one back.

## The moodboard

`src/features/character-sheet/moodboard/` (screen, item, radial, layers), opened by double-tapping the
portrait, rendered by the sheet INSTEAD of itself so the carousel unmounts. Two pure modules hold the
correctness: `lib/moodboard.ts` (array order IS z-order; every op returns a new list) and `lib/snap.ts`
(two thresholds, enter < exit, so a snap grabs early and lets go late; `entered` fires once for the
haptic).

It joins the character file by naming its image field **`imageUri`**, which is what gets it export
embedding, history-snapshot stripping and import-side blob dropping for free, plus the cosmetic-fields
set from [[runekeep_v0330_gotchas]] so arranging images cannot rebuild the carousel.

**Gotcha found by verifying in a browser:** a `Pressable` fires `onPressOut` then `onPress`, so a hold
that completes an action is followed by a tap that undoes it. The lock unlocked and instantly
re-locked. Guard with the same ref the hold sets.

**Test-harness gotcha:** puppeteer's `mouse.click(x, y, { clickCount: 2 })` does NOT trigger an RNGH
double tap on web. Two discrete `mouse.click` calls ~90ms apart do. `xy2:` in both
`scripts/web-probe.mjs` and `scripts/web-profile.mjs` does it that way.
