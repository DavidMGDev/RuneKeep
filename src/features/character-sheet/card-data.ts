/**
 * Card decks. Each card ships at two LODs (#78): `source` = the full 750x1050 WEBP q86 (~90KB,
 * #62 C), `thumb` = a 188x263 WEBP q70 (~9KB, 16x fewer pixels) that every slot renders ALWAYS —
 * the full image only fades in over it near the fan's center. Metro needs literal require()
 * paths, so the deck is wired here; the carousel reads by category. The Card component renders an
 * image now but is shaped to also accept HTML/CSS-style content later, always at the same aspect.
 *
 * Assets live in assets/extracted_cards/Domains/<Domain>/<LL>_page_..., sorted + level-prefixed
 * by scripts/sort_domain_cards.py (banner-color classification, reading-order levels). The two
 * sample decks below are the same 36 cards as before, at their new paths.
 */
export const CARD_ASPECT = 750 / 1050; // 5:7

/**
 * A carousel category key. The four BUILT-IN keys are fixed; custom categories (#246) use their own
 * generated ids, so the type is a widened `string` rather than a closed union. Resolve a key's label /
 * icon through `carousel-categories` (built-in) or the character's `customCategories` (custom).
 */
export type CardCategory = string;

/**
 * The immutable built-in categories (#246): always present, never deletable. `wildshape` shows only
 * for Druids and `companion` (#311) only for Beastbound Rangers (both gated in availableCategories).
 * `archive` (#306, shown as "Vault") is a stash that starts empty → disabled (excluded from the ring
 * and locked off).
 *
 * v0.34.8 (owner) puts the CLASS decks last among the active ones, so the ring for a Druid reads
 * Arsenal, Inventory, Notes, Beastform, Vault. They used to sit in the middle, which meant stepping
 * through every ordinary deck to reach the one that belongs to the class you are playing. Only
 * characters with no explicit `categoryOrder` follow this; anyone who has arranged their own ring
 * keeps it.
 */
export const BUILTIN_CATEGORIES = ['abilities', 'inventory', 'notes', 'wildshape', 'companion', 'martialform', 'archive'] as const;
export type BuiltinCategory = (typeof BUILTIN_CATEGORIES)[number];
export const isBuiltinCategory = (k: string): k is BuiltinCategory => (BUILTIN_CATEGORIES as readonly string[]).includes(k);

/** One LOD pair (full-res + thumb), the unit both `CardItem` and a multi-page page hold. */
export interface CardImage {
  source: number | { uri: string };
  thumb: number | { uri: string };
}

/** One face of a multi-face card (#110): a forged LOD pair, OR a live element rendered until its
 *  bitmap is forged (so an un-forged page is never dropped — the #110 missing-first-page bug). */
export interface CardFace {
  source?: number | { uri: string };
  thumb?: number | { uri: string };
  custom?: import('react').ReactNode;
}

export interface CardItem extends CardImage {
  id: string;
  /** The card's SYNC KEY (#277): its underlying catalog/custom id. Copies of one card share a ref, so
   *  enable state + effects (keyed by ref) apply once across every copy. Defaults to the id. */
  ref?: string;
  /**
   * A MULTI-FACE card (#110, ex-#108 pages): the class-feature card is a single element in the hand
   * that, when focused, becomes a 3D flip-deck — face 0 = the class card, then each feature page.
   * `source`/`thumb` mirror face 0 for the compact LOD; the carousel tracks the page per slot and
   * persists it. Absent for ordinary single cards.
   */
  faces?: CardFace[];
  /** A LIVE card (#136 gold): rendered as-is instead of the forged image. With `interactive`, taps
   *  go to the card's own controls (the carousel won't close it on tap — swipe-down/gear closes). */
  live?: import('react').ReactNode;
  interactive?: boolean;
}

/**
 * Make a list of card ids unique by suffixing repeats (#269): the FIRST occurrence of an id is kept as
 * is (so existing per-card state keyed by the catalog id still matches), the 2nd+ become `id#2`, `id#3`.
 * This lets a player hold several copies of one catalog card and treat each as an individual card; the
 * catalog id is recovered for content lookup via `catalogIdOf`. Pure + positional (stable while the
 * source ordering is stable).
 *
 * ponytail: positional ids — if the order of two IDENTICAL copies changes, their per-instance state
 * (tokens/enabled) may swap. Non-corrupting (same card). A stored-instance-id model would remove this.
 */
export function dedupeIds(ids: string[]): string[] {
  const seen = new Map<string, number>();
  return ids.map((id) => {
    const n = seen.get(id) ?? 0;
    seen.set(id, n + 1);
    return n === 0 ? id : `${id}#${n + 1}`;
  });
}

/**
 * What a card contributes to a printed sheet (v0.35, owner).
 *
 * One entry per FACE, so a multi-page card (a class card and its feature pages) prints as several
 * cards in reading order rather than as its cover alone.
 *
 * A face is either a bitmap that already exists or the LIVE node the carousel is drawing in its
 * place. Crucially it is never `item.source` when the card carries a live node: that field holds a
 * placeholder while the forge queue catches up, and printing it put the app icon on the page.
 */
export function printFaces(item?: CardItem): { image: number | { uri: string } | null; node: import('react').ReactNode | null }[] {
  if (!item) return [];
  if (item.faces?.length) return item.faces.map((f) => (f.source ? { image: f.source, node: null } : { image: null, node: f.custom ?? null }));
  if (item.live) return [{ image: null, node: item.live }];
  return [{ image: item.source, node: null }];
}

export const CARD_CATEGORIES: { key: CardCategory; label: string }[] = [
  { key: 'abilities', label: 'Abilities' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'notes', label: 'Notes' },
  { key: 'wildshape', label: 'Wild Shape' },
];

export const CARD_DECKS: Record<CardCategory, CardItem[]> = {
  abilities: [
    { id: 'a1', source: require('../../../assets/extracted_cards/Domains/Arcana/arcana-01-1.webp'), thumb: require('../../../assets/extracted_cards/Domains/Arcana/arcana-01-1_lod.webp') },
    { id: 'a2', source: require('../../../assets/extracted_cards/Domains/Arcana/arcana-01-2.webp'), thumb: require('../../../assets/extracted_cards/Domains/Arcana/arcana-01-2_lod.webp') },
    { id: 'a3', source: require('../../../assets/extracted_cards/Domains/Arcana/arcana-01-3.webp'), thumb: require('../../../assets/extracted_cards/Domains/Arcana/arcana-01-3_lod.webp') },
    { id: 'a4', source: require('../../../assets/extracted_cards/Domains/Blade/blade-01-1.webp'), thumb: require('../../../assets/extracted_cards/Domains/Blade/blade-01-1_lod.webp') },
    { id: 'a5', source: require('../../../assets/extracted_cards/Domains/Blade/blade-01-2.webp'), thumb: require('../../../assets/extracted_cards/Domains/Blade/blade-01-2_lod.webp') },
    { id: 'a6', source: require('../../../assets/extracted_cards/Domains/Blade/blade-01-3.webp'), thumb: require('../../../assets/extracted_cards/Domains/Blade/blade-01-3_lod.webp') },
    { id: 'a7', source: require('../../../assets/extracted_cards/Domains/Bone/bone-01-1.webp'), thumb: require('../../../assets/extracted_cards/Domains/Bone/bone-01-1_lod.webp') },
    { id: 'a8', source: require('../../../assets/extracted_cards/Domains/Bone/bone-01-2.webp'), thumb: require('../../../assets/extracted_cards/Domains/Bone/bone-01-2_lod.webp') },
    { id: 'a9', source: require('../../../assets/extracted_cards/Domains/Bone/bone-01-3.webp'), thumb: require('../../../assets/extracted_cards/Domains/Bone/bone-01-3_lod.webp') },
    { id: 'a10', source: require('../../../assets/extracted_cards/Domains/Codex/codex-01-1.webp'), thumb: require('../../../assets/extracted_cards/Domains/Codex/codex-01-1_lod.webp') },
    { id: 'a11', source: require('../../../assets/extracted_cards/Domains/Codex/codex-01-2.webp'), thumb: require('../../../assets/extracted_cards/Domains/Codex/codex-01-2_lod.webp') },
    { id: 'a12', source: require('../../../assets/extracted_cards/Domains/Codex/codex-01-3.webp'), thumb: require('../../../assets/extracted_cards/Domains/Codex/codex-01-3_lod.webp') },
    { id: 'a13', source: require('../../../assets/extracted_cards/Domains/Grace/grace-01-1.webp'), thumb: require('../../../assets/extracted_cards/Domains/Grace/grace-01-1_lod.webp') },
    { id: 'a14', source: require('../../../assets/extracted_cards/Domains/Grace/grace-01-2.webp'), thumb: require('../../../assets/extracted_cards/Domains/Grace/grace-01-2_lod.webp') },
    { id: 'a15', source: require('../../../assets/extracted_cards/Domains/Grace/grace-01-3.webp'), thumb: require('../../../assets/extracted_cards/Domains/Grace/grace-01-3_lod.webp') },
    { id: 'a16', source: require('../../../assets/extracted_cards/Domains/Midnight/midnight-01-1.webp'), thumb: require('../../../assets/extracted_cards/Domains/Midnight/midnight-01-1_lod.webp') },
    { id: 'a17', source: require('../../../assets/extracted_cards/Domains/Midnight/midnight-01-2.webp'), thumb: require('../../../assets/extracted_cards/Domains/Midnight/midnight-01-2_lod.webp') },
    { id: 'a18', source: require('../../../assets/extracted_cards/Domains/Midnight/midnight-01-3.webp'), thumb: require('../../../assets/extracted_cards/Domains/Midnight/midnight-01-3_lod.webp') },
  ],
  inventory: [
    { id: 'i1', source: require('../../../assets/extracted_cards/Domains/Sage/sage-01-1.webp'), thumb: require('../../../assets/extracted_cards/Domains/Sage/sage-01-1_lod.webp') },
    { id: 'i2', source: require('../../../assets/extracted_cards/Domains/Sage/sage-01-2.webp'), thumb: require('../../../assets/extracted_cards/Domains/Sage/sage-01-2_lod.webp') },
    { id: 'i3', source: require('../../../assets/extracted_cards/Domains/Sage/sage-01-3.webp'), thumb: require('../../../assets/extracted_cards/Domains/Sage/sage-01-3_lod.webp') },
    { id: 'i4', source: require('../../../assets/extracted_cards/Domains/Splendor/splendor-01-1.webp'), thumb: require('../../../assets/extracted_cards/Domains/Splendor/splendor-01-1_lod.webp') },
    { id: 'i5', source: require('../../../assets/extracted_cards/Domains/Splendor/splendor-01-2.webp'), thumb: require('../../../assets/extracted_cards/Domains/Splendor/splendor-01-2_lod.webp') },
    { id: 'i6', source: require('../../../assets/extracted_cards/Domains/Splendor/splendor-01-3.webp'), thumb: require('../../../assets/extracted_cards/Domains/Splendor/splendor-01-3_lod.webp') },
    { id: 'i7', source: require('../../../assets/extracted_cards/Domains/Valor/valor-01-1.webp'), thumb: require('../../../assets/extracted_cards/Domains/Valor/valor-01-1_lod.webp') },
    { id: 'i8', source: require('../../../assets/extracted_cards/Domains/Valor/valor-01-2.webp'), thumb: require('../../../assets/extracted_cards/Domains/Valor/valor-01-2_lod.webp') },
    { id: 'i9', source: require('../../../assets/extracted_cards/Domains/Valor/valor-01-3.webp'), thumb: require('../../../assets/extracted_cards/Domains/Valor/valor-01-3_lod.webp') },
    { id: 'i10', source: require('../../../assets/extracted_cards/Domains/Arcana/arcana-02-1.webp'), thumb: require('../../../assets/extracted_cards/Domains/Arcana/arcana-02-1_lod.webp') },
    { id: 'i11', source: require('../../../assets/extracted_cards/Domains/Arcana/arcana-02-2.webp'), thumb: require('../../../assets/extracted_cards/Domains/Arcana/arcana-02-2_lod.webp') },
    { id: 'i12', source: require('../../../assets/extracted_cards/Domains/Blade/blade-02-1.webp'), thumb: require('../../../assets/extracted_cards/Domains/Blade/blade-02-1_lod.webp') },
    { id: 'i13', source: require('../../../assets/extracted_cards/Domains/Blade/blade-02-2.webp'), thumb: require('../../../assets/extracted_cards/Domains/Blade/blade-02-2_lod.webp') },
    { id: 'i14', source: require('../../../assets/extracted_cards/Domains/Bone/bone-02-1.webp'), thumb: require('../../../assets/extracted_cards/Domains/Bone/bone-02-1_lod.webp') },
    { id: 'i15', source: require('../../../assets/extracted_cards/Domains/Bone/bone-02-2.webp'), thumb: require('../../../assets/extracted_cards/Domains/Bone/bone-02-2_lod.webp') },
    { id: 'i16', source: require('../../../assets/extracted_cards/Domains/Codex/codex-02-1.webp'), thumb: require('../../../assets/extracted_cards/Domains/Codex/codex-02-1_lod.webp') },
    { id: 'i17', source: require('../../../assets/extracted_cards/Domains/Codex/codex-02-2.webp'), thumb: require('../../../assets/extracted_cards/Domains/Codex/codex-02-2_lod.webp') },
    { id: 'i18', source: require('../../../assets/extracted_cards/Domains/Grace/grace-02-1.webp'), thumb: require('../../../assets/extracted_cards/Domains/Grace/grace-02-1_lod.webp') },
  ],
  // Notes (#214) + Wild Shape (#214, Druid) + Companion (#311, Beastbound) + Archive (#306) decks are
  // character-supplied; the demo sheet has none. Archive starts empty for everyone.
  notes: [],
  wildshape: [],
  companion: [],
  martialform: [], // #357: Martial Artist Brawler stances (character-supplied)
  archive: [],
};
