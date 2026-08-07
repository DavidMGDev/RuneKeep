/**
 * The Cards gallery's two rules, as arithmetic (v0.37, owner).
 *
 * The panel used to have one mode: tap picked cards, hold picked one up and dragged it. The drag is
 * gone (it let go of itself in a browser and took the app down on a phone, twice, through two
 * separate rewrites), and with it the reason tap had to mean "select". So tap LOOKS at a card and
 * hold starts SELECTING, which is what every other list in the app does.
 *
 * Both rules live here rather than inside the component because the trap is not the gesture, it is
 * the state: a panel that is in select mode with nothing selected shows no footer, so it offers no
 * way out and every tap keeps missing. `tapTile` and `holdTile` can never leave that state, and a
 * test says so.
 */
export interface GallerySelection {
  /** Select mode: tap toggles rather than focuses. */
  selecting: boolean;
  selected: Set<string>;
  /** The card drawn large over the panel. Null while selecting. */
  focusId: string | null;
}

export const NO_SELECTION: GallerySelection = { selecting: false, selected: new Set(), focusId: null };

/** Hold a card: enter select mode with that card picked. Holding a picked card leaves it picked. */
export function holdTile(s: GallerySelection, id: string): GallerySelection {
  const selected = new Set(s.selected);
  selected.add(id);
  return { selecting: true, selected, focusId: null };
}

/**
 * Tap a card: focus it, or toggle it while selecting.
 *
 * Deselecting the last card leaves select mode. Otherwise the footer (which only exists while
 * something is selected) would take its Clear button away and strand the panel in a mode that
 * swallows every tap.
 */
export function tapTile(s: GallerySelection, id: string): GallerySelection {
  if (!s.selecting) return { ...s, focusId: id };
  const selected = new Set(s.selected);
  if (selected.has(id)) selected.delete(id);
  else selected.add(id);
  return { selecting: selected.size > 0, selected, focusId: null };
}

/** Clear: drop the selection and leave select mode. */
export function clearSelection(s: GallerySelection): GallerySelection {
  return { selecting: false, selected: new Set(), focusId: s.focusId };
}

/**
 * The order a category holds after cards are moved INTO it (v0.37, owner).
 *
 * The moved cards go first and whatever was already there follows, which is what makes moving a set
 * into the category it is already in mean something: it promotes them to the front of their own
 * deck. `moved` is expected in display order, so a set of three keeps its relative order; ids that
 * are already in `existing` are not duplicated.
 */
export function movedFirst(moved: string[], existing: string[]): string[] {
  const set = new Set(moved);
  return [...moved, ...existing.filter((id) => !set.has(id))];
}
