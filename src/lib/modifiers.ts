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
  /**
   * v0.35: the character's LEVEL, which is an input to the sheet rather than one of its outputs.
   *
   * A DM running "tonight you are all level 6" had to level five characters up and then level them
   * back down, which is not reversible: levelling spends advancements. As a modifier it is a number
   * that goes away when the card does, and because it is resolved BEFORE the sheet is computed
   * (`effectiveLevel`) it carries through to Proficiency, Tier, the per-level threshold bonuses and
   * every `level` or `tier` formula, which is what makes it mean the same thing as a level.
   *
   * Only flat and per-tier shapes resolve. A formula reading the sheet cannot decide the level the
   * sheet is computed at.
   */
  | 'level'
  /** v0.13.0 SCARS: a flat count, one per enabled "Add Scar" card. Each scar disables the character's
   *  rightmost available Hope slot (usable hope = hopeMax − scars, floored at 0); at hopeMax scars the
   *  whole sheet desaturates. Always `{ delta: 1 }` — the editor offers no formula/count for it. */
  | 'scar'
  /** v0.25.0: extra downtime moves at a rest. Like `scar` this is a COUNT rather than a sheet number,
   *  so it has no base value of its own; `restMoveLimit` adds the total to the baseline two. The Elf's
   *  Celestial Trance is the first card to grant it, and any homebrew card can now grant it too. */
  | 'restMoves'
  /** v0.14.0: a bonus on ONE of the character's Experiences (the Honing Relic). Unlike every other
   *  target this names an INSTANCE, carried by `experienceId` — so it has no sheet row and no base
   *  value, and `computeSheet` skips it. See `experienceBreakdown` for how these resolve. */
  | 'experience';

/**
 * One stat modifier carried by a card. Exactly one of `delta` / `byTier` / `dynamic` is meaningful:
 * - `delta`   — a flat signed amount (most effects).
 * - `byTier`  — tier-dependent amount; the value is `byTier[tier - 1]` (tier 1..4).
 * - `dynamic` — computed from the resolved sheet AFTER the flat pass: `proficiency` = the character's
 *               final Proficiency; `halfAgility` = ceil(final Agility / 2); `strengthPlus3` = final
 *               Strength + 3 (Bare Bones' unarmored Armor Score). With `mode:'set'` it REPLACES the
 *               target's running total (e.g. armorScore) instead of adding.
 */
/** A formula value (#278): a sheet VARIABLE scaled by an integer multiply/divide, rounded UP (every
 *  Daggerheart number rounds up). e.g. {variable:'level',divide:2} = ½ level (round up);
 *  {variable:'proficiency',multiply:2} = 2× Proficiency; {variable:'tier'} = your Tier. */
export interface EffectFormula {
  /**
   * v0.21.0: `spellcast` resolves to the character's Spellcast trait total — the trait named by their
   * subclass (Wizard→Knowledge, Sorcerer→Instinct, …). It's what makes Mage Robes' "Enchanted" work:
   * +Spellcast to damage thresholds, whatever the subclass. Resolves to 0 for a non-caster subclass.
   *
   * v0.32.0 adds two that read the table rather than the sheet:
   *  - `stress` is the character's CURRENT marked Stress. Eldritch Flesh ("+1 Armor Score for every
   *    2 Stress you have marked") is the first card that needs it, and it changes as you play.
   *  - `input` is a NUMBER THE PLAYER TYPES ON THIS CARD, and it is per-card, never global. Ferocity
   *    ("+Evasion equal to the Hit Points your target marked") cannot be derived from anything the
   *    app knows, so the card asks. See `numberInputs` on the character file.
   */
  variable: 'level' | 'tier' | 'proficiency' | 'spellcast' | 'stress' | 'input' | TraitKey;
  multiply?: number;
  divide?: number;
  /** #325: a flat constant ADDED after the ×/÷ round-up (e.g. Bare Bones' Armor = Strength + 3). */
  plus?: number;
  /**
   * v0.32.0: round DOWN instead of up.
   *
   * Daggerheart rounds up, so that is the default and stays the default. But "for every 2 Stress you
   * have marked" is a different sentence: at 1 Stress you have not reached the first 2, and rounding
   * up would pay out immediately. Eldritch Flesh is the first card that says it that way.
   */
  floor?: boolean;
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
  /**
   * v0.25.0: the effect keeps applying whether or not the card is equipped, and stops ONLY when the
   * card is deleted from every category.
   *
   * This is the rulebook's "permanently gain" wording, which the engine could not express before:
   * every effect was tied to the equipped state, so a card granting a permanent benefit lost it the
   * moment it was put away. Vitality is the clearest case, since the card itself instructs the player
   * to place it in their vault afterwards.
   *
   * A card carrying one of these is also exempt from the equipped-domain-card limit, since it is not
   * really equipped at all.
   */
  permanent?: boolean;
  /**
   * v0.25.0: this effect belongs to option N of the card's `CardChoice`, and applies only when the
   * player has picked that option. Absent = always applies.
   *
   * Vitality grants two of three benefits, so it carries three optional effects and the player's pick
   * decides which two are live.
   */
  option?: number;
  /** v0.14.0, `target: 'experience'` only: WHICH Experience this boosts. Absent = the character's first
   *  one, which is what makes a shipped card (the Honing Relic) work before the player picks. An id that
   *  no longer resolves (the Experience was deleted) contributes nothing. */
  experienceId?: string;
  /**
   * v0.32.0: this effect SETS the target rather than adding to it, discarding everything else.
   *
   * Overwhelming Aura is the reason: "your Presence is equal to your Spellcast trait". Not a bonus, a
   * replacement, and one that has to beat every other contribution however they were ordered. It runs
   * in a pass of its own, after both the flat and the dynamic passes, so nothing can land on top of
   * it. The Modifiers panel still shows the contributions it overrode, as the delta that got it there.
   *
   * `mode: 'set'` already existed but only for thresholds and dynamics, and only within its own pass.
   * This is the general form, available to any target and any shape, and it is what the card editor's
   * "Overwrite" checkbox writes.
   */
  overwrite?: boolean;
  /**
   * v0.35: this one modifier is switched OFF, without being deleted.
   *
   * The card-level mute (`modifiersOffCardIds`) is all or nothing, which is right for a player: a card
   * is equipped or it is not. A DM works the other way round, keeping a standing list of adjustments
   * and turning individual ones on as the fiction calls for them, so the switch has to be per
   * modifier. The two compose: a muted card contributes nothing whatever these flags say.
   *
   * Only a DM surface writes this. A player can expand a group and read the state; they cannot flip it.
   */
  off?: boolean;
  /**
   * v0.35: the GROUP this modifier belongs to, by name.
   *
   * A card with eight modifiers is a wall, so they can be filed the way characters are filed into
   * folders: a name, no colour, expandable, and a checkbox that switches everything inside at once.
   * By name rather than by id, because the name IS the identity here (there is no colour, no icon and
   * no ordering to keep) and it means a group travels with a card through export, NFC and history
   * with no second table to keep in step.
   */
  group?: string;
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
  /** v0.32.0: the card's stable id, so a per-card `input` formula can find the number the player typed
   *  ON THIS CARD. Absent = an input formula on it resolves to 0, which is the honest answer for a
   *  card nobody can address. */
  key?: string;
}

/** Everything a formula can read that is not a sheet stat (v0.32.0). */
export interface SheetContext {
  /** The character's CURRENT marked Stress, for `variable: 'stress'`. */
  stress?: number;
  /** Per-card numbers the player typed, keyed by `EffectSource.key`, for `variable: 'input'`. */
  inputs?: Record<string, number>;
}

/** The targets that are actually SHEET stats — one base value, one row in the Modifiers panel. Excludes
 *  `experience`, which is per-instance and resolved by `experienceBreakdown` instead. */
export type SheetTarget = Exclude<EffectTarget, 'experience'>;
export type BaseStats = Record<SheetTarget, number>;
export type SheetBreakdown = Record<SheetTarget, StatBreakdown>;

/** Every sheet target, in sheet-reading order (traits first). */
export const EFFECT_TARGETS: SheetTarget[] = [
  'level',
  'agility', 'strength', 'finesse', 'instinct', 'presence', 'knowledge',
  'evasion', 'armorScore', 'maxHp', 'stressMax', 'hopeMax', 'proficiency', 'majorThreshold', 'severeThreshold', 'scar', 'restMoves',
];

const TRAIT_TARGETS: EffectTarget[] = ['agility', 'strength', 'finesse', 'instinct', 'presence', 'knowledge'];
export const isTraitTarget = (t: EffectTarget): t is TraitKey => (TRAIT_TARGETS as string[]).includes(t);

/** Human label for a target (Modifiers panel + per-card effect view). */
export const TARGET_LABEL: Record<EffectTarget, string> = {
  agility: 'Agility', strength: 'Strength', finesse: 'Finesse', instinct: 'Instinct', presence: 'Presence', knowledge: 'Knowledge',
  evasion: 'Evasion', armorScore: 'Armor Score', maxHp: 'Max Hit Points', stressMax: 'Max Stress', hopeMax: 'Max Hope',
  proficiency: 'Proficiency', majorThreshold: 'Major Threshold', severeThreshold: 'Severe Threshold', scar: 'Scar',
  restMoves: 'Optional Rest Bonus', experience: 'Experience', level: 'Level',
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

/** Every source with its switched-off modifiers removed (v0.35). Sources left empty are dropped, so a
 *  card whose every modifier is off contributes no row rather than an empty one. */
export function liveSources(sources: EffectSource[]): EffectSource[] {
  if (!sources.some((s) => s.effects.some((e) => e.off))) return sources; // the overwhelmingly common case
  return sources.map((s) => ({ ...s, effects: s.effects.filter((e) => !e.off) })).filter((s) => s.effects.length > 0);
}

/**
 * The level the sheet is computed AT (v0.35): the character's own level plus every live `level`
 * modifier.
 *
 * Resolved before `computeSheet` rather than inside it, because level is what the computation is
 * parameterised by: proficiency, tier, the per-level threshold bonuses and every `level`/`tier`
 * formula all read it. Flat and per-tier shapes only, since a formula would have to read a sheet that
 * cannot be computed until this number exists. The tier used for a per-tier level modifier is the
 * character's REAL tier, for the same reason.
 *
 * Floored at 1: a character below level 1 is not a state the rest of the app has an answer for.
 */
export function effectiveLevel(baseLevel: number, sources: EffectSource[]): number {
  const tier = tierForLevel(baseLevel);
  let delta = 0;
  for (const s of liveSources(sources)) {
    for (const e of s.effects) {
      if (e.target !== 'level' || e.dynamic) continue;
      delta += flatDelta(e, tier) ?? 0;
    }
  }
  return Math.max(1, baseLevel + delta);
}

/** Resolve the flat/byTier value of an effect (dynamic effects return null — handled in pass 2). */
function flatDelta(e: CardEffect, tier: number): number | null {
  if (e.dynamic) return null;
  if (e.byTier) return e.byTier[Math.min(4, Math.max(1, tier)) - 1] ?? 0;
  return e.delta ?? 0;
}

/** Resolve a formula value (#278) from the finalized sheet, rounded UP (Daggerheart rounds up).
 *  `spellcastTrait` (v0.21.0) is the trait the character's subclass casts with; a `spellcast` formula
 *  reads that trait's total. Null/undefined (non-caster or unknown subclass) resolves to 0. */
function resolveFormula(
  f: EffectFormula | undefined,
  out: SheetBreakdown,
  level: number,
  spellcastTrait?: TraitKey | null,
  ctx?: SheetContext,
  sourceKey?: string,
): number {
  if (!f) return 0;
  const base =
    f.variable === 'level' ? level
    : f.variable === 'tier' ? tierForLevel(level)
    : f.variable === 'proficiency' ? out.proficiency?.total ?? 0
    : f.variable === 'spellcast' ? (spellcastTrait ? out[spellcastTrait]?.total ?? 0 : 0)
    // v0.32.0: read from the table rather than the sheet. Current Stress moves as you play, and the
    // per-card input is whatever the player last typed on THIS card (0 until they do).
    : f.variable === 'stress' ? ctx?.stress ?? 0
    : f.variable === 'input' ? (sourceKey ? ctx?.inputs?.[sourceKey] ?? 0 : 0)
    : out[f.variable]?.total ?? 0; // a trait total (from pass 1)
  const div = f.divide && f.divide !== 0 ? f.divide : 1;
  const scaled = (base * (f.multiply ?? 1)) / div;
  return (f.floor ? Math.floor(scaled) : Math.ceil(scaled)) + (f.plus ?? 0); // #325: + flat constant
}

/** The value of a dynamic effect, whichever shape it is. Shared by the dynamic and overwrite passes. */
function dynamicValue(e: CardEffect, out: SheetBreakdown, level: number, spellcastTrait?: TraitKey | null, ctx?: SheetContext, sourceKey?: string): number {
  return e.dynamic === 'proficiency' ? out.proficiency.total
    : e.dynamic === 'strengthPlus3' ? out.strength.total + 3
    /**
     * ROUNDS UP (owner, v0.34.5), like every other division in this engine.
     *
     * This floored while the formula path ceils, and the two are the SAME effect: opening a card's
     * modifiers rewrites `halfAgility` into `{variable:'agility', divide:2}` (see
     * `migrateEffectShape`). So Untouchable was worth one number until you looked at it in the
     * Modifiers panel and saved, and a different number afterwards. That is the owner's "does not
     * properly update until I edit and save": nothing was stale, the two paths disagreed.
     */
    : e.dynamic === 'halfAgility' ? Math.ceil(out.agility.total / 2)
    : resolveFormula(e.formula, out, level, spellcastTrait, ctx, sourceKey);
}

/**
 * Compute the whole sheet. `base` holds the intrinsic value per target; `sources` are the enabled
 * cards' effects. Pure + deterministic — same inputs always yield the same breakdown.
 */
export function computeSheet(base: BaseStats, level: number, sources: EffectSource[], spellcastTrait?: TraitKey | null, ctx?: SheetContext): SheetBreakdown {
  // v0.35: a modifier switched off individually is dropped ONCE, here, rather than in each of the four
  // passes below, so a new pass cannot forget to check it.
  sources = liveSources(sources);
  const tier = tierForLevel(level);
  const out = {} as SheetBreakdown;
  for (const t of EFFECT_TARGETS) out[t] = { base: base[t] ?? 0, contributions: [], total: base[t] ?? 0 };

  // Pass 1: flat + tier-dependent effects. Threshold targets are handled in their own pass below
  // (they are set-or-bonus, not plain additive), so skip them here. An OVERWRITE effect is skipped
  // everywhere until its own final pass (v0.32.0), so nothing it replaces can be applied twice.
  for (const src of sources) {
    for (const e of src.effects) {
      if (e.overwrite) continue;
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
        if (e.target !== t || e.overwrite) continue;
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
      if (!e.dynamic || e.overwrite) continue;
      if (e.target === 'experience') continue; // per-instance, not a sheet stat
      const b = out[e.target];
      if (!b) continue;
      const d = dynamicValue(e, out, level, spellcastTrait, ctx, src.key);
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
  /**
   * Pass 3: OVERWRITE (v0.32.0). The target becomes this value, whatever else contributed.
   *
   * It runs last and reads the sheet as pass 2 left it, which is what makes Overwhelming Aura's
   * "your Presence is equal to your Spellcast trait" mean the trait total including its own bonuses.
   * With several overwrites on one target the LAST source wins, matching how `set` already behaves;
   * two cards claiming the same stat is a table argument, not something the app should average.
   */
  for (const src of sources) {
    for (const e of src.effects) {
      if (!e.overwrite || e.target === 'experience') continue;
      const b = out[e.target];
      if (!b) continue;
      const d = e.dynamic ? dynamicValue(e, out, level, spellcastTrait, ctx, src.key) : flatDelta(e, tier) ?? 0;
      // Recorded as the step that got us here, so the panel still shows what it displaced.
      b.contributions.push({ source: src.source, delta: d - b.total, note: e.note });
      b.total = d;
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
