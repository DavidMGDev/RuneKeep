/**
 * A class, as a handful of ORDINARY CARDS (v0.42.0, owner).
 *
 * Until now a character's class was one card you paged through, and its abilities were pages rather
 * than cards. That is the right shape while you are CHOOSING a class, which is why character creation
 * keeps it, and the wrong shape once you are playing one: a page cannot be sorted, moved, favourited,
 * annotated, toggled or given a token, and every other thing on the sheet can.
 *
 * So a class EXPANDS: one card per ability, whole, in the class's own colour. A new character is
 * created expanded; one that already exists converts on demand from the Expand button on its class
 * card. The conversion writes real cards onto the character file, which is why it is one-way and why
 * the dialog says so: after it, the app has no class card to go back to, only the cards it made.
 *
 * Pure on purpose. Both paths (creation and the Expand button) call the same function, so a character
 * made today and one converted tomorrow carry byte-identical cards.
 */

import { classColor, classInfo, type ClassName } from '@/constants/identity';
import { featurePages } from '@/data/class-data';
import type { CardAdvance, CardFunction } from './card-functions';
import type { CustomCardDef } from './character-file';

/**
 * The class abilities that are TRACKERS, not just text (v0.42.1, owner).
 *
 * "Some features are described as 'as a level advancement option', for example the Brawler's Combo
 * Die, and these should be added to the level advancement options."
 *
 * The Brawler is the only printed class that says it in those words, so this is a table of one and
 * will stay small. It is keyed by the ability's NAME rather than its index because the pages repack
 * whenever the text is reflowed, and a Combo Die that moved to another card would be a bug nobody
 * would find. The element is locked: an advancement moves it, a press does not.
 */
const CLASS_TRACKERS: Record<string, { functions: CardFunction[]; advances: CardAdvance[] }> = {
  'brawler|Combo Strike': {
    functions: [{ id: 'combo', kind: 'cycle', title: 'Combo Die', options: ['d4', 'd6', 'd8', 'd10', 'd12'], startIndex: 0, locked: true }],
    advances: [{ id: 'combo-up', label: 'Increase your Combo Die by one step', functionId: 'combo', tiers: [], perTier: 1, effect: { kind: 'step', by: 1 } }],
  },
};

/**
 * The id of the card for one ability of one class.
 *
 * Deterministic, so expanding twice cannot produce two of the same card and so a card can be told to
 * have come from a class at all (see {@link isClassCard}). The class and the page index are enough:
 * a character has one class, and a class has one ability per page.
 */
export const classCardId = (cls: ClassName, pageIndex: number): string => `cls-${cls}-${pageIndex}`;

/** Whether this card was made by expanding a class. Used to keep one from being made twice. */
export const isClassCard = (id: string): boolean => id.startsWith('cls-');

/**
 * The cards for a class, in order, one per ability.
 *
 * The hope feature comes last because `featurePages` puts it last, which is where the printed cards
 * put it: it is the class's 3-Hope move and reads as the pay-off.
 *
 * `target: 'arsenal'` because these are abilities, not equipment. `effects` is deliberately absent:
 * a class's numbers live in the class itself (starting Evasion, starting Hit Points, its domains),
 * not in a card, so a card added by hand from Add Gear grants nothing and cannot double anything.
 */
export function classCards(cls: ClassName): CustomCardDef[] {
  const info = classInfo(cls);
  const color = classColor(cls).deep;
  /**
   * One card per SECTION, not per page (v0.42.1).
   *
   * The pages are a printing decision: they pack a short Hope feature onto the end of the ability
   * before it so a printed card is not half empty. A card in the arsenal has no such problem, and
   * the owner's rule for the sheet is one ability per card, so the sections are unpacked again. A
   * long ability that had to be split keeps its "(1/2)" name, which is the same promise on both.
   */
  return featurePages(cls)
    .flatMap((page) => page.sections)
    .map((section, i) => ({
      id: classCardId(cls, i),
      title: section.name,
      text: section.text,
      imageUri: null,
      color,
      typeLabel: `${info.label} Feature`,
      target: 'arsenal' as const,
      // v0.42.1: an ability the rulebook writes as a tracker gets one. See CLASS_TRACKERS.
      ...(CLASS_TRACKERS[`${cls}|${section.name.replace(/ \(\d+\/\d+\)$/, '')}`] ?? {}),
    }));
}

/**
 * The cards a character is MISSING for its class.
 *
 * Adding is idempotent: a card whose id is already on the file is never added again, so pressing
 * Expand twice, or adding a class card from Add Gear after expanding, cannot produce a duplicate.
 */
export function missingClassCards(cls: ClassName, existing: { id: string }[] | undefined): CustomCardDef[] {
  const have = new Set((existing ?? []).map((c) => c.id));
  return classCards(cls).filter((c) => !have.has(c.id));
}

/** How many cards a class comes to. What the confirmation dialog counts. */
export const classCardCount = (cls: ClassName): number => featurePages(cls).reduce((n, p) => n + p.sections.length, 0);
