# create — character creation flow

**Responsibility:** the guided, card-by-card character forge: class & subclass, ancestry (incl. mixed),
community, two domain cards, the trait array, experiences, weapons, armor, inventory, and starting gold.
On finish it writes a `CharacterFile` via `src/lib/character-store.ts`. Entry: `src/app/create.tsx` →
`CreateScreen`.

## Structure
- `create-screen.tsx` — the orchestrator: owns the draft state, the 10-step deck-switch flow (with the
  fade/grace animation), the carousel + editors, and the loaders.
- `create-types.ts` / `create-constants.ts` — the `Draft` model, deck keys/guards, `TRAIT_POOL`,
  `deckDone()` and other pure predicates.
- `create-ui.tsx`, `create-loaders.tsx`, `create-rail.tsx` — extracted leaf components, loaders, and the
  deck rail (self-contained; props in, JSX out).
- **`components/`** — the card visuals: `forged-card.tsx` (the code-rendered card), `forged-snapshots.tsx`,
  `class-cards.tsx`, `gold-card.tsx`, `straight-carousel.tsx`, `card-divider.tsx`, `chamfered-image.tsx`.

## Public surface
`CreateScreen` (route). `components/` exports `ForgedCard` & friends, `CLASS_CARDS`, `StraightCarousel`,
`DividerPlaque` — also consumed by the character-sheet panels (gear-browser, level-up).

## Data / deps
All rulebook data from `src/data/` (catalog, equipment, class-data, class-inventory, item-colors);
effect lookups via `src/features/cards/card-effects.ts`.

## Oversized-file exceptions (ponytail)
`create-screen.tsx` remains the orchestrator (~650 lines after extraction). Its deck-switch fade timing,
the per-deck `items` memo, and the `onToggle` state machine close over the draft + fade shared value;
extracting them would invert control / drill state and *increase* complexity — a principled exception.
