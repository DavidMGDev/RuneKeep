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

export type CardCategory = 'abilities' | 'inventory';

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
  /**
   * A MULTI-FACE card (#110, ex-#108 pages): the class-feature card is a single element in the hand
   * that, when focused, becomes a 3D flip-deck — face 0 = the class card, then each feature page.
   * `source`/`thumb` mirror face 0 for the compact LOD; the carousel tracks the page per slot and
   * persists it. Absent for ordinary single cards.
   */
  faces?: CardFace[];
}

export const CARD_CATEGORIES: { key: CardCategory; label: string }[] = [
  { key: 'abilities', label: 'Abilities' },
  { key: 'inventory', label: 'Inventory' },
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
};
