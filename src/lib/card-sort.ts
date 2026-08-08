/**
 * Sorting a hand (v0.38, owner).
 *
 * Edit mode can pick any set of cards and put them in order. This module is the whole decision: what
 * "in order" means for five different questions, over a deck that mixes printed scans, forged text
 * cards, photographs and live controls. It is pure and has no idea what a card looks like; the caller
 * reads each card down to a `SortEntry` first (see `card-sort-entries`).
 *
 * Two rules run through all of it:
 *
 *  - **Every comparison is total.** A sort that leaves ties unresolved reorders cards that the player
 *    did not ask to move, differently each time. Every key falls through to the title and then to the
 *    id, so the same hand sorted twice is the same hand.
 *  - **A card the app knows nothing about goes last, whichever direction you sort.** "Descending"
 *    means the strongest answer first, not "put the blanks at the top": a card with no title, no text
 *    or no colour is not the opposite of one with a lot, it is a card with no answer, and burying it
 *    is what the player expects both ways.
 */

export type SortKey = 'color' | 'title' | 'type' | 'group' | 'length';
export type SortDir = 'asc' | 'desc';

export interface SortEntry {
  id: string;
  /** The card's name. Empty when it genuinely has none. */
  title: string;
  /** The plaque label: Ability, Domain, Item, Note, Currency... Empty when unknown. */
  type: string;
  /** Which family that type belongs to, as the type picker groups them. Empty when unknown. */
  group: string;
  /** How much description the card carries, in characters. */
  length: number;
  /** One colour standing for the card's art, `#RRGGBB`. Null when the app cannot read one. */
  color: string | null;
}

/** The type picker's own order, so "by category" reads the way the picker does rather than A to Z. */
export const GROUP_ORDER = ['Arsenal', 'Inventory', 'Notes', 'Character', 'Custom'];

// ---------------------------------------------------------------------------------------- colour

export interface ColorRank {
  /** 0 = a hue, 1 = a grey, 2 = no colour at all. Kept apart because hue is meaningless for a grey. */
  band: 0 | 1 | 2;
  /** 0..1 around the wheel, red at 0. Zero for greys. */
  hue: number;
  /** 0..1. */
  light: number;
}

/**
 * Below this CHROMA (the plain distance between the strongest and weakest channel) a colour has no
 * hue worth sorting by, only a brightness.
 *
 * Chroma rather than HSL saturation, which is the obvious choice and the wrong one: saturation is
 * divided by how far the colour is from black or white, so parchment (#FAF8F2) reports 0.44 and would
 * be filed under "a slightly green thing" alongside the greens. Chroma says 0.03, which is what the
 * eye says. 0.08 keeps the app's muted art colours (a bone-grey ancestry at 0.09) on the wheel.
 */
const GREY_CHROMA = 0.08;

export function parseHex(hex: string | null | undefined): { r: number; g: number; b: number } | null {
  if (!hex) return null;
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

/**
 * A colour, as the three numbers the sort actually orders by.
 *
 * Hue first, then brightness, which is what "sort by colour" means to anyone looking at a rainbow: the
 * reds together, the blues together, and within a hue the light ones apart from the dark. Greys have no
 * place on that wheel, so they form their own run after it, ordered dark to light.
 */
export function colorRank(hex: string | null | undefined): ColorRank {
  const rgb = parseHex(hex);
  if (!rgb) return { band: 2, hue: 0, light: 0 };
  const r = rgb.r / 255, g = rgb.g / 255, b = rgb.b / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const light = (max + min) / 2;
  const d = max - min;
  if (d < GREY_CHROMA) return { band: 1, hue: 0, light };
  let hue: number;
  if (max === r) hue = ((g - b) / d + 6) % 6;
  else if (max === g) hue = (b - r) / d + 2;
  else hue = (r - g) / d + 4;
  return { band: 0, hue: hue / 6, light };
}

// ------------------------------------------------------------------------------------ comparators

/** Case- and accent-insensitive, and a leading "the" is not what a title is filed under. */
export function titleKey(title: string): string {
  const t = (title ?? '').trim().toLowerCase().replace(/^(the|a|an)\s+/, '');
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

const cmpStr = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Compare two entries on `key`, ascending, with blanks pushed to the end.
 *
 * Returns a number whose SIGN is the order and whose magnitude means nothing. `sortEntries` handles
 * the direction, because a blank must stay at the end when the comparison is reversed.
 */
function compareKey(key: SortKey, a: SortEntry, b: SortEntry): number {
  if (key === 'color') {
    const ra = colorRank(a.color), rb = colorRank(b.color);
    if (ra.band !== rb.band) return ra.band - rb.band;
    if (ra.band === 0 && Math.abs(ra.hue - rb.hue) > 1e-6) return ra.hue - rb.hue;
    if (Math.abs(ra.light - rb.light) > 1e-6) return ra.light - rb.light;
    return 0;
  }
  if (key === 'title') return cmpStr(titleKey(a.title), titleKey(b.title));
  if (key === 'type') return cmpStr(a.type.trim().toLowerCase(), b.type.trim().toLowerCase());
  if (key === 'group') {
    const ia = GROUP_ORDER.indexOf(a.group), ib = GROUP_ORDER.indexOf(b.group);
    if (ia !== ib) return (ia < 0 ? GROUP_ORDER.length : ia) - (ib < 0 ? GROUP_ORDER.length : ib);
    return cmpStr(a.type.trim().toLowerCase(), b.type.trim().toLowerCase());
  }
  return a.length - b.length;
}

/** Whether this entry has no answer for `key` at all, and so belongs at the end either way. */
function isBlank(key: SortKey, e: SortEntry): boolean {
  if (key === 'color') return colorRank(e.color).band === 2;
  if (key === 'title') return titleKey(e.title) === '';
  if (key === 'type') return e.type.trim() === '';
  if (key === 'group') return e.group.trim() === '';
  return false; // a card with no description has a length of zero, which is a real answer
}

/**
 * The entries in order.
 *
 * Stable by construction: the final tie-break is the id, so two cards that agree on everything the
 * key can see keep a fixed order rather than whatever the engine's sort happened to do.
 */
export function sortEntries(entries: SortEntry[], key: SortKey, dir: SortDir): SortEntry[] {
  const sign = dir === 'desc' ? -1 : 1;
  return [...entries].sort((a, b) => {
    const ba = isBlank(key, a), bb = isBlank(key, b);
    if (ba !== bb) return ba ? 1 : -1; // blanks last, both directions
    if (ba && bb) return cmpStr(a.id, b.id);
    const c = compareKey(key, a, b);
    if (c !== 0) return sign * c;
    const t = cmpStr(titleKey(a.title), titleKey(b.title));
    if (t !== 0) return sign * t;
    return cmpStr(a.id, b.id);
  });
}

/**
 * The deck's new order after sorting only `selected`.
 *
 * The cards that are NOT selected never move: the sorted cards are dealt back into the slots the
 * selection already occupied, in order. That is what "sort the selected cards" has to mean, or
 * sorting three cards would rearrange the whole hand around them.
 */
export function sortWithinSelection(deckIds: string[], entries: SortEntry[], key: SortKey, dir: SortDir): string[] {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const picked = deckIds.filter((id) => byId.has(id));
  if (picked.length < 2) return [...deckIds];
  const ordered = sortEntries(picked.map((id) => byId.get(id)!), key, dir).map((e) => e.id);
  let i = 0;
  return deckIds.map((id) => (byId.has(id) ? ordered[i++] : id));
}
