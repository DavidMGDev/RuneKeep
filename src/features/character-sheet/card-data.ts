/**
 * Card decks. Cards are the extracted_cards PNGs (750x1050), used AS IS — no rounding, no edits.
 * Metro needs literal require() paths, so the deck is wired here; the carousel reads by category.
 * The Card component renders an image now but is shaped to also accept HTML/CSS-style content later,
 * always at the same fixed aspect.
 */
export const CARD_ASPECT = 750 / 1050; // 5:7

export type CardCategory = 'abilities' | 'inventory';

export interface CardItem {
  id: string;
  /** A require()'d image for now; a future custom-card renderer can swap this for content. */
  source: number;
}

export const CARD_CATEGORIES: { key: CardCategory; label: string }[] = [
  { key: 'abilities', label: 'Abilities' },
  { key: 'inventory', label: 'Inventory' },
];

export const CARD_DECKS: Record<CardCategory, CardItem[]> = {
  abilities: [
    { id: 'a1', source: require('../../../assets/extracted_cards/page_386_card_1x1.png') },
    { id: 'a2', source: require('../../../assets/extracted_cards/page_386_card_1x2.png') },
    { id: 'a3', source: require('../../../assets/extracted_cards/page_386_card_1x3.png') },
    { id: 'a4', source: require('../../../assets/extracted_cards/page_386_card_2x1.png') },
    { id: 'a5', source: require('../../../assets/extracted_cards/page_386_card_2x2.png') },
    { id: 'a6', source: require('../../../assets/extracted_cards/page_386_card_2x3.png') },
    { id: 'a7', source: require('../../../assets/extracted_cards/page_386_card_3x1.png') },
    { id: 'a8', source: require('../../../assets/extracted_cards/page_386_card_3x2.png') },
    { id: 'a9', source: require('../../../assets/extracted_cards/page_386_card_3x3.png') },
    { id: 'a10', source: require('../../../assets/extracted_cards/page_387_card_1x1.png') },
    { id: 'a11', source: require('../../../assets/extracted_cards/page_387_card_1x2.png') },
    { id: 'a12', source: require('../../../assets/extracted_cards/page_387_card_1x3.png') },
    { id: 'a13', source: require('../../../assets/extracted_cards/page_387_card_2x1.png') },
    { id: 'a14', source: require('../../../assets/extracted_cards/page_387_card_2x2.png') },
    { id: 'a15', source: require('../../../assets/extracted_cards/page_387_card_2x3.png') },
    { id: 'a16', source: require('../../../assets/extracted_cards/page_387_card_3x1.png') },
    { id: 'a17', source: require('../../../assets/extracted_cards/page_387_card_3x2.png') },
    { id: 'a18', source: require('../../../assets/extracted_cards/page_387_card_3x3.png') },
  ],
  inventory: [
    { id: 'i1', source: require('../../../assets/extracted_cards/page_388_card_1x1.png') },
    { id: 'i2', source: require('../../../assets/extracted_cards/page_388_card_1x2.png') },
    { id: 'i3', source: require('../../../assets/extracted_cards/page_388_card_1x3.png') },
    { id: 'i4', source: require('../../../assets/extracted_cards/page_388_card_2x1.png') },
    { id: 'i5', source: require('../../../assets/extracted_cards/page_388_card_2x2.png') },
    { id: 'i6', source: require('../../../assets/extracted_cards/page_388_card_2x3.png') },
    { id: 'i7', source: require('../../../assets/extracted_cards/page_388_card_3x1.png') },
    { id: 'i8', source: require('../../../assets/extracted_cards/page_388_card_3x2.png') },
    { id: 'i9', source: require('../../../assets/extracted_cards/page_388_card_3x3.png') },
    { id: 'i10', source: require('../../../assets/extracted_cards/page_389_card_1x1.png') },
    { id: 'i11', source: require('../../../assets/extracted_cards/page_389_card_1x2.png') },
    { id: 'i12', source: require('../../../assets/extracted_cards/page_389_card_1x3.png') },
    { id: 'i13', source: require('../../../assets/extracted_cards/page_389_card_2x1.png') },
    { id: 'i14', source: require('../../../assets/extracted_cards/page_389_card_2x2.png') },
    { id: 'i15', source: require('../../../assets/extracted_cards/page_389_card_2x3.png') },
    { id: 'i16', source: require('../../../assets/extracted_cards/page_389_card_3x1.png') },
    { id: 'i17', source: require('../../../assets/extracted_cards/page_389_card_3x2.png') },
    { id: 'i18', source: require('../../../assets/extracted_cards/page_389_card_3x3.png') },
  ],
};
