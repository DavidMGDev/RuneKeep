# RuneKeep — architecture

The load-bearing technical decisions, kept current with the shipped code. When this disagrees with an
older comment, this file wins. Per-feature responsibilities live in each feature's `SPEC.md`.

---

## Responsive layout — the `DesignStage`

Screens are dense, overlap-heavy art compositions authored in a **fixed design space of 412×892**. They
must match the mockup and **never stretch** anything that isn't a panel outline / background. Aspect-ratio
*resizing* (uniform scale) is fine; free per-axis *stretching* is not.

**Decision:** author each screen in design px and render it inside `<DesignStage>` (`src/components/design-stage.tsx`),
which applies a single uniform scale (`transformOrigin: 'top left'`) to fit the available area, then centers it.

- `scale = min(availW / designW, availH / designH)` → uniform aspect resize only, never distortion. Math lives
  in `src/lib/stage-scale.ts`.
- Inside the stage, components are positioned in design px with **flex inside local clusters** (icon rows, stat
  columns). Art uses `resizeMode="contain"` / locked `aspectRatio` so icons, emblems and banners never distort.
- The full-bleed **ink background renders *outside* the stage** — the root layout (`GestureHandlerRootView` +
  the Router stack `contentStyle`) paints `Rune.ink` across the whole device, so the screen always fills.
- The gold **frame (`SheetFrame`) renders *inside* the stage on purpose**: it interlocks with content (portrait
  notch, chamfered parchment edge, z-ordering above the card hand). Scaling it *with* the content keeps those
  alignments exact. On non-412:892 aspect ratios the framed sheet **letterboxes inside the filled ink field** —
  that's the intended "framed character sheet" look, not a bug.
- Only stretch the ink background; never stretch the frame. A subtree that later needs genuinely reflowing
  content (long lists/text) can opt out of the stage and use plain flex — the stage is per-screen, not global.

### Tablets — the `PhoneFrame` (v0.24.0)

**A tablet does not get a tablet layout. It runs the phone layout.**

v0.23.0 tried the other thing: a wider centred column, scaled-up controls, more grid columns per screen.
It worked and it was wrong. The border ended up stranded at the edge of a 10" panel with the carousel
spilling past it, dialogs dimmed the middle of the display and left the sides lit, and creation put five
trait dials in one row and the sixth alone. It had become a second app to maintain.

**Decision:** `<PhoneFrame>` (`src/components/phone-frame.tsx`) wraps the entire router at the root. Above
`smallestWidth 600dp` it renders everything into a **412dp-wide viewport**, uniformly magnified by
`min(w/412, h/892)` so it fills the display height, centred, clipped, with the leftover width used as
decorated margin. Below the breakpoint it returns its children untouched.

Everything else follows from that, rather than needing its own tablet case:

- `useLayout()` reads the **viewport**, not the window, so it reports ~412dp inside the frame. Every
  tablet branch written in v0.23.0 evaluates false on its own. `scaled()` and `gridColumns()` are now
  identities, kept only so those call sites still read naturally.
- **Never read `Dimensions.get('window')` or `useWindowDimensions()` in a screen.** Use `useLayout()` /
  `useFrame()`. The window is the display; the frame is the space you are laying out in, and inside the
  frame they differ by the magnification.
- **Window coordinates need converting.** Gesture `absoluteX/absoluteY` and `measureInWindow` report
  physical window space and ignore the frame's transform, so anything that positions a view from them (a
  drag ghost, a radial cursor, a keyboard spacer) must pass through `windowToFrameX/Y` or divide by
  `useFrame().scale`. `DesignStage` publishes stage × frame through `useStageScale()` for the same reason.
- **The margins mirror the screen; they do not decorate it.** They paint whatever colour the screen
  paints at its horizontal edge, under the same dim, behind the same status and navigation bars. Both
  are DECLARED, not sampled (React Native cannot read back a rendered pixel cheaply):
  `useScreenEdge(color)` for the base colour, `useScreenDim(opacity)` / `<DimScreen>` for a scrim
  (`src/lib/screen-dim.ts`). **Anything that covers the screen edge must declare itself**, or a tablet
  shows a lit strip either side of a darkened app. `AppScreen` declares ink; the character sheet
  declares parchment, because its matte runs edge to edge.
- Gesture *translations* are still reported in physical px, so a drag scrubs the carousel about 40% faster
  on a tablet than on a phone. Cards snap to slots, so it reads as a livelier flick rather than a fault;
  correcting it would mean retuning constants that are currently right on phones.

---

## Card carousel

The loadout is a fanned hand of cards riding an arc, coupled to a spinning gear. Geometry constants and the
per-frame worklets live in `src/features/character-sheet/carousel-geometry.ts`; the state machine in
`src/features/character-sheet/carousel-context.tsx`. **Everything derives from two shared values:** `rotation`
(radians, the engine) and `expandProgress` (0 compact → 1 expanded).

### Arc + scale math
- Cards ride a circle radius `R`, center far below screen; `theta=0` = screen-center.
  `theta_i = baseAngle + i·angleStep − rotation`; `x = Ox + R·sin θ`, `y = Oy − R·cos θ`, tilt `= θ`.
- Finger delta `dx` → `dθ = dx/R`. Larger `R` ⇒ flatter fan + heavier feel. `angleStep` is set from a
  center↔neighbor overlap cap (≤5%).
- Scale falloff is a Gaussian of angular distance: `scale = SCALE_MIN + (SCALE_MAX−SCALE_MIN)·exp(−d²/2σ²)`,
  `σ ≈ 1.7·angleStep` → center biggest, smooth rings out. `zIndex = round(1000 − d/angleStep)`.

### State model — 3 states, NO timers
`compact → expanded → fullscreen`, held on a shared value. There is **no** held/locked state, **no** timer,
**no** auto-collapse — removing your finger leaves the hand where it is. JS actions on the carousel context
drive the shared values directly (`expand` / `collapse` / `openCardAt(i)` / `closeFullscreen`).

### Gestures
- **One `Gesture.Pan`** on a full-sheet `box-none` container scrolls the hand 1:1 in any state, with a
  `withSpring(snapRot(...))` settle on release (no decay). Vertical drags transition state (up-drag fans, then
  flies the center card fullscreen; down-drag collapses). At most one transition per gesture.
- **Per-card `Gesture.Tap`** nested under the pan (scroll-view-with-buttons pattern): tap compact → expand;
  tap expanded → that card flies fullscreen. Fullscreen = the same `CardSlot` growing in place over a dim
  overlay (no separate overlay object). Thresholds live in `carousel-geometry.ts`.

### Rendering — the LOD system
- Every card ships at two LODs (`card-data.ts`): `source` ≈ 750×1050 WebP q86 (~90KB) and `thumb` ≈ 188×263
  WebP q70 (~9KB). **Every deck slot is mounted forever** on its thumb — no virtualization, no unmount pops; a
  full deck of thumbs composites for less than two full cards.
- The full-res layer mounts within ±2 of center and draws on the three center cards, cross-fading over the
  thumb; it's damped to zero during a gear grind (a grind composites only thumbs).

### The gear control
- Two static rings (alpha ~0.26); the inner ring brightens to full as the hand expands — it *is* the control.
  Drag = grind with adaptive sensitivity (~half a screen sweeps the whole deck); the fan tightens and shrinks.
  Tap cycles state (fullscreen→close+collapse, expanded→collapse, compact→expand). Tap logic lives in both
  `onEnd` and `onFinalize(!success)` to catch jittery vs clean taps.

### Layering (z-index, all siblings inside the scaled stage)
body/traits `0` < dim veil `0` < gear `0` < card hand (`~1000`) < `SheetFrame` gold border `2000` (name `2100`
to clear the finial) < fullscreen overlay `5000`.

### Perf rules (learned on-device, A54) — do not regress
1. Never put `renderToHardwareTextureAndroid` / `shouldRasterizeIOS` / Android `elevation` on a view whose
   opacity/scale animates per frame (texture invalidation).
2. Never put a fractional opacity on a **multi-child container** (Android `saveLayerAlpha` per frame).
   Translucency goes on single-image leaves; rest-state alphas must be integers.
3. Count **textures drawn per frame**, not views mounted — big sources decode cheap as WebP, tiny as thumbs;
   compositing many full-res layers is what kills the GPU.

---

## Animation / SDK-54 gotchas
- Reanimated 4 + worklets + gesture-handler are installed and wired (`GestureHandlerRootView` in `_layout.tsx`).
- Do NOT add the reanimated/worklets Babel plugin manually — `babel-preset-expo` injects it (double-add throws).
- Per-frame math = module-scope worklets reading shared values. Finalize any decay with a `withSpring` snap.
- Install Expo-tracked libs with `npx expo install …`, never plain `npm install`.

## The web target (v0.24.3)
The browser is not a small phone; it brings its own defaults, and four of them made the app look
broken rather than merely different. All four fixes live outside the screens, so nothing has to
remember them:

- **`src/app/+html.tsx`** (web only) is the HTML shell. It kills image dragging (`user-drag: none`,
  or every card hands you a translucent ghost instead of scrolling), kills text selection outside
  inputs, stops overscroll, links the PWA manifest, and carries the **drag-to-scroll** shim. A browser
  will not scroll an `overflow` container from a press-and-drag, so every list looked frozen with a
  mouse; the shim restores the phone gesture and steps aside whenever a gesture-handler target
  (`touch-action: none`) sits between the pointer and the scroller.
- **`.svgrrc.js`** adds SVGO's `prefixIds`. Ids are minified per file (`a`, `b`, `c`), which is fine on
  native where each `<Svg>` owns its canvas, and fatal on web where every inline `<svg>` shares one
  document: `url(#a)` resolved to whichever gradient rendered first, so all nine class banners painted
  in one colour. (This supersedes `scripts/uniquify_svg_ids.py`, which namespaced ids in the source
  files only for SVGO to rename them again.)
- **Platform API shapes can differ inside one library.** `createBufferSource` takes an options object
  on native and a bare boolean on web, so `{ pitchCorrection: false }` read as truthy there and every
  single sound threw. Check the `web-core` implementation, not just the types.
- **Anything gated on native-only work must be satisfied on web.** The sheet waits for every forged
  card bitmap before lifting its loading veil, and web never forges any (cards render live instead),
  so the veil sat opaque and click-eating for its full 7.5s fallback on every open.

Verify with `scripts/web-probe.mjs`, which drives the real browser; see `docs/web-deploy.md`.

## Data
All static game data is bundled with the app — **no database, no network, fully offline**. User saves are
per-character JSON via `expo-file-system` (native) / IndexedDB (web, `src/lib/web-store.ts`),
serialized through `src/lib/character-file.ts` (versioned `CharacterFile` schema).
