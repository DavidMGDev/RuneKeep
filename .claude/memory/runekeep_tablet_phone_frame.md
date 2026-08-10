---
name: runekeep-tablet-phone-frame
description: "v0.24.0 - tablets run the PHONE layout inside a magnified phone-shaped viewport (PhoneFrame), never a per-screen tablet adaptation"
metadata: 
  node_type: memory
  type: project
  originSessionId: 1859e40f-c67c-40af-8dd0-8ad1cbbfa612
  modified: 2026-08-02T19:56:27.810Z
---

**A tablet does not get a tablet layout in RuneKeep. It runs the phone layout, magnified.**

v0.23.0 adapted each screen for large screens (wider centred column, scaled controls, more grid
columns). The owner rejected it: the gold border ended up at the edge of a 10" panel instead of around
anything, the sheet's carousel spilled its off-screen cards across the empty width, dialogs dimmed only
the middle column and left the margins lit, and creation put five trait dials in a row and one alone.

v0.24.0 replaced it with `src/components/phone-frame.tsx`, wrapping the whole router in `_layout.tsx`.
Above `smallestWidth 600dp` it renders everything into a **412dp viewport** magnified by
`min(w/412, h/892)`, centred, clipped, with faint card art in the margins. Below it, children pass
through untouched.

**Consequences worth knowing before touching any layout:**
- `useLayout()` reads the VIEWPORT, so `isTablet` is false inside the frame and every v0.23.0 tablet
  branch is inert. `scaled()` and `gridColumns()` are identities now.
- **Never** `Dimensions.get('window')` or `useWindowDimensions()` in a screen. Use `useLayout()` /
  `useFrame()`, or you get the display size instead of the layout size.
- Gesture `absoluteX/absoluteY` and `measureInWindow` are PHYSICAL and ignore the transform. Anything
  positioning a view from them needs `windowToFrameX/Y`. Same for keyboard `endCoordinates.height`.
  `useStageScale()` publishes stage x frame.
- Scrims cannot escape the clip, so an overlay that dims declares it with `useScreenDim` /
  `<DimScreen opacity={x} />` and PhoneFrame paints the margins to match.
- Known and accepted: drag TRANSLATIONS are still physical, so the carousel scrubs ~40% faster on a
  tablet. Cards snap, so it reads as a livelier flick. Fixing it means retuning constants that are
  right on phones.

**Two failure modes this frame causes that only appear on a TABLET IN A BROWSER (v0.31.0):**

1. **A gesture's `e.x`/`e.y` is CSS pixels on web, design px on native.** react-native-gesture-handler
   divides by the target's own computed transform, and the DesignStage scale lives on an ancestor, so
   the divisor is 1. `card-carousel.tsx` publishes `coordScale = Platform.OS === 'web' ? stageScale : 1`
   and every hit test divides by it. Anything that forgets is *invisible on a phone browser*, because
   the stage there renders at ~1, and wildly wrong on a tablet. This has now bitten twice: the golden
   gear "missing" (v0.28.0) and the edit-mode card wheel teleporting its marker to the bottom-right
   plus the card-drag ghost (v0.31.0). Check every `e.x` / `e.y` in a worklet against `coordScale`.
2. **A browser shortens the window for its soft keyboard, so PhoneFrame re-magnifies the whole app**
   mid-sentence, border and all. `useKeyboardFreeHeight` holds the SCALE while an INPUT/TEXTAREA has
   focus; the frame height still follows the live window, so the column shrinks around the keyboard
   the way a phone does. Never derive the frame's scale from a live window height again.

Neither can be driven by `scripts/web-probe.mjs`: desktop Chrome has no soft keyboard, and the probe
cannot press, hold still, and then drag (which is what opens the wheel). The owner's Galaxy Tab is
the check.

See also [[runekeep-v0230-gotchas]], [[runekeep-v0240-gotchas]], [[runekeep-web-platform-gotchas]].
