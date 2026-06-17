/**
 * Ranger Companion (#311) — the Beastbound subclass's animal companion (Core Rulebook p40-41). The
 * companion is its own little sheet: Evasion, a Stress track, a damage die + range, Experiences, and
 * a set of per-level-up "training" options. This module is the pure, testable core (state + reducers
 * + the tier→picks rule + Beastbound detection). The live Companion card + the level-up section build
 * on it. See [[runekeep_card_system_v03]] conventions.
 */

import { cardById } from '@/data/catalog';
import type { CharacterFile } from './character-file';

export interface CompanionExperience {
  name: string;
  bonus: number;
}

export interface CompanionState {
  name: string;
  evasion: number; // starts at 10 (Aware adds +2)
  stress: number; // currently marked
  stressMax: number; // starts at 3 (Resilient adds +1 each)
  damageDie: number; // 6 | 8 | 10 | 12 (Vicious steps up)
  range: string; // Melee | Close | Far | Very Far (Vicious steps up at max die)
  experiences: CompanionExperience[]; // 2 to start, each +2; a new one whenever the character gains one
  /** Training options chosen at level-up: option key → times taken. */
  options: Record<string, number>;
}

export const DIE_LADDER = [6, 8, 10, 12];
export const RANGES = ['Melee', 'Close', 'Far', 'Very Far'];

/** A brand-new companion (rulebook defaults): Evasion 10, d6 Melee, 3 Stress, two +2 Experiences. */
export const DEFAULT_COMPANION: CompanionState = {
  name: '',
  evasion: 10,
  stress: 0,
  stressMax: 3,
  damageDie: 6,
  range: 'Melee',
  experiences: [
    { name: '', bonus: 2 },
    { name: '', bonus: 2 },
  ],
  options: {},
};

export interface CompanionOptionDef {
  key: string;
  label: string;
  desc: string;
  /** How many times the option can be taken (the sheet's checkbox count). */
  max: number;
}

/** The eight companion training options (Core Rulebook p41). */
export const COMPANION_OPTIONS: CompanionOptionDef[] = [
  { key: 'intelligent', label: 'Intelligent', desc: '+1 to a Companion Experience.', max: 3 },
  { key: 'lightInDark', label: 'Light in the Dark', desc: 'An additional Hope slot you can mark.', max: 3 },
  { key: 'creatureComfort', label: 'Creature Comfort', desc: 'Once per rest, gain a Hope or both clear a Stress.', max: 1 },
  { key: 'armored', label: 'Armored', desc: 'Mark one of your Armor Slots instead of their Stress.', max: 1 },
  { key: 'vicious', label: 'Vicious', desc: 'Increase the damage die or range by one step.', max: 3 },
  { key: 'resilient', label: 'Resilient', desc: 'Gain an additional Stress slot.', max: 3 },
  { key: 'bonded', label: 'Bonded', desc: 'When you mark your last HP, your companion can rush to save you.', max: 1 },
  { key: 'aware', label: 'Aware', desc: '+2 Companion Evasion.', max: 1 },
];

export function companionOptionDef(key: string): CompanionOptionDef | undefined {
  return COMPANION_OPTIONS.find((o) => o.key === key);
}

/** How many more times an option can still be taken. */
export function companionOptionRemaining(c: CompanionState, key: string): number {
  const def = companionOptionDef(key);
  if (!def) return 0;
  return Math.max(0, def.max - (c.options[key] ?? 0));
}

export function stepDie(d: number): number {
  const i = DIE_LADDER.indexOf(d);
  return i >= 0 && i < DIE_LADDER.length - 1 ? DIE_LADDER[i + 1] : d;
}
export function stepRange(r: string): string {
  const i = RANGES.indexOf(r);
  return i >= 0 && i < RANGES.length - 1 ? RANGES[i + 1] : r;
}

/**
 * Apply a chosen level-up training option to the companion (pure). Deterministic stat options change
 * the sheet directly; Vicious steps the damage die, then the range once the die is maxed. The rest are
 * recorded only (their effect is a rules reminder, not a tracked companion stat).
 */
export function applyCompanionOption(c: CompanionState, key: string): CompanionState {
  const next: CompanionState = { ...c, options: { ...c.options, [key]: (c.options[key] ?? 0) + 1 }, experiences: c.experiences.map((e) => ({ ...e })) };
  switch (key) {
    case 'resilient':
      next.stressMax += 1;
      break;
    case 'aware':
      next.evasion += 2;
      break;
    case 'vicious':
      if (next.damageDie < 12) next.damageDie = stepDie(next.damageDie);
      else next.range = stepRange(next.range);
      break;
    case 'intelligent':
      if (next.experiences.length) next.experiences[0] = { ...next.experiences[0], bonus: next.experiences[0].bonus + 1 };
      break;
    // lightInDark / creatureComfort / armored / bonded: tracked only (player-facing rules reminders).
  }
  return next;
}

/** The companion gains an Experience whenever the character does (rulebook p40). */
export function addCompanionExperience(c: CompanionState, name = ''): CompanionState {
  return { ...c, experiences: [...c.experiences, { name, bonus: 2 }] };
}

/** Mark/clear companion Stress, clamped to [0, stressMax]. */
export function setCompanionStress(c: CompanionState, value: number): CompanionState {
  return { ...c, stress: Math.max(0, Math.min(c.stressMax, value)) };
}

// --- Beastbound detection (needs the catalog) ---
function subclassKeyOf(cardId?: string): string | undefined {
  return cardId ? cardById(cardId)?.subclass : undefined;
}

/** The character has a companion when their PRIMARY or MULTICLASS subclass is Beastbound (#311). */
export function hasCompanion(file: Pick<CharacterFile, 'subclassCardId' | 'multiclassSubclassCardId'>): boolean {
  return subclassKeyOf(file.subclassCardId) === 'beastbound' || subclassKeyOf(file.multiclassSubclassCardId) === 'beastbound';
}

/**
 * Companion training picks granted per character level-up, from the Beastbound tier: foundation 1,
 * specialization 2 (Expert Training: +1), mastery 4 (Advanced Training: +2). A companion gained via
 * MULTICLASS is always at the foundation feature (multiclass can't reach a subclass mastery) → 1.
 */
export function companionPicksPerLevel(file: CharacterFile): number {
  if (subclassKeyOf(file.subclassCardId) === 'beastbound') {
    const t = file.subclassTier ?? 'foundation';
    return t === 'mastery' ? 4 : t === 'specialization' ? 2 : 1;
  }
  if (subclassKeyOf(file.multiclassSubclassCardId) === 'beastbound') return 1;
  return 0;
}

/** The companion state for a file, defaulting a fresh one when absent. */
export function companionOf(file: CharacterFile): CompanionState {
  return file.companion ?? DEFAULT_COMPANION;
}
