/**
 * What a campaign, a session or an encounter LOOKS like (v0.41.4, owner).
 *
 * All three levels of DM Mode used to be a name and, at best, a colour diamond. Told apart at a
 * glance they could not be, which is why the session list had to start printing its encounters as
 * bullets just to be usable. They now share one identity: a picture, or a colour, or the first letter
 * of the title, plus the title itself and an optional description.
 *
 * The point of putting it here rather than in three components is the FALLBACK. An initial is never
 * stored, it is derived, which is what makes every record that already exists identifiable the moment
 * this ships: an old session has no colour and no image, but it has a title, so it already has an
 * initial. Item 9 of the owner's list costs nothing because of that one decision.
 */

/** The fields any DM record carries to say what it is. Every one of them is optional but the title. */
export interface DmIdentity {
  name: string;
  description?: string;
  color?: string;
  imageUri?: string;
}

/** What a badge should draw. Exactly one of the three, decided once, so no component has to choose. */
export type IdentityFace =
  | { kind: 'image'; uri: string }
  | { kind: 'color'; color: string; initial: string }
  | { kind: 'initial'; initial: string };

/**
 * The letter shown when there is nothing else: the first character that is not a space, uppercased.
 *
 * A title of nothing but spaces, or of nothing at all, still has to draw SOMETHING, or a record the
 * user has not named yet is an empty hole in the list. The question mark is that something.
 */
export function identityInitial(name: string | undefined): string {
  const t = (name ?? '').trim();
  return t ? t[0]!.toUpperCase() : '?';
}

/**
 * What to draw for this record.
 *
 * A picture beats a colour and a colour beats a letter, which is the order of how much the user has
 * told us. A colour keeps its initial alongside it, because a coloured square with a letter on it
 * reads as an entry and a coloured square alone reads as a swatch.
 */
export function identityFace(id: DmIdentity): IdentityFace {
  const initial = identityInitial(id.name);
  if (id.imageUri) return { kind: 'image', uri: id.imageUri };
  if (id.color) return { kind: 'color', color: id.color, initial };
  return { kind: 'initial', initial };
}

/** A one-line summary for a row that has room for one: the description, or how many things are inside. */
export function identitySubtitle(id: DmIdentity, fallback: string): string {
  const d = (id.description ?? '').trim();
  return d || fallback;
}
