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

## The desktop play table (v0.47.0, reworked v0.47.1 and v0.47.3)

- Everything right of the desktop sheet is one table seen from above: ink felt (`public/table/felt.webp` plus
  `weave.png`, rendered in Blender by `scripts/blender/make_table.py`, graded by `grade_table.py`). The felt colour
  never changes. No drawer: the hand lies on the same felt, marked off by a faint hairline, a soft shade or nothing.
- The table's edge is a setting: a gold hairline, a 3D stone wall, a 3D brass rail, or nothing drawn.
- Dice are seen through an orthographic camera tipped 0.32 rad: no perspective skew anywhere, but tops and fronts
  both read. Sharp bevels (Blender, `make_dice.py`). Finishes: resin, stone, metal for rolled dice; obsidian,
  gilded, ivory for control dice. Control dice carry their glyph on two opposite faces and always rest on one.
- Control dice: State, Cards, Sort and the deck die (a d6 at least; thrown or rolled, the face it lands on picks the deck). Characters, Rest and Level up live on the
  port under the traits. A roll's result is a pop-up on the port, accepted with OK, never under the dice.
- Panels on the table are DOM: 45° chamfers by clip path, 1.2 px gold hairlines, red for the one primary action,
  Archivo Bold capitals for labels. No selection bars: a chosen item is filled red, a hovered one is lit whole.
- v0.47.3 (round four): input priority is the table's buttons, then pieces, then cards. No dice bar and no Roll or
  Tokens die: the control dice are Cards, State and Sort deck (top right by default); the supply (top left) is a
  token (wheel: wood, bone, iron), a colour token (wheel: colour), a die (wheel: d4 to d20, Hope and Fear, d100)
  and the Deck of Many Things. A click throws out a copy, a drag pulls one, a right click flings one (held, it
  charges: the piece shakes harder and fires). Supply pieces can be knocked about; Reset sends them home, Tidy
  (above Reset) puts every loose piece and rolled die back.
- Pieces dropped on a card are anchored: physics never moves them, only the card or the hand. A card can be made
  physical (its menu): a box body knocked by dice that carries its anchored pieces. The hand draws a card's tokens
  flat, the table stands them up in 3D, from the same list; pressing one on a hand card pops it off.
- Drag on the empty felt to select; the selection bar (top centre) rolls the dice in it, saves them as a preset or
  puts them back. Presets live in the table menu under Roll dice, each with a delete that asks first.
- The Deck of Many Things: 22 cards (names and SRD text from the booklet via `scripts/extract-domat.py`; the art is
  gitignored and only shows in a local build). A drawn card waits on the table; let go after a drag it is consumed
  and its effect plays from there (push, pull, whirl, shatter, ice, gems, rewind...). Effects are DOM light over
  the felt plus engine fields and impulses; hard hits shake the table.
- Layout is part of the look (`ctlX/ctlY/ctlDir`, `supX/supY/supDir`, `catX/catY`, `handMode`): while settings are
  open every row goes home and can be dragged or stood on end. Six whole tables made for ways of playing
  (Storyteller, Dice goblin, Tactician, Archivist, Showman, Duelist) and four drawn by `randomTables` and kept,
  scored by `tableScore` (rows on the table, out of the hand, clear of each other). Share is a link (`#table=RK1:`)
  or a code, first on the Presets tab.
