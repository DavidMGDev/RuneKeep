# ADR 0001 — Responsive strategy: uniformly-scaled design stage

Status: accepted · 2026-06-08

## Context
The character sheet (and future screens) are exported from Ligma as a dense, **overlap-heavy**
composition authored at a base design of **412×892**. The export encodes responsiveness as
per-layer keyframes resolved per-viewport; in practice almost every layer is `w:fluid h:fluid`
with `lerp`/`center` anchors — i.e. the whole sheet **scales roughly proportionally**, with minor
repositioning, across the observed range (widths 360–443, heights 732–956).

The owner's hard constraints:
- Match the HTML mockup as closely as possible.
- **Minimize stretching** of anything that isn't a panel outline / panel background.
- Aspect-ratio *resizing* (uniform scale) is completely fine; free aspect *stretching* is not.

A pure flexbox re-layout would fight the design's overlaps (ArmorSection overlaps Bio, ClassBan
hangs over the portrait, LongBorder frames everything) and risk per-axis stretching.

## Decision
Author each screen in its **fixed design coordinate space** (e.g. 412×892) and render it inside a
**`<DesignStage>`** that applies a **single uniform `scale`** (`transformOrigin: 'top left'`) to fit
the available area (`contain`), then centers it.

- `scale = min(availW / designW, availH / designH)` → never distorts; uniform aspect resize only.
- **Full-bleed background & frame** (ink background, `LongBorder` gold frame) render *outside* the
  scaled stage and stretch to the device edges — these are explicitly the "panel outline / panel
  background" layers where stretching is allowed. So the screen always fills the device while the
  *content* never stretches.
- Inside the stage, layout uses real, named components positioned in design px (from the resolved
  base geometry in `design-reference/`), with **flex inside local clusters** (icon rows, stat
  columns) so they distribute naturally. Art uses `contain` / locked `aspectRatio` so icons,
  emblems and banners never distort.

## Why not the alternatives
- **Pure flex translation** — can't faithfully reproduce overlaps; high risk of per-axis stretch;
  much more code to verify against the oracle. Rejected.
- **Porting the Ligma keyframe runtime** — brittle, heavy, and the export's own README warns against
  it. We instead bake the resolved base geometry and scale it. Rejected.
- **Per-element `px * scale` math** — equivalent result but verbose and error-prone vs. one stage
  transform. Rejected in favor of `<DesignStage>`.

## Consequences
- Pixel-faithful to the mockup at any size; trivial to verify (open `design-reference/screen-1.html`
  at a resolution, compare). Zero non-panel stretching by construction.
- On unusual aspect ratios the content letterboxes within the filled frame — which is the intended
  look (a framed character sheet), not a bug.
- Animated transforms (spring scale, float, drag) compose cleanly *on top of* the static layout.
- If a screen later needs genuinely reflowing content (lists, long text), that subtree can opt out
  of the stage and use plain flex — the stage is per-screen, not global.

## Revisit if
The owner prefers content to *fill* rather than letterbox on extreme aspect ratios, or a future
screen is text/list-heavy rather than a fixed art composition.

## Amendment — 2026-06-10 (reconciling the decision with the implementation, H1)
The original Decision said the **gold `LongBorder` frame** renders *outside* the scaled stage and
stretches to the device edges. In the shipped sheet it renders **inside** the stage
(`SheetFrame`, a `DesignStage` child), and that is now the intended design:
- The full-bleed **ink background still renders outside** the stage — the root layout
  (`GestureHandlerRootView` + the Router stack `contentStyle`) paints `Rune.ink` across the whole
  device, so the screen always fills regardless of aspect ratio. The ADR's "screen always fills"
  goal holds via the ink background.
- The **gold frame is kept in-stage on purpose**: it interlocks with content (the portrait notch,
  the chamfered parchment edge, the z-ordered stacking that lets the frame sit above the card hand —
  see C5). Scaling it *with* the content keeps those alignments exact; pulling it out to device edges
  would desync it from the parchment it frames and re-introduce the corner seam.
- Net: on non-412:892 aspect ratios the framed sheet **letterboxes inside the filled ink field** —
  which is exactly the "framed character sheet" look the Consequences section calls intended, not a
  bug. Only stretch the ink background; never stretch the frame.
