/**
 * The card-carousel CATEGORY RING (#214 / #246). The carousel holds an ordered, LOOPING ring of the
 * categories active for this character:
 *   - abilities + inventory      (always, every class)        — built-in, never deletable
 *   - wildshape (Beastform)      (Druids only)                — built-in, never deletable
 *   - notes                      (every class)                — built-in, never deletable
 *   - <custom categories>        (#246: player-created, with their own icon, order + visibility)
 *
 * Over-scrolling past a deck end walks the ring (wrapping). This module is the one pure, testable
 * place that decides what's in the ring, in what order, and what comes next — no React, no I/O.
 */

import { BUILTIN_CATEGORIES, type CardCategory, isBuiltinCategory } from './card-data';

/** A player-created category (#246): its own id, label, and icon key (from the icon library). */
export interface CustomCategory {
  id: string;
  label: string;
  icon: string;
}

/** Canonical built-in ring order. v0.34.8 (owner): the class decks (Beastform, Companion, Martial
 *  Form) come LAST among the active ones, so Arsenal is one step from the deck your class gave you. */
export const CATEGORY_ORDER: CardCategory[] = [...BUILTIN_CATEGORIES];

/** Human label per built-in category (indicator + a11y). `wildshape` shows as "Beastform" (#227). */
export const CATEGORY_LABEL: Record<string, string> = {
  abilities: 'Arsenal',
  inventory: 'Inventory',
  notes: 'Notes',
  wildshape: 'Beastform',
  companion: 'Companion',
  martialform: 'Martial Form', // #357: Martial Artist Brawler stances + Focus
  archive: 'Vault', // v0.34.8 (owner): "Archive" reads as somewhere things go to be forgotten

  favorites: 'Favorites', // v0.9.8: a special category of duplicates, gated by `hasFavorites`
};

/** Resolve any category key to its label — built-in name, or a custom category's label. */
export function categoryLabel(key: CardCategory, custom: CustomCategory[] = []): string {
  if (isBuiltinCategory(key)) return CATEGORY_LABEL[key] ?? key;
  return custom.find((c) => c.id === key)?.label ?? 'Cards';
}

export interface RingOptions {
  /** The character is a Druid → the Beastform category is available. */
  isDruid?: boolean;
  /** The character is a Beastbound Ranger (#311) → the Companion category is available. */
  hasCompanion?: boolean;
  /** The character is a Martial Artist Brawler (#357) → the Martial Form category is available. */
  hasMartialForm?: boolean;
  /** The character has ≥1 favorite (v0.9.8) → the Favorites category is available. */
  hasFavorites?: boolean;
  /** Categories the player has toggled OFF in the Cards panel (#227). At least one always stays on. */
  hidden?: CardCategory[];
  /** Player-created categories (#246). */
  custom?: CustomCategory[];
  /** Explicit category order (#246): keys listed here lead, in this order; the rest follow canonically. */
  order?: CardCategory[];
}

/** Every category that COULD be in the ring (before hide), in canonical-then-custom order. The
 *  feature-gated categories appear only when their feature is present (#311 / v0.9.8 Favorites). */
export function availableCategories({ isDruid, hasCompanion, hasMartialForm, custom = [] }: Pick<RingOptions, 'isDruid' | 'hasCompanion' | 'hasMartialForm' | 'hasFavorites' | 'custom'>): CardCategory[] {
  // v0.10.7: Favorites is a HIDDEN mirror category — it is NEVER in the ring or the category menu (it
  // holds only copies of favorited cards). It's reachable ONLY via the sheet's Favorites button, which
  // opens it as a transient detour (see carousel-context `openFavorites`). So it's not appended here.
  return [
    ...CATEGORY_ORDER.filter((c) => (c === 'wildshape' ? !!isDruid : c === 'companion' ? !!hasCompanion : c === 'martialform' ? !!hasMartialForm : true)),
    ...custom.map((c) => c.id),
  ];
}

/**
 * The ordered list of ACTIVE categories (#227/#246): everything available, reordered by `order`, minus
 * the ones toggled off. Never empty — falls back to abilities so the ring always has a category.
 */
export function activeRing({ isDruid, hasCompanion, hasMartialForm, hasFavorites, hidden = [], custom = [], order }: RingOptions): CardCategory[] {
  const available = availableCategories({ isDruid, hasCompanion, hasMartialForm, hasFavorites, custom });
  const ordered = order && order.length
    ? [...order.filter((k) => available.includes(k)), ...available.filter((k) => !order.includes(k))]
    : available;
  const ring = ordered.filter((c) => !hidden.includes(c));
  return ring.length ? ring : ['abilities'];
}

/**
 * The category `dir` steps from `current` around the ring (wrapping). dir > 0 = forward, dir < 0 =
 * backward. If `current` isn't in the ring, fall back to the first ring entry.
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

/**
 * The order the destination prompt offers categories in (v0.24.3): the SUGGESTED category leads, so
 * the common case is one tap, then the rest in their given order. Favorites is never a destination:
 * it is a mirror of other decks, so a card cannot be created or received into it.
 */
export function destinationOrder(categories: CardCategory[], suggested?: CardCategory): CardCategory[] {
  const list = categories.filter((k) => k !== 'favorites');
  if (!suggested || !list.includes(suggested)) return list;
  return [suggested, ...list.filter((k) => k !== suggested)];
}
