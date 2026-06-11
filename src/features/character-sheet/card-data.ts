/**
 * Card decks. Cards are the extracted_cards images (750x1050) as WEBP q86 — ~8x smaller than the
 * source PNGs (~650KB -> ~90KB each), so the decode when the virtualization window slides onto a
 * new card is ~8x cheaper (#62 C). Same pixels, no visible loss. Metro needs literal require()
 * paths, so the deck is wired here; the carousel reads by category. The Card component renders an
 * image now but is shaped to also accept HTML/CSS-style content later, always at the same aspect.
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
    { id: 'a1', source: require('../../../assets/extracted_cards/page_386_card_1x1.webp') },
    { id: 'a2', source: require('../../../assets/extracted_cards/page_386_card_1x2.webp') },
    { id: 'a3', source: require('../../../assets/extracted_cards/page_386_card_1x3.webp') },
    { id: 'a4', source: require('../../../assets/extracted_cards/page_386_card_2x1.webp') },
    { id: 'a5', source: require('../../../assets/extracted_cards/page_386_card_2x2.webp') },
    { id: 'a6', source: require('../../../assets/extracted_cards/page_386_card_2x3.webp') },
    { id: 'a7', source: require('../../../assets/extracted_cards/page_386_card_3x1.webp') },
    { id: 'a8', source: require('../../../assets/extracted_cards/page_386_card_3x2.webp') },
    { id: 'a9', source: require('../../../assets/extracted_cards/page_386_card_3x3.webp') },
    { id: 'a10', source: require('../../../assets/extracted_cards/page_387_card_1x1.webp') },
    { id: 'a11', source: require('../../../assets/extracted_cards/page_387_card_1x2.webp') },
    { id: 'a12', source: require('../../../assets/extracted_cards/page_387_card_1x3.webp') },
    { id: 'a13', source: require('../../../assets/extracted_cards/page_387_card_2x1.webp') },
    { id: 'a14', source: require('../../../assets/extracted_cards/page_387_card_2x2.webp') },
    { id: 'a15', source: require('../../../assets/extracted_cards/page_387_card_2x3.webp') },
    { id: 'a16', source: require('../../../assets/extracted_cards/page_387_card_3x1.webp') },
    { id: 'a17', source: require('../../../assets/extracted_cards/page_387_card_3x2.webp') },
    { id: 'a18', source: require('../../../assets/extracted_cards/page_387_card_3x3.webp') },
  ],
  inventory: [
    { id: 'i1', source: require('../../../assets/extracted_cards/page_388_card_1x1.webp') },
    { id: 'i2', source: require('../../../assets/extracted_cards/page_388_card_1x2.webp') },
    { id: 'i3', source: require('../../../assets/extracted_cards/page_388_card_1x3.webp') },
    { id: 'i4', source: require('../../../assets/extracted_cards/page_388_card_2x1.webp') },
    { id: 'i5', source: require('../../../assets/extracted_cards/page_388_card_2x2.webp') },
    { id: 'i6', source: require('../../../assets/extracted_cards/page_388_card_2x3.webp') },
    { id: 'i7', source: require('../../../assets/extracted_cards/page_388_card_3x1.webp') },
    { id: 'i8', source: require('../../../assets/extracted_cards/page_388_card_3x2.webp') },
    { id: 'i9', source: require('../../../assets/extracted_cards/page_388_card_3x3.webp') },
    { id: 'i10', source: require('../../../assets/extracted_cards/page_389_card_1x1.webp') },
    { id: 'i11', source: require('../../../assets/extracted_cards/page_389_card_1x2.webp') },
    { id: 'i12', source: require('../../../assets/extracted_cards/page_389_card_1x3.webp') },
    { id: 'i13', source: require('../../../assets/extracted_cards/page_389_card_2x1.webp') },
    { id: 'i14', source: require('../../../assets/extracted_cards/page_389_card_2x2.webp') },
    { id: 'i15', source: require('../../../assets/extracted_cards/page_389_card_2x3.webp') },
    { id: 'i16', source: require('../../../assets/extracted_cards/page_389_card_3x1.webp') },
    { id: 'i17', source: require('../../../assets/extracted_cards/page_389_card_3x2.webp') },
    { id: 'i18', source: require('../../../assets/extracted_cards/page_389_card_3x3.webp') },
  ],
};
