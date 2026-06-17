# cards — card effect / modifier resolution

**Responsibility:** the logic that turns any deck-card id into its stat effects and labels. The card
*data* lives in `src/data/`; this feature is the **resolver** that sits between the data and the
modifier engine.

## Files
- `card-effects.ts` — the resolver. Resolves any id (catalog / equipment / loot / wildshape / custom /
  duplicate-instance) to `CardEffect[]`, plus identity helpers for duplicate instances and editing.
- `card-effects.test.ts` — covers the resolution logic.

## Public surface
- `effectsForCardId(id, file?)` — the effects for a card id (the engine's entry point).
- `catalogIdOf(id)` — strips per-instance suffixes (`#2`) to the underlying catalog id.
- `refOf(id, file?)` — resolves a copy/instance id to its underlying card ref (enable-state keying).
- `sourceLabelForCardId(id, file?)` — human label (Modifiers panel).
- `findEditableCard(file, id)` / `editableCardIds(...)` — locate a player-authored card + its collection.

## Data / deps
Reads `src/data/` (`cardById`, `CATALOG_EFFECTS`, equipment/loot/wildshape accessors, ancestry traits)
and feeds `src/lib/modifiers.ts`. Player overrides come from the `CharacterFile`.
