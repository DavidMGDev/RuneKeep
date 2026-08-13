/**
 * A class, as its own pages (v0.42.0; CORRECTED v0.42.4, owner).
 *
 * A character's class is a card you page through, and that is the right shape while you are CHOOSING
 * one. Once you are playing, a page cannot be sorted, moved, favourited, annotated, toggled or given
 * a token, and every other thing on the sheet can. So a class EXPANDS: one card per ability.
 *
 * ## What v0.42.0 got wrong, and what this is instead
 *
 * It WROTE NEW CARDS onto the character file, in the authored-card format, with the generic plaque
 * and a made-up type label. The owner's verdict: "the ONLY GOAL IS TO HAVE THE MULTI-PAGE CARDS
 * RENDER EACH OF THEIR CONTENTS AS INDIVIDUAL CARDS."
 *
 * So expanding writes nothing. It is a RENDERING decision: `classExpanded` stops the pages being
 * assembled into one paged card and lets each page stand as its own card, drawn by the very same
 * forged job the paged card was using. They are identical to the cards character creation shows,
 * because they are the same cards.
 *
 * ## The cover page is not one of them
 *
 * A class's first page is its flavour: what the class is, for someone deciding whether to be one.
 * That belongs to creation. On the sheet the pages are the abilities, numbered from 1, which is the
 * "2/4" the owner reported: the cover was being counted and not shown.
 *
 * What is left in this module is the arithmetic of that, plus the migration for the characters the
 * old path already wrote cards onto.
 */

import type { ClassName } from '@/constants/identity';
import { featurePages } from '@/data/class-data';
import type { CardAdvance, CardFunction } from './card-functions';

/**
 * The class abilities that are TRACKERS, not just text (v0.42.1, owner).
 *
 * "Some features are described as 'as a level advancement option', for example the Brawler's Combo
 * Die, and these should be added to the level advancement options."
 *
 * The Brawler is the only printed class that says it in those words, so this is a table of one and
 * will stay small. Keyed by the ability's NAME rather than its index because the pages repack whenever
 * the text is reflowed, and a Combo Die that moved to another card would be a bug nobody would find.
 * The element is locked: an advancement moves it, a press does not.
 */
export const CLASS_TRACKERS: Record<string, { functions: CardFunction[]; advances: CardAdvance[] }> = {
  'brawler|Combo Strike': {
    functions: [{ id: 'combo', kind: 'cycle', title: 'Combo Die', options: ['d4', 'd6', 'd8', 'd10', 'd12'], startIndex: 0, locked: true }],
    advances: [{ id: 'combo-up', label: 'Increase your Combo Die by one step', functionId: 'combo', tiers: [], perTier: 1, effect: { kind: 'step', by: 1 } }],
  },
};

/** The tracker an ability carries, if it carries one. Split names ("Beastform (1/2)") ask as one. */
export const trackerFor = (cls: string, abilityName: string): { functions: CardFunction[]; advances: CardAdvance[] } | undefined =>
  CLASS_TRACKERS[`${cls}|${abilityName.replace(/ \(\d+\/\d+\)$/, '')}`];

/**
 * The id of the card ONE PAGE of a class expands into.
 *
 * Deterministic, so the same page is the same card across a reload, and prefixed so a card can be
 * told to have come from a class at all. It is a card id in the deck, not a stored record.
 */
export const classPageId = (cls: ClassName, pageIndex: number): string => `clspage-${cls}-${pageIndex}`;

/** The id of an ACQUIRED class's page. A different card from the character's own class. */
export const acquiredPageId = (cls: string, pageIndex: number): string => `acqpage-${cls}-${pageIndex}`;

/**
 * How many cards a class comes to once expanded.
 *
 * The ABILITY pages, and not the cover. This is what the confirmation counts and what the page marks
 * divide by, and having one function answer both is what stops the two disagreeing.
 */
export const classPageCount = (cls: ClassName): number => featurePages(cls).length;

/** The page mark one expanded page carries: "1/3". Counting from one, cover excluded. */
export const classPageMark = (index: number, total: number): string => `${index + 1}/${total}`;

// ---------------------------------------------------------------------------------- the migration

/**
 * The id prefix the v0.42.0 path used for the cards it WROTE.
 *
 * Kept for one reason: a character that expanded a class between v0.42.0 and v0.42.3 is carrying
 * those cards, and they have to be recognised in order to be dropped.
 */
export const isLegacyClassCard = (id: string): boolean => id.startsWith('cls-');

/**
 * A character file's authored cards, with the old expansion's leavings removed.
 *
 * A tolerant READ, the rule this app has followed since v0.41.4: nothing is rewritten on disk until
 * the file is next saved for some other reason, and a file that never expanded comes back
 * REFERENCE-IDENTICAL, so the common case costs one array scan and no allocation.
 *
 * Only applied to a file marked expanded. A card whose id happens to start with `cls-` on a file that
 * never expanded is somebody's own card, and it is theirs.
 */
export function withoutLegacyClassCards<T extends { id: string }>(cards: T[] | undefined, expanded: boolean | undefined): T[] | undefined {
  if (!expanded || !cards?.length) return cards;
  return cards.some((c) => isLegacyClassCard(c.id)) ? cards.filter((c) => !isLegacyClassCard(c.id)) : cards;
}
