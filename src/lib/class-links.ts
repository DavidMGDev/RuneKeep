/**
 * What a card BELONGS TO (v0.42.1, owner) — the spine of authoring a class.
 *
 * The owner's correction to v0.42.0 is a change of direction rather than a change of feature: "the
 * class card is created first to have a center to assign cards to, from here the functional cards
 * are made as separate cards and inside the creation or edit of functional cards you can assign
 * them... The whole idea is to not create cards from inside the class card UI, i wish to create the
 * other cards in their own merit, from subclass to items."
 *
 * So a class is not a form that contains its parts. It is a CENTRE, and every other card names it.
 * That inverts who owns the relationship: the feature card says "I belong to the Warden", not the
 * Warden saying "I have these features". One consequence is worth stating, because it is why this is
 * the right way round: a card can then be written, copied between expansions and edited on its own
 * merits, and the class simply reports what currently points at it.
 *
 * A link is by NAME, matched loosely, for the same reason a subclass family is (see
 * `subclassFamilyKey`): an author types "Warden" on three cards and expects them to find each other.
 */

import { classKeyOf } from './custom-class';
import type { LibraryCard } from './library';

/** What a card may be attached to. A subclass link implies the class link its subclass carries. */
export interface CardLink {
  /** The class this belongs to, by title. Empty means unattached. */
  className?: string;
  /** The subclass FAMILY within that class, by name. Empty means the whole class. */
  subclassName?: string;
}

/** The link a card declares, whatever kind of card it is. */
export const linkOf = (c: LibraryCard): CardLink => ({ className: c.className, subclassName: c.linkSubclass });

/** Whether this card is attached to that class. */
export const linksToClass = (c: LibraryCard, classTitle: string): boolean =>
  !!classKeyOf(c.className) && classKeyOf(c.className) === classKeyOf(classTitle);

/** Whether this card is attached to that subclass FAMILY of that class. */
export const linksToSubclass = (c: LibraryCard, classTitle: string, subclassName: string): boolean =>
  linksToClass(c, classTitle) && classKeyOf(c.linkSubclass) === classKeyOf(subclassName);

/**
 * Everything in an expansion that points at one class, grouped by what it is.
 *
 * This is what the class card's editor shows instead of the forms it used to contain, and what the
 * validator counts. A card that names a subclass is still the class's, because a subclass belongs to
 * a class; it is simply also the subclass's.
 */
export interface ClassAttachments {
  subclasses: LibraryCard[];
  features: LibraryCard[];
  functional: LibraryCard[];
  items: LibraryCard[];
  domainCards: LibraryCard[];
}

export function attachmentsFor(cards: LibraryCard[], classTitle: string): ClassAttachments {
  const mine = cards.filter((c) => linksToClass(c, classTitle));
  return {
    subclasses: mine.filter((c) => c.contentType === 'subclass'),
    // A FEATURE card is a generic card the author marked as one of the class's abilities.
    features: mine.filter((c) => c.contentType === 'generic' && c.classRole === 'feature'),
    functional: mine.filter((c) => (c.functions ?? []).length > 0 && c.classRole !== 'feature'),
    items: mine.filter((c) => c.contentType === 'inventory' || c.contentType === 'weapon' || c.contentType === 'armor'),
    domainCards: cards.filter((c) => c.contentType === 'domain'),
  };
}

/** The subclass families of a class, by display name, in the order they were authored. */
export function subclassNamesFor(cards: LibraryCard[], classTitle: string): string[] {
  const out: string[] = [];
  for (const c of cards) {
    if (c.contentType !== 'subclass' || !linksToClass(c, classTitle)) continue;
    const name = (c.subclass?.trim() || c.title?.trim() || '').trim();
    if (name && !out.some((x) => classKeyOf(x) === classKeyOf(name))) out.push(name);
  }
  return out;
}

/** Every class an expansion offers, by title, so a card's link can be chosen rather than typed. */
export const classTitlesIn = (cards: LibraryCard[]): string[] =>
  cards.filter((c) => c.contentType === 'class' && c.title.trim()).map((c) => c.title.trim());
