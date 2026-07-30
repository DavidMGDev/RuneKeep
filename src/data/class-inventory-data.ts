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
import { startingItemCardId } from './starting-items';

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
  assassin: { take: COMMON_TAKE, choices: [POTION_CHOICE, ['a list of names with several marked off', 'a rusted blade inscribed with an insignia']] },
  witch: { take: COMMON_TAKE, choices: [POTION_CHOICE, ['a small, harmless pet', 'a scrying stone']], spellContainerPrompt: 'What do you use for your craft? (a handwritten journal, runestones, ...)' },
  warlock: { take: COMMON_TAKE, choices: [POTION_CHOICE, ['a carving that symbolizes your patron', "a ring you can't remove"]] },
  bloodhunter: { take: COMMON_TAKE, choices: [POTION_CHOICE, ['a steel needle', "a vial holding a foe's blood"]] },
  summoner: { take: COMMON_TAKE, choices: [POTION_CHOICE, ['a harmless spirit trapped inside a glass bottle', 'a pair of mysterious coins']] },
  brawler: { take: COMMON_TAKE, choices: [POTION_CHOICE, ['hand wraps from a mentor', 'a book about your secret hobby']] },
};

/**
 * Whether a starting item is a CONSUMABLE rather than a piece of kit (v0.26.0).
 *
 * Every class guide offers a potion as its first choice, and those were landing as generic items, so
 * a Brawler's Minor Health Potion sat in the same deck as their hand wraps and read as equipment. The
 * guides phrase these consistently enough to recognise by name.
 */
export const isConsumableName = (name: string): boolean => /(potion|elixir|salve|oil|tonic|draught)/i.test(name);

/** Strip a leading article for a card TITLE; keep the full phrase for the body/label. */
export function itemTitle(name: string): string {
  const t = name.replace(/^(a|an|the)\s+/i, '');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** The id a starting item has always had, when it is not an archive card. */
export function authoredItemOptionId(name: string): string {
  return `inv-opt-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
}

/**
 * Stable id for a suggested item option.
 *
 * v0.27.0: an item that EXISTS in the archive is stored under the archive's id, so the potion every
 * class guide offers is the printed consumable card ("Clear 1d4 HP") rather than a plain item that
 * only repeats its own name. Anything with no printed card keeps the authored id it always had.
 *
 * Heroes made before this hold the authored id for their potion. Nothing rewrites them; the sheet
 * accepts either id for the same item, so an existing character keeps the card it has and a new one
 * gets the better card.
 */
export function itemOptionId(name: string): string {
  return startingItemCardId(name) ?? authoredItemOptionId(name);
}
