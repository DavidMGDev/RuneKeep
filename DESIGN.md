# RuneKeep — Design system

Source of truth for look & feel. The character sheet (AELIANA mockup) established the language;
this file extends it to the whole app (menu, gallery, roster, creation flow).

## Color

Strategy: **committed on ink** outside the sheet (the dark keep), committed on parchment inside the
sheet. Red carries identity, gold is the detail, near-black/ivory are the ground.

- `ink` #0B0E13 — app background / darkest. THE surface of every non-sheet screen.
- `panelDark` #0E1116 — raised dark panels on ink (subtle step, no shadow stacks).
- `sheet` #FAF8F2 — parchment surface (warm near-white, never pure #fff). Sheet + selected/active
  fills only; on dark screens parchment is an ACCENT (a lit panel), not the ground.
- `inkText` #14110C — primary text on parchment (warm near-black, never pure #000).
- `red` #C81B18 — THE accent. Primary actions, active states, HP. **One red, no variations.**
- `gold` #C8923A / `goldDetail` #DAA249 / `goldBright` #E0B563 — filigree, frames, labels, dividers,
  selection glows. Gold = structure & honor; red = action & blood.
- `bronze` #8A6B33 — labels on parchment (AA at small sizes). `ivory` #F2EDE2 — text on ink.
- `muted` #938E88 — secondary text, disabled states.
- **Class colors exist but stay subordinate**: when a class/domain needs identity color (creation
  flow, gallery filters), sample the card art's banner hue, desaturate/darken toward ink so gold
  text stays AA on it. Never let nine saturated buttons shout at once; color appears on focus/
  selection, muted at rest.

## Shape language — the signature

- **Chamfered 45° corners, NOT rounded.** Panels, frames, buttons, chips cut corners at 45°
  (`ChamferFrame`). No `borderRadius` except genuinely circular emblems and pip dots.
- **Flat.** No decorative gradients, no glassmorphism, minimal shadow. Color blocks + gold hairlines.
- **Gold hairline = structure.** 1–1.6px gold rules divide and frame; thicker gold only on the
  full-bleed screen borders.
- Provided SVG frames (`assets/art/new/`), each with a role:
  - `FullUI.svg` — full-bleed screen border for NON-sheet screens (sharp corners, dark + gold edge).
    The sheet keeps its own ornamental `longBorder`; everything else uses FullUI.
  - `Square.svg` — square dark panel (class buttons, portrait wells, icon tiles).
  - `Pop-up.svg` — dialog/confirm frame (import/export prompts, unsaved-changes).
  - `image.svg` (chamfered panel), `image-2` (red-tab header), `image-6` (gold octagon),
    `image-7` (sunburst), `image-11/10` (dark armor panel — reusable on dark screens),
    `image-4/5` (gold dividers), `image-8/9` (side filigree). The HP bar frame (red tab) is
    sheet-only; do not reuse it elsewhere.
  - All have 0 rounded corners: use them full-bleed, or seat them inside an ink panel; never clip
    them into rounded containers.

## Typography (Archivo)

- Display/numerals: **Archivo Black**, uppercase, tight tracking — screen titles, big numerals.
- Labels: **Archivo Bold**, uppercase, +tracking — section labels, tabs, chips.
- Secondary/body: Archivo 500/Regular — descriptions, captions.
- Scale steps ≥1.25 apart; on dark screens titles run bigger (ink absorbs weight).
- Text must fit its frame; size for NATIVE glyph widths. Auto-shrink (`fit`) is opt-in and rare.

## Layout laws

- **Sheet**: one screen, no scroll, DesignStage 412×892 (unchanged, owner-approved).
- **Non-sheet screens**: normal RN flex + ScrollView/FlatList layouts (dp units, safe-area aware) —
  NOT DesignStage; these screens scroll and adapt. Full-bleed FullUI border with content inset
  inside it; top/bottom inset floors (32dp/48dp Android) carry over.
- Vary spacing for rhythm: section gaps ≥ 2× intra-block gaps. Don't wrap everything; ink itself is
  a fine ground for type.
- Tap targets ≥44dp. One primary action per screen region, in red; secondary actions are gold
  hairline outlines on ink.
- Card thumbs in grids/strips keep the 5:7 aspect, chamfer-framed, LOD assets only.

## Motion

- Outside the sheet: 150–250ms fades/slides, ease-out (quart/expo feel via Reanimated springs with
  high damping). No bounce, no elastic, no particles. One deliberate ceremony moment is allowed per
  flow (e.g. the Domains tab unlocking) — short, meaningful, skippable by reduced-motion.
- Loading states: ink screen + gold chamfered emblem pulse (opacity 0.4→1 loop) + label; ambient
  LOD card drift where it fits (menu). Never a bare ActivityIndicator on white.
- The sheet keeps its richer motion system (charge/particle/carousel) untouched.

## Components (canonical)

- `ChamferFrame` — chamfered outline/fill panel (any size).
- `SheetText` — fixed-box text primitive (alignment, uppercase, tracking).
- `GoldRule` / `GoldRuleV` — hairline dividers.
- Chips: 20–28dp tall chamfered fills (red = active/selected, gold outline = available).
- `CardThumb` / `Card` — the two-LOD card image pair; reuse everywhere cards render.
- New shared pieces should land in `src/components/` when used by 2+ screens.
