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

/** Whether this card is the FIRST page of a homebrew class: the one everything else points at. */
export const isClassBase = (c: LibraryCard): boolean => c.contentType === 'class' && c.classSpec?.role !== 'page';

/** Whether this card is a further page of some class. */
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
 * A page wearing its class's identity.
 *
 * Title, colour and art come from the base; the text, the sections and anything functional stay the
 * page's own. Done at read time rather than copied on save, so an author who recolours the class card
 * recolours its pages with it and never has to go and find them.
 */
export function inheritedPage(page: LibraryCard, base: LibraryCard): LibraryCard {
  return { ...page, title: base.title, color: base.color, imageUri: page.imageUri ?? base.imageUri, className: base.title };
}

/** Assemble one class from a pack's cards. */
export function assembleClass(cards: LibraryCard[], base: LibraryCard): ClassAssembly {
  const key = classKeyOf(base.title);
  const pages = cards.filter((c) => isClassPage(c) && classKeyOf(c.className) === key).map((p) => inheritedPage(p, base));
  return { base, pages, faces: [base, ...pages] };
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
