/**
 * Card decks. Each card ships at two LODs (#78): `source` = the full 750x1050 WEBP q86 (~90KB,
 * #62 C), `thumb` = a 188x263 WEBP q70 (~9KB, 16x fewer pixels) that every slot renders ALWAYS —
 * the full image only fades in over it near the fan's center. Metro needs literal require()
 * paths, so the deck is wired here; the carousel reads by category. The Card component renders an
 * image now but is shaped to also accept HTML/CSS-style content later, always at the same aspect.
 */
export const CARD_ASPECT = 750 / 1050; // 5:7

export type CardCategory = 'abilities' | 'inventory';

export interface CardItem {
  id: string;
  /** Full-resolution card (750x1050 webp); a future custom-card renderer can swap this for content. */
  source: number;
  /** Low LOD (188x263 webp) — cheap enough that every slot keeps it mounted forever (#78). */
  thumb: number;
}

export const CARD_CATEGORIES: { key: CardCategory; label: string }[] = [
  { key: 'abilities', label: 'Abilities' },
  { key: 'inventory', label: 'Inventory' },
];

export const CARD_DECKS: Record<CardCategory, CardItem[]> = {
  abilities: [
    { id: 'a1', source: require('../../../assets/extracted_cards/page_386_card_1x1.webp'), thumb: require('../../../assets/extracted_cards/page_386_card_1x1_lod.webp') },
    { id: 'a2', source: require('../../../assets/extracted_cards/page_386_card_1x2.webp'), thumb: require('../../../assets/extracted_cards/page_386_card_1x2_lod.webp') },
    { id: 'a3', source: require('../../../assets/extracted_cards/page_386_card_1x3.webp'), thumb: require('../../../assets/extracted_cards/page_386_card_1x3_lod.webp') },
    { id: 'a4', source: require('../../../assets/extracted_cards/page_386_card_2x1.webp'), thumb: require('../../../assets/extracted_cards/page_386_card_2x1_lod.webp') },
    { id: 'a5', source: require('../../../assets/extracted_cards/page_386_card_2x2.webp'), thumb: require('../../../assets/extracted_cards/page_386_card_2x2_lod.webp') },
    { id: 'a6', source: require('../../../assets/extracted_cards/page_386_card_2x3.webp'), thumb: require('../../../assets/extracted_cards/page_386_card_2x3_lod.webp') },
    { id: 'a7', source: require('../../../assets/extracted_cards/page_386_card_3x1.webp'), thumb: require('../../../assets/extracted_cards/page_386_card_3x1_lod.webp') },
    { id: 'a8', source: require('../../../assets/extracted_cards/page_386_card_3x2.webp'), thumb: require('../../../assets/extracted_cards/page_386_card_3x2_lod.webp') },
    { id: 'a9', source: require('../../../assets/extracted_cards/page_386_card_3x3.webp'), thumb: require('../../../assets/extracted_cards/page_386_card_3x3_lod.webp') },
    { id: 'a10', source: require('../../../assets/extracted_cards/page_387_card_1x1.webp'), thumb: require('../../../assets/extracted_cards/page_387_card_1x1_lod.webp') },
    { id: 'a11', source: require('../../../assets/extracted_cards/page_387_card_1x2.webp'), thumb: require('../../../assets/extracted_cards/page_387_card_1x2_lod.webp') },
    { id: 'a12', source: require('../../../assets/extracted_cards/page_387_card_1x3.webp'), thumb: require('../../../assets/extracted_cards/page_387_card_1x3_lod.webp') },
    { id: 'a13', source: require('../../../assets/extracted_cards/page_387_card_2x1.webp'), thumb: require('../../../assets/extracted_cards/page_387_card_2x1_lod.webp') },
    { id: 'a14', source: require('../../../assets/extracted_cards/page_387_card_2x2.webp'), thumb: require('../../../assets/extracted_cards/page_387_card_2x2_lod.webp') },
    { id: 'a15', source: require('../../../assets/extracted_cards/page_387_card_2x3.webp'), thumb: require('../../../assets/extracted_cards/page_387_card_2x3_lod.webp') },
    { id: 'a16', source: require('../../../assets/extracted_cards/page_387_card_3x1.webp'), thumb: require('../../../assets/extracted_cards/page_387_card_3x1_lod.webp') },
    { id: 'a17', source: require('../../../assets/extracted_cards/page_387_card_3x2.webp'), thumb: require('../../../assets/extracted_cards/page_387_card_3x2_lod.webp') },
    { id: 'a18', source: require('../../../assets/extracted_cards/page_387_card_3x3.webp'), thumb: require('../../../assets/extracted_cards/page_387_card_3x3_lod.webp') },
  ],
  inventory: [
    { id: 'i1', source: require('../../../assets/extracted_cards/page_388_card_1x1.webp'), thumb: require('../../../assets/extracted_cards/page_388_card_1x1_lod.webp') },
    { id: 'i2', source: require('../../../assets/extracted_cards/page_388_card_1x2.webp'), thumb: require('../../../assets/extracted_cards/page_388_card_1x2_lod.webp') },
    { id: 'i3', source: require('../../../assets/extracted_cards/page_388_card_1x3.webp'), thumb: require('../../../assets/extracted_cards/page_388_card_1x3_lod.webp') },
    { id: 'i4', source: require('../../../assets/extracted_cards/page_388_card_2x1.webp'), thumb: require('../../../assets/extracted_cards/page_388_card_2x1_lod.webp') },
    { id: 'i5', source: require('../../../assets/extracted_cards/page_388_card_2x2.webp'), thumb: require('../../../assets/extracted_cards/page_388_card_2x2_lod.webp') },
    { id: 'i6', source: require('../../../assets/extracted_cards/page_388_card_2x3.webp'), thumb: require('../../../assets/extracted_cards/page_388_card_2x3_lod.webp') },
    { id: 'i7', source: require('../../../assets/extracted_cards/page_388_card_3x1.webp'), thumb: require('../../../assets/extracted_cards/page_388_card_3x1_lod.webp') },
    { id: 'i8', source: require('../../../assets/extracted_cards/page_388_card_3x2.webp'), thumb: require('../../../assets/extracted_cards/page_388_card_3x2_lod.webp') },
    { id: 'i9', source: require('../../../assets/extracted_cards/page_388_card_3x3.webp'), thumb: require('../../../assets/extracted_cards/page_388_card_3x3_lod.webp') },
    { id: 'i10', source: require('../../../assets/extracted_cards/page_389_card_1x1.webp'), thumb: require('../../../assets/extracted_cards/page_389_card_1x1_lod.webp') },
    { id: 'i11', source: require('../../../assets/extracted_cards/page_389_card_1x2.webp'), thumb: require('../../../assets/extracted_cards/page_389_card_1x2_lod.webp') },
    { id: 'i12', source: require('../../../assets/extracted_cards/page_389_card_1x3.webp'), thumb: require('../../../assets/extracted_cards/page_389_card_1x3_lod.webp') },
    { id: 'i13', source: require('../../../assets/extracted_cards/page_389_card_2x1.webp'), thumb: require('../../../assets/extracted_cards/page_389_card_2x1_lod.webp') },
    { id: 'i14', source: require('../../../assets/extracted_cards/page_389_card_2x2.webp'), thumb: require('../../../assets/extracted_cards/page_389_card_2x2_lod.webp') },
    { id: 'i15', source: require('../../../assets/extracted_cards/page_389_card_2x3.webp'), thumb: require('../../../assets/extracted_cards/page_389_card_2x3_lod.webp') },
    { id: 'i16', source: require('../../../assets/extracted_cards/page_389_card_3x1.webp'), thumb: require('../../../assets/extracted_cards/page_389_card_3x1_lod.webp') },
    { id: 'i17', source: require('../../../assets/extracted_cards/page_389_card_3x2.webp'), thumb: require('../../../assets/extracted_cards/page_389_card_3x2_lod.webp') },
    { id: 'i18', source: require('../../../assets/extracted_cards/page_389_card_3x3.webp'), thumb: require('../../../assets/extracted_cards/page_389_card_3x3_lod.webp') },
  ],
};
