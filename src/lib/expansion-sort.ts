/**
 * Putting an expansion's cards in an order worth reading (v0.42.1, owner).
 *
 * "Add auto-sorting by type to the expansion creation UI so that all custom domain cards of a domain
 * are organized together automatically and sorted themselves by level, and add pagination so that the
 * user doesn't scroll vertically through the long unoptimized list."
 *
 * A finished class expansion is sixty or seventy cards: a class, its subclasses, its features, its
 * trackers, its items, and eleven domain cards per domain. In creation order that is a heap. Sorted,
 * it is a table of contents.
 *
 * Both halves are pure so the order is a fact rather than a rendering accident, and so the paging can
 * be tested without a screen.
 */

import type { LibraryCard, LibraryContentType } from './library';

/**
 * The order the types read in, which is the order an author builds them.
 *
 * The class leads because everything else points at it, its subclasses and features follow it, and
 * the domains come next with their cards grouped under them. Gear and loose cards last, because they
 * are the parts you dip into rather than read through.
 */
const TYPE_ORDER: LibraryContentType[] = [
  // v0.43.0: a `type` sits with the other TEMPLATES, ahead of the content that joins it, for the same
  // reason the class leads: it is what everything after it points at.
  'class', 'subclass', 'feature', 'customDomain', 'domain', 'type', 'ancestry', 'community', 'weapon', 'armor', 'inventory', 'generic',
];

const rank = (t: LibraryContentType): number => {
  const i = TYPE_ORDER.indexOf(t);
  return i < 0 ? TYPE_ORDER.length : i;
};

const key = (s: string | undefined): string => (s ?? '').trim().toLowerCase();

/**
 * The sort itself.
 *
 * Within a type, cards group by what they belong to and then by the thing that orders them there: a
 * domain card by its domain and then by LEVEL (the owner's explicit ask), a subclass by its family
 * and then by tier, a class's cards by the class. Everything else falls back to the title, so the
 * order is total and two runs never disagree.
 */
export function sortExpansionCards(cards: LibraryCard[]): LibraryCard[] {
  return [...cards].sort((a, b) => {
    const r = rank(a.contentType) - rank(b.contentType);
    if (r) return r;
    if (a.contentType === 'domain') {
      const d = key(a.domain).localeCompare(key(b.domain));
      if (d) return d;
      const l = (a.level ?? 1) - (b.level ?? 1);
      if (l) return l;
    }
    if (a.contentType === 'subclass') {
      const f = key(a.subclass || a.title).localeCompare(key(b.subclass || b.title));
      if (f) return f;
      const t = (a.tier ?? 1) - (b.tier ?? 1);
      if (t) return t;
    }
    const c = key(a.className).localeCompare(key(b.className));
    if (c) return c;
    return key(a.title).localeCompare(key(b.title));
  });
}

/**
 * The heading a card sits under, so a sorted list reads as sections rather than as a long run.
 *
 * A domain card says which domain AND that it is a domain card, because "Pyre" alone would collide
 * with the domain's own card two sections above it.
 */
export function sectionOf(c: LibraryCard): string {
  if (c.contentType === 'domain') return `${(c.domain ?? 'No domain').trim()} cards`;
  if (c.contentType === 'subclass') return `${(c.className ?? 'Unattached').trim()} subclasses`;
  if (c.contentType === 'feature') return `${(c.className ?? 'Unattached').trim()} features`;
  if (c.contentType === 'customDomain') return 'Domains';
  if (c.contentType === 'type') return 'Kinds of card';
  if (c.contentType === 'class') return 'Classes';
  if (c.contentType === 'weapon' || c.contentType === 'armor' || c.contentType === 'inventory') return 'Gear and items';
  if (c.contentType === 'ancestry') return 'Ancestries';
  if (c.contentType === 'community') return 'Communities';
  return 'Cards';
}

/** How many cards one page holds. Enough to fill a phone without scrolling far. */
export const CARDS_PER_PAGE = 8;

/**
 * The cards, sorted and cut into pages.
 *
 * Paging AFTER sorting is what makes a page mean something: page two is the rest of the domain, not
 * an arbitrary eight. An empty expansion yields ONE empty page rather than none, so the pager always
 * has something to draw and the caller never has to special-case it.
 */
export function paginate(cards: LibraryCard[], perPage = CARDS_PER_PAGE): LibraryCard[][] {
  const sorted = sortExpansionCards(cards);
  if (!sorted.length) return [[]];
  const pages: LibraryCard[][] = [];
  for (let i = 0; i < sorted.length; i += perPage) pages.push(sorted.slice(i, i + perPage));
  return pages;
}
