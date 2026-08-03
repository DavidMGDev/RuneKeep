/**
 * Which categories actually HAVE homebrew in them (v0.34.0).
 *
 * v0.32.2 made Homebrew a filter inside each category rather than a category of its own, which was
 * the right shape but offered the chip everywhere. So a category with no homebrew in it still invited
 * you to narrow to homebrew, and doing that showed an empty list, which reads as a bug in the
 * catalogue rather than an honest "there is nothing here". Worse, the selection SURVIVED a category
 * change: narrowing Ancestry to homebrew and then switching to Community left the chip lit over
 * nothing at all.
 *
 * The rule the owner asked for: the chip exists only where it would find something, a selection is
 * kept when the new category also has homebrew, and dropped when it does not.
 *
 * Pure, and separate from the two screens that need it, because the browser and the archive file the
 * same content under the same names and must agree about it.
 */

/** The macro categories a card can be filed under. Shared by the gear browser and the card archive. */
export type BrowseCat = 'domain' | 'ancestry' | 'community' | 'subclass' | 'class' | 'transformation' | 'weapon' | 'armor' | 'loot' | 'consumable';

/** What a card must BE to appear under each category. Mirrors how both screens bucket their lists. */
const CONTENT_FOR: Record<BrowseCat, readonly string[]> = {
  domain: ['domain'],
  ancestry: ['ancestry'],
  community: ['community'],
  subclass: ['subclass'],
  class: ['class'],
  // Beastform and the Martial stances are generated from bundled data; nothing authored lands here.
  transformation: [],
  weapon: ['weapon'],
  armor: ['armor'],
  // `generic` has no macro home of its own, so it joins Loot, the bucket for what you carry (v0.32.2).
  loot: ['inventory', 'generic'],
  consumable: [],
};

/** Where a filter can send you. `all` shows both and is what "no chip lit" means. */
export type SourceFilter = 'all' | 'official' | 'homebrew';

/** Whether `cards` holds anything that would appear under `cat`. */
export function hasHomebrew(cat: BrowseCat, cards: readonly { contentType?: string }[]): boolean {
  const want = CONTENT_FOR[cat];
  if (!want.length) return false;
  return cards.some((c) => want.includes(c.contentType ?? 'generic'));
}

/**
 * The filter to hold after a category change: the current one when it is still on offer, otherwise
 * everything.
 *
 * Only `homebrew` can become unavailable. Official content exists in every category the app browses,
 * so an Official selection is never taken away underneath the player.
 */
export function keepSource(current: SourceFilter, cat: BrowseCat, cards: readonly { contentType?: string }[]): SourceFilter {
  if (current !== 'homebrew') return current;
  return hasHomebrew(cat, cards) ? 'homebrew' : 'all';
}
