# RuneKeep — Design system

Derived from the AELIANA mockup (the source of truth for look & feel).

## Color (committed: red carries identity, gold is the detail, near-black/ivory are the ground)
- `ink` #0B0E13 — app background / darkest.
- `panelDark` #0E1116 — dark stat panels (defenses/armor).
- `sheet` #FAF8F2 — the parchment sheet surface (warm near-white, never pure #fff).
- `inkText` #14110C — primary text on the sheet (warm near-black, never pure #000).
- `red` #C81B18 — THE accent. Class line, key values, HP, stress fills, banners. **One red, no variations.**
- `gold` #C8923A / `goldDetail` #DAA249 / `goldBright` #E0B563 — filigree, frames, labels, dividers.
- `muted` #938E88 — secondary text (subclass, captions).
- Accent is **locked to red** for now (the multi-color picker logic stays but is hidden).

## Shape language — the signature
- **Chamfered 45° corners, NOT rounded.** Panels, frames, buttons cut their corners at 45°. Avoid
  `borderRadius` except where the mockup is genuinely round (the radiant AC ring, pip dots).
- **Flat.** No gradients-as-decoration, no gl, minimal shadow. Color blocks + gold hairlines.
- **Sharp edges, selective roundness.** Hard chamfers everywhere; roundness only for circular emblems
  (sun radiant, compass) and the heart/diamond glyphs themselves.
- Use the provided SVG frames (`assets/art/new/`) as the chamfered containers — never invent rounded
  frames: chamfered panel (image), red-tab header bar (image-2), gold octagon (image-6), radiant
  sunburst (image-7), dark chamfered armor panel (image-11/10), gold dividers (image-4/5), side
  filigree (image-8/9).

## Typography (Archivo)
- Display/numerals: **Archivo Black**, uppercase, tight tracking — name, big numerals, trait modifiers.
- Labels: **Archivo Bold**, uppercase, +tracking — EVASION / HIT POINTS / STRESS etc.
- Secondary/body: Archivo 500/Regular — class line, captions.
- Text must **fit its frame** (auto-shrink + clip); never spill or get cut with an ellipsis.

## Layout laws (this product)
- One screen, fit (DesignStage). Vertical budget: bio ≤30% top, resource icons own the bulk, cards
  bottom ~15%.
- **Resource icons are large** (~40-44px). HP = 6 hearts (each worth 2). Stress/Armor (12) wrap to two
  rows of 6 so the icons stay big. **Hope = a single elegant row of large diamonds connected by a gold
  line.** Stress and Hope share the same left edge (aligned).
- Every section sits inside a chamfered frame with its label; the armor/defense block is the dark
  (image-11) panel. Trait banners keep their current size (they already read well).

## Motion
- Trait banners slide offscreen (3 left, 3 right) when the card deck expands. Springs, ease-out, no bounce.
