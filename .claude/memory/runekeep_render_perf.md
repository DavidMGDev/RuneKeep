---
name: runekeep_render_perf
description: "RuneKeep render-perf cost model — why per-card SVG canvases tank FPS, the appearance-preserving fixes, and the no-flicker carousel constraint"
metadata: 
  node_type: memory
  type: reference
  originSessionId: 3f43d8ff-479e-4502-bb00-7646a63952a3
---

The recurring RuneKeep on-device perf bug ("the float menu and scroll menus drop to ~3-5 FPS"): the **driver is the COUNT of live `react-native-svg` (`<Svg>`) canvases compositing per frame** under a fractional-opacity dim veil, NOT view/card count. Each `<Svg>` is a separate native canvas; under an animated dim (Android `saveLayerAlpha` over a multi-child container) the compositor redraws them every frame. So overlays rendered **per-card** (and worst, per *enabled* card on every slot) multiply the cost. Confirmed twice: #297 (token gradient SVGs gated to the 3 center slots) and #328/v0.9.6 (`EnabledCorner`/`TraitCrossOut` SVG → plain Views). See [[runekeep_v09_features]], [[runekeep_apk_build]], docs/architecture.md perf rules.

**Diagnostic fingerprint** (owner's narration): lag scales with how many cards are ENABLED in the *current* carousel category; switching category clears it; returning brings it back; persists across reload. → it's the live overlays on the mounted current-category cards, composited under the float-menu/expand/sheet dims.

**Appearance-preserving levers, in order of preference:**
1. **Plain Views** (`<View>` with backgroundColor) — the cheapest primitive, no SVG canvas, no saveLayer. Faithful for: solid rects, axis-aligned lines (`GoldRule`), border-trick triangles (corner badges), and FILL-ONLY chamfer octagons (plus-shape body + 4 border-trick corner triangles in the fill colour = the same 8 vertices; background-INDEPENDENT, no bg-coloured knockout). The border-trick triangle model: a 0×0 View with two adjacent borders, one = fill colour, the other = `'transparent'`, the other two width 0; anchor to the corner. See `enabled-corner.tsx`, `trait-cross-out.tsx`, `chamfer.tsx` `ViewChamferFill`.
2. **Bake to a bitmap** (the LOD system / `useForgedSnapshots` → WebP/PNG thumb+full). Forged cards already do this; the live `<Svg>` only renders during the offscreen capture, never per-frame in the carousel.
3. **`React.memo`** — only cuts JS reconciliation, NOT the per-frame GPU composite. Helps when a parent re-renders often AND props are referentially stable (inline `onPress`/`style`/`children` defeat it). Modest; use as hygiene, not as the perf fix.

**NOT View-faithful (keep as SVG):** STROKED chamfers (the 45° diagonal **mitered hairline** can't be drawn with Views — border-trick gives solid fills, not anti-aliased diagonal outlines; `borderRadius` rounds the corner, changing the signature shape), gradient/clip art (`DividerPlaque`/`PlaqueMask`, `ChamferedImage`), complex art SVGs (`FrameSvg.Octagon`). For these, memoize or bake instead.

**HARD CONSTRAINT (owner): never make the carousel flicker.** Do NOT unmount, hide, or fade the card carousel when the float menu opens — cards (and their tokens) must stay visible behind the dim, no jump, no disappear. The fix is to make the carousel CONTENT cheap (cheap overlays), not to remove it. The float menu's own dim + `SheetDim` stay as-is.

Owner verifies motion/perf manually on device (see [[runekeep_verify_animations_manually]]) — ship the structural fix, but flag any motion-path change (e.g. stress-pip charge animation) for an on-device glance.
