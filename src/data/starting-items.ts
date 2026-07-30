/**
 * Starting inventory items that are really ARCHIVE cards (v0.27.0).
 *
 * Every class guide opens its inventory choice with "a Minor Health Potion or a Minor Stamina
 * Potion". Both of those are printed cards with printed text, and RuneKeep already carries them in
 * the consumables archive, where one says "Clear 1d4 HP" and the other "Clear 1d4 Stress".
 *
 * Creation was not using them. It authored a plain item card that repeated the name and said nothing
 * else, so a new Brawler's potion sat among their hand wraps and their torch, looking like a keepsake
 * and telling the player nothing about drinking it.
 *
 * So a starting item is matched against the archive by name first, and only falls back to an authored
 * item when there is no such card. The rest of the guides' choices (a sharpening stone, a grappling
 * hook) have no printed card and are unaffected.
 *
 * Pure and data-only, so the matching rules are a unit test rather than something you find out by
 * making fifteen characters.
 */
import { ALL_LOOT } from './loot-data';

/** "a Minor Health Potion" and "Minor Health Potion" are the same thing. */
function normalise(name: string): string {
  return name
    .replace(/^(a|an|the)\s+/i, '')
    .trim()
    .toLowerCase();
}

/** Archive cards by normalised name, built once. Consumables win a tie, since these are the ones the
 *  guides hand out; a "Recipe" card shares most of a potion's name and must never be the match. */
const BY_NAME = (() => {
  const m = new Map<string, string>();
  for (const l of ALL_LOOT) {
    const key = normalise(l.name);
    if (!m.has(key) || l.kind === 'consumable') m.set(key, l.id);
  }
  return m;
})();

/**
 * The archive card id for a starting-inventory item, or null when the item has no printed card and
 * should be authored as a plain item the way it always was.
 */
export function startingItemCardId(name: string): string | null {
  return BY_NAME.get(normalise(name)) ?? null;
}
