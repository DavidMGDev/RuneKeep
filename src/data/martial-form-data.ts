/**
 * Martial Form (#357; roster rebuilt for the official release, v0.21.0 item 4) — the Brawler's MARTIAL
 * ARTIST subclass sheet, as an interactive card category (the Beastform/Companion pattern). One stance is
 * active at a time (enabling one disables the rest — you drop the old stance when you shift); Focus tokens
 * live on the live Focus card.
 *
 * The official "Hope and Fear" release replaced the playtest roster: it's now exactly 16 stances, 4 per
 * tier (transcribed from HOPEANDFEAR_Classes.pdf). Focus rules (physical play): once per rest during a
 * moment of calm, clear the Focus track, roll d6s equal to your Instinct, and gain Focus equal to the
 * highest result — cap 6. Stances with sheet-mappable mechanics carry CardEffects (Aggressive's -1 Evasion,
 * Anchored's +2 thresholds); everything else is rules text resolved by physical play. Ids are kept stable
 * where a stance survived the rework so an in-progress Brawler keeps their picks.
 */
import type { CardEffect } from '@/lib/modifiers';
import type { CharacterFile } from '@/lib/character-file';
import { cardById } from '@/data/catalog';

export interface MartialStance {
  id: string;
  name: string;
  tier: 1 | 2 | 3 | 4;
  body: string;
  effects?: CardEffect[];
}

/** Card-art tint per tier (bone → valor → blood → void). */
const TIER_COLOR: Record<1 | 2 | 3 | 4, string> = { 1: '#C9A227', 2: '#C87434', 3: '#B33B2E', 4: '#7E4FA0' };

const st = (id: string, name: string, tier: 1 | 2 | 3 | 4, body: string, effects?: CardEffect[]): MartialStance => ({ id: `ms-${id}`, name, tier, body, effects });

export const MARTIAL_STANCES: MartialStance[] = [
  // Tier 1
  st('favored', 'Favored', 1, 'Gain a bonus to damage rolls equal to a trait of your choice.'),
  st('invigorating', 'Invigorating', 1, 'On a successful attack, roll a d4. On a result of 4, gain a Focus.'),
  st('quick', 'Quick', 1, 'When you make an attack, you can spend a Focus or mark a Stress to target another creature within range with that attack.'),
  st('reliable', 'Reliable', 1, 'Gain a +1 bonus to your attack rolls.'),
  // Tier 2
  st('aggressive', 'Aggressive', 2, 'Gain a -1 penalty to your Evasion. On a successful attack, roll an additional damage die and discard the lowest result.', [{ target: 'evasion', delta: -1 }]),
  st('anchored', 'Anchored', 2, 'Gain a +2 bonus to your damage thresholds. While in this stance, you can’t be moved against your will.', [
    { target: 'majorThreshold', mode: 'bonus', delta: 2 },
    { target: 'severeThreshold', mode: 'bonus', delta: 2 },
  ]),
  st('defensive', 'Defensive', 2, 'Attack rolls targeting you from within Melee range have disadvantage unless the attacker marks a Stress to negate the disadvantage.'),
  st('otherworldly', 'Otherworldly', 2, 'On a successful attack, you can deal physical or magic damage.'),
  // Tier 3
  st('grappling', 'Grappling', 3, 'On a successful attack within Melee range, you can spend a Focus or mark a Stress to temporarily Restrain the target or throw the target up to Close range.'),
  st('scary', 'Scary', 3, 'On a successful attack, the target must mark a Stress.'),
  st('stable', 'Stable', 3, 'You can spend a Focus instead of an Armor Slot to reduce damage.'),
  st('vigilant', 'Vigilant', 3, 'When you are targeted by an attack, you can mark a Stress to gain a d6 bonus to your Evasion against the attack.'),
  // Tier 4
  st('crushing', 'Crushing', 4, 'When you deal Severe damage, you can spend a Hope to force the target to mark an additional Hit Point.'),
  st('exacting', 'Exacting', 4, 'When you roll a 1 on a damage die, you can treat it as the highest value on the die instead.'),
  st('honed', 'Honed', 4, 'Spend a Focus before you make an attack roll to gain a +1 bonus to your Proficiency for that attack.'),
  st('isolating', 'Isolating', 4, 'Gain advantage on attack rolls when there are no other creatures within Very Close range of you or your target.'),
];

export function martialStanceById(id: string): MartialStance | undefined {
  return MARTIAL_STANCES.find((s) => s.id === id);
}

/** Category-lock guard (the `isWildshapeId` pattern): stance ids are prefixed `ms-`. */
export const isMartialStanceId = (id: string): boolean => id.startsWith('ms-');

/** Stable deck-card id of the live Focus token card. */
export const MARTIAL_FOCUS_CARD_ID = 'martial-focus';

export const stanceColor = (s: MartialStance): string => TIER_COLOR[s.tier];

/** The character has the Martial Form category when their PRIMARY or MULTICLASS subclass is the
 *  Brawler's Martial Artist (mirrors companion.ts `hasCompanion`). */
export function hasMartialForm(file: Pick<CharacterFile, 'subclassCardId' | 'multiclassSubclassCardId'>): boolean {
  const key = (cardId?: string) => (cardId ? cardById(cardId)?.subclass : undefined);
  return key(file.subclassCardId) === 'martial-artist' || key(file.multiclassSubclassCardId) === 'martial-artist';
}
