/**
 * Per-line strikethrough positions for the mixed-ancestry cross-out (#276 item 3). For each ancestry
 * card, `a` = the Y-fractions (of card height) of each text line of FEATURE 1, `b` = the lines of
 * FEATURE 2 — measured by the owner on the real card art (the race-flavor paragraph is intentionally
 * excluded). The cross-out strikes every line of the trait the player did NOT take, in black.
 */
export const ANCESTRY_STRIKES: Record<string, { a: number[]; b: number[] }> = {
  'ancestry-clank': { a: [0.6925, 0.7233, 0.7526, 0.7851], b: [0.829, 0.8583, 0.8859] },
  'ancestry-drakona': { a: [0.6599, 0.6876, 0.7201], b: [0.7607, 0.7916, 0.8225, 0.8518, 0.8843, 0.9168] },
  'ancestry-dwarf': { a: [0.7672, 0.7981], b: [0.8404, 0.8696] },
  'ancestry-elf': { a: [0.7347, 0.7656], b: [0.8062, 0.8371] },
  'ancestry-faerie': { a: [0.6957, 0.7298, 0.7607], b: [0.803, 0.8306, 0.8599, 0.8891] },
  'ancestry-faun': { a: [0.6616, 0.6941, 0.7233, 0.7526], b: [0.7932, 0.8257, 0.855, 0.8859, 0.9184] },
  'ancestry-firbolg': { a: [0.7347, 0.764, 0.7949, 0.8274], b: [0.8664, 0.9005] },
  'ancestry-fungril': { a: [0.7038, 0.7331, 0.7656], b: [0.8046, 0.8355, 0.8664, 0.8973] },
  'ancestry-galapa': { a: [0.7347, 0.7656], b: [0.8062, 0.8371, 0.868, 0.8973] },
  'ancestry-giant': { a: [0.7331, 0.7656], b: [0.8079, 0.8371, 0.868] },
  'ancestry-goblin': { a: [0.7347, 0.764], b: [0.8062, 0.8388, 0.8664] },
  'ancestry-halfling': { a: [0.7347, 0.764], b: [0.8046, 0.8371] },
  'ancestry-human': { a: [0.7672, 0.7997], b: [0.8404, 0.8696, 0.9021] },
  'ancestry-infernis': { a: [0.7672, 0.7981], b: [0.8388, 0.8696] },
  'ancestry-katari': { a: [0.7347, 0.7656], b: [0.8046, 0.8371, 0.868] },
  'ancestry-orc': { a: [0.7185, 0.7493], b: [0.7916, 0.8192, 0.8518, 0.8826] },
  'ancestry-ribbet': { a: [0.6973, 0.7282], b: [0.7705, 0.7997, 0.8306, 0.8615] },
  'ancestry-simiah': { a: [0.7347, 0.7656], b: [0.8095, 0.8388] },

  // v0.25.0: the Hope and Fear ancestries, now printed card faces like the base game's rather than
  // app-rendered text. Read out of the publisher PDF's own text geometry by
  // `scripts/ancestry_marker.py` and confirmed by the owner in the page it generates, so these are
  // measured rather than eyeballed.
  //
  // These moved once already: the card crop was a point out in both axes, which put a sliver of the
  // neighbouring card down the left edge of every face. Re-cutting the cards moved the text with them,
  // so the marks were recomputed on the corrected grid. Any change to the faces means re-running
  // `scripts/extract_hf_cards.py` AND the marker, in that order.
  'ancestry-aetheris': { a: [0.7335, 0.764, 0.7946], b: [0.8364, 0.8669, 0.8975] },
  'ancestry-skykin': { a: [0.6685, 0.6991, 0.7296, 0.7602], b: [0.802, 0.8325, 0.8631, 0.8937] },
  'ancestry-earthkin': { a: [0.7283, 0.7589, 0.7894], b: [0.8312, 0.8618] },
  'ancestry-tidekin': { a: [0.7323, 0.7628], b: [0.8046, 0.8352, 0.8657, 0.8963] },
  'ancestry-emberkin': { a: [0.692, 0.7226], b: [0.7644, 0.7949, 0.8255, 0.856, 0.8866] },
  'ancestry-gnome': { a: [0.733, 0.7636], b: [0.8054, 0.836] },
};

/** Whether this ancestry's cross-out is DRAWN over a printed face (measured strike lines) rather than
 *  applied to app-rendered text. The two must never both run, or the feature is struck twice. */
export const hasStrikeLines = (catalogId: string): boolean => !!ANCESTRY_STRIKES[catalogId];

/** Horizontal extent of every strike (fraction of card width) — same for all so they line up. */
export const STRIKE_X0 = 0.065;
export const STRIKE_X1 = 0.935;

/** The Y-fractions to strike for the CROSSED-OUT trait of a card: trait 1 = feature 1 (`a`), trait 2 =
 *  feature 2 (`b`). */
export function strikeLines(catalogId: string, crossedTrait: 1 | 2): number[] {
  const s = ANCESTRY_STRIKES[catalogId];
  if (!s) return [];
  return crossedTrait === 1 ? s.a : s.b;
}
