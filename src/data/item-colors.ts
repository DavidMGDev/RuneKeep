/**
 * Curated card-art colors (#155): the per-class inventory items (kit + the chosen options) get a
 * color from THIS hand-picked list instead of a shared placeholder image — so the four-ish item
 * cards read as distinct, never identical, and never an ugly random tone. Deterministic per item
 * (hashed from the item name/key) so a given item is always the same color. Custom cards keep their
 * own TRUE-random color (card-editor's randomCardColor) — only these list-picked.
 */
export const ITEM_COLORS = [
  '#7C4A3A', // terracotta
  '#6B7A3A', // olive
  '#3A6B6B', // teal
  '#4A5A7C', // slate blue
  '#7C3A5A', // plum
  '#5A3A7C', // violet
  '#3A7C5A', // emerald
  '#7C6B3A', // ochre
  '#3A4A6B', // navy
  '#6B3A3A', // brick
  '#4A7C7C', // muted cyan
  '#7C5A3A', // bronze
  '#5A6B3A', // moss
  '#3A5A7C', // steel
  '#6B3A6B', // muted magenta
  '#2F6B5A', // pine
  '#7C7C3A', // gold-olive
  '#5A3A5A', // mauve
  '#3A6B4A', // forest
  '#7C4A6B', // rose
  '#4A3A7C', // indigo
  '#6B5A3A', // khaki
  '#3A7C6B', // jade
  '#5A7C3A', // muted lime
  '#7C3A4A', // wine
  '#3A4A7C', // cobalt
  '#6B4A7C', // amethyst
  '#4A6B7C', // muted sky
];

/** Stable color for an inventory item, picked from the curated list by hashing its key. */
export function itemColor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (Math.imul(h, 31) + key.charCodeAt(i)) >>> 0;
  return ITEM_COLORS[h % ITEM_COLORS.length];
}
