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
  | 'severeThreshold'
  /** v0.13.0 SCARS: a flat count, one per enabled "Add Scar" card. Each scar disables the character's
   *  rightmost available Hope slot (usable hope = hopeMax − scars, floored at 0); at hopeMax scars the
   *  whole sheet desaturates. Always `{ delta: 1 }` — the editor offers no formula/count for it. */
  | 'scar'
  /** v0.14.0: a bonus on ONE of the character's Experiences (the Honing Relic). Unlike every other
   *  target this names an INSTANCE, carried by `experienceId` — so it has no sheet row and no base
   *  value, and `computeSheet` skips it. See `experienceBreakdown` for how these resolve. */
  | 'experience';

/**
 * One stat modifier carried by a card. Exactly one of `delta` / `byTier` / `dynamic` is meaningful:
 * - `delta`   — a flat signed amount (most effects).
 * - `byTier`  — tier-dependent amount; the value is `byTier[tier - 1]` (tier 1..4).
 * - `dynamic` — computed from the resolved sheet AFTER the flat pass: `proficiency` = the character's
 *               final Proficiency; `halfAgility` = floor(final Agility / 2); `strengthPlus3` = final
 *               Strength + 3 (Bare Bones' unarmored Armor Score). With `mode:'set'` it REPLACES the
 *               target's running total (e.g. armorScore) instead of adding.
 */
/** A formula value (#278): a sheet VARIABLE scaled by an integer multiply/divide, rounded UP (every
 *  Daggerheart number rounds up). e.g. {variable:'level',divide:2} = ½ level (round up);
 *  {variable:'proficiency',multiply:2} = 2× Proficiency; {variable:'tier'} = your Tier. */
export interface EffectFormula {
  variable: 'level' | 'tier' | 'proficiency' | TraitKey;
  multiply?: number;
  divide?: number;
  /** #325: a flat constant ADDED after the ×/÷ round-up (e.g. Bare Bones' Armor = Strength + 3). */
  plus?: number;
}

export interface CardEffect {
  target: EffectTarget;
  delta?: number;
  byTier?: [number, number, number, number];
  dynamic?: 'proficiency' | 'halfAgility' | 'strengthPlus3' | 'formula';
  /** Present when `dynamic === 'formula'`: the variable-scaled value (resolved in the dynamic pass). */
  formula?: EffectFormula;
  /**
   * Damage-threshold mode (#242 item 9) — only meaningful for `majorThreshold` / `severeThreshold`:
   * - `set`   — OVERRIDE the level-based base to `delta` (e.g. armor "8"). Only one set-major and one
   *             set-severe may be enabled at once (the toggle layer enforces it); if more slip through,
   *             the last in source order wins.
   * - `bonus` (or undefined) — ADD `delta` on top of the base/set.
   * Ignored for every non-threshold target (those are always additive).
   */
  mode?: 'set' | 'bonus';
  /** Optional human note (the rule text the effect came from) — shown in the Modifiers panel. */
  note?: string;
  /** v0.14.0, `target: 'experience'` only: WHICH Experience this boosts. Absent = the character's first
   *  one, which is what makes a shipped card (the Honing Relic) work before the player picks. An id that
   *  no longer resolves (the Experience was deleted) contributes nothing. */
  experienceId?: string;
}

/** The two damage-threshold stats, modeled specially (set-or-bonus) rather than plain additive. */
const THRESHOLD_TARGETS: SheetTarget[] = ['majorThreshold', 'severeThreshold'];
const isThreshold = (t: EffectTarget) => (THRESHOLD_TARGETS as string[]).includes(t);

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

/** The targets that are actually SHEET stats — one base value, one row in the Modifiers panel. Excludes
 *  `experience`, which is per-instance and resolved by `experienceBreakdown` instead. */
export type SheetTarget = Exclude<EffectTarget, 'experience'>;
export type BaseStats = Record<SheetTarget, number>;
export type SheetBreakdown = Record<SheetTarget, StatBreakdown>;

/** Every sheet target, in sheet-reading order (traits first). */
export const EFFECT_TARGETS: SheetTarget[] = [
  'agility', 'strength', 'finesse', 'instinct', 'presence', 'knowledge',
  'evasion', 'armorScore', 'maxHp', 'stressMax', 'hopeMax', 'proficiency', 'majorThreshold', 'severeThreshold', 'scar',
];

const TRAIT_TARGETS: EffectTarget[] = ['agility', 'strength', 'finesse', 'instinct', 'presence', 'knowledge'];
export const isTraitTarget = (t: EffectTarget): t is TraitKey => (TRAIT_TARGETS as string[]).includes(t);

/** Human label for a target (Modifiers panel + per-card effect view). */
export const TARGET_LABEL: Record<EffectTarget, string> = {
  agility: 'Agility', strength: 'Strength', finesse: 'Finesse', instinct: 'Instinct', presence: 'Presence', knowledge: 'Knowledge',
  evasion: 'Evasion', armorScore: 'Armor Score', maxHp: 'Max Hit Points', stressMax: 'Max Stress', hopeMax: 'Max Hope',
  proficiency: 'Proficiency', majorThreshold: 'Major Threshold', severeThreshold: 'Severe Threshold', scar: 'Scar',
  experience: 'Experience',
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

/** Resolve a formula value (#278) from the finalized sheet, rounded UP (Daggerheart rounds up). */
function resolveFormula(f: EffectFormula | undefined, out: SheetBreakdown, level: number): number {
  if (!f) return 0;
  const base =
    f.variable === 'level' ? level
    : f.variable === 'tier' ? tierForLevel(level)
    : f.variable === 'proficiency' ? out.proficiency?.total ?? 0
    : out[f.variable]?.total ?? 0; // a trait total (from pass 1)
  const div = f.divide && f.divide !== 0 ? f.divide : 1;
  return Math.ceil((base * (f.multiply ?? 1)) / div) + (f.plus ?? 0); // #325: + flat constant
}

/**
 * Compute the whole sheet. `base` holds the intrinsic value per target; `sources` are the enabled
 * cards' effects. Pure + deterministic — same inputs always yield the same breakdown.
 */
export function computeSheet(base: BaseStats, level: number, sources: EffectSource[]): SheetBreakdown {
  const tier = tierForLevel(level);
  const out = {} as SheetBreakdown;
  for (const t of EFFECT_TARGETS) out[t] = { base: base[t] ?? 0, contributions: [], total: base[t] ?? 0 };

  // Pass 1: flat + tier-dependent effects. Threshold targets are handled in their own pass below
  // (they are set-or-bonus, not plain additive), so skip them here.
  for (const src of sources) {
    for (const e of src.effects) {
      if (isThreshold(e.target)) continue;
      if (e.target === 'experience') continue; // per-instance, not a sheet stat — see experienceBreakdown
      const d = flatDelta(e, tier);
      if (d === null || d === 0) continue;
      const b = out[e.target];
      if (!b) continue;
      b.contributions.push({ source: src.source, delta: d, note: e.note });
      b.total += d;
    }
  }
  // Threshold pass (#242 item 9 / #320): base thresholds are 0; ALL value comes from sources — the
  // per-level bonus (level scaling / add-your-level) plus armor/Bare-Bones. A `set` effect overrides the
  // base (last enabled wins — the toggle layer keeps it to one); `bonus` effects add on top. Contributions
  // are recorded so the Modifiers panel shows provenance.
  for (const t of THRESHOLD_TARGETS) {
    const b = out[t];
    let setVal: number | null = null;
    let setSource = '';
    let setNote: string | undefined;
    const bonuses: Contribution[] = [];
    for (const src of sources) {
      for (const e of src.effects) {
        if (e.target !== t) continue;
        const d = flatDelta(e, tier);
        if (d === null) continue;
        if (e.mode === 'set') { setVal = d; setSource = src.source; setNote = e.note; }
        else if (d !== 0) bonuses.push({ source: src.source, delta: d, note: e.note });
      }
    }
    if (setVal !== null) {
      b.contributions.push({ source: setSource, delta: setVal - b.base, note: setNote ?? `set to ${setVal}` });
      b.total = setVal;
    }
    for (const bn of bonuses) { b.contributions.push(bn); b.total += bn.delta; }
  }
  // Pass 2: dynamic effects (read finalized Proficiency / Agility / Strength from pass 1). A dynamic
  // effect with `mode:'set'` REPLACES the running total (Bare Bones' Armor Score = 3 + Strength);
  // otherwise it adds.
  for (const src of sources) {
    for (const e of src.effects) {
      if (!e.dynamic) continue;
      if (e.target === 'experience') continue; // per-instance, not a sheet stat
      const b = out[e.target];
      if (!b) continue;
      const d =
        e.dynamic === 'proficiency' ? out.proficiency.total
        : e.dynamic === 'strengthPlus3' ? out.strength.total + 3
        : e.dynamic === 'halfAgility' ? Math.floor(out.agility.total / 2)
        : resolveFormula(e.formula, out, level);
      if (e.mode === 'set') {
        b.contributions.push({ source: src.source, delta: d - b.total, note: e.note });
        b.total = d;
      } else {
        if (d === 0) continue;
        b.contributions.push({ source: src.source, delta: d, note: e.note });
        b.total += d;
      }
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
