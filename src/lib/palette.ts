/**
 * The app's colour swatches (v0.34.3).
 *
 * Two places let a player choose a flat colour: the moodboard's background and a card's art. Both had
 * the same complaint from the owner, that "random" was either a cycle through a handful of fixed
 * values or a dice roll with no way to aim it, and both now open the SAME picker (see
 * `components/color-palette`) over one of these lists.
 *
 * Generated rather than typed out, so the grid is even and widening it is changing a number. The two
 * lists differ only in their tone range, and that difference is the whole point:
 *
 *  - a BOARD colour sits behind artwork and has to stay dark enough to read on;
 *  - a CARD colour IS the artwork, so it lives in the same band `randomCardColor` rolls in, and a
 *    swatch you pick has to be a colour the dice could also have given you.
 *
 * Pure, so both are covered by ordinary tests rather than by looking at them.
 */

/** Hues, evenly spaced round the wheel with the warm end a little denser, where card art tends to sit. */
const HUES = [0, 30, 60, 100, 150, 190, 220, 260, 300, 330];

/**
 * The moodboard's background swatches. The default deep blue leads, then the greys, then colour.
 *
 * Lightness stops at 36%: every image on the board has to stay readable against whatever is behind
 * it, and a pale canvas washes artwork out.
 */
export function boardPalette(): string[] {
  const out = ['#101A2B', '#0E0F12', '#181A20', '#2A2E36', '#3C424C'];
  for (const [s, l] of [
    [38, 12],
    [42, 19],
    [40, 27],
    [34, 36],
  ]) {
    for (const h of HUES) out.push(`hsl(${h}, ${s}%, ${l}%)`);
  }
  return out;
}

/**
 * A card's art swatches, in the band `randomCardColor` rolls in (saturation 42-70, lightness 30-52).
 *
 * The neutrals lead because a card with no picture often wants to be plain, and rolling the dice
 * until a random gives you a slate grey is not a way to choose one.
 */
export function cardPalette(): string[] {
  const out = ['#262A32', '#3A4048', '#55504A', '#2A3340', '#3A2A4A'];
  for (const [s, l] of [
    [46, 32],
    [62, 38],
    [50, 44],
    [66, 50],
  ]) {
    for (const h of HUES) out.push(`hsl(${h}, ${s}%, ${l}%)`);
  }
  return out;
}
