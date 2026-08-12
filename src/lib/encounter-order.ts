/**
 * The ORDER of an encounter's entries (v0.42.0, owner) — pure, and deliberately not the array's.
 *
 * Adversaries and allies listed in the order they were added, forever, and a DM had no way to say
 * "these three are the wave that arrives second" or to put the fight in initiative order.
 *
 * The order is a LIST OF IDS on the encounter rather than a re-sorted array, for one reason worth
 * stating: an encounter that already exists has no order, and an entry added after one was set is not
 * in it. Both cases have to be harmless. An id the list has never heard of sorts LAST, in the order it
 * was added, so a fight the DM has never reordered lists exactly as it always did, and a new adversary
 * arrives at the bottom rather than shuffling the ones already placed.
 *
 * It is a list of ids and not an index on each entry because reordering by index means rewriting every
 * entry to move one, and rewriting every entry is how a partial write loses a fight.
 */

/** Anything with an id can be ordered. Combatants and allies are both, by different routes. */
export interface Orderable {
  id: string;
}

/**
 * Sort by the saved order, with anything unknown falling to the end in its existing order.
 *
 * Stable in both halves: two entries the order does not mention keep the order they arrived in.
 */
export function applyOrder<T extends Orderable>(items: T[], order: string[] | undefined): T[] {
  if (!order?.length) return items;
  const rank = new Map(order.map((id, i) => [id, i]));
  return items
    .map((item, i) => ({ item, i, rank: rank.get(item.id) ?? Number.POSITIVE_INFINITY }))
    .sort((a, b) => (a.rank === b.rank ? a.i - b.i : a.rank - b.rank))
    .map((x) => x.item);
}

/**
 * The order list after moving one entry to a new position.
 *
 * Takes the CURRENT visible sequence rather than the stored order, because that is what the DM is
 * looking at when they drag: a stored order that mentions half the fight would otherwise produce a
 * move relative to a list nobody can see. The result always names every entry, which is what makes
 * the next drag simple.
 */
export function moveTo(visibleIds: string[], id: string, toIndex: number): string[] {
  const from = visibleIds.indexOf(id);
  if (from < 0) return visibleIds;
  const to = Math.max(0, Math.min(visibleIds.length - 1, toIndex));
  if (to === from) return visibleIds;
  const out = [...visibleIds];
  out.splice(from, 1);
  out.splice(to, 0, id);
  return out;
}

/** Move one entry one place up or down. What the two handle arrows do. */
export const nudge = (visibleIds: string[], id: string, delta: -1 | 1): string[] =>
  moveTo(visibleIds, id, visibleIds.indexOf(id) + delta);

/**
 * Drop ids that are no longer in the fight, so the stored order cannot grow forever.
 *
 * Not strictly necessary (an unknown id in the order is simply never matched) but an encounter that
 * has been edited for a year should not carry a list of everything that was ever in it.
 */
export const pruneOrder = (order: string[] | undefined, liveIds: string[]): string[] | undefined => {
  if (!order?.length) return undefined;
  const live = new Set(liveIds);
  const kept = order.filter((id) => live.has(id));
  return kept.length ? kept : undefined;
};
