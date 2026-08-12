/**
 * Domains, printed the way the book prints them (v0.42.3, owner).
 *
 * "The domains must be capitalized throughout the app, its not arcana or blade, its Arcana and Blade
 * domains."
 *
 * The STORED value is unchanged: domains are keyed lower-case everywhere (class data, card records,
 * expansion links, campaign settings), and changing that would mean migrating every card and every
 * character that references one. So this is a display helper and nothing else, which is also why it
 * is safe: a label can be fixed in one place without a single stored byte moving.
 *
 * An author's own domain is printed exactly as they typed it. They named it; the app does not know
 * better than they do.
 */

/** A domain name as it should be READ. Keys stay lower-case; only the printing changes. */
export function domainLabel(name: string | undefined): string {
  const t = (name ?? '').trim();
  if (!t) return '';
  // A name that already carries capitals was typed by an author, and is theirs.
  if (t !== t.toLowerCase()) return t;
  return t.replace(/\b[a-z]/g, (ch) => ch.toUpperCase());
}

/** The same, for a list. */
export const domainLabels = (names: string[] | undefined): string[] => (names ?? []).map(domainLabel);

/** "Arcana and Valor", for the one-line summary a class card prints. */
export function domainPair(names: string[] | undefined): string {
  const out = domainLabels(names).filter(Boolean);
  return out.length === 2 ? `${out[0]} and ${out[1]}` : out.join(', ');
}
