---
name: runekeep_v0272_diagnosis
description: "v0.27.2 verified causes: collapsed folders were saved but never read back; the pop-up frame was a stretched SVG whose inner edge is a FRACTION while the fill was a flat 8dp inset; the gallery FlatList had zero windowing; live cards must ride the withImage window; Android audio 'suspended' means the oboe stream never opened"
metadata: 
  node_type: memory
  type: reference
  originSessionId: 1859e40f-c67c-40af-8dd0-8ad1cbbfa612
  modified: 2026-07-31T16:14:51.954Z
---

Found by a 31-agent workflow (5 investigators + adversarial verifiers). Several plausible causes were
REFUTED and must not be "fixed" again.

**Collapsed folders**: `src/lib/folders.ts` has persisted `collapsed?: string[]` since v0.23.0 and
round-trips it fine. The roster kept a SECOND copy in component state (`useState(new Set())`), and
that is what every render read, so arriving at the screen re-opened everything and the next toggle
saved that over the good value. Fix: derive from `index.collapsed`; there is no second source of
truth. `removeFolder` also rebuilt the index literally as `{folders, assignments}`, dropping
`collapsed` whenever any folder was deleted. **Spread the index in every reducer.**

**Pop-up border vs background**: the frame was ONE SVG stretched with `preserveAspectRatio="none"`,
so its inner edge sits at a FRACTION of the box (~1.2%/side), while the fill was a separate View inset
a flat 8 dp. Never agree; the gap differs per dialog because the vertical fractions multiply by a
content-driven height; square fill corners cut the chamfers. Now `ChamferBox` (one polygon carries
outline AND fill). The art also carried its own opaque mat OUTSIDE the frame.

**Card archive** (`src/features/gallery/gallery-screen.tsx`): FlatList over 637-1011 items with NO
windowing props at all + inline unmemoized `renderItem`. Fixed with getItemLayout/windowSize/
memoized cell. The filter drawer was 4 unlabelled wrap-bands (~344dp); now 4 labelled one-line
horizontal scrollers. Equipment/class cells still live-render ForgedCard (not yet wired to
`useForgedSnapshots`) — that remains the biggest archive win if it gets slow again.

**Live cards on native**: since v0.27.0 a card with no bitmap renders `live` (needed for web). Do NOT
gate that off native by dropping the card — verifiers showed it reintroduces silent capture failures
and destabilises `dedupeIds` instance ids. The safe fix is to keep deck membership and only render
`item.live` inside the existing `withImage` distance window (card-carousel.tsx).

**Creation headroom**: `REST_FRAC` is a FRACTION of the rail, so only ~36% of anything trimmed above
the carousel becomes visible headroom. Trim the header AND raise REST_FRAC (0.36 -> 0.38).

**Android audio**: SUPERSEDED, this conclusion was WRONG — see [[runekeep-v0273-diagnosis]]. The
stream was not failing to open; the app was starting it twice and the library stored the rejection.
The rebuild-with-a-different-sample-rate attempt described here did not help and its restarts were
the app fighting itself. Still true and worth keeping: `setAudioSessionActivity` /
`setAudioSessionOptions` are NO-OPS on Android (checked AudioAPIModule.kt), and holding the speaker
on the main menu gives the readout (`sfxDiagnostics()`).

**Process**: never `git checkout` another branch while a gradle APK build is running — it bundles the
wrong JS silently.

Related: [[runekeep_forged_cache_perf]], [[runekeep_v0270_web_cards_audio]], [[runekeep_render_perf]]
