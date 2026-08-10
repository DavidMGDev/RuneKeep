---
name: runekeep-v0390-dice-overlays
description: v0.39.0 - the React Compiler silently memoises a component that renders a mutable ref; an absolute overlay inside a ScrollView is placed against the scroll CONTENT; a debounce timer that never nulls its handle wrote a stale encounter over a characterized one; the dice tray
metadata: 
  node_type: memory
  type: project
  originSessionId: 8f1ac8f4-8b1d-46ee-a1ba-0bac49621f6b
  modified: 2026-08-10T08:47:53.943Z
---

For [[project-runekeep-overview]], shipped 2026-08-10 as v0.39.0 (issue #434, PR #435).

**THE REACT COMPILER IS ON.** `app.json` › `experiments.reactCompiler: true`. It memoises a
component's output against the state and props it can SEE. A component that renders data held in a
mutable ref, and keeps only a throwaway counter to force repaints, has output the compiler can prove
does not depend on that counter: it returns the cached JSX forever. This cost an hour on v0.39's
overlay host, and it fails SILENTLY - the subscription was live, the notify fired, the state
incremented, and nothing rendered, with no error and nothing in the console. **Whatever a component
renders must live in real state.** Diagnosed by adding a `globalThis` write to the render body, which
made the compiler bail out of memoising and the bug vanish; that flip-flop is the tell.

**AN ABSOLUTE INSET-0 OVERLAY IS ONLY FULL-SCREEN IF ITS PARENT IS.** Inside a `ScrollView` the
containing block is the CONTENT CONTAINER, whose top is wherever it is scrolled to and whose height
is the height of the content. That is the whole of the owner's "the pop-up for naming a group of
modifiers is off-centre vertically and partly outside the screen": `GroupNameDialog` is rendered by
`EffectsField`, which sits in the modifier panel's ScrollView. Nothing about the dialog was wrong.
`src/components/overlay-host.tsx` is the general fix: `<OverlayHost>` at a panel root, `<Overlay>`
around the dialog wherever it is written. With no host above it, `Overlay` renders in place, so
panels adopt it one at a time. Hosts now live in `dm-modifiers-panel`, `full-screen-panel` (which
covers every panel built on it) and `card-editor`.

**A DEBOUNCE TIMER MUST NULL ITS OWN HANDLE.** `encounter-screen`'s `commitEncounter` set
`encTimer.current = setTimeout(...)` and the callback never cleared it, so after the DM touched any
stat once the handle stayed truthy for the life of the screen. The focus effect then "flushed the
pending save" on every focus, writing the copy that screen was holding - which, right after a
characterize, is the pre-characterize adversary. It also did not AWAIT the flush before reading, so
it raced. That is why the owner saw it work once and fail once: it was never about the portrait or
Skip and Forge, it was about which write landed last. Fixed by nulling in the callback, awaiting the
flush, and flushing on blur instead of abandoning.

**THE DICE TRAY** (`src/lib/dice-pool.ts` + `src/features/character-sheet/sheet/dice-tray.tsx`). A
triangle at design (24,244) swaps the three vitals panels for a die carousel, a pool and
Roll/total/Clear; tapping a trait throws the duality pair with that trait's modifier. The app STILL
never resolves a check - see [[runekeep-no-digital-dice]] - this is a tray, and `rollValue` is the one
place `Math.random` is allowed.
- The pure module owns the order (smallest die first, stable on ties), the grid (every column count
  tried, biggest cell wins - NOT `ceil(sqrt(n))`, which is wrong in a panel 2.3x wider than it is
  tall), the total, the verdict and the roll's pitch ladder.
- All motion is transform-only: each die is one box whose CENTRE sits at the panel origin, so the
  grid re-flowing is one `withTiming` per die with no re-layout and no SVG re-render. A die added
  from the carousel is the same code starting somewhere else, which IS the "dragged into place"
  effect, and it cannot flicker because the shared values are seeded before the first frame.
- `DieButton` gained `fill`/`ink` overrides so a d12 can be drawn in Hope gold or Fear purple.
- **`Rune.sheet` is the PARCHMENT, not a text colour.** The total first printed white on white. On
  the sheet's bright half use `Rune.inkText` and `Rune.bronze`; `goldText`/`goldBright` are for dark
  panels only.

**The Scar type had two doors.** v0.37.1 wired `effectsForType` into the full editor's picker only,
and the Add Card badge opens `QuickCardFlow`, which is the door most cards come through. Both pickers
apply it now, and both flows re-settle it at SAVE through `withTypeEffects`, which is additive only -
stripping on every save would silently delete a scar effect a player added by hand.

**Editing these files from Python on this machine:** `open()` defaults to **cp1252**, so an anchor
string containing an em dash will not match a UTF-8 source file. Pass `encoding='utf-8'` explicitly.
A cp1252 round-trip (read then write, unchanged) is byte-safe, so earlier edits were not corrupted.

READ before any overlay/dialog placement, debounced-save, React-Compiler-shaped "it just does not
re-render", dice, or card-type-effect work.
