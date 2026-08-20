/**
 * BRINGING AN OLD PACK INTO THE NEW SHAPE (v0.43.1, owner).
 *
 * "I need you to make the change so that it actually adapts old versions of expansions into the new
 * systems. When you import an expansion on an updated device, or when you update the app and you open
 * an expansion that's noticeably from an older version, I need you to adapt them so that they work
 * flawlessly. The old way, where creating a class card was also the first card of the class info, is
 * no longer the case, and it's causing some issues."
 *
 * ## What changed underneath
 *
 * A CLASS used to be one card that did two jobs: it declared the class AND it was the first page a
 * player read, carrying the banner, the colour and the prose. From v0.43.1 those are two different
 * things:
 *
 *  - the CLASS CARD is a template. A name and a chip. Nobody ever holds one.
 *  - a CLASS INFO CARD is a page a player holds, and the FIRST one is where the set's look comes from.
 *
 * A pack written the old way therefore has its banner on a card that is now supposed to have none,
 * and no info card to hand that look to the rest of the set. That is the owner's "it doesn't actually
 * copy the style completely".
 *
 * ## What this does about it
 *
 * SPLITS such a class card in two: the template keeps the name, the chip and the class spec; a new
 * info card takes the banner, the colour and every authored section. Nothing is discarded and nothing
 * is rewritten in place, so the pack says exactly what it said before, in the shape the app now reads.
 *
 * The new card's id is DERIVED from the old one (`<id>-info`), which is what makes this idempotent:
 * running it twice finds the info card already there and does nothing. A pack that has already been
 * migrated, or was authored after this release, passes straight through.
 *
 * Pure and total: it takes a pack and returns a pack, so it can run on every read, on every import,
 * and in a test.
 */

import { isClassBase, isClassPage } from './custom-class-pages';
import { classKeyOf } from './custom-class';
import type { Expansion, LibraryCard } from './library';

/** The id the info card split out of `base` gets. Derived, so the split happens at most once. */
export const splitInfoId = (baseId: string): string => `${baseId}-info`;

/** Whether this class card is carrying something a PLAYER was meant to read. */
function carriesPageContent(c: LibraryCard): boolean {
  const authored = (c.sections ?? []).some((s) => (s.body ?? '').trim() || (s.name ?? '').trim());
  return !!c.imageUri || !!(c.text ?? '').trim() || authored;
}

/**
 * One class card, split into the template it is now and the info card it also used to be.
 *
 * The template keeps identity: the title everything points at, the chip, and the spec that holds the
 * class's numbers and starting items. The info card takes everything a reader would have seen.
 */
function splitClassCard(base: LibraryCard): [LibraryCard, LibraryCard] {
  const template: LibraryCard = {
    ...base,
    imageUri: null,
    color: null,
    text: '',
    sections: undefined,
    effects: undefined,
    functions: undefined,
    advances: undefined,
  };
  const info: LibraryCard = {
    ...base,
    id: splitInfoId(base.id),
    // A page belongs to the class by NAME, which is the class card's title.
    className: base.title,
    classSpec: { ...(base.classSpec ?? { startingEvasion: 0, startingHp: 0, hopeFeature: { name: '', text: '' }, summary: '', domains: [], fixedItemIds: [], choiceAItemIds: [], choiceBItemIds: [] }), role: 'page' },
    // The chip is the class's, handed down; it is not the page's own.
    plaque: undefined,
    typeSpec: undefined,
  };
  return [template, info];
}

/**
 * A pack's cards, in the v0.43.1 shape.
 *
 * The split card is inserted immediately after its template so authoring order still reads as the
 * author left it, and so the new info card is the FIRST one of its class, which is what makes it the
 * one the rest of the set takes its look from.
 */
export function migrateCards(cards: LibraryCard[]): LibraryCard[] {
  const out: LibraryCard[] = [];
  for (const c of cards) {
    if (!isClassBase(c) || !carriesPageContent(c)) { out.push(c); continue; }
    const key = classKeyOf(c.title);
    // Already split, or the author has written info cards of their own: leave the class card alone
    // apart from nothing. Its paint still resolves as a fallback (see `lib/class-identity`).
    const alreadySplit = cards.some((x) => x.id === splitInfoId(c.id));
    const hasInfo = cards.some((x) => isClassPage(x) && classKeyOf(x.className) === key);
    if (alreadySplit || hasInfo) { out.push(c); continue; }
    const [template, info] = splitClassCard(c);
    out.push(template, info);
  }
  return out;
}

/** Whether `migrateCards` would change anything, so a read can skip writing when it would not. */
export const needsMigration = (cards: LibraryCard[]): boolean => migrateCards(cards).length !== cards.length;

/** The pack, migrated. Returns the SAME object when there was nothing to do, so callers can tell. */
export function migrateExpansion(exp: Expansion): Expansion {
  const cards = migrateCards(exp.cards ?? []);
  return cards.length === (exp.cards ?? []).length ? exp : { ...exp, cards };
}
