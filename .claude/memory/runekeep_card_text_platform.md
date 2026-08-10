---
name: runekeep_card_text_platform
description: "Card text overflowed the footer on Android but not web because UNSET lineHeight is taller in Android's font metrics than Chrome's (~21dp over 4 stat rows); pin lineHeight on every forged-card text, and adjustsFontSizeToFit/onTextLayout are no-ops on web"
metadata: 
  node_type: memory
  type: project
  originSessionId: 1859e40f-c67c-40af-8dd0-8ad1cbbfa612
  modified: 2026-08-03T07:52:39.232Z
---

v0.30.0 (2026-07-31). The reported bug was "the Katana's feature text collides with the RuneKeep
footer watermark on Android, curiously not on web". The feature text was **not** too long.

**Root cause:** `ForgedWeaponCard`'s `StatRow` and title declared no `lineHeight`, so each row was as
tall as the font's own metrics made it. Android's Archivo metrics are noticeably taller than Chrome's:
measured ~19.6 design px per stat row on Android vs ~14.2 in Chrome, about **21dp over four rows**,
which is most of a line of feature text, taken out of the bottom of a fixed-height card.

**Why:** Explicit `lineHeight` on every text in a fixed-size forged card. `STAT_ROW_H = 13`,
`EQUIP_TITLE_H = 19`, `BODY_TITLE_H = 21`, `BODY_SUB_H = 11` in `forged-card.tsx`. Both platforms then
lay the card out identically and the leftover room is computable (`equipFeatureRoom(rows)`).

**How to apply:** any time a fixed-size card/panel must fit text on both platforms, pin `lineHeight`
rather than trusting font metrics, and never diagnose "text too long" from a web screenshot alone.

Sizing beyond that is `src/lib/fit-text.ts` (`fitText`, `wrapLines`): a PURE estimator that picks a
font size before rendering, because `numberOfLines` cuts (unacceptable for a rule) and
`adjustsFontSizeToFit` is a no-op on web (see [[runekeep_web_stacking_firefox]]). Pure also matters
because a value computed during layout can be captured a frame early by the forged bitmap cache.
`CHAR_RATIO = 0.53` is an eyeballed average glyph advance, biased to over-estimate lines.

`src/lib/fit-text.ts` is in `scripts/forge-hash.mjs` SOURCES, so editing it re-forges cached bitmaps
(see [[runekeep_forged_cache_perf]]).

## The MEASURED Archivo numbers (v0.32.2 / v0.33.0)

Read straight off `node_modules/@expo-google-fonts/archivo/400Regular/Archivo_400Regular.ttf` with
Python `struct` (head/hhea/OS2/hmtx/cmap-4). Do not re-derive these:

- hhea line box **1.088 em**, typo line box **1.088 em**, **win** box **1.51 em**.
- `fsSelection` bit 7 (USE_TYPO_METRICS) is **SET**, so Android's ascent/descent match a browser's.
  The v0.30.0 note above is still right about UNSET lineHeight, but not because the metrics differ.
- Average glyph advance over real card body text = **0.438 em**, against the 0.53 `CHAR_RATIO`
  assumes. The estimator is ~21% conservative ON PURPOSE; do not "correct" it.

**The remaining native-only vertical term is `includeFontPadding`**, which RN Android defaults to
true. It pads a text block out to the WIN metrics regardless of lineHeight, so every block on a phone
is **0.42 em taller** than the same block in Chrome (4.4dp at 10.5pt), and it lands at the BOTTOM. The
fitter deliberately fills its box exactly, so on a tight card that extra is entirely outside the box,
in the 9dp between the body box and the footer watermark. v0.33.0 sets `NO_FONT_PAD =
{ includeFontPadding: false }` on every text in `forged-card.tsx` that takes part in the vertical
budget. Apply the same to any new fixed-size card text.

**Diagnostic order for a "text bleeds on native only" report:** check the forged CACHE first (a stale
bitmap looks exactly like a layout bug and is far more likely, see [[runekeep_v0330_gotchas]]), then
`includeFontPadding`, then measure. Simulating the fitter against the real font takes ten minutes and
settles it; guessing has been wrong three times.
