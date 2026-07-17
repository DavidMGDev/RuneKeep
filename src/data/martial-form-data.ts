/**
 * Martial Form (#357, v0.13.1) — the Brawler's MARTIAL ARTIST subclass sheet, as an interactive card
 * category (the Beastform/Companion pattern; the owner's Void integration plan A3 names this sheet as
 * "needs its own card category"). Stances are transcribed VERBATIM from the extracted Brawler v1.5 PDF
 * (assets/temp/void-data/Brawler.md). One stance is active at a time (enabling one disables the rest —
 * the sheet rule: "until you shift into another stance"); Focus tokens live on the live Focus card.
 *
 * Stances with sheet-mappable mechanics carry CardEffects (Steady's -1 Evasion, Immovable's +2
 * thresholds); everything else is rules text resolved by physical play.
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
  st('brutal', 'Brutal', 1, 'When you roll the maximum value on a damage die, roll an additional damage die.'),
  st('defensive', 'Defensive', 1, 'Attack rolls against you have disadvantage unless the adversary marks a Stress.'),
  st('grappling', 'Grappling', 1, 'On a successful attack, you can spend a Focus to make the target temporarily Restrained.'),
  st('steady', 'Steady', 1, 'Gain a -1 penalty to your Evasion. When you deal damage on a successful attack, roll an additional damage die and drop the lowest.', [{ target: 'evasion', delta: -1 }]),
  st('precise', 'Precise', 1, 'Gain a +1 bonus to your attack rolls.'),
  st('quick', 'Quick', 1, 'When making an attack roll, spend a Focus to include an additional target within range.'),
  // Tier 2
  st('deadly', 'Deadly', 2, 'When you deal Severe damage, the target marks an additional HP.'),
  st('hindering', 'Hindering', 2, 'On a successful attack, spend a Focus to make the target temporarily Hindered (-2 to their attack rolls).'),
  st('invigorating', 'Invigorating', 2, 'When you make a successful attack, roll a d4. On a 4, gain a Focus.'),
  st('immovable', 'Immovable', 2, 'Gain a +2 bonus to your damage thresholds and you cannot be moved unwillingly.', [
    { target: 'majorThreshold', mode: 'bonus', delta: 2 },
    { target: 'severeThreshold', mode: 'bonus', delta: 2 },
  ]),
  st('nimble', 'Nimble', 2, 'When an adversary makes a successful attack roll against you, spend Focus up to your Tier. Roll (1 + Focus spent) d6s. If any dice values match, you take no damage.'),
  st('otherworldly', 'Otherworldly', 2, 'You can choose whether to do Physical or Magic damage.'),
  st('scary', 'Scary', 2, 'Successful attacks also force the target to mark a Stress.'),
  // Tier 3
  st('deflecting', 'Deflecting', 3, 'When targeted by an attack, spend 2 Focus to gain a bonus to Evasion equal to your Armor Score against the attack.'),
  st('devastating', 'Devastating', 3, 'Spend a Focus before your attack roll to use d20s as your damage dice.'),
  st('dueling', 'Dueling', 3, 'Advantage on attack rolls when no other adversaries or allies are within Very Close range of you or your target.'),
  st('compounding', 'Compounding', 3, 'When you roll the maximum on a Combo Die, increase the size of subsequent Combo Dice for the attack (max d12s).'),
  st('inexorable', 'Inexorable', 3, 'Attacks against you have disadvantage if more than two adversaries are within Melee range.'),
  st('favored', 'Favored', 3, 'Add the trait of your choice to your damage roll.'),
  st('sheltering', 'Sheltering', 3, 'When you mark an Armor Slot, it reduces damage for you and all allies within Melee range who took the same damage.'),
  // Tier 4
  st('crushing', 'Crushing', 4, 'When you roll a 1 on a damage die, treat it as the highest value instead.'),
  st('infuriating', 'Infuriating', 4, 'On a successful attack, the target becomes Furious (Vulnerable, -2 to attack rolls; clears only by succeeding on an attack against you).'),
  st('sweeping', 'Sweeping', 4, 'Your attack targets all adversaries within Very Close range. Deal half damage to all you succeed against.'),
  st('discerning', 'Discerning', 4, 'Choose your target after your attack roll; the GM tells you who it would succeed against.'),
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
