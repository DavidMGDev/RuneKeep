/**
 * The Modifier Engine — the single, pure place the character sheet's derived numbers are computed.
 *
 * Cards (weapons, armor, ancestry/community/subclass/domain, loot, and player-authored custom cards)
 * each carry a list of `CardEffect`s. When a card is *enabled* (toggled on in the carousel), its
 * effects are layered on top of the character's base stats. `computeSheet` takes the base stats, the
 * character level, and the enabled cards' effects, and returns a `StatBreakdown` per stat: the base
 * value, the ordered list of contributions (each tagged with the card that applied it), and the
 * capped total. No React, no I/O — unit-tested in isolation (see modifiers.test.ts).
 */

import type { TraitKey } from '@/features/character-sheet/character';

/** The closed set of character-sheet numbers a card may modify. */
export type EffectTarget =
  | TraitKey // agility | strength | finesse | instinct | presence | knowledge
  | 'evasion'
  | 'armorScore'
  | 'maxHp'
  | 'stressMax'
  | 'hopeMax'
  | 'proficiency'
  | 'majorThreshold'
  | 'severeThreshold';

/**
 * One stat modifier carried by a card. Exactly one of `delta` / `byTier` / `dynamic` is meaningful:
 * - `delta`   — a flat signed amount (most effects).
 * - `byTier`  — tier-dependent amount; the value is `byTier[tier - 1]` (tier 1..4).
 * - `dynamic` — computed from the resolved sheet AFTER the flat pass: `proficiency` = the character's
 *               final Proficiency; `halfAgility` = floor(final Agility / 2).
 */
export interface CardEffect {
  target: EffectTarget;
  delta?: number;
  byTier?: [number, number, number, number];
  dynamic?: 'proficiency' | 'halfAgility';
  /** Optional human note (the rule text the effect came from) — shown in the Modifiers panel. */
  note?: string;
}

/** A card's contribution to one stat, kept in application order so the panel can show provenance. */
export interface Contribution {
  source: string;
  delta: number;
  note?: string;
}

export interface StatBreakdown {
  base: number;
  contributions: Contribution[];
  /** Base + sum of contributions, after the per-stat cap. */
  total: number;
  /** The cap applied (if any), so the UI can show "capped at N". */
  cap?: number;
}

/** A card's effects tagged with the card's human label, the unit `computeSheet` consumes. */
export interface EffectSource {
  source: string;
  effects: CardEffect[];
}

export type BaseStats = Record<EffectTarget, number>;
export type SheetBreakdown = Record<EffectTarget, StatBreakdown>;

/** Every target, in sheet-reading order (traits first). */
export const EFFECT_TARGETS: EffectTarget[] = [
  'agility', 'strength', 'finesse', 'instinct', 'presence', 'knowledge',
  'evasion', 'armorScore', 'maxHp', 'stressMax', 'hopeMax', 'proficiency', 'majorThreshold', 'severeThreshold',
];

const TRAIT_TARGETS: EffectTarget[] = ['agility', 'strength', 'finesse', 'instinct', 'presence', 'knowledge'];
export const isTraitTarget = (t: EffectTarget): t is TraitKey => (TRAIT_TARGETS as string[]).includes(t);

/** Human label for a target (Modifiers panel + per-card effect view). */
export const TARGET_LABEL: Record<EffectTarget, string> = {
  agility: 'Agility', strength: 'Strength', finesse: 'Finesse', instinct: 'Instinct', presence: 'Presence', knowledge: 'Knowledge',
  evasion: 'Evasion', armorScore: 'Armor Score', maxHp: 'Max Hit Points', stressMax: 'Max Stress', hopeMax: 'Max Hope',
  proficiency: 'Proficiency', majorThreshold: 'Major Threshold', severeThreshold: 'Severe Threshold',
};

/** Game caps: HP, Stress, and Armor slots can never exceed 12 (rulebook). */
export const STAT_CAPS: Partial<Record<EffectTarget, number>> = {
  maxHp: 12,
  stressMax: 12,
  armorScore: 12,
};

/** Daggerheart tier from level: T1 = 1, T2 = levels 2–4, T3 = 5–7, T4 = 8–10. */
export function tierForLevel(level: number): 1 | 2 | 3 | 4 {
  if (level <= 1) return 1;
  if (level <= 4) return 2;
  if (level <= 7) return 3;
  return 4;
}

/** Resolve the flat/byTier value of an effect (dynamic effects return null — handled in pass 2). */
function flatDelta(e: CardEffect, tier: number): number | null {
  if (e.dynamic) return null;
  if (e.byTier) return e.byTier[Math.min(4, Math.max(1, tier)) - 1] ?? 0;
  return e.delta ?? 0;
}

/**
 * Compute the whole sheet. `base` holds the intrinsic value per target; `sources` are the enabled
 * cards' effects. Pure + deterministic — same inputs always yield the same breakdown.
 */
export function computeSheet(base: BaseStats, level: number, sources: EffectSource[]): SheetBreakdown {
  const tier = tierForLevel(level);
  const out = {} as SheetBreakdown;
  for (const t of EFFECT_TARGETS) out[t] = { base: base[t] ?? 0, contributions: [], total: base[t] ?? 0 };

  // Pass 1: flat + tier-dependent effects.
  for (const src of sources) {
    for (const e of src.effects) {
      const d = flatDelta(e, tier);
      if (d === null || d === 0) continue;
      const b = out[e.target];
      if (!b) continue;
      b.contributions.push({ source: src.source, delta: d, note: e.note });
      b.total += d;
    }
  }
  // Pass 2: dynamic effects (read finalized Proficiency / Agility from pass 1).
  for (const src of sources) {
    for (const e of src.effects) {
      if (!e.dynamic) continue;
      const b = out[e.target];
      if (!b) continue;
      const d = e.dynamic === 'proficiency' ? out.proficiency.total : Math.floor(out.agility.total / 2);
      if (d === 0) continue;
      b.contributions.push({ source: src.source, delta: d, note: e.note });
      b.total += d;
    }
  }
  // Apply caps.
  for (const t of EFFECT_TARGETS) {
    const cap = STAT_CAPS[t];
    if (cap != null) {
      out[t].cap = cap;
      if (out[t].total > cap) out[t].total = cap;
    }
  }
  return out;
}
