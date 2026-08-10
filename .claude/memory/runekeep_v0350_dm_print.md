---
name: runekeep-v0350-dm-print
description: "v0.35 verified diagnoses - view-shot's captureRef THROWS on web (findNodeHandle unsupported), the print path read the app-icon placeholder, DM modifiers are materialised as cards, and the stat-radial gesture was rebuilt mid-hold"
metadata: 
  node_type: memory
  type: project
  originSessionId: 1859e40f-c67c-40af-8dd0-8ad1cbbfa612
  modified: 2026-08-05T18:07:38.648Z
---

RuneKeep v0.35 (PR #420, PRD issue #419). Four things worth carrying forward:

**`captureRef` from react-native-view-shot THROWS on web.** Its shared `src/index.js` resolves the ref
through `findNodeHandle`, and react-native-web refuses: "findNodeHandle is not supported on web". The
library ships a perfectly good `RNViewShot.web.js` (html2canvas) that never gets reached. The fix is
`print-capture.ts` / `print-capture.web.ts` (Metro platform extensions): the web twin calls
`require('html2canvas')` directly on `ref.current`, which in RNW **is the DOM element**. Verified in
Chrome: a real 750x1050 card face, 28 distinct sampled colours, not a blank.

**The printed PDF's app icons were the placeholder, not a rendering bug.** A carousel `CardItem` whose
bitmap has not been forged yet carries `GENERIC_CARD_ART` (assets/images/icon.png) in `source` with the
live node in `live`. v0.34.8's print path read `item.source` directly. Use `printFaces(item)` in
card-data.ts: it returns one entry per FACE and NEVER hands back the placeholder. Cards with no bitmap
are captured on demand by `PrintStage`. A release invalidates the whole forge cache
(FORGE_CONTENT_HASH), so right after an update most of a deck is un-forged, which is why the owner saw
it everywhere.

**The web print frame is `about:blank`, so relative asset URLs resolve against nothing.** That is why
every image in the browser PDF was broken. `absolute()` in card-pdf.ts plus a `<base href>` in the
written document.

**DM modifiers are materialised as CARDS on the character file** (`lib/dm-cards.ts`, ids `rk-dm-changes`
and `rk-dmparty-<partyId>`). That one decision is what makes items 6, 8, 9 and 10 compose: the sheet
shows them, history rewinds them, export carries them, and an import overwrite strips them. The engine
learned only two new things: `CardEffect.off` (per-modifier switch, filtered once at the top of
`computeSheet` via `liveSources`) and the `level` target (resolved by `effectiveLevel` BEFORE the sheet
is computed, because level parameterises the computation). `allEffectSources(file)` now returns
`{ sources, level }`.

**The stat radial's gesture was rebuilt on every render** (`onApply` arrives as a fresh inline arrow
from MemberPanel), so a stat change replaced the gesture while its own hold was live. That is the same
failure as the v0.27.3 creator lock-up and the most likely cause of the reported Android crash on hold.
Fixed by reading callbacks through a ref and memoising. NOT reproduced: no device, no stack trace.
Also fixed there: `hostX/hostY` were subtracted in WINDOW units from anchor/finger values already in
FRAME units, which draws the pointer a margin away from the finger on any magnified viewport.

See [[runekeep_v0348_cards_copies]] for the v0.34.8 print groundwork this replaced.

## v0.35.1 additions

**A gesture rebuilt while it is running is THE recurring bug in this repo** (four times now: the
v0.27.3 creator lock-up, the v0.35 stat wheel, the v0.35.1 card drag, and the wheel's SVG tree). The
tell is a `useCallback` whose deps include state the gesture itself SETS. Fix: keep callbacks in a ref
and memoise the gesture on stable deps. For the stat wheel it was worse, the whole `<Svg>` was mounted
on hold and unmounted mid-animation, so it is always mounted at zero opacity now.

**The native PDF's broken-image glyphs were SIZE, not URIs.** v0.34.8 got away with inlining because
most of its cards were the tiny placeholder icon; once every card was a real bitmap the Android print
WebView stopped decoding them. `boundedPrintJpeg` re-encodes every print image at 750px wide.

**html2canvas cannot follow a CSS transform.** Scaling the print stage with `transform: scale()` so the
capture would be 750px produced mangled cards and blank class-feature pages. Pass `scale` to
html2canvas instead and leave the DOM alone.

**`onLayout` does not fire when only the CHILD changes.** The print stage captured on layout, every
card is the same size, and React batches "clear" with "next card", so only the first card of a
multi-card print was ever real. Drive that kind of thing from a `useEffect` on the node.

**`useCarousel()` throws outside the sheet**, so `CategoryGlyph` needed `useCarouselMaybe()` plus a
`meta` prop before the DM screens could borrow it.

## v0.35.2 additions

**The stat wheel crashed Android for THREE releases.** Two fixes (gesture rebuilt mid-gesture, SVG
mounted/unmounted mid-hold) were real and were not enough. The third stops diagnosing and copies the
component that works: `float-menu.tsx` holds the same wheel on the same platform and never crashes.
Its three differences, now matched in `stat-pulse.tsx`: ONE `Gesture.Pan` (no `Gesture.Exclusive`, no
`activateAfterLongPress`, tap-vs-hold decided by a JS timer + a movement flag with
`manualActivation(true)` so lists still scroll); worklets capture SHARED VALUES and plain functions,
NEVER the context object (it used to capture `radial` and read `radial.commit` on the UI thread);
measurement at layout, not inside the gesture. If it still crashes, get a logcat.

**Bundled artwork has NO BYTES on Android.** `require()`d card images are packaged resources: no
`file://`, nothing `expo-file-system` or `expo-image-manipulator` can read, and the URI means nothing
to a print engine. They must be DRAWN on the print stage and captured (`PrintableImage`). This is why
base-game ancestry/community/subclass/domain cards printed as bare text.

**Chrome on Android renames a download to match its MIME type**, so a `.rune` blob typed
`application/json` arrived as `.rune.json`. Export blobs use `application/octet-stream`.

**`preserveAspectRatio` is not honoured the same way on web.** A class banner drawn into a box taller
than its own aspect stretched in the browser and letterboxed on native. Give the box the art's own
shape instead of relying on the attribute.

**`git checkout -- src/features/dm/` wipes uncommitted work in that whole directory** (lost the
stat-pulse rewrite once). Commit before any directory-wide revert.

## v0.35.3 additions

**The character sheet's deck JOB BUILDER now lives in `sheet/deck-jobs.tsx`** (moved verbatim out of
`redesigned-sheet`'s useMemo). Anything that needs "the cards this character holds" must use it: the
STARTING KIT comes from `CLASS_INVENTORY[class].take`, not from the character file, so any code that
reads the file to find cards will silently miss a player's default inventory. `features/dm/dm-decks`
composes from it and `lib/dm-card-list` applies the player's own arrangement (deletes, moves, copies,
drag order) as a tested pure pass.

**Stat wheel, attempt four:** both `useAnimatedReaction`s removed. They had NO dependency array, so
each highlight change re-registered the mapper on the UI thread, and each fired two `runOnJS` calls
mid-gesture (a React setter and the audio engine). The wedge is now decided in JS from the pan's own
callback. The provider's callbacks are wrapped in a `guard()` that toasts the error, and the host sits
behind an error boundary, SO THE NEXT REPORT IS ACTIONABLE: a crash with no toast after v0.35.3 is
native, not JavaScript, and needs a logcat.

**The APK download chain is site -> GitHub -> signed expiring URL.** `ANDROID_DOWNLOAD_URL` now points
straight at the asset. The 17MB of WAVs are genuinely stereo (channel-difference peak −10 dB), so
folding them to mono to shrink the APK would degrade tuned audio; measured, rejected.

## v0.36 additions

**The stat wheel's fifth fix: an ANIMATED TRANSFORM around an `<Svg>` is a native Fabric crash and no
JavaScript guard can see it.** Four attempts each removed something real (gesture rebuilt mid-gesture,
`AnimatedPath` with no animated props, SVG mounted/unmounted mid-hold, both `useAnimatedReaction`s) and
the app kept dying. What survived all four was the one structural difference from `float-menu.tsx`,
which holds the same wheel on the same phones and has NEVER crashed: the float menu animates **opacity
only** on the view containing its `<Svg>`; the radial animated translate+scale on that view every
frame. The wheel is now positioned once from React state (written in `open()`), only opacity animates,
and the bloom scale is gone. **Rule: never put an animated transform on a view whose children are
react-native-svg nodes.** The v0.35.3 guards and error boundary stayed silent throughout, which is what
identified the fault as native in the first place.

**`adjustsFontSizeToFit` is a no-op on react-native-web, so any layout that assumes a title MIGHT
shrink is wrong on one platform.** A card title running to two lines pushed its description down and
clipped it, on Android only, because the browser drew titles at full size while the body's arithmetic
allowed for a shrunk one. `fitTitle` in `lib/fit-text` chooses the size before rendering into a FIXED
band one line tall: shrink to one line, and only allow two lines once they fit the same band. Same
family of bug as the v0.30.0 body fit. Any forged-card text change needs `node scripts/forge-hash.mjs`.

**Both card layers window on the CENTRE of the row, so a long drag empties the card being carried.**
`withImage` / `withLive` in `card-carousel` are distance-from-centre gates and a drag scrolls the row.
A card with no forged bitmap loses its live body too, so only the landing ghost is left. Raised cards
now bypass both windows.

**`DmModal`'s tap-absorber and a platform `ScrollView` negotiate for the same touch** (the absorber
claims `onStartShouldSetResponder`), which is why the adversary Configure panel would not scroll for
seconds and then stopped again. Third time this repo has hit it: use the gesture-handler `ScrollView`
inside any DM modal.

**Characterize (`lib/characterize.ts`) is the one place that knows how a stat block becomes a
character.** Three consumers read it and must not drift: the creator's review carousel, the cards
written at Forge, and the numbers written onto the file. Two additive `CharacterFile` flags each
honoured in exactly ONE place: `arsenalOnly` (the category resolver in `redesigned-sheet` and the
matching `place()` in `dm-card-list`) and `skipStartingKit` (`buildDeckJobs`). A characterized entry is
a `Combatant` with `charId`, so it stays on the side it was fighting on and the encounter holds its
vitals in `charVitals` (it is not a party member). Carried thresholds/HP/stress are held by computing
the sheet ONCE without them and writing the difference as a bonus effect, which is the only way the
number survives whatever class, level and cards the DM picks.
