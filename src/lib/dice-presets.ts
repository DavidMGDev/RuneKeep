/**
 * Roll presets (v0.41.0, owner) — a handful of dice you keep.
 *
 * Three slots on the character sheet, each holding a set of dice, a name, an icon and an optional
 * modifier. Tapping a full one deals its dice into the tray and throws them; holding one edits it.
 *
 * This module is the whole of what a preset IS and what it comes to. It is pure and knows nothing
 * about React, so the arithmetic that decides a total can be tested rather than watched:
 *
 *  - a preset stores the KINDS of dice, not the dice, so `duality` is one entry and stays a pair;
 *  - its modifier is a number, a sheet variable, or both, resolved against the character at the
 *    moment it is rolled rather than at the moment it was saved, which is the point of naming a
 *    variable at all: "+ Attack Rolls" keeps up with the cards you have equipped today.
 */

import type { DieType } from '@/features/character-sheet/components/card-tokens-data';
import { addDie, type PoolDie } from '@/lib/dice-pool';
import type { EffectFormula } from '@/lib/modifiers';

/** How many slots the sheet offers. Three, because that is what fits the panel they live in. */
export const PRESET_SLOTS = 3;
/** As many dice as one preset may hold. The pool's own layout stops being readable past this. */
export const PRESET_MAX_DICE = 20;

export interface PresetModifier {
  /** A flat amount the player typed. May be negative. */
  value: number;
  /** A sheet variable added on top, resolved when the preset is rolled. */
  variable?: EffectFormula['variable'];
}

export interface DicePreset {
  id: string;
  name: string;
  /** A key from the card-category icon set. Absent means the name's first letter is used instead. */
  icon?: string;
  /** The KINDS, in the order they were picked up. `duality` is one entry and becomes two dice. */
  dice: DieType[];
  modifier?: PresetModifier;
}

/** A slot list is always {@link PRESET_SLOTS} long, with a hole where a slot is empty. */
export type PresetSlots = (DicePreset | null)[];

export function slotsOf(saved: PresetSlots | undefined): PresetSlots {
  const out: PresetSlots = [];
  for (let i = 0; i < PRESET_SLOTS; i++) out.push(saved?.[i] ?? null);
  return out;
}

export function writeSlot(saved: PresetSlots | undefined, slot: number, preset: DicePreset | null): PresetSlots {
  const out = slotsOf(saved);
  if (slot >= 0 && slot < PRESET_SLOTS) out[slot] = preset;
  return out;
}

/**
 * The kinds of dice in a pool, as a preset stores them.
 *
 * A duality pair is TWO dice sharing a `pairId` and must come back as one `duality` entry, or loading
 * the preset would put two lone d12s in the tray and the pair's whole meaning would be gone.
 */
export function diceOf(pool: PoolDie[]): DieType[] {
  const out: DieType[] = [];
  const seen = new Set<string>();
  for (const d of pool) {
    if (d.pairId) {
      if (seen.has(d.pairId)) continue;
      seen.add(d.pairId);
      out.push('duality');
      continue;
    }
    out.push(d.type);
  }
  return out;
}

/** A preset's dice as a pool, ready to be thrown. `id` mints ids so this stays pure. */
export function poolOf(preset: DicePreset, id: (n: number) => string): PoolDie[] {
  let pool: PoolDie[] = [];
  let n = 0;
  for (const t of preset.dice) pool = addDie(pool, t, () => id(n++));
  return pool;
}

/** The letter shown when a preset has no icon: the first one that is not a space. */
export const presetInitial = (name: string): string => (name.trim()[0] ?? '?').toUpperCase();

/** What the sheet can answer a preset's variable with, at the moment it is rolled. */
export interface PresetContext {
  level: number;
  tier: number;
  proficiency: number;
  stress: number;
  attackRoll: number;
  spellcastRoll: number;
  spellcast: number;
  traits: Partial<Record<string, number>>;
}

/**
 * What a preset's modifier comes to right now.
 *
 * `input` is the one variable a preset cannot use: it names a number typed onto a particular card, and
 * a preset belongs to no card. It resolves to nothing rather than being offered and lying.
 */
export function modifierValue(mod: PresetModifier | undefined, ctx: PresetContext): number {
  if (!mod) return 0;
  const v = mod.variable;
  const from =
    !v || v === 'input' ? 0
    : v === 'level' ? ctx.level
    : v === 'tier' ? ctx.tier
    : v === 'proficiency' ? ctx.proficiency
    : v === 'stress' ? ctx.stress
    : v === 'attackRoll' ? ctx.attackRoll
    : v === 'spellcastRoll' ? ctx.spellcastRoll
    : v === 'spellcast' ? ctx.spellcast
    : ctx.traits[v] ?? 0;
  return (mod.value || 0) + from;
}

/** True when a modifier is worth showing at all. */
export const hasModifier = (mod: PresetModifier | undefined): boolean => !!mod && (mod.value !== 0 || !!mod.variable);

/** A short human summary of a preset's dice, for the edit dialog: "2d6, d20, Hope and Fear". */
export function diceSummary(dice: DieType[]): string {
  const order: DieType[] = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100', 'duality'];
  const count = new Map<DieType, number>();
  for (const d of dice) count.set(d, (count.get(d) ?? 0) + 1);
  const parts: string[] = [];
  for (const t of order) {
    const n = count.get(t);
    if (!n) continue;
    parts.push(t === 'duality' ? (n > 1 ? `${n} Hope and Fear` : 'Hope and Fear') : `${n > 1 ? n : ''}${t}`);
  }
  return parts.join(', ') || 'No dice';
}
