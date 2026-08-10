---
name: runekeep-v0400-mirror-detent
description: "v0.40.0 - the sheet's upper band was 5 design px out; the dice button is the armor panel MIRRORED via scaleX(-1) about the diamond axis; a detent WATCHDOG (sample until at rest) fixes every stranded-carousel path at once; on web a swipe fires a DOM click too; the repo is PUBLIC so assets/temp must never be pushed"
metadata: 
  node_type: memory
  type: project
  originSessionId: 8f1ac8f4-8b1d-46ee-a1ba-0bac49621f6b
  modified: 2026-08-10T17:22:25.732Z
---

For [[project-runekeep-overview]], shipped 2026-08-10 as v0.40.0 (issue #436, PR #437).

**THE REPOSITORY IS PUBLIC.** `gh repo view --json isPrivate` says false. `assets/temp/` (the Core
Rulebook, its class-page extracts, The Void's PDFs and the full-resolution card scans, ~380MB) is
gitignored with the note "licensed; transcribe to data, NEVER push" and that is a LICENSING rule, not
a size rule. When the owner asked for "everything I need to continue development" in the repo, the
right answer was: commit `.claude/memory/` and `docs/fresh-machine.md`, and hand the licensed material
over as a local archive (`D:/Tools/Homebrew/Daggerheart/RuneKeep-licensed-assets.zip`, 130MB, core
rulebook excluded). None of it is needed to build or run the app.

**The upper band was 5 design px out, not 8.** The portrait frame's visible left edge is its box's
left edge at design x=16; the hit points panel's is its box's at x=21. Both confirmed twice: by
`getBoundingClientRect` on the rendered DOM and by scanning the screenshot's pixels. The owner
measured ~8 CSS px because their window's stage scale is ~1.6. **To measure the sheet on web:** find
any element of known design size in the DOM, divide to get the stage scale, and back out the origin.
The portrait frame IMG is ideal (150x282 design).

**The dice button is the armor panel MIRRORED, and the mirror is arithmetic.** `ArmorBg` rendered
with `transform: scaleX(-1)` inside an `overflow: hidden` window. Mirroring a box of width W at left
L maps content offset f to `L + W - f`, so to reflect about the diamond's centre axis A the copy's
left must be `B = (A - (panelLeft - A)) - W`. Same `top`/`height` as the real panel, which is what
makes them level (the v0.39 triangle was 44px lower). **Do not hand-cut a matching path**: reflecting
the asset cannot drift and needs no re-tuning if the art is replaced.
- The usable area is small: the tail tapers, so the largest square that fits INSIDE the fill and clear
  of the diamond is only 21dp, at design (21,259). Found by rasterising a screenshot and running a
  largest-inscribed-square DP over the dark mask - much faster than eyeballing.
- At 19dp an icon must be 2 shapes, not 5. The first d20 glyph (hexagon + 3 facets) merged into a blob.

**A DETENT WATCHDOG beats another gesture branch.** `src/hooks/use-detent.ts`: after every touch,
sample the value until it STOPS changing, and only then snap it. Because it acts at rest it can never
fight a fling still travelling, and it does not care which of the many ways a touch can end skipped
the snap (a tap that never activates the pan, a card opening, a deck switch, the browser taking
pointer capture). The v0.28.0 fix in `onFinalize` only covered ONE of those paths, which is why the
owner kept finding the row stranded. The rule is pure (`detentStep`) and unit-tested; the hook is a
timer. **The card carousel reaches `arm` through a REF** because `arm` changes with the deck length and
a gesture rebuilt mid-gesture has now cost five releases.

**On web a swipe also fires a DOM click.** RNGH's Pan claims the touch on a phone so a die's
`Pressable` never fires, but a mouse-down and mouse-up on the same element is a click whatever the
gesture handler did. A swipe ending over the carousel's centre was adding a die. Fix: a `dragged`
shared value set past a 6px slop in `onUpdate`, cleared in `onBegin`, checked by the tap handler; the
stray click arrives after `onFinalize` and before the next `onBegin`, so the flag is still set.

**Rolling twice over one throw is what makes dice land crooked.** Each die's `turn` is only ever ADDED
to, so a second throw starting mid-spin leaves it at an arbitrary angle. Gate the whole tray, not just
the button: a die added mid-flight is also missing from the total.

**Which animation a result deserves belongs in the pure module.** `dieVerdicts` in `lib/dice-pool`:
an ordinary die at its max is `critical`, at 1 it is `fear`, otherwise `plain`; for a duality pair only
the WINNER moves, and two equal faces make both critical. "A natural 20 is a critical" is then a test.
The animations themselves are lifted verbatim from `card-token-board` so the tray and the card tokens
speak the same language.

**`DiceTrayPanels` takes its geometry and palette as parameters**, which is how DM Mode gets the same
tray in the dark with no second implementation (`features/dm/dm-dice-panel.tsx`).

**v0.40.1 replaced the mirrored bitmap with a DERIVED POLYGON** (`sheet/dice-button.tsx`). A clipped
copy of an asset has no rail on the cut side and nothing drawn over it can be masked to its fill,
which is what a decoration needs. The derivation is the same arithmetic as above, run once offline:
flatten both paths, map through the non-uniform stretch, mirror, clip, Douglas-Peucker. It comes out
as NINE straight edges because the artwork is nine straight edges. `OUTER` is the gold silhouette,
`INNER` is the same inset by the rail, and `INNER` doubles as the pattern's clip path.
- A tiled pattern inside an irregular shape must be FILTERED, not just clipped: a half-drawn digit
  against the rail reads as a mistake and a cut digit is a different digit. Point-in-polygon over the
  glyph's corners at module load, and single digits only at 5dp.
- The button's two states say what it will GIVE you: numbers on dark when shut (dice), hearts on red
  when open (your hit points back).

**Other v0.40.1 rules.** `dualityVerdict` no longer requires a pool of exactly two, so the pair still
answers when thrown with other dice; only ONE pair may be added (`hasDuality`) and the refusal is a
toast, never silence. The tray's critical is `DieWash`, the die's own SILHOUETTE, with the token
board's timings; a translucent circle over a pentagon is a sticker. Every reaction fires at one
shared `resultAt` (the last die's landing) while faces still turn up in sequence, and a throw gets ONE
sound by precedence (critical, fumble, duality, tick) because five flourishes at once is noise. The
total counts up per die and then reacts to `rollTally`; **purple means Fear and nothing else**, so the
lean may tint a throw that has no pair but must never repaint one that does.

READ before sheet-geometry, mirrored-art, svg-pattern, carousel-snap, web-tap-after-drag,
dice-animation or repo-contents work.
