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

  /** Heart pips (visual HP boxes). */
  hearts: Track;
  /** How many HP each heart is worth (Daggerheart "golden hearts"). */
  heartsWorth: number;
  /** Numeric hit-point tracker shown beside the hearts. */
  hitPoints: { current: number; max: number };

  armor: Track;
  hope: Track;
  stress: Track;

  portraitUri?: string | null;
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
  hearts: { active: 5, total: 6 },
  heartsWorth: 2,
  hitPoints: { current: 10, max: 12 },
  armor: { active: 9, total: 12, locked: 1 },
  hope: { active: 5, total: 6 },
  stress: { active: 10, total: 12, locked: 1 },
  portraitUri: null,
};
