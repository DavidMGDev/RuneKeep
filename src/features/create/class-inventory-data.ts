/**
 * Per-class starting inventory (#128), transcribed from the rulebook class guides
 * (local reference only — the licensed rulebook is never bundled or pushed).
 *
 * `take` = items the character STARTS with automatically (a "just take" bundle, shown as owned). A
 * "handful of gold" from the guide is tracked by the Gold card, not listed here. `choices` = the
 * guide's "choose one of these" groups (Health/Stamina potion first, then a class keepsake pair).
 * `spellContainerPrompt` = the spellcaster guides' "decide what you carry your spells in" nudge →
 * the player authors a custom item for it.
 */

import { type ClassName } from '@/constants/identity';

export interface ClassInventory {
  take: string[];
  choices: string[][];
  spellContainerPrompt?: string;
}

const COMMON_TAKE = ['a torch', '50 feet of rope', 'basic supplies'];
const POTION_CHOICE = ['a Minor Health Potion', 'a Minor Stamina Potion'];

export const CLASS_INVENTORY: Record<ClassName, ClassInventory> = {
  bard: { take: COMMON_TAKE, choices: [POTION_CHOICE, ['a romance novel', 'a letter never opened']], spellContainerPrompt: 'What do you carry your spells in? (a songbook, a journal, ...)' },
  druid: { take: COMMON_TAKE, choices: [POTION_CHOICE, ['a small bag of rocks and bones', 'a strange pendant found in the dirt']] },
  guardian: { take: COMMON_TAKE, choices: [POTION_CHOICE, ['a totem from your mentor', 'a secret key']] },
  ranger: { take: COMMON_TAKE, choices: [POTION_CHOICE, ['a trophy from your first kill', 'a seemingly broken compass']] },
  rogue: { take: COMMON_TAKE, choices: [POTION_CHOICE, ['a set of forgery tools', 'a grappling hook']] },
  seraph: { take: COMMON_TAKE, choices: [POTION_CHOICE, ['a bundle of offerings', 'a sigil of your god']] },
  sorcerer: { take: COMMON_TAKE, choices: [POTION_CHOICE, ['a whispering orb', 'a family heirloom']] },
  warrior: { take: COMMON_TAKE, choices: [POTION_CHOICE, ['the drawing of a lover', 'a sharpening stone']] },
  wizard: { take: COMMON_TAKE, choices: [POTION_CHOICE, ["a book you're trying to translate", 'a tiny, harmless elemental pet']], spellContainerPrompt: 'What do you carry your spells in? (large tomes, tarot cards, ...)' },
};

/** Strip a leading article for a card TITLE; keep the full phrase for the body/label. */
export function itemTitle(name: string): string {
  const t = name.replace(/^(a|an|the)\s+/i, '');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Stable id for a suggested item option. */
export function itemOptionId(name: string): string {
  return `inv-opt-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
}
