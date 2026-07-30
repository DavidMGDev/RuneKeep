/**
 * Reading the forged-card cache folder (v0.26.1).
 *
 * The bitmaps are named `<key>-v<render>.png` with a `<key>-v<render>_lod.png` twin. Everything the
 * cache needs to know is answerable from ONE folder listing, so these two take that listing and no
 * filesystem of their own. That keeps the naming rules unit-testable: getting them wrong is invisible
 * on the machine that wrote them and expensive on everyone else's, because a key that fails to match
 * its own bitmap re-forges every card on every launch.
 *
 * Its own file, with no imports, because anything reaching the theme drags a CSS import that Jest
 * cannot load.
 */
export type NameIndex = Map<string, string[]>;

/** Group a folder listing by the card key each bitmap belongs to. Half-written pairs are dropped. */
export function groupNames(listing: string[]): NameIndex {
  const names = new Set(listing);
  const byKey: NameIndex = new Map();
  for (const n of names) {
    if (!n.endsWith('.png') || n.endsWith('_lod.png')) continue;
    if (!names.has(n.replace(/\.png$/, '_lod.png'))) continue; // a crash between the two captures
    // The render version never contains "-v", so the LAST one splits key from version whatever the
    // key itself looks like.
    const cut = n.lastIndexOf('-v');
    if (cut <= 0) continue;
    const key = n.slice(0, cut);
    const list = byKey.get(key);
    if (list) list.push(n);
    else byKey.set(key, [n]);
  }
  return byKey;
}

/** The best bitmap for a key, and whether it is the CURRENT one (so nothing needs forging). */
export function bestName(index: NameIndex, key: string, renderV: string): { name: string | null; current: boolean } {
  const names = index.get(key);
  if (!names?.length) return { name: null, current: false };
  const cur = `${key}-v${renderV}.png`;
  if (names.includes(cur)) return { name: cur, current: true };
  return { name: names[0], current: false }; // an older release's: show it while this one re-forges
}
