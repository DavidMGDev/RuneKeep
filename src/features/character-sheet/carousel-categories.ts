/**
 * The card-carousel CATEGORY RING (#214). The carousel used to hold exactly two decks toggled a↔b;
 * now it holds an ordered, LOOPING ring of however many categories are active for this character:
 *   - abilities + inventory      (always, every class)
 *   - notes                      (when the player has toggled it on — float-menu "Toggle Notes")
 *   - wildshape                  (Druids only — the Beastform deck)
 *
 * Over-scrolling past a deck end walks the ring (wrapping around), so a Druid with Notes on cycles
 * abilities → inventory → notes → wildshape → abilities → … in either direction. This module is the
 * one pure, testable place that decides what's in the ring and what comes next — no React, no I/O.
 */

import type { CardCategory } from './card-data';

/** Canonical ring order (#227: Notes sits AFTER Beastform). The active ring is this list filtered to
 *  what's enabled, so order is stable regardless of which optional categories are present. */
export const CATEGORY_ORDER: CardCategory[] = ['abilities', 'inventory', 'wildshape', 'notes'];

/** Human label per category (indicator + a11y). `wildshape` shows as "Beastform" (#227). */
export const CATEGORY_LABEL: Record<CardCategory, string> = {
  abilities: 'Arsenal',
  inventory: 'Inventory',
  notes: 'Notes',
  wildshape: 'Beastform',
};

export interface RingOptions {
  /** The character is a Druid → the Beastform category is available. */
  isDruid?: boolean;
  /** Categories the player has toggled OFF in the Cards panel (#227). At least one always stays on. */
  hidden?: CardCategory[];
}

/** The ordered list of ACTIVE categories (#227): canonical order minus the ones toggled off in the
 *  Cards panel; Beastform only for Druids. Never empty — falls back to abilities so the ring always
 *  has at least one category. */
export function activeRing({ isDruid, hidden = [] }: RingOptions): CardCategory[] {
  const ring = CATEGORY_ORDER.filter((c) => (c === 'wildshape' ? !!isDruid : true) && !hidden.includes(c));
  return ring.length ? ring : ['abilities'];
}

/**
 * The category `dir` steps from `current` around the ring (wrapping). dir > 0 = forward (toward the
 * next category), dir < 0 = backward. If `current` isn't in the ring (e.g. Notes was just toggled
 * off while viewing it), fall back to the first ring entry.
 */
export function nextCategory(ring: CardCategory[], current: CardCategory, dir: number): CardCategory {
  if (ring.length === 0) return current;
  const i = ring.indexOf(current);
  if (i === -1) return ring[0];
  const step = dir >= 0 ? 1 : -1;
  return ring[(i + step + ring.length) % ring.length];
}

/** Whether a category is still reachable in the ring (used after a toggle removes one). */
export function ringContains(ring: CardCategory[], category: CardCategory): boolean {
  return ring.includes(category);
}
