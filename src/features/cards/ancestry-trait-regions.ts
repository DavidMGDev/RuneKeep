/**
 * Where each ancestry card's two trait blurbs sit, as fractions of the card height (#265). Used to draw
 * the cross-out over the inactive half in a mixed ancestry. The card template is consistent (art on top,
 * a name banner, then the two stacked features, then a footer), so the text box is shared; only the
 * boundary between feature 1 and feature 2 (`splitY`) varies — estimated per card from the relative
 * length of its first feature's text. Tunable by eye against the card art.
 */

/** Top of feature 1 (just under the name banner) and bottom of feature 2 (just above the footer). */
export const ANCESTRY_TEXT_TOP = 0.635;
export const ANCESTRY_TEXT_BOTTOM = 0.93;

/** Normalized boundary between trait 1 (above) and trait 2 (below) per ancestry card. */
export const ANCESTRY_SPLIT_Y: Record<string, number> = {
  'ancestry-clank': 0.815,
  'ancestry-drakona': 0.735,
  'ancestry-dwarf': 0.83,
  'ancestry-elf': 0.75,
  'ancestry-faerie': 0.783,
  'ancestry-faun': 0.759,
  'ancestry-firbolg': 0.847,
  'ancestry-fungril': 0.774,
  'ancestry-galapa': 0.729,
  'ancestry-giant': 0.738,
  'ancestry-goblin': 0.726,
  'ancestry-halfling': 0.794,
  'ancestry-human': 0.756,
  'ancestry-infernis': 0.797,
  'ancestry-katari': 0.771,
  'ancestry-orc': 0.747,
  'ancestry-ribbet': 0.715,
  'ancestry-simiah': 0.797,
};

/** The vertical band (as height fractions) to strike through for the crossed-out trait of a card. */
export function crossOutBand(catalogId: string, crossedTrait: 1 | 2): { top: number; bottom: number } {
  const split = ANCESTRY_SPLIT_Y[catalogId] ?? (ANCESTRY_TEXT_TOP + ANCESTRY_TEXT_BOTTOM) / 2;
  return crossedTrait === 1 ? { top: ANCESTRY_TEXT_TOP, bottom: split } : { top: split, bottom: ANCESTRY_TEXT_BOTTOM };
}
