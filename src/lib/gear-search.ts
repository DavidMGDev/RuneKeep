/**
 * Asking the catalogue for a thing by name (v0.43.0, owner).
 *
 * ADD GEAR's four item tabs are flat lists: sixty loot, sixty consumables, every weapon of a tier,
 * plus whatever homebrew is installed. Tier chips narrow two of them and nothing narrowed the other
 * two, so finding the Broadsword meant scrolling past everything that is not the Broadsword.
 *
 * The rule is TOKENS, not substrings: every whitespace-separated word of the query has to appear
 * somewhere in the row, in any order. That is what makes "d10 agility" a sensible question. Both
 * sides are stripped to letters and digits first, so "two-handed", "two handed" and "twohanded" are
 * the same query, and a roll number matches whether it was typed as "3" or "03".
 *
 * Pure and free of React on purpose: it is one rule, and the rows it is asked about (official gear,
 * homebrew gear, loot) come from four different shapes.
 */

/** Lower-case, with every run of non-alphanumerics collapsed to one space. */
export function searchNorm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Does this row satisfy the query?
 *
 * An empty query matches everything, which is what an untouched search field should do. A token is
 * satisfied by the spaced form OR by the squashed one, which is the whole of "twohanded" working:
 * nobody types the hyphen and a search that demands it is a search that fails.
 */
export function matchesQuery(haystack: string, query: string): boolean {
  const q = searchNorm(query);
  if (!q) return true;
  const hay = searchNorm(haystack);
  const squashed = hay.replace(/ /g, '');
  return q.split(' ').every((t) => hay.includes(t) || squashed.includes(t));
}

/**
 * The roll a player typed, as the rulebook writes it.
 *
 * The tables print two digits ("01".."60") and a person types "3". Comparing the numbers rather than
 * the strings is the only version of this that works both ways.
 */
export const rollMatches = (roll: string, n: number): boolean => parseInt(roll, 10) === n;
