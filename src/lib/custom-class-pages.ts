/**
 * A homebrew class and ITS PAGES, as one card (v0.42.6, owner).
 *
 * Two complaints, one cause.
 *
 * "Custom classes do not appear in character creation" — the class step was built from the bundled
 * class list and nothing else, so a pack could define a class nobody could ever pick.
 *
 * "NOT displayed as two separate cards from the homebrew class panel as it does now. They should
 * appear in the Add Gear panel EXACTLY like the base game / expansion classes show up in that panel.
 * They show up as paginated cards and I can press expand on that class card and the pages get
 * individualized as individual cards, with the numbering fixed because the first page is removed."
 *
 * A published class is ONE card you page through. A homebrew class is a base card plus however many
 * page cards point at it, and until now those were separate entries in every list, which is a class
 * shown as four unrelated cards. This module is the one place that puts them back together, so
 * creation, Add Gear and the sheet all agree on what a class IS.
 *
 * ## The pages inherit
 *
 * "It inherits data from the class that it is a page of... so that they get together as paginated
 * class cards." A page carries only its own text; its title, its colour and its art belong to the
 * class. `inheritedPage` is what makes a page drawn anywhere look like the class it belongs to, and
 * it is applied at READ time, so editing the base card restyles every page of it at once.
 */

import { classKeyOf } from './custom-class';
import type { LibraryCard } from './library';

/**
 * Whether this card IS the class: the template everything else points at (v0.43.1).
 *
 * A name and a chip, and nothing else. No player ever holds one, which is why it is not among the
 * faces below.
 */
export const isClassBase = (c: LibraryCard): boolean => c.contentType === 'class' && c.classSpec?.role !== 'page';

/** Whether this card is a CLASS INFO CARD: one of the pages a player actually holds. */
export const isClassPage = (c: LibraryCard): boolean => c.contentType === 'class' && c.classSpec?.role === 'page';

/** A homebrew class, assembled. */
export interface ClassAssembly {
  base: LibraryCard;
  /** Its further pages, in the order they were authored. */
  pages: LibraryCard[];
  /** Every face in reading order: the base first, then its pages. */
  faces: LibraryCard[];
}

/**
 * A class info card wearing its class's identity.
 *
 * The TITLE is the class's, from the class card. The paint is `look`'s: the first info card of this
 * class (v0.43.1), because the class card is a chip-only template with no banner to hand down. A card
 * with art of its own keeps it; the rest of the set falls in behind the first one.
 *
 * Done at read time rather than copied on save, so an author who re-banners the first info card
 * re-banners the whole set and never has to go and find them.
 */
export function inheritedPage(page: LibraryCard, base: LibraryCard, look: LibraryCard = base): LibraryCard {
  return { ...page, title: base.title, color: page.color ?? look.color, imageUri: page.imageUri ?? look.imageUri, className: base.title };
}

/**
 * Assemble one class from a pack's cards.
 *
 * v0.43.1: the FACES are the class info cards, and the class card itself is not among them. It is a
 * template that declares the class, not a page anybody reads, so putting it in the deck put a card
 * with a name and no content at the front of every homebrew class. A class with no info cards yet
 * still shows the class card, because a class you cannot see at all cannot be chosen.
 */
export function assembleClass(cards: LibraryCard[], base: LibraryCard): ClassAssembly {
  const key = classKeyOf(base.title);
  const own = cards.filter((c) => isClassPage(c) && classKeyOf(c.className) === key);
  const look = own[0] ?? base;
  const pages = own.map((p) => inheritedPage(p, base, look));
  return { base, pages, faces: pages.length ? pages : [base] };
}

/**
 * Every homebrew class in these cards, assembled, with its pages folded in.
 *
 * A page whose class is not here is DROPPED rather than shown alone: it is half a card, and on its
 * own it says nothing. It comes back the moment its class does.
 */
export function assembleClasses(cards: LibraryCard[]): ClassAssembly[] {
  return cards.filter(isClassBase).map((base) => assembleClass(cards, base));
}

/**
 * The cards a list should show once classes are assembled.
 *
 * Every page is removed, because it is already inside its class's card. This is what stops a class
 * appearing as four unrelated entries in Add Gear and in the pack's own gallery.
 */
export const withoutClassPages = (cards: LibraryCard[]): LibraryCard[] => cards.filter((c) => !isClassPage(c));

/**
 * The page mark one face carries, in a list that INCLUDES the base card.
 *
 * "1/3" on the base, counting every face. This is the creation view, where the flavour page is the
 * first thing you read.
 */
export const faceMark = (index: number, total: number): string => `${index + 1}/${total}`;

/**
 * The page marks once the class is EXPANDED, with the base dropped.
 *
 * "The numbering fixed because the first page is removed, so that the numbering doesn't change and it
 * isnt confusing." So the pages are numbered among themselves: page one of two, not two of three.
 */
export const expandedMark = (index: number, pageCount: number): string => `${index + 1}/${pageCount}`;

/** The classes a pack offers, by title, for anything that needs to name one. */
export const classTitles = (cards: LibraryCard[]): string[] => cards.filter(isClassBase).map((c) => c.title.trim()).filter(Boolean);
