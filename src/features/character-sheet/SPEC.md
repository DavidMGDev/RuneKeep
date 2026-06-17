# character-sheet — the live play surface

**Responsibility:** the running character sheet: HP/Stress/Hope/Armor tracks with physics, the fanned
card carousel + gear, fullscreen cards, cosmetic tokens, and the panels/flows for damage, rest,
level-up, modifiers, gear browsing, and card authoring. Entry point: `src/app/sheet.tsx` →
`RedesignedSheet`.

## Structure
- **root** — domain logic & data shapes: `character.ts` (runtime sheet model + traits), `card-data.ts`
  / `card-types.ts` (deck card shapes, dedupe), `carousel-context.tsx` (the carousel state machine,
  shared values, actions), `carousel-geometry.ts` (arc/scale worklets + thresholds), `carousel-categories.ts`
  (the looping category ring), `art.ts`.
- **`components/`** — sheet primitives: `card-carousel.tsx` (the animated hand), `card.tsx`/`card-tokens*`,
  `charge-track.tsx` + `heart-track.tsx` (resource tracks), `trait-banners.tsx`, `sheet-frame.tsx`,
  `gear-*`, `enabled-corner.tsx`, `focus-overlay.tsx`, `accent.tsx` (sheet tinting), `primitives.tsx`.
- **`sheet/`** — the live screen + its overlays: `redesigned-sheet.tsx` (the screen orchestrator),
  panels (`damage-panel`, `rest-panel`, `level-up-panel`, `modifiers-panel`, `gear-browser`,
  `card-management-panel`, `full-screen-panel`, `overlay-shell`), flows (`new-card-flow`,
  `edit-card-flow`), and UI support (`float-menu`, `number-keypad`, `frame-svgs`, `category-icons`, …).

## Public surface
`RedesignedSheet` (consumed by the route). `CategoryGlyph` (deck-toggle-icon) and `DeleteCardConfirm`
(edit-card-flow) are also used by `components/`.

## Data / deps
Reads the runtime character from a `CharacterFile` via `src/lib/character-file.ts` (`toSheetCharacter`);
resolves card effects via `src/features/cards/card-effects.ts`; pulls static data from `src/data/`.

## Architecture notes
The carousel is animation-critical — see `docs/architecture.md › Card carousel` and its **perf rules**
before touching `card-carousel.tsx` / `carousel-context.tsx`.

## Oversized-file exceptions (ponytail)
`redesigned-sheet.tsx` (~1.5k) and the carousel files exceed the 150-line guideline. Per the analysis
in PR #300, they are coupled by design (refs-to-avoid-rerender, the beastform state machine, per-frame
worklets); splitting them further fragments cohesion and risks animation regressions that need on-device
verification. Pure helpers/constants/types have been extracted; the orchestrator/animation cores remain
as deliberate, verification-gated exceptions.
