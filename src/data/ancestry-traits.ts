/**
 * Mixed-ancestry data (#265). A mixed character takes the FIRST trait of one ancestry and the SECOND
 * trait of another, so each card's other half is crossed out and its modifiers dropped. This module is
 * the one place that knows which trait owns each ancestry's passive, and which half is active for a
 * given mixed pair — pure + testable, no React.
 *
 * Trait text regions (for the visible cross-out) live in `ancestry-trait-regions.ts`.
 */

export interface MixedAncestry {
  /** Keeps its FIRST trait (its second trait is crossed out). */
  first: string;
  /** Keeps its SECOND trait (its first trait is crossed out). */
  second: string;
}

/**
 * Which trait (1 = first, 2 = second) a modifier-bearing ancestry's passive belongs to. Only the four
 * ancestries that grant a permanent stat passive are listed; every other ancestry grants nothing, so
 * mixing it never changes the sheet either way. Derived from the rulebook text:
 *  - Giant   → trait 1 "Endurance" (+1 Max HP)
 *  - Human   → trait 1 "High Stamina" (+1 Stress)
 *  - Galapa  → trait 1 "Shell" (+Proficiency to damage thresholds)
 *  - Simiah  → trait 2 "Nimble" (+1 Evasion)
 */
export const ANCESTRY_EFFECT_TRAIT: Record<string, 1 | 2> = {
  'ancestry-giant': 1,
  'ancestry-human': 1,
  'ancestry-galapa': 1,
  'ancestry-simiah': 2,
};

/** The active trait for an ancestry card within a mixed pair: the FIRST-picked keeps trait 1, the
 *  SECOND-picked keeps trait 2. Returns null when this card isn't part of the mix. */
export function mixedActiveTrait(mixed: MixedAncestry | undefined, catalogId: string): 1 | 2 | null {
  if (!mixed) return null;
  if (catalogId === mixed.first) return 1;
  if (catalogId === mixed.second) return 2;
  return null;
}

/** Whether a mixed ancestry card's passive is on its CROSSED-OUT half (so its effects must be dropped).
 *  True only for the four modifier-bearing ancestries when their passive's trait isn't the active one. */
export function isAncestryEffectDisabled(mixed: MixedAncestry | undefined, catalogId: string): boolean {
  const active = mixedActiveTrait(mixed, catalogId);
  if (active == null) return false;
  const effTrait = ANCESTRY_EFFECT_TRAIT[catalogId];
  return effTrait != null && effTrait !== active;
}
