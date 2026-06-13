import { Art } from './art';

export type TraitKey = 'agility' | 'strength' | 'finesse' | 'instinct' | 'presence' | 'knowledge';

export interface Track {
  /** Filled / available slots. */
  active: number;
  /** Total slots in the row. */
  total: number;
  /** Trailing locked slots. */
  locked?: number;
}

export interface Character {
  name: string;
  level: number;
  className: string;
  subclass: string;
  ancestry: string;
  community: string;
  /** Two domain names shown as "A × B". */
  domains: [string, string];
  quote?: string;

  traits: Record<TraitKey, number>;

  evasion: number;
  armorScore: number;
  proficiency: number;
  /** Damage thresholds (#128): take `major`+ damage → 2 HP, `severe`+ → 3 HP, 2×severe+ → 4 HP,
   *  below major → 1 HP. Set from the chosen armor card at creation; read-only on the sheet. */
  damageThresholds: { major: number; severe: number };

  /**
   * Current hit points — the SINGLE source of truth for HP. Hearts and the numeric `current / max`
   * tracker are both derived from this via `resolveHearts` (see §1A); there is no separate stored
   * tracker that could drift.
   */
  hp: number;
  /** Number of heart boxes (each worth up to 2 HP when golden). Daggerheart default = 6. */
  heartSlots: number;
  /**
   * The character's HP CEILING (#107): healing can never exceed it, and only `min(6, maxHp)`
   * hearts are drawn at all — a 4-max character has four hearts, not four of six. Class data
   * sets it at creation (5–7); the sample keeps the homebrew 12 (6 slots, golden overflow).
   */
  maxHp: number;

  armor: Track;
  hope: Track;
  stress: Track;

  /** Coin (#136): handfuls/bags/chest, capped 9/9/1 (the gold card carries the +/- controls). */
  gold: { handfuls: number; bags: number; chest: number };

  portraitUri?: string | null;
  /** How the portrait photo is positioned in its mask (#155): zoom + offset (viewBox px). */
  portraitTransform?: { scale: number; x: number; y: number };
}

/** Trait display order + icon, matching the mockup's bottom banner row (left→right). */
export const TRAIT_ORDER: { key: TraitKey; label: string; icon: number }[] = [
  { key: 'agility', label: 'Agility', icon: Art.traitAgility },
  { key: 'strength', label: 'Strength', icon: Art.traitStrength },
  { key: 'finesse', label: 'Finesse', icon: Art.traitFinesse },
  { key: 'instinct', label: 'Instinct', icon: Art.traitInstinct },
  { key: 'presence', label: 'Presence', icon: Art.traitPresence },
  { key: 'knowledge', label: 'Knowledge', icon: Art.traitKnowledge },
];

/** Format a trait modifier the Daggerheart way: always signed. */
export function formatModifier(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`;
}

/** Sample character so the sheet renders fully populated. */
export const SAMPLE_CHARACTER: Character = {
  name: 'Aria Nightwind',
  level: 4,
  className: 'Sorcerer',
  subclass: 'Primal Origin',
  ancestry: 'Elf',
  community: 'Wildborne',
  domains: ['Arcana', 'Midnight'],
  quote: 'Magic is the language of the bold.',
  traits: { agility: 1, strength: -1, finesse: 2, instinct: 1, presence: 2, knowledge: 0 },
  evasion: 11,
  armorScore: 4,
  proficiency: 2,
  damageThresholds: { major: 8, severe: 16 },
  hp: 5, // 6 slots → 5 red + 1 empty, reads "5 / 12" (self-consistent with the hearts)
  heartSlots: 6,
  maxHp: 12,
  armor: { active: 9, total: 12, locked: 1 },
  hope: { active: 5, total: 6 },
  stress: { active: 10, total: 12, locked: 1 },
  gold: { handfuls: 3, bags: 1, chest: 0 },
  portraitUri: null,
};
