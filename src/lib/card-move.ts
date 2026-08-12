/**
 * Moving and copying cards between expansions (v0.42.1, owner).
 *
 * "Add the ability to move or copy a card from one expansion to another with rigorous dependency
 * tracking."
 *
 * The rigour is the whole feature. A card is rarely alone: a subclass names a class, a domain card
 * names a domain, a class names the items it hands out. Move one and leave the rest and you have not
 * moved a card, you have broken two expansions. So the mover resolves what a card NEEDS first, tells
 * the author, and takes the whole cluster if they say yes.
 *
 * Links are by NAME (see `class-links`) except items, which a class holds by id. That is why a copy
 * KEEPS ids: regenerating them would leave a class pointing at items that no longer exist. Landing on
 * an id the destination already has means the same card is already there, so it is replaced rather
 * than duplicated, which makes copying twice the same as copying once.
 */

import { classKeyOf } from './custom-class';
import { linksToClass } from './class-links';
import type { LibraryCard } from './library';

/** The item ids a class card hands out, across the fixed grant and both choices. */
const itemIdsOf = (c: LibraryCard): string[] => {
  const s = c.classSpec;
  if (!s) return [];
  return [...(s.fixedItemIds ?? []), ...(s.choiceAItemIds ?? []), ...(s.choiceBItemIds ?? [])];
};

const domainKey = (s: string | undefined): string => (s ?? '').trim().toLowerCase();

/**
 * What ONE card needs beside it, one step out.
 *
 * Deliberately two-way: a class needs the cards that make it playable (its subclasses, its features,
 * its items) and a feature needs the class it belongs to. Either direction alone leaves a hole.
 */
function directDeps(card: LibraryCard, all: LibraryCard[]): LibraryCard[] {
  const out: LibraryCard[] = [];
  const others = all.filter((c) => c.id !== card.id);

  // ...the class this card belongs to.
  if (card.className) out.push(...others.filter((c) => c.contentType === 'class' && classKeyOf(c.title) === classKeyOf(card.className)));
  // ...the subclass family it belongs to.
  if (card.className && card.linkSubclass) {
    out.push(...others.filter((c) => c.contentType === 'subclass' && linksToClass(c, card.className!) && classKeyOf(c.subclass || c.title) === classKeyOf(card.linkSubclass)));
  }
  // ...the domain a domain card is filed under.
  if (card.contentType === 'domain' && card.domain) {
    out.push(...others.filter((c) => c.contentType === 'customDomain' && domainKey(c.title) === domainKey(card.domain)));
  }
  if (card.contentType === 'customDomain') {
    out.push(...others.filter((c) => c.contentType === 'domain' && domainKey(c.domain) === domainKey(card.title)));
  }
  // ...and everything a class is made of.
  if (card.contentType === 'class') {
    const ids = new Set(itemIdsOf(card));
    out.push(...others.filter((c) => ids.has(c.id) || linksToClass(c, card.title)));
  }
  return out;
}

/**
 * The whole cluster: the cards asked for, plus everything they need, transitively.
 *
 * Returned in the source's own order so the destination reads the way the source did.
 */
export function withDependencies(ids: string[], all: LibraryCard[]): LibraryCard[] {
  const picked = new Set(ids);
  const queue = all.filter((c) => picked.has(c.id));
  while (queue.length) {
    const next = queue.pop()!;
    for (const dep of directDeps(next, all)) {
      if (picked.has(dep.id)) continue;
      picked.add(dep.id);
      queue.push(dep);
    }
  }
  return all.filter((c) => picked.has(c.id));
}

/** What gets pulled along that the author did not choose. Empty means the card travels alone. */
export const extraDependencies = (ids: string[], all: LibraryCard[]): LibraryCard[] =>
  withDependencies(ids, all).filter((c) => !ids.includes(c.id));

/** A sentence naming what will travel too, for the confirmation. */
export function dependencyNote(extra: LibraryCard[]): string {
  if (!extra.length) return '';
  const names = extra.map((c) => c.title || 'Untitled');
  const head = names.slice(0, 3).join(', ');
  return names.length <= 3
    ? `${head} ${names.length === 1 ? 'comes' : 'come'} too, because the card does not work without ${names.length === 1 ? 'it' : 'them'}.`
    : `${head} and ${names.length - 3} more come too, because the card does not work without them.`;
}

export type MoveMode = 'move' | 'copy';

/**
 * The operation itself: pure, returning both card lists so the caller saves them together.
 *
 * `move` removes from the source, `copy` leaves it be. Both replace a destination card of the same
 * id rather than duplicating it, so a second copy is a no-op instead of a mess.
 */
export function moveCards(
  from: LibraryCard[],
  to: LibraryCard[],
  ids: string[],
  mode: MoveMode,
): { from: LibraryCard[]; to: LibraryCard[]; moved: LibraryCard[] } {
  const moved = withDependencies(ids, from);
  const movedIds = new Set(moved.map((c) => c.id));
  const kept = to.filter((c) => !movedIds.has(c.id));
  return {
    from: mode === 'move' ? from.filter((c) => !movedIds.has(c.id)) : from,
    to: [...kept, ...moved],
    moved,
  };
}
